import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { selectViewModel } from '../../src/extension/application/selectors';
import type { WebviewToHost } from '../../src/shared/messages';
import type { CompanionViewModel } from '../../src/shared/viewModel';
import { createBridge } from '../../src/webview/bridge';
import { SidebarApp, announcement } from '../../src/webview/sidebar/SidebarApp';
import { configWith } from '../support/config';
import { EngineDriver } from '../support/engineDriver';

afterEach(cleanup);

/** Real view models from the real engine, so the UI is tested against what the host sends. */
function vmFrom(d: EngineDriver): CompanionViewModel {
  return selectViewModel(d.state, d.clock.now());
}
const breaksOnly = configWith({ 'reminders.eye.enabled': false });

function renderWith(vm: CompanionViewModel | null) {
  const sent: WebviewToHost[] = [];
  render(<SidebarApp viewModel={vm} send={(m) => sent.push(m)} />);
  return sent;
}

describe('SidebarApp', () => {
  it('shows a busy state until the first snapshot arrives', () => {
    renderWith(null);
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
  });

  it('anchors on the companion: an image named for its stage, a heading and the stage line (R13.2)', () => {
    renderWith(vmFrom(new EngineDriver()));
    expect(screen.getByRole('img', { name: 'Your companion, looking healthy and alert.' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'Feeling human' })).toBeDefined();
  });

  it('offers the self-care actions when nothing is pending', () => {
    const sent = renderWith(vmFrom(new EngineDriver()));
    fireEvent.click(screen.getByRole('button', { name: 'Take a break' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rest my eyes' }));
    expect(sent).toStrictEqual([
      { v: 1, type: 'intent', intent: { kind: 'break.start' } },
      { v: 1, type: 'intent', intent: { kind: 'eyeRest.start' } },
    ]);
  });

  it('renders the reminder card and sends intents with its occurrence id', () => {
    const d = new EngineDriver(breaksOnly).work(61);
    const vm = vmFrom(d);
    const id = vm.reminder?.id ?? '';
    const sent = renderWith(vm);
    const region = screen.getByRole('region', { name: 'Break reminder' });
    expect(region.textContent).toContain('Time for a short break');
    for (const name of ['Take a break', 'Snooze', 'Skip']) fireEvent.click(screen.getByRole('button', { name }));
    expect(sent.map((m) => (m.type === 'intent' ? m.intent : null))).toStrictEqual([
      { kind: 'reminder.takeBreak', occurrenceId: id },
      { kind: 'reminder.snooze', occurrenceId: id },
      { kind: 'reminder.skip', occurrenceId: id },
    ]);
  });

  it('announces reminders politely without moving focus (R13.3)', () => {
    const vm = vmFrom(new EngineDriver(breaksOnly).work(61));
    renderWith(vm);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Time for a short break. Stretch your legs and grab some water.');
    expect(document.activeElement).toBe(document.body);
  });

  it('asks to confirm a break, offering duration choices only when the time is unknown', () => {
    const d = new EngineDriver(breaksOnly).work(61);
    d.intent({ kind: 'reminder.takeBreak', occurrenceId: d.live?.id ?? '' });
    d.away(7);
    d.signal();
    const vm = vmFrom(d);
    const sent = renderWith(vm);
    expect(screen.getByRole('region', { name: 'Count this break' }).textContent).toContain('about 7 min');
    expect(screen.queryByRole('button', { name: '5 minutes or more' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, count it' }));
    expect(sent).toStrictEqual([
      { v: 1, type: 'intent', intent: { kind: 'break.confirm', breakId: vm.confirmBreak?.id ?? '', confirmed: true, atLeastFiveMinutes: false } },
    ]);
  });

  it('shows "I\'m back" during a break and Resume while paused', () => {
    const d = new EngineDriver();
    d.intent({ kind: 'break.start' });
    const sent = renderWith(vmFrom(d));
    fireEvent.click(screen.getByRole('button', { name: "I'm back" }));
    expect(sent[0]).toMatchObject({ type: 'intent', intent: { kind: 'break.end' } });
    cleanup();

    const p = new EngineDriver();
    p.intent({ kind: 'pause.start', durationMs: null });
    const pausedSent = renderWith(vmFrom(p));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(pausedSent).toStrictEqual([{ v: 1, type: 'intent', intent: { kind: 'pause.resume' } }]);
  });

  it('answers the welcome-back prompt', () => {
    const d = new EngineDriver().work(10);
    d.away(10);
    d.signal();
    const vm = vmFrom(d);
    const sent = renderWith(vm);
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(sent).toStrictEqual([
      { v: 1, type: 'intent', intent: { kind: 'welcomeBack.answer', promptId: vm.welcomeBack?.id ?? '', tookBreak: false } },
    ]);
  });

  it('toggles sound through a pressed-state button (R12.6)', () => {
    const sent = renderWith(vmFrom(new EngineDriver()));
    const toggle = screen.getByRole('button', { name: 'Sound on' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(sent).toStrictEqual([{ v: 1, type: 'sound/setEnabled', enabled: false }]);
  });

  it('applies reduced motion from the setting (baseline default on)', () => {
    renderWith(vmFrom(new EngineDriver()));
    expect(screen.getByRole('main').className).toContain('motion-reduced');
    cleanup();
    renderWith(vmFrom(new EngineDriver(configWith({ 'experience.reducedMotion': false }))));
    expect(screen.getByRole('main').className).toContain('motion-full');
  });

  it('works without the character when the companion is disabled (R2.10)', () => {
    renderWith(vmFrom(new EngineDriver(configWith({ 'companion.enabled': false }))));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('The companion is hidden. Reminders still work.')).toBeDefined();
  });

  it('every button has an accessible name and is a native button (R13.1)', () => {
    renderWith(vmFrom(new EngineDriver(breaksOnly).work(61)));
    for (const button of screen.getAllByRole('button')) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.textContent.trim().length).toBeGreaterThan(0);
    }
  });

  it('announces nothing when nothing new is on screen', () => {
    expect(announcement(vmFrom(new EngineDriver()))).toBe('');
  });
});

describe('bridge', () => {
  it('delivers only validated host messages', () => {
    const posted: unknown[] = [];
    const bridge = createBridge({ postMessage: (m) => posted.push(m) }, window);
    const snapshots: CompanionViewModel[] = [];
    const stop = bridge.listen((vm) => snapshots.push(vm), () => undefined);
    const vm = vmFrom(new EngineDriver());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { v: 1, type: 'snapshot', viewModel: vm } }));
      window.dispatchEvent(new MessageEvent('message', { data: { v: 1, type: 'snapshot', viewModel: { protocol: 1 } } }));
      window.dispatchEvent(new MessageEvent('message', { data: '<script>' }));
    });
    stop();
    expect(snapshots).toStrictEqual([vm]);
    bridge.send({ v: 1, type: 'ui/interaction' });
    expect(posted).toStrictEqual([{ v: 1, type: 'ui/interaction' }]);
  });
});

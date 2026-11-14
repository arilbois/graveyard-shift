import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { selectViewModel } from '../../src/extension/application/selectors';
import {
  isCompanionViewModel,
  messageTypeForLog,
  parseHostMessage,
  parseWebviewMessage,
} from '../../src/shared/messages';
import { configWith } from '../support/config';
import { EngineDriver } from '../support/engineDriver';

describe('parseWebviewMessage (R15.3)', () => {
  it.each([
    [{ v: 1, type: 'ready', surface: 'sidebar' }],
    [{ v: 1, type: 'ui/interaction' }],
    [{ v: 1, type: 'sound/setEnabled', enabled: false }],
    [{ v: 1, type: 'intent', intent: { kind: 'reminder.skip', occurrenceId: 'occ-3' } }],
    [{ v: 1, type: 'intent', intent: { kind: 'eyeRest.start' } }],
    [{ v: 1, type: 'intent', intent: { kind: 'break.end', breakId: 'brk-2' } }],
    [{ v: 1, type: 'intent', intent: { kind: 'break.confirm', breakId: 'brk-2', confirmed: true, atLeastFiveMinutes: false } }],
    [{ v: 1, type: 'intent', intent: { kind: 'welcomeBack.answer', promptId: 'wb-9', tookBreak: false } }],
    [{ v: 1, type: 'intent', intent: { kind: 'pause.resume' } }],
  ])('accepts %j', (message) => {
    expect(parseWebviewMessage(message)).toStrictEqual(message);
  });

  it.each([
    ['wrong version', { v: 2, type: 'ui/interaction' }],
    ['missing version', { type: 'ui/interaction' }],
    ['unknown type', { v: 1, type: 'eval' }],
    ['extra key', { v: 1, type: 'ui/interaction', path: '/secret' }],
    ['wrong surface', { v: 1, type: 'ready', surface: 'editor' }],
    ['non-boolean', { v: 1, type: 'sound/setEnabled', enabled: 'yes' }],
    ['unknown intent', { v: 1, type: 'intent', intent: { kind: 'reset.everything' } }],
    ['pause.start is command-only', { v: 1, type: 'intent', intent: { kind: 'pause.start', durationMs: null } }],
    ['extra intent key', { v: 1, type: 'intent', intent: { kind: 'eyeRest.start', x: 1 } }],
    ['long id', { v: 1, type: 'intent', intent: { kind: 'reminder.skip', occurrenceId: 'o'.repeat(65) } }],
    ['markup in id', { v: 1, type: 'intent', intent: { kind: 'reminder.skip', occurrenceId: '<img>' } }],
    ['empty id', { v: 1, type: 'intent', intent: { kind: 'break.end', breakId: '' } }],
    ['missing confirm field', { v: 1, type: 'intent', intent: { kind: 'break.confirm', breakId: 'b', confirmed: true } }],
    ['array', [1, 2]],
    ['null', null],
    ['string', 'ready'],
  ])('rejects %s', (_label, message) => {
    expect(parseWebviewMessage(message)).toBeNull();
  });

  it('never throws and only returns known message types, for any input', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const parsed = parseWebviewMessage(raw);
        if (parsed !== null) expect(['ready', 'intent', 'ui/interaction', 'sound/setEnabled']).toContain(parsed.type);
      }),
    );
  });
});

describe('parseHostMessage', () => {
  const vm = selectViewModel(new EngineDriver(configWith()).work(61).state, { mono: 0, wall: 0 });

  it('accepts real snapshots and cues', () => {
    expect(isCompanionViewModel(vm)).toBe(true);
    expect(parseHostMessage({ v: 1, type: 'snapshot', viewModel: vm })).toStrictEqual({ v: 1, type: 'snapshot', viewModel: vm });
    expect(parseHostMessage({ v: 1, type: 'cue', cue: 'recovery' })).toStrictEqual({ v: 1, type: 'cue', cue: 'recovery' });
  });

  it('rejects snapshots with a bad stage, protocol or field type', () => {
    expect(parseHostMessage({ v: 1, type: 'snapshot', viewModel: { ...vm, protocol: 2 } })).toBeNull();
    expect(parseHostMessage({ v: 1, type: 'snapshot', viewModel: { ...vm, companion: { ...vm.companion, stage: 'ghost' } } })).toBeNull();
    expect(parseHostMessage({ v: 1, type: 'snapshot', viewModel: { ...vm, notice: 3 } })).toBeNull();
    expect(parseHostMessage({ v: 1, type: 'cue', cue: 'scream' })).toBeNull();
    expect(parseHostMessage({ v: 1, type: 'cue', cue: 'reminder', volume: 1 })).toBeNull();
  });
});

describe('messageTypeForLog (R14.7)', () => {
  it('logs only a plausible type, never payloads', () => {
    expect(messageTypeForLog({ type: 'intent', intent: { secret: 'x' } })).toBe('intent');
    expect(messageTypeForLog({ type: '/Users/me/project/secret.ts' })).toBe('unknown');
    expect(messageTypeForLog('raw text')).toBe('unknown');
  });
});

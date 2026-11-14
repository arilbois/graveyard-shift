import type { JSX } from 'react';
import { COPY } from '../../shared/copy';
import type { WebviewIntent, WebviewToHost } from '../../shared/messages';
import type { CompanionViewModel } from '../../shared/viewModel';
import { ActionButton } from '../components/ActionButton';
import { CompanionScene } from '../components/CompanionScene';
import { LiveRegion } from '../components/LiveRegion';
import { usePrefersReducedMotion } from '../useReducedMotion';
import { BreakPanel, ConfirmBreak, EyeRestCountdown, PausedNotice, WelcomeBack } from './BreakPrompts';
import { ReminderCard } from './ReminderCard';

interface Props {
  readonly viewModel: CompanionViewModel | null;
  readonly send: (message: WebviewToHost) => void;
}

/** What the live region announces: the most important new thing on screen, if any (R13.3). */
export function announcement(vm: CompanionViewModel): string {
  if (vm.confirmBreak) return vm.confirmBreak.question;
  if (vm.welcomeBack) return vm.welcomeBack.question;
  if (vm.reminder) return `${vm.reminder.title}. ${vm.reminder.body}`;
  if (vm.eyeRest) return vm.eyeRest.text;
  if (vm.notice) return vm.notice;
  return '';
}

/** The single main card, in priority order. Self-care actions sit second, after the companion. */
function MainCard({ vm, onIntent }: { readonly vm: CompanionViewModel; readonly onIntent: (i: WebviewIntent) => void }): JSX.Element {
  if (vm.paused) return <PausedNotice paused={vm.paused} onIntent={onIntent} />;
  if (vm.confirmBreak) return <ConfirmBreak confirm={vm.confirmBreak} onIntent={onIntent} />;
  if (vm.eyeRest) return <EyeRestCountdown eyeRest={vm.eyeRest} onIntent={onIntent} />;
  if (vm.onBreak) return <BreakPanel onBreak={vm.onBreak} onIntent={onIntent} />;
  if (vm.welcomeBack) return <WelcomeBack prompt={vm.welcomeBack} onIntent={onIntent} />;
  if (vm.reminder) return <ReminderCard reminder={vm.reminder} onIntent={onIntent} />;
  return (
    <div className="gs-actions">
      <ActionButton
        variant="primary"
        label={COPY.sidebar.takeBreak}
        onPress={() => {
          onIntent({ kind: 'break.start' });
        }}
      />
      <ActionButton
        label={COPY.sidebar.restEyes}
        onPress={() => {
          onIntent({ kind: 'eyeRest.start' });
        }}
      />
    </div>
  );
}

export function SidebarApp({ viewModel, send }: Props): JSX.Element {
  const osReduced = usePrefersReducedMotion();
  if (viewModel === null) {
    return (
      <main className="gs-sidebar" aria-busy="true">
        <p className="gs-hint">{COPY.sidebar.loading}</p>
      </main>
    );
  }

  const vm = viewModel;
  const reduced = vm.motion === 'reduced' || osReduced;
  const onIntent = (intent: WebviewIntent): void => {
    send({ v: 1, type: 'intent', intent });
  };

  return (
    <main
      className={`gs-sidebar ${reduced ? 'motion-reduced' : 'motion-full'}`}
      aria-label={COPY.app.name}
      data-stage={vm.companion.stage}
    >
      {vm.demo && <p className="gs-demo-badge">{vm.demo.label}</p>}

      {vm.companion.enabled ? (
        <header className="gs-companion">
          <CompanionScene stage={vm.companion.stage} description={vm.companion.description} />
          <h1 className="gs-stage-label">{vm.companion.label}</h1>
          <p className="gs-stage-line">{vm.companion.line}</p>
        </header>
      ) : (
        <header className="gs-companion">
          <h1 className="gs-stage-label">{COPY.app.name}</h1>
          <p className="gs-stage-line">{COPY.sidebar.companionOff}</p>
        </header>
      )}

      <MainCard vm={vm} onIntent={onIntent} />

      {vm.snoozed && <p className="gs-hint">{vm.snoozed.text}</p>}
      {vm.notice && !vm.reminder && <p className="gs-hint">{vm.notice}</p>}

      <footer className="gs-footer">
        <p className="gs-status">{vm.statusText}</p>
        <p className="gs-stats" aria-label={COPY.sidebar.statsRegion}>
          {vm.stats.text}
        </p>
        <div className="gs-controls">
          <ActionButton
            label={vm.sound.enabled ? COPY.sidebar.soundOn : COPY.sidebar.soundOff}
            pressed={vm.sound.enabled}
            onPress={() => {
              send({ v: 1, type: 'sound/setEnabled', enabled: !vm.sound.enabled });
            }}
          />
        </div>
      </footer>

      <LiveRegion message={announcement(vm)} />
    </main>
  );
}

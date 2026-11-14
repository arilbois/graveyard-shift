import { useEffect, useState, type JSX } from 'react';
import { COPY } from '../../shared/copy';
import type { WebviewIntent } from '../../shared/messages';
import type { CompanionViewModel } from '../../shared/viewModel';
import { ActionButton } from '../components/ActionButton';

type OnIntent = (intent: WebviewIntent) => void;

/** Wall-clock "now" for display only; the host decides when anything actually ends (R15.4). */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(handle);
    };
  }, [intervalMs]);
  return now;
}

export function EyeRestCountdown({
  eyeRest,
  onIntent,
}: {
  readonly eyeRest: NonNullable<CompanionViewModel['eyeRest']>;
  readonly onIntent: OnIntent;
}): JSX.Element {
  const now = useNow(1_000);
  return (
    <section className="gs-card" aria-label={COPY.status.eyeRest}>
      <p className="gs-card__body">{eyeRest.text}</p>
      <p className="gs-countdown">{COPY.sidebar.eyeRestLeft((eyeRest.endsAtWall - now) / 1_000)}</p>
      <div className="gs-actions">
        <ActionButton
          label={COPY.eyeRest.cancel}
          onPress={() => {
            onIntent({ kind: 'eyeRest.cancel' });
          }}
        />
      </div>
    </section>
  );
}

export function BreakPanel({
  onBreak,
  onIntent,
}: {
  readonly onBreak: NonNullable<CompanionViewModel['onBreak']>;
  readonly onIntent: OnIntent;
}): JSX.Element {
  const now = useNow(30_000);
  return (
    <section className="gs-card" aria-label={COPY.status.onBreak}>
      <p className="gs-card__body">{onBreak.text}</p>
      <p className="gs-hint">{COPY.sidebar.awayFor((now - onBreak.startedAtWall) / 60_000)}</p>
      <div className="gs-actions">
        <ActionButton
          variant="primary"
          label={COPY.onBreak.back}
          onPress={() => {
            onIntent({ kind: 'break.end', breakId: onBreak.id });
          }}
        />
      </div>
    </section>
  );
}

export function ConfirmBreak({
  confirm,
  onIntent,
}: {
  readonly confirm: NonNullable<CompanionViewModel['confirmBreak']>;
  readonly onIntent: OnIntent;
}): JSX.Element {
  const answer = (confirmed: boolean, atLeastFiveMinutes: boolean) => () => {
    onIntent({ kind: 'break.confirm', breakId: confirm.id, confirmed, atLeastFiveMinutes });
  };
  const c = COPY.confirmBreak;
  return (
    <section className="gs-card" aria-label={COPY.sidebar.confirmRegion}>
      <p className="gs-card__body">{confirm.question}</p>
      <div className="gs-actions">
        {confirm.askDuration ? (
          <>
            <ActionButton variant="primary" label={c.atLeastFive} onPress={answer(true, true)} />
            <ActionButton label={c.lessThanFive} onPress={answer(true, false)} />
          </>
        ) : (
          <ActionButton variant="primary" label={c.yes} onPress={answer(true, false)} />
        )}
        <ActionButton label={c.no} onPress={answer(false, false)} />
      </div>
    </section>
  );
}

export function WelcomeBack({
  prompt,
  onIntent,
}: {
  readonly prompt: NonNullable<CompanionViewModel['welcomeBack']>;
  readonly onIntent: OnIntent;
}): JSX.Element {
  const answer = (tookBreak: boolean) => () => {
    onIntent({ kind: 'welcomeBack.answer', promptId: prompt.id, tookBreak });
  };
  return (
    <section className="gs-card" aria-label={COPY.sidebar.welcomeBackRegion}>
      <p className="gs-card__body">{prompt.question}</p>
      <div className="gs-actions">
        <ActionButton variant="primary" label={COPY.welcomeBack.yes} onPress={answer(true)} />
        <ActionButton label={COPY.welcomeBack.no} onPress={answer(false)} />
      </div>
    </section>
  );
}

export function PausedNotice({
  paused,
  onIntent,
}: {
  readonly paused: NonNullable<CompanionViewModel['paused']>;
  readonly onIntent: OnIntent;
}): JSX.Element {
  return (
    <section className="gs-card" aria-label={COPY.status.paused}>
      <p className="gs-card__body">{paused.text}</p>
      <div className="gs-actions">
        <ActionButton
          variant="primary"
          label={COPY.paused.resume}
          onPress={() => {
            onIntent({ kind: 'pause.resume' });
          }}
        />
      </div>
    </section>
  );
}

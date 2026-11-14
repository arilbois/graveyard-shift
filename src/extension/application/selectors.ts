import { COPY } from '../../shared/copy';
import { CLOCK_TOLERANCE_MS, EYE_REST_MS, MINUTE_MS } from '../../shared/constants';
import { isConsistent, type Instant } from '../../shared/time';
import type { ActivityStatus, CompanionViewModel } from '../../shared/viewModel';
import { displayedStage } from '../companion/stage';
import type { CoreState, Notice } from './engine';

/** Pure projection of core state into the Webview snapshot (design §5). */

const toMinutes = (ms: number): number => Math.floor(ms / MINUTE_MS);

function activityStatus(s: CoreState, at: Instant): ActivityStatus {
  if (s.pause !== null) return 'paused';
  if (s.breaks.phase === 'eyeRest') return 'eyeRest';
  if (s.breaks.phase === 'onBreak') return 'onBreak';
  if (!s.accounting.focused) return 'unfocused';
  const { chain } = s.accounting;
  const idleMs = s.config.experience.idleMinutes * MINUTE_MS;
  if (chain === null) return 'idle';
  const recent = isConsistent(chain, at, CLOCK_TOLERANCE_MS) && at.mono - chain.mono <= idleMs;
  return recent ? 'active' : 'idle';
}

function noticeText(notice: Notice | null): string | null {
  if (notice === null) return null;
  switch (notice.kind) {
    case 'snoozed':
      return COPY.notice.snoozed(notice.minutes);
    case 'snoozedOut':
      return COPY.notice.snoozedOut(notice.minutes);
    case 'skipped':
      return COPY.notice.skipped;
  }
}

export function selectViewModel(s: CoreState, at: Instant): CompanionViewModel {
  const stage = displayedStage(s.companion);
  const stageCopy = COPY.stage(stage);
  const status = activityStatus(s, at);
  const { live } = s.reminders;
  const showReminder = live !== null && live.status !== 'snoozed';
  const minutesSinceBreak = toMinutes(s.session.sinceBreakMs);
  const activeMinutes = toMinutes(s.session.activeMs);

  return {
    protocol: 1,
    demo: null,
    companion: { enabled: s.config.companion.enabled, stage, ...stageCopy },
    motion: s.config.experience.reducedMotion ? 'reduced' : 'full',
    sound: { enabled: s.config.experience.sounds, volume: s.config.experience.soundVolume / 100 },
    status,
    statusText: COPY.status[status],
    reminder: showReminder
      ? {
          id: live.id,
          kinds: live.kinds,
          title: COPY.reminder.title(live.kinds),
          body: COPY.reminder.body(live.kinds),
          subtle: live.status === 'subtle',
        }
      : null,
    snoozed:
      live?.status === 'snoozed' && live.snoozedUntilActiveMs !== null
        ? { text: COPY.snoozed(Math.ceil((live.snoozedUntilActiveMs - s.session.activeMs) / MINUTE_MS)) }
        : null,
    notice: noticeText(s.notice),
    eyeRest:
      s.breaks.phase === 'eyeRest'
        ? { endsAtWall: s.breaks.startedAt.wall + EYE_REST_MS, text: COPY.eyeRest.text }
        : null,
    onBreak:
      s.breaks.phase === 'onBreak'
        ? { id: s.breaks.id, startedAtWall: s.breaks.startedAt.wall, text: COPY.onBreak.text }
        : null,
    confirmBreak:
      s.breaks.phase === 'awaitingConfirm'
        ? {
            id: s.breaks.id,
            question: COPY.confirmBreak.question(s.breaks.durationMs === null ? null : s.breaks.durationMs / MINUTE_MS),
            askDuration: s.breaks.durationMs === null,
          }
        : null,
    welcomeBack:
      s.welcomeBack.prompt === null
        ? null
        : { id: s.welcomeBack.prompt.id, question: COPY.welcomeBack.question(s.welcomeBack.prompt.gapMs / MINUTE_MS) },
    paused:
      s.pause === null
        ? null
        : {
            text:
              s.pause.untilMono === null
                ? COPY.paused.untilRestart
                : COPY.paused.until(Math.max(0, s.pause.untilMono - at.mono) / MINUTE_MS),
          },
    stats: {
      text: COPY.stats(s.today.breaks, minutesSinceBreak, activeMinutes),
      breaksToday: s.today.breaks,
      eyeRestsToday: s.today.eyeRests,
      minutesSinceBreak,
      activeMinutesEstimate: activeMinutes,
    },
  };
}

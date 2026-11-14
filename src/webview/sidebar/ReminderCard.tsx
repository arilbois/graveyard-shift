import type { JSX } from 'react';
import { COPY } from '../../shared/copy';
import type { WebviewIntent } from '../../shared/messages';
import type { ReminderView } from '../../shared/viewModel';
import { ActionButton } from '../components/ActionButton';

interface Props {
  readonly reminder: ReminderView;
  readonly onIntent: (intent: WebviewIntent) => void;
}

/** The pending reminder. Shown as soon as it exists, whatever the delivery decision (R7.1). */
export function ReminderCard({ reminder, onIntent }: Props): JSX.Element {
  const occurrenceId = reminder.id;
  const { actions } = COPY.reminder;
  return (
    <section className="gs-card gs-reminder" aria-label={COPY.sidebar.reminderRegion}>
      <h2 className="gs-card__title">{reminder.title}</h2>
      <p className="gs-card__body">{reminder.body}</p>
      {reminder.subtle && <p className="gs-hint">{COPY.reminder.subtleHint}</p>}
      <div className="gs-actions">
        <ActionButton
          variant="primary"
          label={actions.takeBreak}
          onPress={() => {
            onIntent({ kind: 'reminder.takeBreak', occurrenceId });
          }}
        />
        <ActionButton
          label={actions.snooze}
          onPress={() => {
            onIntent({ kind: 'reminder.snooze', occurrenceId });
          }}
        />
        <ActionButton
          label={actions.skip}
          onPress={() => {
            onIntent({ kind: 'reminder.skip', occurrenceId });
          }}
        />
      </div>
    </section>
  );
}

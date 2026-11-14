import type { JSX } from 'react';

interface Props {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary';
  readonly pressed?: boolean;
}

/** Native button so keyboard, focus and screen readers work without extra code (R13.1). */
export function ActionButton({ label, onPress, variant = 'secondary', pressed }: Props): JSX.Element {
  return (
    <button
      type="button"
      className={`gs-button gs-button--${variant}`}
      aria-pressed={pressed}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

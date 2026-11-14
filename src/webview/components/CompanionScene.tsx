import { useEffect, useRef, useState, type JSX, type RefObject } from 'react';
import type { CompanionStage } from '../../shared/domain';
import { SPRITE_SIZE, spritePixels } from './placeholderSprites';

const MIN_SCALE = 6;
const MAX_SCALE = 12;
const FALLBACK_SCALE = 8;
/** Horizontal room kept free around the sprite inside the scene frame (8px rhythm). */
const FRAME_PADDING = 32;

/** Largest whole-number scale that fits, so pixels stay crisp (R13.7). */
export function integerScale(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return FALLBACK_SCALE;
  const fit = Math.floor((width - FRAME_PADDING) / SPRITE_SIZE);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
}

function useIntegerScale(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(FALLBACK_SCALE);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setScale(integerScale(width));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, scale];
}

interface Props {
  readonly stage: CompanionStage;
  readonly description: string;
}

/** The companion inside a fixed night-sky frame. Static in task 8; animation arrives in task 13. */
export function CompanionScene({ stage, description }: Props): JSX.Element {
  const [ref, scale] = useIntegerScale();
  const size = SPRITE_SIZE * scale;
  return (
    <div ref={ref} className={`gs-scene gs-scene--${stage}`}>
      <svg
        className="gs-sprite"
        role="img"
        aria-label={description}
        width={size}
        height={size}
        viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
        shapeRendering="crispEdges"
      >
        {spritePixels(stage).map((p) => (
          <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={p.colour} />
        ))}
      </svg>
    </div>
  );
}

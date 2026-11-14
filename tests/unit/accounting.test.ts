import { beforeEach, describe, expect, it } from 'vitest';
import { CLOCK_TOLERANCE_MS, MINUTE_MS, SECOND_MS } from '../../src/shared/constants';
import {
  initialAccounting,
  reduceAccounting,
  restoredAccounting,
  resumeAccounting,
  type AccountingEvent,
  type AccountingResult,
  type AccountingState,
  type SignalSource,
} from '../../src/extension/session/accounting';
import { isConsistent, trustedWallGap } from '../../src/shared/time';
import { FakeClock } from '../support/fakeClock';

const IDLE = 5 * MINUTE_MS;

class Driver {
  state: AccountingState;
  credited = 0;
  last: AccountingResult | null = null;
  suspended = false;

  constructor(
    readonly clock: FakeClock,
    focused = true,
    windowActive = false,
  ) {
    this.state = initialAccounting(focused, windowActive);
  }

  send(event: AccountingEvent): AccountingResult {
    const result = reduceAccounting(this.state, event, { idleMs: IDLE, suspended: this.suspended });
    this.state = result.state;
    this.credited += result.creditedMs;
    this.last = result;
    return result;
  }

  signal(source: SignalSource = 'keyboardSelection'): AccountingResult {
    return this.send({ type: 'signal', source, at: this.clock.now() });
  }
  tick(): AccountingResult {
    return this.send({ type: 'tick', at: this.clock.now() });
  }
  focus(focused: boolean): AccountingResult {
    return this.send({ type: 'focus', focused, at: this.clock.now() });
  }
  windowActive(active: boolean): AccountingResult {
    return this.send({ type: 'windowActive', active, at: this.clock.now() });
  }
}

let clock: FakeClock;
let d: Driver;

beforeEach(() => {
  clock = new FakeClock();
  d = new Driver(clock);
});

describe('time helpers', () => {
  it('treats agreeing forward clocks as consistent and sleep or jumps as not', () => {
    const a = clock.now();
    expect(isConsistent(a, clock.advance(MINUTE_MS), CLOCK_TOLERANCE_MS)).toBe(true);
    const b = clock.now();
    expect(isConsistent(b, clock.sleep(2 * MINUTE_MS), CLOCK_TOLERANCE_MS)).toBe(false);
    const c = clock.now();
    expect(isConsistent(c, clock.shiftWall(-SECOND_MS), CLOCK_TOLERANCE_MS)).toBe(false);
  });

  it('distrusts wall gaps when the clock moved backwards', () => {
    const start = clock.now().wall;
    expect(trustedWallGap(start, clock.advance(10))).toBe(10);
    expect(trustedWallGap(start, clock.shiftWall(-1_000))).toBeNull();
  });
});

describe('crediting between signals (R3.3, R3.4)', () => {
  it('credits nothing for the first signal of a chain', () => {
    expect(d.signal().creditedMs).toBe(0);
  });

  it('credits the gap between two signals within the idle threshold', () => {
    d.signal();
    clock.advance(3 * MINUTE_MS);
    expect(d.signal().creditedMs).toBe(3 * MINUTE_MS);
  });

  it('credits a gap of exactly the idle threshold', () => {
    d.signal();
    clock.advance(IDLE);
    expect(d.signal().creditedMs).toBe(IDLE);
  });

  it('credits nothing for a gap 1 ms over the idle threshold', () => {
    d.signal();
    clock.advance(IDLE + 1);
    expect(d.signal().creditedMs).toBe(0);
  });

  it('continues crediting normally after an idle gap', () => {
    d.signal();
    clock.advance(IDLE + 1);
    d.signal();
    clock.advance(SECOND_MS * 30);
    expect(d.signal().creditedMs).toBe(30 * SECOND_MS);
  });

  it('treats every content-free source the same way', () => {
    const sources: SignalSource[] = ['focus', 'windowActive', 'keyboardSelection', 'mouseSelection', 'webview'];
    d.signal();
    for (const source of sources) {
      clock.advance(SECOND_MS);
      expect(d.signal(source).creditedMs).toBe(SECOND_MS);
    }
  });
});

describe('Active Editor Interaction tracking', () => {
  it('records only keyboard and mouse selection signals as interaction', () => {
    d.signal('webview');
    expect(d.state.lastInteraction).toBeNull();
    d.signal('focus');
    expect(d.state.lastInteraction).toBeNull();
    const at = clock.advance(SECOND_MS);
    d.signal('mouseSelection');
    expect(d.state.lastInteraction).toStrictEqual(at);
    const later = clock.advance(SECOND_MS);
    d.signal('keyboardSelection');
    expect(d.state.lastInteraction).toStrictEqual(later);
  });
});

describe('focus (R3.5)', () => {
  it('credits up to the moment focus is lost, then nothing while unfocused', () => {
    d.signal();
    clock.advance(2 * MINUTE_MS);
    expect(d.focus(false).creditedMs).toBe(2 * MINUTE_MS);
    clock.advance(MINUTE_MS);
    expect(d.signal().creditedMs).toBe(0);
    expect(d.tick().creditedMs).toBe(0);
    expect(d.credited).toBe(2 * MINUTE_MS);
  });

  it('does not credit the unfocused span when focus returns', () => {
    d.signal();
    d.focus(false);
    clock.advance(MINUTE_MS);
    expect(d.focus(true).creditedMs).toBe(0);
    clock.advance(10 * SECOND_MS);
    expect(d.signal().creditedMs).toBe(10 * SECOND_MS);
  });

  it('ignores repeated focus events with no change', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    expect(d.focus(true).creditedMs).toBe(0);
    clock.advance(MINUTE_MS);
    expect(d.signal().creditedMs).toBe(2 * MINUTE_MS);
  });

  it('ignores signals while unfocused even if they arrive', () => {
    const unfocused = new Driver(clock, false);
    unfocused.signal();
    clock.advance(MINUTE_MS);
    expect(unfocused.signal().creditedMs).toBe(0);
    expect(unfocused.state.chain).toBeNull();
  });
});

describe('WindowState.active heartbeat (R3.6, R3.7)', () => {
  it('treats ticks as signals while focused and active', () => {
    d.windowActive(true);
    clock.advance(15 * SECOND_MS);
    expect(d.tick().creditedMs).toBe(15 * SECOND_MS);
  });

  it('does not treat ticks as signals when the window is not active', () => {
    d.signal();
    clock.advance(15 * SECOND_MS);
    expect(d.tick().creditedMs).toBe(0);
    d.windowActive(true);
    d.windowActive(false);
    clock.advance(15 * SECOND_MS);
    expect(d.tick().creditedMs).toBe(0);
  });

  it('does not heartbeat while unfocused', () => {
    const unfocused = new Driver(clock, false, true);
    clock.advance(15 * SECOND_MS);
    expect(unfocused.tick().creditedMs).toBe(0);
  });

  it('works with no windowActive events at all', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    d.tick();
    expect(d.signal().creditedMs).toBe(MINUTE_MS);
  });
});

describe('sleep and clock changes (R4.1–R4.3)', () => {
  it('treats system sleep as a gap even when the monotonic gap looks short', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    clock.sleep(2 * 60 * MINUTE_MS);
    expect(d.signal().creditedMs).toBe(0);
  });

  it('credits nothing when the wall clock moves backwards', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    clock.shiftWall(-10 * MINUTE_MS);
    expect(d.signal().creditedMs).toBe(0);
  });

  it('tolerates small clock drift', () => {
    d.signal();
    clock.advance(2 * MINUTE_MS);
    clock.shiftWall(CLOCK_TOLERANCE_MS);
    expect(d.signal().creditedMs).toBe(2 * MINUTE_MS);
  });

  it('treats a forward wall jump beyond the tolerance as a gap', () => {
    d.signal();
    clock.advance(2 * MINUTE_MS);
    clock.shiftWall(CLOCK_TOLERANCE_MS + 1);
    expect(d.signal().creditedMs).toBe(0);
  });
});

describe('suspension: pause and breaks (R14.8)', () => {
  it('credits nothing while suspended and nothing for the suspended span afterwards', () => {
    d.signal();
    d.suspended = true;
    clock.advance(MINUTE_MS);
    expect(d.signal().creditedMs).toBe(0);
    d.windowActive(true);
    clock.advance(MINUTE_MS);
    expect(d.tick().creditedMs).toBe(0);
    d.suspended = false;
    clock.advance(MINUTE_MS);
    expect(d.signal().creditedMs).toBe(0);
    clock.advance(SECOND_MS);
    expect(d.signal().creditedMs).toBe(SECOND_MS);
  });

  it('still tracks focus changes while suspended', () => {
    d.suspended = true;
    d.focus(false);
    expect(d.state.focused).toBe(false);
  });

  it('resumeAccounting restarts presence so the suspension is not reported as a return', () => {
    d.signal();
    d.suspended = true;
    clock.advance(20 * MINUTE_MS);
    d.state = resumeAccounting(d.state, clock.now());
    d.suspended = false;
    expect(d.signal().returned).toBeNull();
  });
});

describe('presence returns (input to welcome-back and new sessions)', () => {
  it('reports nothing for continuous activity', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    expect(d.signal().returned).toBeNull();
  });

  it('reports nothing for gaps within the idle threshold', () => {
    d.signal();
    clock.advance(IDLE);
    expect(d.signal().returned).toBeNull();
  });

  it('reports the wall gap after an idle period', () => {
    d.signal();
    clock.advance(12 * MINUTE_MS);
    expect(d.signal().returned).toStrictEqual({ wallGapMs: 12 * MINUTE_MS });
  });

  it('reports the wall gap after sleep, measured from the last signal', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    clock.sleep(60 * MINUTE_MS);
    expect(d.signal().returned).toStrictEqual({ wallGapMs: 61 * MINUTE_MS });
  });

  it('measures an unfocused absence from the moment focus was lost', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    d.focus(false);
    clock.advance(9 * MINUTE_MS);
    expect(d.focus(true).returned).toStrictEqual({ wallGapMs: 9 * MINUTE_MS });
  });

  it('reports an untrusted gap when the wall clock went backwards', () => {
    d.signal();
    clock.advance(MINUTE_MS);
    clock.shiftWall(-30 * MINUTE_MS);
    expect(d.signal().returned).toStrictEqual({ wallGapMs: null });
  });

  it('reports a return after a restart using the persisted wall time only', () => {
    const before = clock.now().wall;
    clock.advance(30 * MINUTE_MS);
    const restored = new Driver(clock);
    restored.state = restoredAccounting(before, true, false);
    const result = restored.signal();
    expect(result.creditedMs).toBe(0);
    expect(result.returned).toStrictEqual({ wallGapMs: 30 * MINUTE_MS });
  });

  it('reports nothing on the very first signal ever', () => {
    expect(d.signal().returned).toBeNull();
  });
});

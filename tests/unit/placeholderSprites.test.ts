import { describe, expect, it } from 'vitest';
import { SPRITE_SIZE, spritePixels, spriteRows } from '../../src/webview/components/placeholderSprites';
import { integerScale } from '../../src/webview/components/CompanionScene';
import { COMPANION_STAGES } from '../../src/shared/domain';

describe('placeholder companion sprites', () => {
  it.each(COMPANION_STAGES.map((s) => [s]))('%s is a complete 16×16 grid of known pixels', (stage) => {
    const rows = spriteRows(stage);
    expect(rows).toHaveLength(SPRITE_SIZE);
    for (const row of rows) {
      expect(row).toHaveLength(SPRITE_SIZE);
      expect(row).toMatch(/^[.khselwbmtc]+$/);
    }
    expect(spritePixels(stage).every((p) => /^#[0-9a-f]{6}$/.test(p.colour))).toBe(true);
  });

  it('keeps one silhouette across stages: the same pixels are filled in every stage', () => {
    const filled = (stage: (typeof COMPANION_STAGES)[number]) =>
      spriteRows(stage)
        .map((row) => row.replace(/[^.]/g, '#'))
        .join('\n');
    for (const stage of COMPANION_STAGES) expect(filled(stage)).toBe(filled('human'));
  });

  it('looks different in every stage', () => {
    const looks = COMPANION_STAGES.map((stage) => JSON.stringify(spritePixels(stage)));
    expect(new Set(looks).size).toBe(COMPANION_STAGES.length);
  });
});

describe('integerScale (R13.7)', () => {
  it.each([
    [240, 12],
    [160, 8],
    [130, 6],
    [100, 6],
    [1000, 12],
    [0, 8],
    [Number.NaN, 8],
  ])('width %d → scale %d', (width, scale) => {
    expect(integerScale(width)).toBe(scale);
    expect(Number.isInteger(integerScale(width))).toBe(true);
  });
});

import type { CompanionStage } from '../../shared/domain';

/**
 * Original placeholder companion (CC BY 4.0, see ASSETS.md once added). One 16×16 silhouette shared
 * by every stage; only skin tone, eyes and mouth change, so the character stays consistent.
 * Replaced by the sprite atlas pipeline in task 13.
 *
 * Legend: `.` transparent, k outline, h hair, s skin, e eye, l eyelid, w pale eye, b blemish,
 * m mouth, t teeth, c clothing.
 */

export const SPRITE_SIZE = 16;

const BASE: readonly string[] = [
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '...khhsssshhk...',
  '...kssssssssk...',
  'EYES',
  'CHEEKS',
  'MOUTH',
  '....kssssssk....',
  '.....kkkkkk.....',
  '......kssk......',
  '..kcccccccccck..',
  '.kcccccccccccck.',
  '.kcccccccccccck.',
  '.kcccccccccccck.',
  '.kkkkkkkkkkkkkk.',
];

interface Face {
  readonly eyes: string;
  readonly cheeks: string;
  readonly mouth: string;
  readonly skin: string;
}

const FACES: Readonly<Record<CompanionStage, Face>> = {
  human: {
    eyes: '...kseesseesk...',
    cheeks: '...kssssssssk...',
    mouth: '...ksssmmsssk...',
    skin: '#d9ad86',
  },
  tired: {
    eyes: '...ksllssllsk...',
    cheeks: '...kseesseesk...',
    mouth: '...ksssmmsssk...',
    skin: '#cbae95',
  },
  infected: {
    eyes: '...kseesseesk...',
    cheeks: '...ksbssssbsk...',
    mouth: '...kssmmmmssk...',
    skin: '#aab48a',
  },
  zombie: {
    eyes: '...kswwsswwsk...',
    cheeks: '...ksbssssbsk...',
    mouth: '...kssmttmssk...',
    skin: '#8fa37a',
  },
  recovery: {
    eyes: '...kseesseesk...',
    cheeks: '...kssssssssk...',
    mouth: '...kssmssmssk...',
    skin: '#c9b48c',
  },
};

const SHARED_COLOURS: Readonly<Record<string, string>> = {
  k: '#191e1b',
  h: '#3b2f28',
  e: '#191e1b',
  l: '#7a6252',
  w: '#ebe7da',
  b: '#6f7d58',
  m: '#6b3f35',
  t: '#ebe7da',
  c: '#4f5f4c',
};

export interface SpritePixel {
  readonly x: number;
  readonly y: number;
  readonly colour: string;
}

export function spriteRows(stage: CompanionStage): readonly string[] {
  const face = FACES[stage];
  return BASE.map((row) => (row === 'EYES' ? face.eyes : row === 'CHEEKS' ? face.cheeks : row === 'MOUTH' ? face.mouth : row));
}

export function spritePixels(stage: CompanionStage): readonly SpritePixel[] {
  const { skin } = FACES[stage];
  const pixels: SpritePixel[] = [];
  spriteRows(stage).forEach((row, y) => {
    // Rows are ASCII-only (checked by tests), so indexing by character is safe.
    for (let x = 0; x < row.length; x++) {
      const char = row.charAt(x);
      if (char === '.') continue;
      const colour = char === 's' ? skin : SHARED_COLOURS[char];
      if (colour !== undefined) pixels.push({ x, y, colour });
    }
  });
  return pixels;
}

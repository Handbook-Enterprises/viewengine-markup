/**
 * The ViewEngine mark: a row of ellipses in a 512 box, under one transform.
 *
 * One definition because two renderers draw it — the app's own `Logo` and the
 * server-rendered OG card — and a mark that differs between the product and its
 * share preview is the kind of drift nobody looks at until it is embarrassing.
 * They differ only in fill: the app pours the brand gradient in, the card draws
 * it flat white so the only colour on it belongs to the annotations.
 *
 * (apps/site keeps its own copy in Logo.astro: it is a separate build with no
 * dependency on this workspace. Change one, change the other.)
 */
export const MARK_PATHS = [
  'M194 256a62 114 0 1 0 124 0a62 114 0 1 0 -124 0Z',
  'M128 256a30 80 0 1 0 60 0a30 80 0 1 0 -60 0Z',
  'M324 256a30 80 0 1 0 60 0a30 80 0 1 0 -60 0Z',
  'M90 256a16 58 0 1 0 32 0a16 58 0 1 0 -32 0Z',
  'M390 256a16 58 0 1 0 32 0a16 58 0 1 0 -32 0Z',
  'M59 256a11 44 0 1 0 22 0a11 44 0 1 0 -22 0Z',
  'M431 256a11 44 0 1 0 22 0a11 44 0 1 0 -22 0Z',
  'M37 256a7 32 0 1 0 14 0a7 32 0 1 0 -14 0Z',
  'M461 256a7 32 0 1 0 14 0a7 32 0 1 0 -14 0Z',
  'M20 256a4 20 0 1 0 8 0a4 20 0 1 0 -8 0Z',
  'M484 256a4 20 0 1 0 8 0a4 20 0 1 0 -8 0Z',
];

/** Places the paths inside the 512 viewBox. */
export const MARK_TRANSFORM = '';

/**
 * `--color-ml-accent` — oklch(0.5 0.085 215) — in sRGB.
 *
 * The app states the accent in oklch; resvg does not parse CSS Color 4, so the
 * OG cards carry the same colour as hex. Change one, change the other.
 */
export const MARK_ACCENT = '#0e6f81';

import { BilliardTable } from './entities/billiard-table.entity';

// Where a table stands on the hall plan: center (x, y) in cm, size lengthCm × widthCm,
// rotation 0/90/180/270 degrees (with rotation 0 the length lies along the x axis).
export type TablePlacement = Pick<BilliardTable, 'x' | 'y' | 'lengthCm' | 'widthCm' | 'rotation'>;

// Minimum passage between the edges of two tables: a player needs room to draw the cue back.
// shortcut: one value for the whole hall, becomes a club setting in lesson 15.
export const MIN_GAP_CM = 150;

// The table's rectangle on the floor. 90° and 270° turn the length across the x axis.
function edges(t: TablePlacement) {
  const turned = t.rotation % 180 !== 0;
  const sizeX = turned ? t.widthCm : t.lengthCm;
  const sizeY = turned ? t.lengthCm : t.widthCm;
  return {
    left: t.x - sizeX / 2,
    right: t.x + sizeX / 2,
    top: t.y - sizeY / 2,
    bottom: t.y + sizeY / 2,
  };
}

// True when a and b are closer than gapCm (with gapCm = 0: when their rectangles overlap).
// Axis-aligned rectangles are far enough apart if they are separated on at least ONE axis;
// edges exactly gapCm apart count as separated, so tables that only touch do not overlap.
export function tablesOverlap(a: TablePlacement, b: TablePlacement, gapCm = 0): boolean {
  const ea = edges(a);
  const eb = edges(b);
  const separated =
    ea.right + gapCm <= eb.left || // a is left of b
    eb.right + gapCm <= ea.left || // a is right of b
    ea.bottom + gapCm <= eb.top || // a is above b
    eb.bottom + gapCm <= ea.top; // a is below b
  return !separated;
}

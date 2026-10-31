import { TablePlacement } from '@/modules/tables/table-layout';

// Places `count` tables of the given size in rows of `columns` tables (rotation 0),
// every table at least gapCm from its neighbours and fully inside the hall (no edge below 0).
export function planTableGrid(
  count: number,
  columns: number,
  size: { lengthCm: number; widthCm: number },
  gapCm: number,
): TablePlacement[] {
  return Array.from({ length: count }).map((_, index) => {
    return {
      ...size,
      x: (index % columns) * (size.lengthCm + gapCm) + size.lengthCm / 2,
      y: Math.floor(index / columns) * (size.widthCm + gapCm) + size.widthCm / 2,
      rotation: 0,
    };
  });
}

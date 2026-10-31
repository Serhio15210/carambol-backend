import { tablesOverlap } from '@/modules/tables/table-layout';
import { planTableGrid } from './table-grid';

const size = { lengthCm: 300, widthCm: 150 };
const gap = 150;

describe('planTableGrid', () => {
  it('returns one placement per table, with the given size and rotation 0', () => {
    const grid = planTableGrid(7, 3, size, gap);

    expect(grid).toHaveLength(7);
    grid.forEach((t) => expect(t).toMatchObject({ ...size, rotation: 0 }));
  });

  it('returns nothing for zero tables', () => {
    expect(planTableGrid(0, 3, size, gap)).toEqual([]);
  });

  it('keeps at least gapCm between every pair of tables', () => {
    const grid = planTableGrid(7, 3, size, gap);

    grid.forEach((a, i) =>
      grid.slice(i + 1).forEach((b) => expect(tablesOverlap(a, b, gap)).toBe(false)),
    );
  });

  it('keeps every table inside the hall: no edge below 0', () => {
    planTableGrid(7, 3, size, gap).forEach((t) => {
      expect(t.x - t.lengthCm / 2).toBeGreaterThanOrEqual(0);
      expect(t.y - t.widthCm / 2).toBeGreaterThanOrEqual(0);
    });
  });

  it('puts `columns` tables in a row, then starts the next row below', () => {
    const grid = planTableGrid(4, 3, size, gap);

    const firstRow = grid.slice(0, 3);
    expect(new Set(firstRow.map((t) => t.y)).size).toBe(1); // one row: the same y
    expect(new Set(firstRow.map((t) => t.x)).size).toBe(3); // three different columns
    expect(grid[3].y).toBeGreaterThan(grid[0].y); // the 4th table starts a new row
    expect(grid[3].x).toBe(grid[0].x); // ...in the first column
  });
});

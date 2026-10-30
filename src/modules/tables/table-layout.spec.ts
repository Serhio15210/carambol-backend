import { tablesOverlap } from './table-layout';

// Stage 4. Table A: center (500, 500), 300 × 150 cm, rotation 0 → x 350..650, y 425..575.
const a = { x: 500, y: 500, lengthCm: 300, widthCm: 150, rotation: 0 };

describe('tablesOverlap', () => {
  it('detects tables that overlap', () => {
    expect(tablesOverlap(a, { ...a, x: 700 })).toBe(true);
  });

  it('detects a table placed exactly on top of another', () => {
    expect(tablesOverlap(a, { ...a })).toBe(true);
  });

  it('does not report tables that are far apart', () => {
    expect(tablesOverlap(a, { ...a, x: 2000 })).toBe(false);
    expect(tablesOverlap(a, { ...a, y: 2000 })).toBe(false);
  });

  it('does not report tables that only touch edge to edge', () => {
    expect(tablesOverlap(a, { ...a, x: 800 })).toBe(false); // x 650..950
    expect(tablesOverlap(a, { ...a, y: 650 })).toBe(false); // y 575..725
  });

  it('needs an overlap on BOTH axes', () => {
    // overlaps on x (same column) but is far away on y
    expect(tablesOverlap(a, { ...a, x: 550, y: 1000 })).toBe(false);
  });

  it('swaps length and width for rotation 90 and 270', () => {
    expect(tablesOverlap(a, { ...a, x: 740 })).toBe(true); // x 590..890
    expect(tablesOverlap(a, { ...a, x: 740, rotation: 90 })).toBe(false); // x 665..815
    expect(tablesOverlap(a, { ...a, x: 740, rotation: 270 })).toBe(false);
  });

  it('treats rotation 180 like 0', () => {
    expect(tablesOverlap(a, { ...a, x: 740, rotation: 180 })).toBe(true);
  });

  it('gives the same answer in both directions', () => {
    const b = { ...a, x: 740, rotation: 90 };

    expect(tablesOverlap(a, b)).toBe(tablesOverlap(b, a));
    expect(tablesOverlap(a, b, 100)).toBe(tablesOverlap(b, a, 100));
  });

  describe('with a passage (gapCm) between tables', () => {
    it('reports tables that do not touch but are closer than the gap', () => {
      const b = { ...a, x: 850 }; // x 700..1000: 50 cm from A

      expect(tablesOverlap(a, b)).toBe(false); // no gap required
      expect(tablesOverlap(a, b, 100)).toBe(true); // 50 < 100
    });

    it('allows tables exactly gapCm apart', () => {
      expect(tablesOverlap(a, { ...a, x: 900 }, 100)).toBe(false); // x 750..1050: 100 cm
    });

    it('applies the gap on the y axis too', () => {
      expect(tablesOverlap(a, { ...a, y: 700 }, 100)).toBe(true); // y 625..775: 50 cm
      expect(tablesOverlap(a, { ...a, y: 750 }, 100)).toBe(false); // y 675..825: 100 cm
    });

    it('treats a table near a corner as too close when it is closer than the gap on both axes', () => {
      // 50 cm to the right of A and 50 cm below it
      expect(tablesOverlap(a, { ...a, x: 850, y: 700 }, 100)).toBe(true);
    });

    it('uses the rotated footprint together with the gap', () => {
      // rotation 90 → x 665..815: 15 cm from A
      expect(tablesOverlap(a, { ...a, x: 740, rotation: 90 }, 10)).toBe(false);
      expect(tablesOverlap(a, { ...a, x: 740, rotation: 90 }, 20)).toBe(true);
    });
  });
});

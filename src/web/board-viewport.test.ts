import { describe, expect, it } from 'vitest';
import { clampCamera } from './useBoardViewport';

describe('board camera bounds', () => {
  it('keeps the whole board at reset and prevents dragging it offscreen', () => {
    expect(clampCamera({ zoom: 1, x: 900, y: -900 })).toEqual({ zoom: 1, x: 0, y: -0 });
  });
  it('limits zoom and pan at both edges while permitting useful panning', () => {
    expect(clampCamera({ zoom: 8, x: 9000, y: -9000 })).toEqual({ zoom: 3, x: 940, y: -680 });
    expect(clampCamera({ zoom: .2, x: 0, y: 0 }).zoom).toBe(1);
    expect(clampCamera({ zoom: 2, x: 120, y: -100 })).toEqual({ zoom: 2, x: 120, y: -100 });
  });
});

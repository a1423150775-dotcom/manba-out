export type Hex = { q: number; r: number };
export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];
// The board projects axial coordinates with r increasing down-screen.
// Clockwise from east is southeast, southwest, west, northwest, northeast.
export function clockwiseDirection(direction: number): number {
  if (!Number.isInteger(direction) || direction < 0 || direction >= DIRS.length) throw new Error('无效方向');
  return (direction + DIRS.length - 1) % DIRS.length;
}
export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });
export const sub = (a: Hex, b: Hex): Hex => ({ q: a.q - b.q, r: a.r - b.r });
export const scale = (a: Hex, n: number): Hex => ({ q: a.q * n, r: a.r * n });
export const distance = (a: Hex, b: Hex = { q: 0, r: 0 }): number => {
  const d = sub(a, b);
  return Math.max(Math.abs(d.q), Math.abs(d.r), Math.abs(d.q + d.r));
};
export const equal = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;
export const onBoard = (h: Hex, radius = 4): boolean => distance(h) <= radius;
export const key = (h: Hex): string => `${h.q},${h.r}`;
export const board = (radius = 4): Hex[] => {
  const cells: Hex[] = [];
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (onBoard({ q, r }, radius)) cells.push({ q, r });
  }
  return cells;
};

// These two functions are shared by the browser preview and the authoritative engine.
export function getAirCannonCells(origin: Hex, directionIndex: number, boardRadius: number): Hex[] {
  if (!Number.isInteger(directionIndex) || directionIndex < 0 || directionIndex > 5) throw new Error('无效方向');
  const u = DIRS[directionIndex];
  const a = DIRS[(directionIndex + 5) % 6];
  const b = DIRS[(directionIndex + 1) % 6];
  return [a, u, b, scale(a, 2), add(a, u), scale(u, 2), add(u, b), scale(b, 2)]
    .map(offset => add(origin, offset)).filter(cell => onBoard(cell, boardRadius));
}

export function getAirCannonKnockbackDirection(origin: Hex, targetAtCastTime: Hex, directionIndex: number): Hex {
  if (!Number.isInteger(directionIndex) || directionIndex < 0 || directionIndex > 5) throw new Error('无效方向');
  const u = DIRS[directionIndex];
  const a = DIRS[(directionIndex + 5) % 6];
  const b = DIRS[(directionIndex + 1) % 6];
  const offset = sub(targetAtCastTime, origin);
  if (equal(offset, a) || equal(offset, scale(a, 2))) return a;
  if (equal(offset, b) || equal(offset, scale(b, 2))) return b;
  if ([u, scale(u, 2), add(a, u), add(u, b)].some(h => equal(h, offset))) return u;
  throw new Error('目标不在空气炮范围');
}

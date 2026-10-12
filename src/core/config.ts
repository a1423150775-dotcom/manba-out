export const CONFIG = {
  radius: 4,
  baseAp: 3,
  handLimit: 3,
  turnSeconds: 40,
  rounds: { 2: 18, 3: 13, 4: 10, 5: 10, 6: 10 } as Record<number, number>,
  starts: {
    2: [{ q: 4, r: 0 }, { q: -4, r: 0 }],
    3: [{ q: 4, r: 0 }, { q: 0, r: -4 }, { q: -4, r: 4 }],
    4: [{ q: 4, r: 0 }, { q: 0, r: -4 }, { q: -4, r: 0 }, { q: 0, r: 4 }],
    5: [{ q: 4, r: 0 }, { q: 4, r: -4 }, { q: 0, r: -4 }, { q: -4, r: 0 }, { q: -4, r: 4 }],
    6: [{ q: 4, r: 0 }, { q: 4, r: -4 }, { q: 0, r: -4 }, { q: -4, r: 0 }, { q: -4, r: 4 }, { q: 0, r: 4 }],
  } as Record<number, { q: number; r: number }[]>,
};

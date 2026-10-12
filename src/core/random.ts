export function nextRandom(seed: number): { seed: number; value: number } {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { seed: next, value: next / 4294967296 };
}
export function deriveSeed(seed: number, stream: number): number {
  return (seed ^ Math.imul(stream, 0x9e3779b9)) >>> 0;
}

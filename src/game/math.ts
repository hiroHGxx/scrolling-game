// Small math / RNG helpers used across the game.

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `current` toward `target` by at most `delta` (frame-rate independent when delta = speed*dt). */
export function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return current;
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  // inclusive of both ends
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

/** Distance between two points. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Circle-circle overlap test. */
export function circlesHit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/** Angle (radians) from point A to point B. */
export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

/** Shortest distance from point C to segment A-B (for swept collision). */
export function segPointDist(cx: number, cy: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy));
}

/** Wrap a value into [0, max). */
export function wrap(v: number, max: number): number {
  return ((v % max) + max) % max;
}

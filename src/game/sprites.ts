// Small offscreen-canvas helpers for sprite tinting (hit flashes, damage
// reddening). Results are cached so we only composite once per sprite/color.

import type { Sprite } from "./assets";

const whiteCache = new Map<Sprite, HTMLCanvasElement>();
const tintCache = new Map<string, HTMLCanvasElement>();
let tintId = 0;
const spriteIds = new WeakMap<object, number>();

function idOf(sprite: Sprite): number {
  let id = spriteIds.get(sprite);
  if (id === undefined) {
    id = ++tintId;
    spriteIds.set(sprite, id);
  }
  return id;
}

/** A pure-white silhouette of the sprite (for hit flashes). */
export function whiteSilhouette(sprite: Sprite): HTMLCanvasElement {
  let c = whiteCache.get(sprite);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = sprite.width;
  c.height = sprite.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(sprite as CanvasImageSource, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  whiteCache.set(sprite, c);
  return c;
}

/** A color-tinted copy of the sprite (silhouette filled with `color`). */
export function tinted(sprite: Sprite, color: string): HTMLCanvasElement {
  const key = `${idOf(sprite)}:${color}`;
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = sprite.width;
  c.height = sprite.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(sprite as CanvasImageSource, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}

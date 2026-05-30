// Four-layer parallax starfield. Each layer scrolls left at its own speed.
// `flow` (0..1) lets the game halt scrolling for the boss fight.

import type { Assets } from "./assets";
import { VIEW, SCROLL } from "./spec";

export class Background {
  private farX = 0;
  private nebX = 0;
  private midX = 0;
  private nearX = 0;

  constructor(private assets: Assets) {}

  reset() {
    this.farX = this.nebX = this.midX = this.nearX = 0;
  }

  update(dt: number, flow = 1) {
    this.farX += SCROLL.far * flow * dt;
    this.nebX += SCROLL.nebula * flow * dt;
    this.midX += SCROLL.mid * flow * dt;
    this.nearX += SCROLL.near * flow * dt;
  }

  private tiled(ctx: CanvasRenderingContext2D, img: Assets[keyof Assets], scrollX: number) {
    const iw = img.width;
    if (iw <= 0) return;
    let off = scrollX % iw;
    if (off < 0) off += iw;
    for (let x = -off; x < VIEW.W; x += iw) {
      ctx.drawImage(img, Math.round(x), 0, iw, VIEW.H);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.tiled(ctx, this.assets.bgFar, this.farX);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.85;
    this.tiled(ctx, this.assets.bgNebula, this.nebX);
    ctx.restore();

    this.tiled(ctx, this.assets.bgMid, this.midX);
    this.tiled(ctx, this.assets.bgNear, this.nearX);
  }
}

// Floating power-up capsule that drifts left. Weapon raises fire power,
// shield restores an HP point.

import type { Assets } from "../assets";
import type { PowerupType } from "../types";
import { TAU } from "../math";

export class Powerup {
  dead = false;
  readonly r = 16;
  private t = 0;
  private baseY: number;

  constructor(readonly type: PowerupType, public x: number, public y: number) {
    this.baseY = y;
  }

  update(dt: number) {
    this.t += dt;
    this.x -= 60 * dt;
    this.y = this.baseY + Math.sin(this.t * 2) * 8;
    if (this.x < -40) this.dead = true;
  }

  draw(rc: CanvasRenderingContext2D, assets: Assets) {
    const img = this.type === "weapon" ? assets.puWeapon : assets.puShield;
    const pulse = 0.9 + 0.1 * Math.sin(this.t * 6);
    const wobble = 1 + 0.06 * Math.sin(this.t * 3);
    rc.save();
    rc.translate(this.x, this.y);
    // glow halo
    rc.globalCompositeOperation = "lighter";
    rc.globalAlpha = 0.35 * pulse;
    const g = rc.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, this.type === "weapon" ? "rgba(255,138,30,0.9)" : "rgba(34,227,255,0.9)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    rc.fillStyle = g;
    rc.beginPath();
    rc.arc(0, 0, 26, 0, TAU);
    rc.fill();
    rc.globalCompositeOperation = "source-over";
    rc.globalAlpha = 1;
    rc.scale(wobble, 1 / wobble);
    rc.drawImage(img as CanvasImageSource, -16, -16, 32, 32);
    rc.restore();
  }
}

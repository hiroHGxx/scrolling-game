// The player craft: velocity-based movement, hold-to-fire primary with
// pickup-driven power levels, a charge beam, i-frames, knockback and lives.

import type { Assets } from "../assets";
import type { Input } from "../input";
import type { Particles } from "../particles";
import type { AudioEngine } from "../audio";
import type { PlayerBullet } from "../types";
import { PLAYER, VIEW } from "../spec";
import { approach, clamp, TAU } from "../math";

/** What the player needs from the game to act on the world. */
export interface PlayerCtx {
  bullets: PlayerBullet[];
  particles: Particles;
  audio: AudioEngine;
  addTrauma(amount: number): void;
  hitStop(frames: number): void;
  onChargeFire(level: "mid" | "full"): void;
}

const DEG15 = (15 * Math.PI) / 180;

export class Player {
  x: number = PLAYER.respawnX;
  y: number = PLAYER.respawnY;
  vx = 0;
  vy = 0;

  hp: number = PLAYER.maxHp;
  lives: number = PLAYER.lives;
  powerLevel = 1;

  iframe: number = PLAYER.spawnIframes;
  dead = false; // true => game over

  hitR = PLAYER.hitR;

  private fireCd = 0;
  private lockout = 0;
  private charging = false;
  private chargeTime = 0;
  private kbVel = 0; // knockback velocity (x)
  private kbTimer = 0;
  private recoil = 0; // visual only
  private recoilVel = 0;
  private flashGreen = 0;
  private scalePunch = 0;
  private anim = 0;
  private blink = false;

  reset() {
    this.x = PLAYER.respawnX;
    this.y = PLAYER.respawnY;
    this.vx = this.vy = 0;
    this.hp = PLAYER.maxHp;
    this.lives = PLAYER.lives;
    this.powerLevel = 1;
    this.iframe = PLAYER.spawnIframes;
    this.dead = false;
    this.fireCd = 0;
    this.lockout = 0;
    this.charging = false;
    this.chargeTime = 0;
    this.kbVel = 0;
    this.kbTimer = 0;
    this.flashGreen = 0;
    this.scalePunch = 0;
  }

  get invulnerable(): boolean {
    return this.iframe > 0;
  }

  isHittable(): boolean {
    return this.iframe <= 0 && !this.dead;
  }

  get chargeRatio(): number {
    return clamp(this.chargeTime / PLAYER.chargeFullTime, 0, 1);
  }

  update(dt: number, input: Input, ctx: PlayerCtx) {
    this.anim += dt;
    if (this.iframe > 0) this.iframe -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.lockout > 0) this.lockout -= dt;
    if (this.flashGreen > 0) this.flashGreen -= dt;
    if (this.scalePunch > 0) this.scalePunch -= dt;

    this.handleMovement(dt, input);
    this.handleFire(dt, input, ctx);

    // engine trail
    if (Math.random() < 0.9) ctx.particles.thruster(this.x - 40, this.y, "#22E3FF");

    // blink while in i-frames
    this.blink = this.iframe > 0 && Math.floor(this.anim * 24) % 2 === 0;
  }

  private handleMovement(dt: number, input: Input) {
    let dx = 0;
    let dy = 0;
    let pointerDriven = false;

    if (input.pointerActive) {
      const p = input.pointerLogical(VIEW.W, VIEW.H);
      const tx = clamp(p.x, PLAYER.minX, PLAYER.maxX);
      const ty = clamp(p.y, PLAYER.minY, PLAYER.maxY);
      const ddx = tx - this.x;
      const ddy = ty - this.y;
      const d = Math.hypot(ddx, ddy);
      if (d > 1) {
        dx = ddx / d;
        dy = ddy / d;
        pointerDriven = true;
        // ease: don't overshoot small distances
        if (d < 8) {
          dx *= d / 8;
          dy *= d / 8;
        }
      }
    } else {
      if (input.isDown("left")) dx -= 1;
      if (input.isDown("right")) dx += 1;
      if (input.isDown("up")) dy -= 1;
      if (input.isDown("down")) dy += 1;
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }
    }

    const targetVx = dx * PLAYER.speed;
    const targetVy = dy * PLAYER.speed;
    const rateX = (dx !== 0 ? PLAYER.accel : PLAYER.decel) * dt;
    const rateY = (dy !== 0 ? PLAYER.accel : PLAYER.decel) * dt;
    this.vx = approach(this.vx, targetVx, rateX);
    this.vy = approach(this.vy, targetVy, rateY);
    void pointerDriven;

    // knockback impulse decays linearly
    if (this.kbTimer > 0) {
      this.kbTimer -= dt;
      if (this.kbTimer < 0) this.kbTimer = 0;
    } else {
      this.kbVel = 0;
    }

    this.x += (this.vx + this.kbVel) * dt;
    this.y += this.vy * dt;

    // recoil spring (visual)
    this.recoilVel += -this.recoil * 60 * dt;
    this.recoilVel *= 1 - Math.min(1, 12 * dt);
    this.recoil += this.recoilVel * dt;

    if (this.x < PLAYER.minX) {
      this.x = PLAYER.minX;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x > PLAYER.maxX) {
      this.x = PLAYER.maxX;
      if (this.vx > 0) this.vx = 0;
    }
    if (this.y < PLAYER.minY) {
      this.y = PLAYER.minY;
      if (this.vy < 0) this.vy = 0;
    } else if (this.y > PLAYER.maxY) {
      this.y = PLAYER.maxY;
      if (this.vy > 0) this.vy = 0;
    }
  }

  private handleFire(dt: number, input: Input, ctx: PlayerCtx) {
    // Primary: hold fire, or auto-fire under pointer control.
    const wantFire = input.isDown("fire") || input.pointerActive;
    if (wantFire && this.fireCd <= 0 && this.lockout <= 0) {
      this.firePrimary(ctx);
      this.fireCd = PLAYER.fireRate;
    }

    // Charge beam (keyboard only).
    const wantCharge = input.isDown("charge");
    if (wantCharge) {
      this.charging = true;
      this.chargeTime += dt;
      // ready tick when crossing full threshold
      if (this.chargeTime - dt < PLAYER.chargeFullTime && this.chargeTime >= PLAYER.chargeFullTime) {
        ctx.audio.uiSelect();
      }
    } else if (this.charging) {
      this.releaseCharge(ctx);
      this.charging = false;
      this.chargeTime = 0;
    }
  }

  private firePrimary(ctx: PlayerCtx) {
    const nx = this.x + PLAYER.noseOffset;
    const ny = this.y;
    const s = PLAYER.bulletSpeed;
    const dmg = PLAYER.bulletDamage;
    const mk = (y: number, vx: number, vy: number): PlayerBullet => ({
      x: nx,
      y,
      vx,
      vy,
      w: 24,
      h: 8,
      damage: dmg,
      pierce: 0,
      kind: "bolt",
      big: false,
      dead: false,
      // bolts don't pierce, so they need no per-hit Set (allocated only for beams)
    });

    if (this.powerLevel <= 1) {
      ctx.bullets.push(mk(ny, s, 0));
    } else if (this.powerLevel === 2) {
      ctx.bullets.push(mk(ny - 6, s, 0), mk(ny + 6, s, 0));
    } else {
      const c = Math.cos(DEG15) * s;
      const v = Math.sin(DEG15) * s;
      ctx.bullets.push(mk(ny - 6, s, 0), mk(ny + 6, s, 0), mk(ny - 4, c, -v), mk(ny + 4, c, v));
    }

    ctx.particles.muzzle(nx, ny, "#AEF9FF", 1);
    ctx.audio.shoot();
    this.recoil = 3;
    this.recoilVel = 0;
  }

  private releaseCharge(ctx: PlayerCtx) {
    if (this.chargeTime < PLAYER.chargeMidTime) return; // too short, no shot
    const full = this.chargeTime >= PLAYER.chargeFullTime;
    const nx = this.x + PLAYER.noseOffset;
    const beam: PlayerBullet = {
      x: nx,
      y: this.y,
      vx: full ? 1600 : 1400,
      vy: 0,
      w: 64,
      h: full ? 28 : 16,
      damage: full ? 15 : 5,
      pierce: full ? Infinity : 1,
      kind: "beam",
      big: full,
      dead: false,
      hit: new Set<number>(),
    };
    ctx.bullets.push(beam);
    ctx.audio.explosionSmall();
    ctx.particles.muzzle(nx, this.y, full ? "#7DF9FF" : "#AEF9FF", 1);
    ctx.addTrauma(full ? 0.35 : 0.18);
    ctx.onChargeFire(full ? "full" : "mid");
    this.lockout = PLAYER.chargeLockout;
    this.recoil = full ? 8 : 5;
    this.recoilVel = 0;
  }

  /** Apply one point of damage. Caller must check isHittable() first. */
  hit(ctx: PlayerCtx) {
    this.hp -= 1;
    ctx.audio.playerHit();
    ctx.addTrauma(0.45);
    this.kbVel = -PLAYER.knockback / PLAYER.knockbackTime;
    this.kbTimer = PLAYER.knockbackTime;
    this.charging = false;
    this.chargeTime = 0;
    if (this.hp <= 0) {
      this.loseLife(ctx);
    } else {
      this.iframe = PLAYER.iframes;
    }
  }

  private loseLife(ctx: PlayerCtx) {
    ctx.particles.explosion(this.x, this.y, ["#FFFFFF", "#FFE7A0", "#FF9A1E", "#FF3B2F"], 1.6);
    ctx.particles.debris(this.x, this.y, ["#D8E4F2", "#8AA3C4", "#22E3FF"], 14, 1.2);
    ctx.audio.explosionBig();
    ctx.addTrauma(0.8);
    ctx.hitStop(3);
    this.lives -= 1;
    if (this.lives <= 0) {
      this.dead = true;
      return;
    }
    // respawn (match reset()'s clean firing state)
    this.x = PLAYER.respawnX;
    this.y = PLAYER.respawnY;
    this.vx = this.vy = 0;
    this.hp = PLAYER.maxHp;
    this.iframe = PLAYER.spawnIframes;
    this.powerLevel = Math.max(1, this.powerLevel - 1);
    this.fireCd = 0;
    this.lockout = 0;
  }

  gainWeapon(ctx: PlayerCtx) {
    this.powerLevel = Math.min(3, this.powerLevel + 1);
    this.pickupFx(ctx);
  }

  gainShield(ctx: PlayerCtx) {
    this.hp = Math.min(PLAYER.maxHp, this.hp + 1);
    this.pickupFx(ctx);
  }

  private pickupFx(ctx: PlayerCtx) {
    this.flashGreen = 0.18;
    this.scalePunch = 0.13;
    ctx.audio.powerup();
  }

  draw(rc: CanvasRenderingContext2D, assets: Assets) {
    if (this.blink) return;

    const drawX = this.x + this.recoil;
    rc.save();
    rc.translate(drawX, this.y);

    const punch = this.scalePunch > 0 ? 1 + Math.sin((this.scalePunch / 0.13) * Math.PI) * 0.14 : 1;
    if (punch !== 1) rc.scale(punch, punch);

    // banking by vertical velocity (cosmetic)
    const bank = clamp(this.vy / PLAYER.speed, -1, 1) * 0.18;

    // charge aura
    if (this.charging && this.chargeTime > 0.08) {
      const r = 22 + this.chargeRatio * 16;
      rc.save();
      rc.globalCompositeOperation = "lighter";
      const g = rc.createRadialGradient(8, 0, 2, 8, 0, r);
      const full = this.chargeTime >= PLAYER.chargeFullTime;
      g.addColorStop(0, full ? "rgba(125,249,255,0.55)" : "rgba(34,227,255,0.35)");
      g.addColorStop(1, "rgba(34,227,255,0)");
      rc.fillStyle = g;
      rc.beginPath();
      rc.arc(8, 0, r, 0, TAU);
      rc.fill();
      rc.restore();
    }

    // engine flame (3-frame strip, 32x24)
    const flame = assets.flame;
    const frame = Math.floor(this.anim * 16) % 3;
    rc.drawImage(flame as CanvasImageSource, frame * 32, 0, 32, 24, -PLAYER.spriteW / 2 - 18, -12, 32, 24);

    rc.rotate(bank);
    const ship = assets.player;
    rc.drawImage(ship as CanvasImageSource, -PLAYER.spriteW / 2, -PLAYER.spriteH / 2, PLAYER.spriteW, PLAYER.spriteH);

    if (this.flashGreen > 0) {
      rc.globalCompositeOperation = "lighter";
      rc.globalAlpha = (this.flashGreen / 0.18) * 0.5;
      rc.fillStyle = "#5CFFB0";
      rc.fillRect(-PLAYER.spriteW / 2, -PLAYER.spriteH / 2, PLAYER.spriteW, PLAYER.spriteH);
    }
    rc.restore();
  }
}

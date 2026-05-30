// Enemy craft. One class drives every type via a switch on `type`; the design's
// concrete movement/fire numbers are encoded here.

import type { Assets } from "../assets";
import type { World, EnemyTypeId, EnemyOpts } from "../types";
import { ENEMY_DEFS, type EnemyDef } from "../spec";
import { whiteSilhouette } from "../sprites";
import { clamp, TAU } from "../math";

const RAD = Math.PI / 180;

export class Enemy {
  readonly def: EnemyDef;
  readonly hitR: number;
  hp: number;
  readonly maxHp: number;
  dead = false;

  private t = 0;
  private flash = 0;
  private spawnY: number;
  private amp: number;
  private period: number;
  private phase: number;
  private anchorX: number;

  // per-type state
  private vx = 0;
  private vy = 0;
  private targetY = 0;
  private locked = false;
  private firedLock = false;
  private anchored = false;
  private anchorTimer = 0;
  private leaving = false;
  private fireTimer = 0;
  private strafePhase: "enter" | "strafe" | "boost" = "enter";
  private strafeStart = 0;
  private burstShots = 0;
  private burstTimer = 0;
  private domeAngle = Math.PI; // turret aim, faces left by default

  constructor(
    readonly id: number,
    readonly type: EnemyTypeId,
    public x: number,
    public y: number,
    opts: EnemyOpts = {}
  ) {
    this.def = ENEMY_DEFS[type];
    this.hitR = this.def.hitR;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.spawnY = y;
    this.amp = opts.amplitude ?? 80;
    this.period = opts.period ?? 2.2;
    this.phase = opts.phase ?? 0;
    this.anchorX = opts.anchorX ?? 740;

    // initialise per-type timers
    if (type === "waver") this.fireTimer = 1.0;
    if (type === "pod") {
      this.vx = -90;
      this.vy = 0;
    }
  }

  takeDamage(dmg: number): boolean {
    this.hp -= dmg;
    this.flash = 0.06;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      return true;
    }
    return false;
  }

  /** Mark off-screen/expired; cleanup() drops it. Scoring lives in Game.onEnemyKilled. */
  private cull() {
    this.dead = true;
  }

  update(dt: number, world: World) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;

    switch (this.type) {
      case "drifter":
        this.x -= 140 * dt;
        break;
      case "waver":
        this.updateWaver(dt, world, 120);
        break;
      case "diver":
        this.updateDiver(dt, world);
        break;
      case "turret":
        this.updateTurret(dt, world);
        break;
      case "strafer":
        this.updateStrafer(dt, world);
        break;
      case "pod":
        this.updatePod(dt, world);
        break;
    }

    // cull when well off-screen
    if (this.x < -90 || this.y < -160 || this.y > world.H + 160) this.cull();
  }

  private aimVel(world: World, speed: number, spreadDeg = 0): [number, number] {
    const ang = Math.atan2(world.player.y - this.y, world.player.x - this.x) + spreadDeg * RAD;
    return [Math.cos(ang) * speed, Math.sin(ang) * speed];
  }

  private updateWaver(dt: number, world: World, hspeed: number) {
    this.x -= hspeed * dt;
    this.y = this.spawnY + this.amp * Math.sin((TAU * this.t) / this.period + this.phase);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.x < world.W && this.x > 40) {
      const [vx, vy] = this.aimVel(world, 220);
      world.spawnEnemyBullet(this.x - 10, this.y, vx, vy, "a");
      world.audio.enemyShoot();
      this.fireTimer += 2.5;
    }
  }

  private updateDiver(dt: number, world: World) {
    if (this.t < 0.8) {
      this.x -= 160 * dt;
    } else {
      if (!this.locked) {
        this.locked = true;
        this.targetY = clamp(world.player.y, 30, world.H - 30);
      }
      if (!this.firedLock) {
        this.firedLock = true;
        const [vx, vy] = this.aimVel(world, 240);
        world.spawnEnemyBullet(this.x - 10, this.y, vx, vy, "a");
        world.audio.enemyShoot();
      }
      this.x -= 200 * dt;
      this.y += clamp(this.targetY - this.y, -180 * dt, 180 * dt);
    }
  }

  private updateTurret(dt: number, world: World) {
    // aim dome at player
    this.domeAngle = Math.atan2(world.player.y - this.y, world.player.x - this.x);

    if (!this.anchored && !this.leaving) {
      this.x -= 100 * dt;
      if (this.x <= this.anchorX) {
        this.x = this.anchorX;
        this.anchored = true;
        this.fireTimer = 0.6;
        this.anchorTimer = 0;
      }
      return;
    }

    if (this.anchored) {
      this.anchorTimer += dt;
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        // 3-way spread, center aimed at player
        const base = this.domeAngle;
        for (const off of [-18, 0, 18]) {
          const a = base + off * RAD;
          world.spawnEnemyBullet(this.x - 12, this.y, Math.cos(a) * 200, Math.sin(a) * 200, "b");
        }
        world.audio.enemyShoot();
        this.fireTimer = 1.8;
      }
      if (this.anchorTimer >= 8) {
        this.anchored = false;
        this.leaving = true;
      }
      return;
    }

    // leaving
    this.x -= 100 * dt;
  }

  private updateStrafer(dt: number, world: World) {
    switch (this.strafePhase) {
      case "enter":
        this.x -= 260 * dt;
        if (this.x <= 620) {
          this.x = 620;
          this.strafePhase = "strafe";
          this.strafeStart = this.t;
          this.spawnY = this.y;
          this.fireTimer = 0.7;
          this.burstShots = 0;
        }
        break;
      case "strafe": {
        const tp = this.t - this.strafeStart;
        this.x -= 70 * dt;
        this.y = this.spawnY + 120 * Math.sin((TAU * tp) / 1.4);
        // aimed 3-shot bursts every 1.2s
        this.fireTimer -= dt;
        if (this.burstShots > 0) {
          this.burstTimer -= dt;
          if (this.burstTimer <= 0) {
            const [vx, vy] = this.aimVel(world, 260);
            world.spawnEnemyBullet(this.x - 10, this.y, vx, vy, "a");
            this.burstShots--;
            this.burstTimer = 0.12;
            world.audio.enemyShoot();
          }
        } else if (this.fireTimer <= 0) {
          this.burstShots = 3;
          this.burstTimer = 0;
          this.fireTimer = 1.2;
        }
        if (tp > 5 || this.x <= 200) this.strafePhase = "boost";
        break;
      }
      case "boost":
        this.x -= 300 * dt;
        break;
    }
  }

  private updatePod(dt: number, world: World) {
    // limited-turn homing
    const desired = Math.atan2(world.player.y - this.y, world.player.x - this.x);
    const cur = Math.atan2(this.vy, this.vx);
    let diff = desired - cur;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    const maxTurn = 2.4 * dt;
    const turn = clamp(diff, -maxTurn, maxTurn);
    const ang = cur + turn;
    const speed = 90;
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.t > 8) this.cull();
  }

  draw(rc: CanvasRenderingContext2D, assets: Assets) {
    const img = assets[this.def.img];
    const w = this.def.w;
    const h = this.def.h;
    rc.save();
    rc.translate(this.x, this.y);

    if (this.type === "pod") {
      // homing missile: glowing orb with a tail
      rc.save();
      rc.globalCompositeOperation = "lighter";
      rc.globalAlpha = 0.5;
      rc.drawImage(img as CanvasImageSource, -16, -6, 26, 12);
      rc.restore();
      rc.drawImage(img as CanvasImageSource, -w / 2, -h / 2, w, h);
      rc.restore();
      return;
    }

    rc.drawImage(img as CanvasImageSource, -w / 2, -h / 2, w, h);

    if (this.flash > 0) {
      rc.globalAlpha = clamp(this.flash / 0.06, 0, 1);
      rc.drawImage(whiteSilhouette(img) as CanvasImageSource, -w / 2, -h / 2, w, h);
      rc.globalAlpha = 1;
    }

    // low-HP damage hint for tanky enemies
    if (this.maxHp >= 5 && this.hp <= this.maxHp * 0.4 && this.flash <= 0) {
      rc.globalAlpha = 0.25 + 0.15 * Math.sin(this.t * 18);
      rc.globalCompositeOperation = "lighter";
      rc.drawImage(whiteSilhouette(img) as CanvasImageSource, -w / 2, -h / 2, w, h);
      rc.globalAlpha = 1;
    }
    rc.restore();
  }
}

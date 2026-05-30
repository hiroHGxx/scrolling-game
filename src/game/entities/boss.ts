// "Gorgon Core" boss: a slide-in entrance, three HP-gated phases, and an
// armored eye weak-point that only takes full damage while open (during the
// boss's own firing tells). Body always takes chip damage.

import type { Assets } from "../assets";
import type { World } from "../types";
import { BOSS } from "../spec";
import { whiteSilhouette, tinted } from "../sprites";
import { clamp, dist, TAU } from "../math";

const RAD = Math.PI / 180;
const TELE_DASH = [12, 8]; // shared dash pattern for laser telegraphs
export const BOSS_ID = -1;

type ActionKind = "aimedFan" | "sweep" | "spiral" | "pods" | "cross" | "panic" | "rest";
interface Action {
  kind: ActionKind;
  dur: number;
  time: number;
  fired: boolean;
  emitT: number;
}

const PHASE_ACTIONS: Record<number, Array<{ kind: ActionKind; dur: number }>> = {
  1: [
    { kind: "aimedFan", dur: 1.0 },
    { kind: "rest", dur: 0.8 },
    { kind: "aimedFan", dur: 1.0 },
    { kind: "rest", dur: 0.7 },
    { kind: "sweep", dur: 1.8 },
    { kind: "rest", dur: 1.0 },
  ],
  2: [
    { kind: "spiral", dur: 2.5 },
    { kind: "rest", dur: 0.6 },
    { kind: "pods", dur: 0.5 },
    { kind: "rest", dur: 0.6 },
    { kind: "spiral", dur: 2.5 },
    { kind: "rest", dur: 1.2 },
  ],
  3: [
    { kind: "cross", dur: 2.6 },
    { kind: "rest", dur: 0.4 },
    { kind: "panic", dur: 0.6 },
    { kind: "panic", dur: 0.6 },
    { kind: "rest", dur: 0.5 },
  ],
};

export class Boss {
  readonly name = "GORGON CORE";
  readonly maxHp: number = BOSS.hp;
  hp: number = BOSS.hp;

  x: number = BOSS.entranceFromX;
  y: number = BOSS.centerY;
  state: "enter" | "fight" | "dead" = "enter";
  phase = 1;
  barVisible = false;

  private t = 0;
  private enterT = 0;
  private flash = 0;
  private stagger = 0;

  private actionIndex = 0;
  private action: Action | null = null;

  eyeOpen = false;
  readonly eyeR = BOSS.eyeR;

  // live beam geometry (read by collision + draw)
  private sweepTele = false;
  private sweepOn = false;
  private sweepY = 0;
  private crossTele = false;
  private crossOn = false;
  private crossAngle = 0;

  private spiralAngle = 0;
  private trashTimer = 3.5;
  private pendingDesperation = false;
  private desperationFired = false;

  get cx() {
    return this.x;
  }
  get cy() {
    return this.y;
  }

  eyeContains(px: number, py: number): boolean {
    return this.eyeOpen && dist(px, py, this.cx, this.cy) <= this.eyeR;
  }
  bodyContains(px: number, py: number): boolean {
    return Math.abs(px - this.cx) <= BOSS.bodyHalfW && Math.abs(py - this.cy) <= BOSS.bodyHalfH;
  }

  /** Apply damage; isEye => full, else chip. Returns true if this hit kills. */
  applyDamage(raw: number, isEye: boolean): boolean {
    if (this.state !== "fight") return false;
    const dmg = isEye ? raw : raw * BOSS.bodyDamageMul;
    this.hp -= dmg;
    this.flash = 0.06;
    if (!this.desperationFired && this.hp <= this.maxHp * 0.13 && this.hp > 0) {
      this.pendingDesperation = true;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "dead";
      this.sweepOn = this.sweepTele = this.crossOn = this.crossTele = false;
      this.eyeOpen = false;
      return true;
    }
    return false;
  }

  update(dt: number, world: World) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;

    if (this.state === "enter") {
      this.enterT += dt;
      const k = clamp(this.enterT / BOSS.entranceTime, 0, 1);
      const ease = 1 - (1 - k) * (1 - k);
      this.x = BOSS.entranceFromX + (BOSS.anchorX - BOSS.entranceFromX) * ease;
      this.y = BOSS.centerY;
      if (this.enterT >= BOSS.entranceTime) {
        this.x = BOSS.anchorX;
        this.barVisible = true;
        if (this.enterT >= BOSS.entranceTime + 0.8) {
          this.state = "fight";
          world.audio.bossAlarm();
        }
      } else if (!this.barVisible && this.enterT > BOSS.entranceTime * 0.4) {
        this.barVisible = true;
      }
      return;
    }

    if (this.state === "dead") return;

    // bob
    this.y = BOSS.centerY + Math.sin(this.t * (this.phase >= 3 ? 2.6 : 1.8)) * BOSS.bobAmp;

    // phase transitions
    const ratio = this.hp / this.maxHp;
    const newPhase = ratio > BOSS.phase2At ? 1 : ratio > BOSS.phase3At ? 2 : 3;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.actionIndex = 0;
      this.action = null;
      this.stagger = newPhase === 3 ? 0.8 : 0.5;
      this.flash = 0.2;
      world.addTrauma(0.3);
      world.audio.bossAlarm();
      this.sweepOn = this.sweepTele = this.crossOn = this.crossTele = false;
    }

    if (this.stagger > 0) {
      this.stagger -= dt;
      this.eyeOpen = false;
      return;
    }

    // desperation ring (once)
    if (this.pendingDesperation && !this.desperationFired) {
      this.desperationFired = true;
      this.pendingDesperation = false;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        world.spawnEnemyBullet(this.cx, this.cy, Math.cos(a) * 160, Math.sin(a) * 160, "a");
      }
      world.audio.bossAlarm();
      world.addTrauma(0.4);
    }

    this.runActions(dt, world);
    this.runTrash(dt, world);
    this.checkContact(world);
    this.checkBeams(world);
  }

  private nextAction() {
    const list = PHASE_ACTIONS[this.phase];
    const spec = list[this.actionIndex % list.length];
    this.actionIndex++;
    this.action = { kind: spec.kind, dur: spec.dur, time: 0, fired: false, emitT: 0 };
    // set eye state for the action
    this.eyeOpen = spec.kind === "aimedFan" || spec.kind === "sweep" || spec.kind === "spiral" || spec.kind === "cross";
    this.sweepOn = this.sweepTele = this.crossOn = this.crossTele = false;
  }

  private runActions(dt: number, world: World) {
    if (!this.action) this.nextAction();
    const a = this.action!;
    a.time += dt;

    switch (a.kind) {
      case "aimedFan": {
        if (!a.fired && a.time >= 0.4) {
          a.fired = true;
          const base = Math.atan2(world.player.y - this.cy, world.player.x - this.cx);
          for (const off of [-12, 0, 12]) {
            const ang = base + off * RAD;
            world.spawnEnemyBullet(this.cx, this.cy, Math.cos(ang) * 220, Math.sin(ang) * 220, "a");
          }
          world.audio.enemyShoot();
        }
        break;
      }
      case "sweep": {
        if (a.time < 0.6) {
          this.sweepTele = true;
          this.sweepOn = false;
          this.sweepY = 70;
        } else {
          if (!a.fired) {
            a.fired = true;
            world.audio.enemyShoot();
            world.addTrauma(0.12);
          }
          this.sweepTele = false;
          this.sweepOn = true;
          const p = clamp((a.time - 0.6) / 1.2, 0, 1);
          this.sweepY = 70 + (world.H - 140) * p;
        }
        break;
      }
      case "spiral": {
        a.emitT -= dt;
        if (a.emitT <= 0) {
          a.emitT = 0.12;
          this.spiralAngle += 22 * RAD;
          const ang = this.spiralAngle;
          world.spawnEnemyBullet(this.cx, this.cy, Math.cos(ang) * 180, Math.sin(ang) * 180, "a");
          // second arm opposite for density
          world.spawnEnemyBullet(this.cx, this.cy, Math.cos(ang + Math.PI) * 180, Math.sin(ang + Math.PI) * 180, "a");
        }
        break;
      }
      case "pods": {
        if (!a.fired) {
          a.fired = true;
          world.spawnEnemy("pod", this.cx - 40, this.cy - 30);
          world.spawnEnemy("pod", this.cx - 40, this.cy + 30);
          world.audio.enemyShoot();
        }
        break;
      }
      case "cross": {
        if (a.time < 0.6) {
          this.crossTele = true;
          this.crossOn = false;
        } else {
          if (!a.fired) {
            a.fired = true;
            world.audio.bossAlarm();
            world.addTrauma(0.15);
          }
          this.crossTele = false;
          this.crossOn = true;
          this.crossAngle += (45 * RAD * dt) / 2.0;
        }
        break;
      }
      case "panic": {
        if (!a.fired) {
          a.fired = true;
          const base = Math.atan2(world.player.y - this.cy, world.player.x - this.cx);
          for (const off of [-40, -20, 0, 20, 40]) {
            const ang = base + off * RAD;
            world.spawnEnemyBullet(this.cx, this.cy, Math.cos(ang) * 200, Math.sin(ang) * 200, "a");
          }
          world.audio.enemyShoot();
        }
        break;
      }
      case "rest":
        this.eyeOpen = false;
        break;
    }

    if (a.time >= a.dur) this.nextAction();
  }

  private runTrash(dt: number, world: World) {
    if (this.phase === 3) return; // P3 has no trash
    this.trashTimer -= dt;
    if (this.trashTimer <= 0) {
      if (this.phase === 1) {
        this.trashTimer = 3.6;
        const top = Math.random() < 0.5;
        world.spawnEnemy("drifter", this.cx - 120, top ? this.cy - 120 : this.cy + 120);
      } else {
        this.trashTimer = 5.0;
        world.spawnEnemy("diver", 940, -20);
        world.spawnEnemy("diver", 940, world.H + 20);
      }
    }
  }

  private checkContact(world: World) {
    const p = world.player;
    if (!p.isHittable()) return;
    if (Math.abs(p.x - this.cx) <= BOSS.bodyHalfW + p.hitR && Math.abs(p.y - this.cy) <= BOSS.bodyHalfH + p.hitR) {
      world.damagePlayer();
    }
  }

  private checkBeams(world: World) {
    const p = world.player;
    if (!p.isHittable()) return;
    if (this.sweepOn) {
      if (Math.abs(p.y - this.sweepY) <= 13 && p.x <= this.cx) {
        world.damagePlayer();
        return;
      }
    }
    if (this.crossOn) {
      const u = p.x - this.cx;
      const v = p.y - this.cy;
      const s = Math.sin(this.crossAngle);
      const c = Math.cos(this.crossAngle);
      const d1 = Math.abs(-u * s + v * c);
      const d2 = Math.abs(u * c + v * s);
      if (Math.min(d1, d2) <= 9) {
        world.damagePlayer();
      }
    }
  }

  // ---- drawing ----------------------------------------------------------

  draw(rc: CanvasRenderingContext2D, assets: Assets) {
    // beams first (under the boss hull glow but over background)
    this.drawBeams(rc);

    const img = assets.boss;
    const w = BOSS.spriteW;
    const h = BOSS.spriteH;
    rc.save();
    rc.translate(this.cx, this.cy);
    rc.drawImage(img as CanvasImageSource, -w / 2, -h / 2, w, h);

    // damage reddening below 30%
    const ratio = this.hp / this.maxHp;
    if (ratio < 0.3 && this.state !== "dead") {
      rc.globalAlpha = (0.3 - ratio) * 1.6;
      rc.globalCompositeOperation = "source-over";
      rc.drawImage(tinted(img, "#FF3B2F") as CanvasImageSource, -w / 2, -h / 2, w, h);
      rc.globalAlpha = 1;
    }

    // hit flash
    if (this.flash > 0) {
      rc.globalAlpha = clamp(this.flash / 0.06, 0, 1) * 0.9;
      rc.drawImage(whiteSilhouette(img) as CanvasImageSource, -w / 2, -h / 2, w, h);
      rc.globalAlpha = 1;
    }
    rc.restore();

    // eye overlay when open
    if (this.eyeOpen && this.state === "fight") {
      const pulse = 0.85 + 0.15 * Math.sin(this.t * 12);
      const s = this.eyeR * 2.4 * pulse;
      rc.save();
      rc.globalCompositeOperation = "lighter";
      rc.drawImage(assets.bossEye as CanvasImageSource, this.cx - s / 2, this.cy - s / 2, s, s);
      rc.restore();
    }
  }

  private drawBeams(rc: CanvasRenderingContext2D) {
    if (this.sweepTele || this.sweepOn) {
      rc.save();
      if (this.sweepTele) {
        rc.strokeStyle = "rgba(255,45,126,0.7)";
        rc.lineWidth = 2;
        rc.setLineDash(TELE_DASH);
      } else {
        rc.globalCompositeOperation = "lighter";
        rc.strokeStyle = "#FF6A3D";
        rc.shadowColor = "#FF2D7E";
        rc.shadowBlur = 16;
        rc.lineWidth = 22;
      }
      rc.beginPath();
      rc.moveTo(0, this.sweepY);
      rc.lineTo(this.cx, this.sweepY);
      rc.stroke();
      if (this.sweepOn) {
        rc.lineWidth = 8;
        rc.strokeStyle = "#FFFFFF";
        rc.beginPath();
        rc.moveTo(0, this.sweepY);
        rc.lineTo(this.cx, this.sweepY);
        rc.stroke();
      }
      rc.restore();
    }

    if (this.crossTele || this.crossOn) {
      rc.save();
      rc.translate(this.cx, this.cy);
      rc.rotate(this.crossAngle);
      const L = 1400;
      const drawArmSet = (lw: number, stroke: string, glow?: string) => {
        rc.lineWidth = lw;
        rc.strokeStyle = stroke;
        if (glow) {
          rc.shadowColor = glow;
          rc.shadowBlur = 14;
        }
        rc.beginPath();
        rc.moveTo(-L, 0);
        rc.lineTo(L, 0);
        rc.moveTo(0, -L);
        rc.lineTo(0, L);
        rc.stroke();
      };
      if (this.crossTele) {
        rc.strokeStyle = "rgba(255,45,126,0.7)";
        rc.lineWidth = 2;
        rc.setLineDash(TELE_DASH);
        rc.beginPath();
        rc.moveTo(-L, 0);
        rc.lineTo(L, 0);
        rc.moveTo(0, -L);
        rc.lineTo(0, L);
        rc.stroke();
      } else {
        rc.globalCompositeOperation = "lighter";
        drawArmSet(18, "#FF6A3D", "#FF2D7E");
        drawArmSet(6, "#FFFFFF");
      }
      rc.restore();
    }
  }
}

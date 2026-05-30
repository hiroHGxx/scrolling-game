// Lightweight particle system with a recycling pool. Used for explosions,
// muzzle sparks, engine trails and shockwave rings. Colors are passed in by
// the caller so this module stays independent of the palette.

import { TAU, randRange, pick } from "./math";

type Kind = "spark" | "smoke" | "ring" | "debris";

interface Particle {
  active: boolean;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  growth: number; // size delta per second (rings expand, smoke grows)
  drag: number;
  rot: number;
  spin: number;
  color: string;
  glow: boolean;
}

function make(): Particle {
  return {
    active: false,
    kind: "spark",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    growth: 0,
    drag: 0,
    rot: 0,
    spin: 0,
    color: "#fff",
    glow: false,
  };
}

export class Particles {
  private pool: Particle[] = [];
  private free: number[] = []; // stack of inactive slot indices
  private cursor = 0; // ring cursor, used only when fully saturated

  constructor(private capacity = 1200) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push(make());
      this.free.push(i);
    }
  }

  private alloc(): Particle {
    // O(1): pop a free slot, or overwrite the oldest when saturated.
    if (this.free.length > 0) return this.pool[this.free.pop()!];
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    return p;
  }

  clear() {
    for (const p of this.pool) p.active = false;
    this.free.length = 0;
    for (let i = 0; i < this.capacity; i++) this.free.push(i);
    this.cursor = 0;
  }

  /** Burst of sparks + smoke for an explosion. */
  explosion(x: number, y: number, colors: string[], scale = 1) {
    const sparkCount = Math.round(14 * scale);
    for (let i = 0; i < sparkCount; i++) {
      const a = randRange(0, TAU);
      const sp = randRange(60, 320) * scale;
      const p = this.alloc();
      p.active = true;
      p.kind = "spark";
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = p.maxLife = randRange(0.3, 0.7) * scale;
      p.size = randRange(1.5, 3.5) * scale;
      p.growth = -p.size * 0.6;
      p.drag = 2.2;
      p.color = pick(colors);
      p.glow = true;
    }
    const smokeCount = Math.round(6 * scale);
    for (let i = 0; i < smokeCount; i++) {
      const a = randRange(0, TAU);
      const sp = randRange(10, 70) * scale;
      const p = this.alloc();
      p.active = true;
      p.kind = "smoke";
      p.x = x + randRange(-6, 6);
      p.y = y + randRange(-6, 6);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 8;
      p.life = p.maxLife = randRange(0.5, 1.1) * scale;
      p.size = randRange(6, 14) * scale;
      p.growth = randRange(10, 26) * scale;
      p.drag = 1.4;
      p.color = "rgba(40,46,70,1)";
      p.glow = false;
    }
    // shockwave ring
    this.ring(x, y, colors[0] ?? "#fff", 4, 220 * scale, 0.35);
  }

  ring(x: number, y: number, color: string, startR: number, expandSpeed: number, life: number) {
    const p = this.alloc();
    p.active = true;
    p.kind = "ring";
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.life = p.maxLife = life;
    p.size = startR;
    p.growth = expandSpeed;
    p.drag = 0;
    p.color = color;
    p.glow = true;
  }

  /** A few sparks at the gun muzzle when firing. */
  muzzle(x: number, y: number, color: string, dir = 1) {
    for (let i = 0; i < 3; i++) {
      const p = this.alloc();
      p.active = true;
      p.kind = "spark";
      p.x = x;
      p.y = y + randRange(-2, 2);
      p.vx = dir * randRange(80, 200);
      p.vy = randRange(-40, 40);
      p.life = p.maxLife = randRange(0.08, 0.16);
      p.size = randRange(1, 2.4);
      p.growth = -4;
      p.drag = 4;
      p.color = color;
      p.glow = true;
    }
  }

  /** Engine trail behind the player ship. */
  thruster(x: number, y: number, color: string) {
    const p = this.alloc();
    p.active = true;
    p.kind = "spark";
    p.x = x;
    p.y = y + randRange(-2.5, 2.5);
    p.vx = randRange(-180, -90);
    p.vy = randRange(-18, 18);
    p.life = p.maxLife = randRange(0.12, 0.26);
    p.size = randRange(2, 4);
    p.growth = -6;
    p.drag = 1.5;
    p.color = color;
    p.glow = true;
  }

  /** Flying debris chunks (boss death etc). */
  debris(x: number, y: number, colors: string[], count = 10, scale = 1) {
    for (let i = 0; i < count; i++) {
      const a = randRange(0, TAU);
      const sp = randRange(40, 240) * scale;
      const p = this.alloc();
      p.active = true;
      p.kind = "debris";
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = p.maxLife = randRange(0.6, 1.4);
      p.size = randRange(2, 5) * scale;
      p.growth = 0;
      p.drag = 0.8;
      p.rot = randRange(0, TAU);
      p.spin = randRange(-10, 10);
      p.color = pick(colors);
      p.glow = false;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.free.push(i);
        continue;
      }
      const dragFactor = 1 - Math.min(1, p.drag * dt);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      if (p.kind === "debris" || p.kind === "smoke") p.vy += 120 * dt; // gravity-ish
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.1, p.size + p.growth * dt);
      p.rot += p.spin * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife; // 1 -> 0
      ctx.globalAlpha = Math.max(0, Math.min(1, t));

      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 2.5;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;

      switch (p.kind) {
        case "ring": {
          ctx.globalAlpha = Math.max(0, t * 0.8);
          ctx.lineWidth = Math.max(1, 3 * t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
          break;
        }
        case "smoke": {
          ctx.globalAlpha = Math.max(0, t * 0.4);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          break;
        }
        case "debris": {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
          break;
        }
        default: {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}

// Central game orchestrator: fixed-timestep simulation, wave spawner,
// collisions, boss fight, screen shake / hitstop / slow-motion, scoring and the
// title / pause / game-over / stage-clear flow.

import type { Assets } from "./assets";
import { Input } from "./input";
import { AudioEngine } from "./audio";
import { Particles } from "./particles";
import { Background } from "./background";
import { Player, type PlayerCtx } from "./entities/player";
import { Enemy } from "./entities/enemy";
import { Boss, BOSS_ID } from "./entities/boss";
import { Powerup } from "./entities/powerup";
import {
  VIEW,
  WAVES,
  PICKUPS,
  BOSS,
  BOSS_START_TIME,
  TITLE,
  SUBTITLE,
  type Wave,
} from "./spec";
import type { World, EnemyTypeId, EnemyOpts, PowerupType, PlayerBullet, EnemyBullet } from "./types";
import { clamp, circlesHit, dist, lerp, randRange, pick, segPointDist } from "./math";
import {
  drawHud,
  drawBossBar,
  drawCharge,
  drawVignette,
  drawWarningBanner,
  neonText,
  type HudState,
} from "./hud";

const STEP = 1 / 60;
const HI_KEY = "neon-derelict-hi";

type GameState = "title" | "playing" | "paused" | "gameover" | "stageclear";

interface PendingSpawn {
  at: number;
  type: EnemyTypeId;
  x: number;
  y: number;
  opts: EnemyOpts;
}

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
}

interface DeathSeq {
  t: number;
  nextBoom: number;
  booms: number;
}

export class Game implements World {
  readonly W = VIEW.W;
  readonly H = VIEW.H;

  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly particles = new Particles(1400);
  private background: Background;

  player = new Player();
  enemies: Enemy[] = [];
  playerBullets: PlayerBullet[] = [];
  enemyBullets: EnemyBullet[] = [];
  powerups: Powerup[] = [];
  boss: Boss | null = null;

  state: GameState = "title";
  private clock = 0; // real-time UI clock
  private acc = 0;
  stageTime = 0;

  score = 0;
  hi = 0;
  combo = 0;
  private comboTimer = 0;
  private popups: ScorePopup[] = [];

  private trauma = 0;
  private hitstop = 0;
  private slowmoT = 0;
  private whiteFlash = 0;
  private overlayLock = 0;

  private waveIndex = 0;
  private pickupIndex = 0;
  private pending: PendingSpawn[] = [];
  private bossStarted = false;
  private scrollFlow = 1;
  private death: DeathSeq | null = null;

  private nextId = 1;
  private readonly pctx: PlayerCtx;

  constructor(private canvas: HTMLCanvasElement, private assets: Assets) {
    this.input = new Input(canvas);
    this.background = new Background(assets);
    this.hi = this.loadHi();
    this.pctx = {
      bullets: this.playerBullets,
      particles: this.particles,
      audio: this.audio,
      addTrauma: (n) => this.addTrauma(n),
      hitStop: (f) => this.hitStop(f),
      onChargeFire: (lvl) => this.onChargeFire(lvl),
    };
  }

  // ---- World interface --------------------------------------------------
  get time() {
    return this.stageTime;
  }
  spawnEnemyBullet(x: number, y: number, vx: number, vy: number, sprite: "a" | "b") {
    this.enemyBullets.push({ x, y, vx, vy, r: 4, sprite, dead: false });
  }
  spawnEnemy(type: EnemyTypeId, x: number, y: number, opts: EnemyOpts = {}): Enemy {
    const e = new Enemy(this.nextId++, type, x, y, opts);
    this.enemies.push(e);
    return e;
  }
  spawnPowerup(type: PowerupType, x: number, y: number) {
    this.powerups.push(new Powerup(type, x, y));
  }
  addTrauma(n: number) {
    this.trauma = clamp(this.trauma + n, 0, 1);
  }
  hitStop(frames: number) {
    this.hitstop = Math.max(this.hitstop, frames);
  }
  damagePlayer() {
    if (this.player.isHittable()) this.player.hit(this.pctx);
  }
  addScore(amount: number, x?: number, y?: number) {
    this.score += amount;
    if (x !== undefined && y !== undefined) {
      this.popups.push({ x, y, text: "+" + amount, life: 0.7 });
    }
  }

  private onChargeFire(level: "mid" | "full") {
    this.whiteFlash = Math.max(this.whiteFlash, level === "full" ? 0.4 : 0.18);
  }

  get multiplier(): number {
    return clamp(1 + Math.floor(this.combo / 8), 1, 8);
  }

  // ---- lifecycle --------------------------------------------------------
  private loadHi(): number {
    try {
      return parseInt(localStorage.getItem(HI_KEY) ?? "0", 10) || 0;
    } catch {
      return 0;
    }
  }
  private saveHi() {
    if (this.score > this.hi) {
      this.hi = this.score;
      try {
        localStorage.setItem(HI_KEY, String(this.hi));
      } catch {
        /* ignore */
      }
    }
  }

  private startGame() {
    this.audio.resume();
    this.player.reset();
    this.enemies.length = 0;
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    this.powerups.length = 0;
    this.popups.length = 0;
    this.particles.clear();
    this.background.reset();
    this.clock = 0;
    this.boss = null;
    this.death = null;
    this.stageTime = 0;
    this.acc = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.trauma = 0;
    this.hitstop = 0;
    this.slowmoT = 0;
    this.whiteFlash = 0;
    this.waveIndex = 0;
    this.pickupIndex = 0;
    this.pending.length = 0;
    this.bossStarted = false;
    this.scrollFlow = 1;
    this.nextId = 1;
    this.state = "playing";
    this.audio.setBossMusic(false);
    this.audio.resetMusicPhase();
    this.audio.startMusic();
  }

  private toTitle() {
    this.state = "title";
  }

  private endGame(win: boolean) {
    this.saveHi();
    this.state = win ? "stageclear" : "gameover";
    this.overlayLock = 1.0;
    this.audio.setBossMusic(false);
    if (win) this.audio.victory();
    else this.audio.gameOver();
    // End the loop music with the stage either way, so the overlay + the
    // returned title screen are silent (matching first load).
    this.audio.stopMusic();
  }

  // ---- per-frame --------------------------------------------------------
  update(dt: number) {
    this.clock += dt;
    if (this.overlayLock > 0) this.overlayLock -= dt;
    this.handleTransitions();

    if (this.state === "playing") {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 15) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= 15) this.acc = 0; // avoid spiral of death
    } else {
      this.acc = 0;
    }
  }

  private handleTransitions() {
    if (this.input.pressed("mute")) this.audio.toggleMute();

    switch (this.state) {
      case "title":
        if (this.input.pressed("start") || this.input.pointerJustDown) {
          this.audio.resume();
          this.startGame();
        }
        break;
      case "playing":
        if (this.input.pressed("pause")) {
          this.state = "paused";
          this.audio.stopMusic();
        }
        break;
      case "paused":
        if (this.input.pressed("pause") || this.input.pressed("start")) {
          this.state = "playing";
          this.audio.startMusic();
        }
        break;
      case "gameover":
      case "stageclear":
        if (this.overlayLock <= 0 && (this.input.pressed("start") || this.input.pointerJustDown)) {
          this.toTitle();
        }
        break;
    }
  }

  // ---- simulation step --------------------------------------------------
  private step(dt: number) {
    // real-time timers (unaffected by slow-mo)
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - 1.5 * dt);
    if (this.whiteFlash > 0) this.whiteFlash = Math.max(0, this.whiteFlash - dt * 2.5);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    let scale = 1;
    if (this.hitstop > 0) {
      this.hitstop -= 1;
      scale = 0;
    } else if (this.slowmoT > 0) {
      this.slowmoT = Math.max(0, this.slowmoT - dt);
      scale = lerp(0.25, 1, 1 - this.slowmoT / 1.2);
    }

    if (this.death) this.updateDeath(dt);

    const sdt = dt * scale;
    if (sdt > 0) this.advance(sdt);
  }

  private advance(dt: number) {
    this.stageTime += dt;

    // scroll halts for the boss
    const targetFlow = this.bossStarted ? 0 : 1;
    this.scrollFlow = lerp(this.scrollFlow, targetFlow, Math.min(1, dt * 1.5));
    this.background.update(dt, this.scrollFlow);

    if (!this.bossStarted) this.runSpawner();

    this.player.update(dt, this.input, this.pctx);

    for (const e of this.enemies) e.update(dt, this);
    if (this.boss) this.boss.update(dt, this);

    this.updateBullets(dt);
    for (const p of this.powerups) p.update(dt);
    this.particles.update(dt);

    this.collide();

    // popups
    for (const pop of this.popups) {
      pop.y -= 40 * dt;
      pop.life -= dt;
    }

    this.cleanup();

    // boss death → money shot
    if (this.boss && this.boss.state === "dead" && !this.death) {
      this.onBossDeath();
    }

    // player death → game over
    if (this.player.dead) {
      this.endGame(false);
    }
  }

  private runSpawner() {
    // trigger waves
    while (this.waveIndex < WAVES.length && this.stageTime >= WAVES[this.waveIndex].t) {
      this.enqueueWave(WAVES[this.waveIndex]);
      this.waveIndex++;
    }
    // process pending spawns
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.stageTime >= this.pending[i].at) {
        const p = this.pending[i];
        this.spawnEnemy(p.type, p.x, p.y, p.opts);
        this.pending.splice(i, 1);
      }
    }
    // pickups
    while (this.pickupIndex < PICKUPS.length && this.stageTime >= PICKUPS[this.pickupIndex].t) {
      const pu = PICKUPS[this.pickupIndex];
      this.spawnPowerup(pu.type, 1000, pu.y);
      this.pickupIndex++;
    }
    // boss start
    if (
      !this.bossStarted &&
      this.waveIndex >= WAVES.length &&
      this.pending.length === 0 &&
      this.stageTime >= BOSS_START_TIME
    ) {
      this.bossStarted = true;
      this.boss = new Boss();
      this.audio.bossAlarm();
      this.audio.setBossMusic(true);
    }
  }

  private enqueueWave(w: Wave) {
    const add = (delay: number, x: number, y: number, opts: EnemyOpts = {}) =>
      this.pending.push({ at: w.t + delay, type: w.type, x, y, opts });

    const amp = w.amp;
    switch (w.form) {
      case "rows": {
        const ys = w.ys ?? [200];
        for (let i = 0; i < w.count; i++) add(i * w.gap, 980, ys[i % ys.length]);
        break;
      }
      case "stream": {
        const y = w.y ?? 270;
        for (let i = 0; i < w.count; i++) add(i * w.gap, 980, y, { amplitude: amp });
        break;
      }
      case "twoStreams": {
        const ys = w.ys ?? [180, 360];
        for (let i = 0; i < w.count; i++) {
          const s = i % 2;
          add(Math.floor(i / 2) * w.gap + s * 0.12, 980, ys[s], { phase: s * Math.PI, amplitude: amp });
        }
        break;
      }
      case "vee": {
        const apex = w.y ?? 270;
        for (let i = 0; i < w.count; i++) {
          if (i === 0) {
            add(0, 980, apex);
          } else {
            const side = i % 2 ? -1 : 1;
            const rank = Math.ceil(i / 2);
            add(i * w.gap, 980 + rank * 30, apex + side * rank * 42);
          }
        }
        break;
      }
      case "topbottom": {
        for (let i = 0; i < w.count; i++) {
          const top = i % 2 === 0;
          add(i * w.gap, 940, top ? -20 : this.H + 20);
        }
        break;
      }
      case "anchors": {
        const ys = w.ys ?? [200];
        for (let i = 0; i < w.count; i++) {
          const ax = (w.anchorX ?? 740) - (i >= 2 ? 60 : 0);
          add(i * w.gap, 1000 + i * 10, ys[i % ys.length], { anchorX: ax });
        }
        break;
      }
    }
  }

  // ---- bullets & collisions --------------------------------------------
  private updateBullets(dt: number) {
    for (const b of this.playerBullets) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x > this.W + 80 || b.x < -120 || b.y < -60 || b.y > this.H + 60) b.dead = true;
    }
    for (const b of this.enemyBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -40 || b.x > this.W + 60 || b.y < -60 || b.y > this.H + 60) b.dead = true;
    }
  }

  private collide() {
    // player bullets vs enemies / boss
    for (const b of this.playerBullets) {
      if (b.dead) continue;
      // enemies
      for (const e of this.enemies) {
        if (e.dead || b.hit?.has(e.id)) continue;
        if (this.bulletHitsCircle(b, e.x, e.y, e.hitR)) {
          b.hit?.add(e.id);
          const killed = e.takeDamage(b.damage);
          this.particles.muzzle(b.x, b.y, "#FFE7A0", -1);
          if (killed) this.onEnemyKilled(e);
          if (!this.consumePierce(b)) break;
        }
      }
      if (b.dead) continue;
      // boss
      const boss = this.boss;
      if (boss && boss.state === "fight" && !b.hit?.has(BOSS_ID)) {
        const onEye = this.bulletHitsCircleOpenEye(b, boss);
        const onBody = onEye || this.bulletHitsBody(b, boss);
        if (onEye || onBody) {
          b.hit?.add(BOSS_ID);
          this.particles.muzzle(b.x, b.y, onEye ? "#FFFFFF" : "#FF9A1E", -1);
          const killed = boss.applyDamage(b.damage, onEye);
          this.addTrauma(0.04);
          if (killed) {
            /* handled by death detection */
          }
          this.consumePierce(b);
        }
      }
    }

    // enemy bullets vs player
    for (const b of this.enemyBullets) {
      if (b.dead) continue;
      if (this.player.isHittable() && circlesHit(b.x, b.y, b.r, this.player.x, this.player.y, this.player.hitR)) {
        b.dead = true;
        this.particles.muzzle(b.x, b.y, "#FFB347", -1);
        this.damagePlayer();
      }
    }

    // enemy bodies vs player
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!circlesHit(e.x, e.y, e.hitR, this.player.x, this.player.y, this.player.hitR)) continue;
      // Pods detonate on contact even during i-frames so they can't "wait out"
      // invulnerability; damagePlayer() itself already no-ops while invulnerable.
      if (e.type === "pod") {
        e.takeDamage(999);
        this.onEnemyKilled(e);
      }
      this.damagePlayer();
    }

    // powerups vs player
    for (const p of this.powerups) {
      if (p.dead) continue;
      if (dist(p.x, p.y, this.player.x, this.player.y) <= p.r + 14) {
        p.dead = true;
        if (p.type === "weapon") this.player.gainWeapon(this.pctx);
        else this.player.gainShield(this.pctx);
        this.addScore(50, p.x, p.y);
      }
    }
  }

  private bulletHitsCircle(b: PlayerBullet, cx: number, cy: number, r: number): boolean {
    if (b.kind === "bolt") {
      // swept test over the bolt's motion this frame so fast bolts can't tunnel
      const ax = b.px ?? b.x;
      const ay = b.py ?? b.y;
      return segPointDist(cx, cy, ax, ay, b.x, b.y) <= r + b.h / 2;
    }
    // beam: AABB [x, x+w] x [y-h/2, y+h/2] vs circle
    const nx = clamp(cx, b.x, b.x + b.w);
    const ny = clamp(cy, b.y - b.h / 2, b.y + b.h / 2);
    return dist(nx, ny, cx, cy) <= r;
  }

  private bulletHitsCircleOpenEye(b: PlayerBullet, boss: Boss): boolean {
    if (!boss.eyeOpen) return false;
    return this.bulletHitsCircle(b, boss.cx, boss.cy, boss.eyeR);
  }

  private bulletHitsBody(b: PlayerBullet, boss: Boss): boolean {
    if (b.kind === "bolt") return boss.bodyContains(b.x, b.y);
    // beam: full band (AABB) vs the boss body AABB, including beam half-height
    const left = b.x;
    const right = b.x + b.w;
    const top = b.y - b.h / 2;
    const bot = b.y + b.h / 2;
    return (
      right >= boss.cx - BOSS.bodyHalfW &&
      left <= boss.cx + BOSS.bodyHalfW &&
      bot >= boss.cy - BOSS.bodyHalfH &&
      top <= boss.cy + BOSS.bodyHalfH
    );
  }

  private consumePierce(b: PlayerBullet): boolean {
    if (b.kind === "bolt") {
      b.dead = true;
      return false;
    }
    if (b.pierce === Infinity) return true;
    b.pierce -= 1;
    if (b.pierce < 0) {
      b.dead = true;
      return false;
    }
    return true;
  }

  private onEnemyKilled(e: Enemy) {
    this.combo += 1;
    this.comboTimer = 2.0;
    const gain = e.def.score * this.multiplier;
    this.addScore(gain, e.x, e.y);

    const big = e.maxHp >= 5;
    this.particles.explosion(
      e.x,
      e.y,
      ["#FFFFFF", "#FFE7A0", "#FF9A1E", "#FF3B2F"],
      big ? 1.4 : 0.85
    );
    if (big) {
      this.particles.debris(e.x, e.y, ["#9AA0A6", "#5E5347", "#FF8A1E"], 8);
      this.audio.explosionBig();
      this.addTrauma(0.18);
    } else {
      this.audio.explosionSmall();
      this.addTrauma(0.1);
    }

    // power-up drops
    let drop = 0;
    if (e.type === "turret" || e.type === "strafer") drop = 0.5;
    else if (Math.random() < 0.05) drop = 1;
    if (drop && Math.random() < drop) {
      this.spawnPowerup(pick(["weapon", "shield"] as PowerupType[]), e.x, e.y);
    }
  }

  // ---- boss death sequence ---------------------------------------------
  private onBossDeath() {
    this.death = { t: 0, nextBoom: 0, booms: 0 };
    this.hitstop = 4;
    this.slowmoT = 1.2;
    this.whiteFlash = 0.7;
    this.addTrauma(1.0);
    this.audio.explosionBig();
    this.audio.setBossMusic(false);

    // convert remaining enemy bullets to score sparks
    for (const b of this.enemyBullets) {
      this.particles.muzzle(b.x, b.y, "#FFE7A0", -1);
      b.dead = true;
      this.score += 10;
    }
    // pop remaining trash enemies
    for (const e of this.enemies) {
      if (!e.dead) {
        this.particles.explosion(e.x, e.y, ["#FFFFFF", "#FF9A1E", "#FF3B2F"], 0.8);
        e.dead = true;
      }
    }
  }

  private updateDeath(dt: number) {
    const d = this.death!;
    d.t += dt;
    d.nextBoom -= dt;
    const boss = this.boss;
    if (boss && d.nextBoom <= 0 && d.booms < 10) {
      d.booms++;
      d.nextBoom = 0.12;
      const x = boss.cx + randRange(-140, 120);
      const y = boss.cy + randRange(-100, 100);
      this.particles.explosion(x, y, ["#FFFFFF", "#FFE7A0", "#FF9A1E", "#FF3B2F", "#7A1020"], 1.6);
      this.particles.debris(x, y, ["#9AA0A6", "#5E5347", "#2B2622"], 10, 1.3);
      this.addTrauma(0.35);
      if (d.booms % 3 === 0) this.audio.explosionBig();
    }
    if (d.t >= 1.5) {
      // final
      const boss2 = this.boss;
      if (boss2) {
        this.particles.explosion(boss2.cx, boss2.cy, ["#FFFFFF", "#FFE7A0", "#FF9A1E"], 3);
        this.addScore(50000, boss2.cx, boss2.cy - 40);
      }
      this.whiteFlash = 0.7;
      this.addTrauma(1.0);
      this.boss = null;
      this.death = null;
      this.endGame(true);
    }
  }

  private cleanup() {
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.playerBullets.some((b) => b.dead)) compactInPlace(this.playerBullets);
    if (this.enemyBullets.some((b) => b.dead)) this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    if (this.powerups.some((p) => p.dead)) this.powerups = this.powerups.filter((p) => !p.dead);
    if (this.popups.some((p) => p.life <= 0)) this.popups = this.popups.filter((p) => p.life > 0);
  }

  // ---- rendering --------------------------------------------------------
  render() {
    const ctx = this.canvas.getContext("2d")!;
    // Base transform maps logical 960x540 coords onto the (DPR-enlarged) buffer.
    ctx.setTransform(this.canvas.width / this.W, 0, 0, this.canvas.height / this.H, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    ctx.save();
    // screen shake
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const mag = 18 * s;
      ctx.translate(randRange(-mag, mag), randRange(-mag, mag));
      if (this.trauma > 0.6) {
        ctx.translate(this.W / 2, this.H / 2);
        ctx.rotate(randRange(-0.02, 0.02) * s);
        ctx.translate(-this.W / 2, -this.H / 2);
      }
    }

    this.background.draw(ctx);

    if (this.state !== "title") {
      this.drawWorld(ctx);
    } else {
      // gentle idle starfield only; draw a demo ship
      this.drawTitleShip(ctx);
    }

    this.particles.draw(ctx);
    ctx.restore();

    // white flash (full screen, not shaken)
    if (this.whiteFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.whiteFlash);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.restore();
    }

    // HUD + overlays (un-shaken)
    if (this.state === "playing" || this.state === "paused") this.drawHudLayer(ctx);
    this.drawOverlays(ctx);

    this.input.endFrame();
  }

  private drawWorld(ctx: CanvasRenderingContext2D) {
    for (const p of this.powerups) p.draw(ctx, this.assets);
    if (this.boss) this.boss.draw(ctx, this.assets);
    for (const e of this.enemies) e.draw(ctx, this.assets);
    this.drawPlayerBullets(ctx);
    this.drawEnemyBullets(ctx);
    if (!this.player.dead) this.player.draw(ctx, this.assets);

    // score popups
    for (const pop of this.popups) {
      neonText(ctx, pop.text, pop.x, pop.y, {
        size: 14,
        color: "#FFE7A0",
        glow: "#FF9A1E",
        align: "center",
        alpha: clamp(pop.life / 0.7, 0, 1),
      });
    }
  }

  private drawPlayerBullets(ctx: CanvasRenderingContext2D) {
    const bolt = this.assets.bullet;
    const laser = this.assets.laser;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.playerBullets) {
      if (b.kind === "bolt") {
        ctx.drawImage(bolt as CanvasImageSource, b.x - 12, b.y - 4, 24, 8);
      } else {
        const len = b.w * 1.4;
        ctx.drawImage(laser as CanvasImageSource, b.x - len * 0.3, b.y - b.h / 2, len, b.h);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(b.x - len * 0.3, b.y - 1.5, len, 3);
      }
    }
    ctx.restore();
  }

  private drawEnemyBullets(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.enemyBullets) {
      const img = b.sprite === "a" ? this.assets.eba : this.assets.ebb;
      ctx.drawImage(img as CanvasImageSource, b.x - 8, b.y - 8, 16, 16);
    }
    ctx.restore();
  }

  private drawHudLayer(ctx: CanvasRenderingContext2D) {
    const hs: HudState = {
      score: this.score,
      hi: Math.max(this.hi, this.score),
      lives: Math.max(0, this.player.lives),
      power: this.player.powerLevel,
      hp: this.player.hp,
      maxHp: 3,
      combo: this.combo,
      multiplier: this.multiplier,
    };
    drawHud(ctx, hs, this.assets);

    if (this.boss && this.boss.barVisible) {
      drawBossBar(ctx, this.boss.name, this.boss.hp / this.boss.maxHp, this.boss.phase);
    }

    drawCharge(ctx, this.player.chargeRatio, this.player.chargeRatio >= 1);

    // pre-boss warning banner
    if (!this.bossStarted && this.stageTime >= 72 && this.stageTime < BOSS_START_TIME) {
      drawWarningBanner(ctx, this.clock);
    }

    // low-HP vignette
    if (this.player.hp <= 1 && !this.player.dead) {
      drawVignette(ctx, 0.35 + 0.2 * Math.sin(this.clock * 6));
    }
  }

  private drawTitleShip(ctx: CanvasRenderingContext2D) {
    const y = this.H / 2 + 40 + Math.sin(this.clock * 1.5) * 14;
    ctx.save();
    ctx.translate(this.W / 2, y);
    const flame = this.assets.flame;
    const frame = Math.floor(this.clock * 16) % 3;
    ctx.drawImage(flame as CanvasImageSource, frame * 32, 0, 32, 24, -48 - 18, -12, 32, 24);
    ctx.drawImage(this.assets.player as CanvasImageSource, -48, -24, 96, 48);
    ctx.restore();
  }

  private drawOverlays(ctx: CanvasRenderingContext2D) {
    if (this.state === "title") {
      this.dim(ctx, 0.35);
      neonText(ctx, TITLE, this.W / 2, 170, { size: 64, color: "#E8F1FF", glow: "#22E3FF", align: "center", font: '"Segoe UI",sans-serif', blur: 24 });
      neonText(ctx, SUBTITLE, this.W / 2, 214, { size: 28, color: "#FF8A1E", glow: "#FF2D7E", align: "center", font: '"Segoe UI",sans-serif', blur: 12 });
      const blink = Math.sin(this.clock * 3) > -0.3;
      if (blink)
        neonText(ctx, "PRESS ENTER  /  TAP TO START", this.W / 2, 330, { size: 22, color: "#E8F1FF", glow: "#22E3FF", align: "center" });
      neonText(ctx, "MOVE  ARROWS / WASD     FIRE  Z / SPACE (hold)     CHARGE  X / SHIFT (hold)", this.W / 2, 470, { size: 14, color: "#7E8CB8", align: "center", font: '"Segoe UI",sans-serif' });
      neonText(ctx, "P  PAUSE        M  MUTE        TIP: shoot the boss eye while it glows", this.W / 2, 496, { size: 13, color: "#7E8CB8", align: "center", font: '"Segoe UI",sans-serif' });
      if (this.hi > 0) neonText(ctx, "HI-SCORE  " + this.hi.toString().padStart(8, "0"), this.W / 2, 252, { size: 14, color: "#22E3FF", align: "center" });
    } else if (this.state === "paused") {
      this.dim(ctx, 0.55);
      neonText(ctx, "PAUSED", this.W / 2, this.H / 2, { size: 52, color: "#E8F1FF", glow: "#22E3FF", align: "center", font: '"Segoe UI",sans-serif' });
      neonText(ctx, "PRESS P TO RESUME", this.W / 2, this.H / 2 + 44, { size: 18, color: "#7E8CB8", align: "center", font: '"Segoe UI",sans-serif' });
    } else if (this.state === "gameover") {
      this.dim(ctx, 0.6);
      neonText(ctx, "GAME OVER", this.W / 2, this.H / 2 - 20, { size: 60, color: "#FF3B2F", glow: "#FF2D7E", align: "center", font: '"Segoe UI",sans-serif', blur: 18 });
      neonText(ctx, "SCORE  " + this.score.toString().padStart(8, "0"), this.W / 2, this.H / 2 + 30, { size: 22, color: "#E8F1FF", align: "center" });
      neonText(ctx, "HI-SCORE  " + this.hi.toString().padStart(8, "0"), this.W / 2, this.H / 2 + 58, { size: 16, color: "#22E3FF", align: "center" });
      if (this.overlayLock <= 0 && Math.sin(this.clock * 3) > -0.3)
        neonText(ctx, "PRESS ENTER / TAP TO CONTINUE", this.W / 2, this.H / 2 + 110, { size: 18, color: "#7E8CB8", align: "center", font: '"Segoe UI",sans-serif' });
    } else if (this.state === "stageclear") {
      this.dim(ctx, 0.45);
      neonText(ctx, "STAGE CLEAR", this.W / 2, this.H / 2 - 30, { size: 58, color: "#0FF4D6", glow: "#22E3FF", align: "center", font: '"Segoe UI",sans-serif', blur: 20 });
      neonText(ctx, "GORGON CORE DESTROYED", this.W / 2, this.H / 2 + 14, { size: 20, color: "#FF8A1E", glow: "#FF2D7E", align: "center", font: '"Segoe UI",sans-serif' });
      neonText(ctx, "SCORE  " + this.score.toString().padStart(8, "0"), this.W / 2, this.H / 2 + 54, { size: 22, color: "#E8F1FF", align: "center" });
      if (this.overlayLock <= 0 && Math.sin(this.clock * 3) > -0.3)
        neonText(ctx, "PRESS ENTER / TAP TO CONTINUE", this.W / 2, this.H / 2 + 110, { size: 18, color: "#7E8CB8", align: "center", font: '"Segoe UI",sans-serif' });
    }

    this.drawMuteButton(ctx);
  }

  private dim(ctx: CanvasRenderingContext2D, a: number) {
    ctx.save();
    ctx.fillStyle = `rgba(3,5,12,${a})`;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  private drawMuteButton(ctx: CanvasRenderingContext2D) {
    const x = this.W - 26;
    const y = this.H - 22;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#7E8CB8";
    ctx.fillStyle = "#7E8CB8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 3);
    ctx.lineTo(x - 2, y - 3);
    ctx.lineTo(x + 2, y - 7);
    ctx.lineTo(x + 2, y + 7);
    ctx.lineTo(x - 2, y + 3);
    ctx.lineTo(x - 6, y + 3);
    ctx.closePath();
    ctx.fill();
    if (this.audio.muted) {
      ctx.beginPath();
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x + 11, y + 5);
      ctx.moveTo(x + 11, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x + 6, y, 4, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Remove dead bullets while keeping the same array reference (PlayerCtx holds a
// stable reference to it).
function compactInPlace(arr: PlayerBullet[]): void {
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    if (!arr[r].dead) arr[w++] = arr[r];
  }
  arr.length = w;
}

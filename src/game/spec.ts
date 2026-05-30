// The game design as typed constants. Numbers come from the design spec
// ("NEON DERELICT: Gorgon Core"). Behaviours that consume these live in the
// entity modules.

import type { ImageKey } from "./assets";
import type { EnemyTypeId } from "./types";

export const TITLE = "NEON DERELICT";
export const SUBTITLE = "GORGON CORE";

export const VIEW = { W: 960, H: 540 } as const;

export const PLAYER = {
  speed: 300, // px/s max
  accel: 3000, // px/s^2
  decel: 4000, // px/s^2
  spriteW: 96,
  spriteH: 48,
  hitR: 6, // forgiving hitbox
  maxHp: 3, // shield points per life
  lives: 3,
  iframes: 1.5, // seconds after a hit
  spawnIframes: 1.5,
  fireRate: 0.1, // seconds between shots (10/s)
  bulletSpeed: 900,
  bulletDamage: 1,
  knockback: 40, // px pushed left on hit
  knockbackTime: 0.15,
  // bounds keep the craft fully on-screen, confined to the left ~80%
  minX: 20,
  maxX: 760,
  minY: 22,
  maxY: 518,
  respawnX: 120,
  respawnY: 270,
  noseOffset: 36, // muzzle x offset from center
  // charge beam
  chargeMidTime: 0.4,
  chargeFullTime: 1.0,
  chargeLockout: 0.25,
} as const;

export interface EnemyDef {
  hp: number;
  score: number;
  hitR: number;
  img: ImageKey;
  w: number;
  h: number;
}

export const ENEMY_DEFS: Record<EnemyTypeId, EnemyDef> = {
  drifter: { hp: 1, score: 100, hitR: 13, img: "dart", w: 48, h: 32 },
  waver: { hp: 2, score: 200, hitR: 15, img: "stinger", w: 48, h: 32 },
  diver: { hp: 3, score: 300, hitR: 16, img: "dart", w: 48, h: 32 },
  turret: { hp: 6, score: 400, hitR: 18, img: "turret", w: 48, h: 48 },
  strafer: { hp: 5, score: 500, hitR: 14, img: "stinger", w: 48, h: 32 },
  pod: { hp: 1, score: 50, hitR: 11, img: "eba", w: 22, h: 22 },
};

export type Formation = "rows" | "stream" | "twoStreams" | "vee" | "topbottom" | "anchors";

export interface Wave {
  t: number; // stage seconds
  type: EnemyTypeId;
  count: number;
  gap: number; // seconds between successive spawns
  form: Formation;
  ys?: number[];
  y?: number;
  amp?: number;
  anchorX?: number;
}

// Structured stage timeline (a codeable translation of the design's wave plan).
export const WAVES: Wave[] = [
  { t: 3, type: "drifter", count: 4, gap: 0.25, form: "rows", ys: [120, 200, 280, 360] },
  { t: 6, type: "drifter", count: 5, gap: 0.3, form: "stream", y: 160 },
  { t: 9, type: "waver", count: 6, gap: 0.35, form: "twoStreams", ys: [180, 360] },
  { t: 13, type: "diver", count: 2, gap: 0.6, form: "topbottom" },
  { t: 16, type: "turret", count: 2, gap: 0.5, form: "anchors", ys: [140, 400], anchorX: 740 },
  { t: 19.5, type: "drifter", count: 6, gap: 0.22, form: "vee", y: 270 },
  // t=22 breather (pickups scheduled separately)
  { t: 28, type: "waver", count: 8, gap: 0.25, form: "twoStreams", ys: [180, 360], amp: 80 },
  { t: 32, type: "turret", count: 3, gap: 0.5, form: "anchors", ys: [140, 270, 400], anchorX: 740 },
  { t: 36, type: "diver", count: 4, gap: 0.5, form: "topbottom" },
  { t: 40, type: "drifter", count: 5, gap: 0.3, form: "stream", y: 270 },
  { t: 40.4, type: "waver", count: 5, gap: 0.32, form: "stream", y: 270, amp: 90 },
  // t=44 breather
  { t: 48, type: "turret", count: 2, gap: 0.5, form: "anchors", ys: [120, 420], anchorX: 745 },
  { t: 51, type: "drifter", count: 4, gap: 0.28, form: "rows", ys: [190, 230, 320, 360] },
  { t: 55, type: "turret", count: 4, gap: 0.35, form: "anchors", ys: [160, 380, 160, 380], anchorX: 720 },
  { t: 59, type: "diver", count: 6, gap: 0.3, form: "topbottom" },
  { t: 63, type: "drifter", count: 10, gap: 0.18, form: "vee", y: 270 },
  { t: 67, type: "strafer", count: 2, gap: 0.6, form: "stream", y: 360 },
  { t: 67.3, type: "waver", count: 4, gap: 0.3, form: "twoStreams", ys: [150, 230], amp: 70 },
  // t=72 breather then boss
];

export interface PickupEvent {
  t: number;
  type: "weapon" | "shield";
  y: number;
}

export const PICKUPS: PickupEvent[] = [
  { t: 23, type: "weapon", y: 220 },
  { t: 24.5, type: "shield", y: 320 },
  { t: 45, type: "weapon", y: 270 },
  { t: 46, type: "shield", y: 360 },
  { t: 70, type: "weapon", y: 270 },
];

export const BOSS_START_TIME = 77;

export const BOSS = {
  hp: 400,
  anchorX: 720,
  centerY: 270,
  bobAmp: 20,
  spriteW: 320,
  spriteH: 256,
  eyeR: 38, // weak-point radius
  bodyHalfW: 150,
  bodyHalfH: 110,
  entranceFromX: 1120,
  entranceTime: 2.0,
  // body always takes this fraction of damage; eye (when open) takes 100%.
  bodyDamageMul: 0.25,
  phase2At: 0.667,
  phase3At: 0.333,
} as const;

// Faster scroll feel constants
export const SCROLL = {
  far: 18,
  nebula: 28,
  mid: 60,
  near: 140,
  base: 140, // foreground/gameplay reference scroll
} as const;

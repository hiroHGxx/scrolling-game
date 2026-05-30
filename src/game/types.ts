// Shared types and the "World" interface that entities use to talk back to the
// Game without importing it directly (keeps the dependency graph acyclic at
// runtime; the cycle is type-only).

import type { Player } from "./entities/player";
import type { Enemy } from "./entities/enemy";
import type { Particles } from "./particles";
import type { AudioEngine } from "./audio";

export type EnemyTypeId = "drifter" | "waver" | "diver" | "turret" | "strafer" | "pod";
export type BulletSprite = "a" | "b";
export type PowerupType = "weapon" | "shield";

/** A player projectile (bolt or charged beam). */
export interface PlayerBullet {
  x: number;
  y: number;
  /** previous-frame position, for swept collision (set in updateBullets) */
  px?: number;
  py?: number;
  vx: number;
  vy: number;
  w: number; // draw/collision length
  h: number; // draw/collision height
  damage: number;
  pierce: number; // extra enemies it can pass through (Infinity = unlimited)
  kind: "bolt" | "beam";
  big: boolean; // full-charge beam
  dead: boolean;
  /** ids of entities already hit (piercing beams only; bolts omit it) */
  hit?: Set<number>;
}

/** An enemy projectile. */
export interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  sprite: BulletSprite;
  dead: boolean;
}

/** Per-enemy spawn parameters consumed by the movement behaviours. */
export interface EnemyOpts {
  /** sine phase offset (radians) for wavers */
  phase?: number;
  /** sine amplitude override */
  amplitude?: number;
  /** sine period override (seconds) */
  period?: number;
  /** x position a turret/strafer anchors at */
  anchorX?: number;
  /** spawn x override */
  spawnX?: number;
}

/** What entities are allowed to ask of the game world. */
export interface World {
  readonly W: number;
  readonly H: number;
  /** seconds since the stage started (affected by slow-motion) */
  readonly time: number;
  readonly player: Player;
  readonly particles: Particles;
  readonly audio: AudioEngine;

  spawnEnemyBullet(x: number, y: number, vx: number, vy: number, sprite: BulletSprite): void;
  spawnEnemy(type: EnemyTypeId, x: number, y: number, opts?: EnemyOpts): Enemy;
  spawnPowerup(type: PowerupType, x: number, y: number): void;

  addScore(amount: number, x?: number, y?: number): void;
  addTrauma(amount: number): void;
  hitStop(frames: number): void;

  /** Apply a hit to the player (respects i-frames). */
  damagePlayer(): void;
}

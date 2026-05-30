// Headless logic smoke test: drives the REAL game code through a full
// playthrough (waves -> boss -> stage clear) under a minimal DOM/canvas shim,
// asserting no exceptions and no NaN state. Run: npx tsx scripts/headless-test.mts
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- DOM / browser shims ----------------------------------------------
const g = globalThis as any;
g.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 960, innerHeight: 540, AudioContext: undefined, setTimeout: () => 0, clearTimeout: () => {} };
g.localStorage = (() => {
  const m: Record<string, string> = {};
  return { getItem: (k: string) => (k in m ? m[k] : null), setItem: (k: string, v: string) => (m[k] = String(v)) };
})();
g.performance = { now: () => Date.now() };
g.requestAnimationFrame = () => 0;
g.Image = class {};
g.document = {
  createElement(tag: string) {
    if (tag === "canvas") return createCanvas(1, 1);
    return {};
  },
  getElementById: () => null,
};

// ---- load real PNG assets into an Assets-like record ------------------
const { IMAGE_FILES } = await import("../src/game/assets.ts");
const assets: any = {};
for (const [key, file] of Object.entries(IMAGE_FILES)) {
  assets[key] = await loadImage(join(root, "public", "assets", file as string));
}

// ---- fake canvas ------------------------------------------------------
const napi = createCanvas(960, 540);
const fakeCanvas: any = {
  width: 960,
  height: 540,
  style: {},
  getContext: (t: string) => napi.getContext(t as "2d"),
  addEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
};

const { Game } = await import("../src/game/game.ts");
const game: any = new Game(fakeCanvas, assets);
const input = game.input;
const press = (code: string) => input.onKeyDown({ code, preventDefault() {} });
const release = (code: string) => input.onKeyUp({ code, preventDefault() {} });

// ---- drive a full playthrough -----------------------------------------
let frames = 0;
let errors = 0;
let sawBoss = false;
let sawStageClear = false;
let bossKillStarted = false;
const seenStates = new Set<string>();

function checkFinite(label: string) {
  const p = game.player;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(game.score)) {
    console.error(`NaN detected at frame ${frames} (${label}): x=${p.x} y=${p.y} score=${game.score}`);
    errors++;
    return false;
  }
  return true;
}

// start the game
press("Enter");
game.update(1 / 60);
game.render();
press("Space"); // hold fire

// make the test pilot invulnerable so the run reliably reaches the boss
game.player.isHittable = () => false;

const MAX = 9000; // ~150s at 60fps
let moveTimer = 0;
try {
  for (; frames < MAX; frames++) {
    // occasional movement so the player dodges / moves around
    moveTimer -= 1;
    if (moveTimer <= 0) {
      release("ArrowUp");
      release("ArrowDown");
      const dir = Math.random();
      if (dir < 0.33) press("ArrowUp");
      else if (dir < 0.66) press("ArrowDown");
      moveTimer = 30 + Math.floor(Math.random() * 60);
    }

    game.update(1 / 60);
    game.render();
    seenStates.add(game.state);
    if (!checkFinite("loop")) break;

    if (game.boss) {
      sawBoss = true;
      // force-kill the boss to exercise the death sequence + stage clear
      if (game.boss.state === "fight") {
        bossKillStarted = true;
        game.boss.applyDamage(60, true);
      }
    }
    if (game.state === "stageclear") {
      sawStageClear = true;
      break;
    }
    if (game.state === "gameover") {
      // restart so we keep going toward boss for coverage
      press("Enter");
    }
  }
} catch (err) {
  console.error(`EXCEPTION at frame ${frames}:`, err);
  errors++;
}

console.log("---- headless test summary ----");
console.log("frames simulated:", frames);
console.log("states seen:", [...seenStates].join(", "));
console.log("score:", game.score);
console.log("reached boss:", sawBoss, "| boss damaged:", bossKillStarted);
console.log("reached stage clear:", sawStageClear);
console.log("errors:", errors);

if (errors > 0) {
  console.error("FAIL");
  process.exit(1);
}
if (!sawBoss) {
  console.error("FAIL: never reached boss");
  process.exit(1);
}
console.log("PASS");

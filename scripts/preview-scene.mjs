// Dev-only: composite a mock gameplay scene to visually verify the generated
// assets look good together. Writes scripts/_preview.png (gitignored).
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const A = (f) => join(root, "public", "assets", f);
const img = (f) => loadImage(A(f));

const W = 960, H = 540;
const c = createCanvas(W, H);
const ctx = c.getContext("2d");

function tile(image, speed, alpha = 1) {
  ctx.globalAlpha = alpha;
  const iw = image.width;
  const off = (speed) % iw;
  for (let x = -off; x < W; x += iw) ctx.drawImage(image, x, 0, iw, H);
  ctx.globalAlpha = 1;
}
function sprite(image, x, y, scale = 1) {
  ctx.drawImage(image, x - (image.width * scale) / 2, y - (image.height * scale) / 2, image.width * scale, image.height * scale);
}

const far = await img("bg_far_starfield.png");
const neb = await img("bg_nebula_glow.png");
const mid = await img("bg_mid_structures.png");
const near = await img("bg_near_foreground.png");
tile(far, 40);
ctx.globalCompositeOperation = "screen";
tile(neb, 80, 0.8);
ctx.globalCompositeOperation = "source-over";
tile(mid, 300);
tile(near, 120);

const boss = await img("boss_core.png");
sprite(boss, 760, 250, 1);
const eye = await img("boss_core_exposed.png");
ctx.globalCompositeOperation = "lighter";
sprite(eye, 700, 250, 0.7);
ctx.globalCompositeOperation = "source-over";

const dart = await img("enemy_a_dart.png");
const stinger = await img("enemy_a_stinger.png");
const turret = await img("enemy_b_turret.png");
sprite(dart, 560, 150, 1);
sprite(dart, 600, 410, 1);
sprite(stinger, 480, 300, 1);
sprite(turret, 660, 470, 1);

const flame = await img("player_engine_flame.png");
ctx.drawImage(flame, 0, 0, 32, 24, 140 - 48 - 26, 270 - 12, 32, 24); // frame 0 behind ship
const ship = await img("player_ship.png");
sprite(ship, 150, 270, 1);

const pb = await img("player_bullet.png");
for (let i = 0; i < 4; i++) sprite(pb, 230 + i * 70, 270, 1);
const laser = await img("player_laser.png");
ctx.drawImage(laser, 220, 320 - 14, 200, 28);

const eba = await img("enemy_bullet_a.png");
const ebb = await img("enemy_bullet_b.png");
for (let i = 0; i < 4; i++) sprite(eba, 520 - i * 60, 180 + i * 20, 1);
for (let i = 0; i < 3; i++) sprite(ebb, 600 - i * 50, 440, 1);

const pw = await img("powerup_weapon.png");
const ps = await img("powerup_shield.png");
sprite(pw, 360, 200, 1);
sprite(ps, 360, 360, 1);

await writeFile(join(root, "scripts", "_preview.png"), c.toBuffer("image/png"));
console.log("wrote scripts/_preview.png");

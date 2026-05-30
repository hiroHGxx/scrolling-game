// Loads every PNG in public/assets/ and exposes them by a short key.
// Robust: if an asset fails to load, a magenta placeholder is substituted so
// the game still runs (and the missing sprite is obvious on screen).

export const IMAGE_FILES = {
  player: "player_ship.png",
  flame: "player_engine_flame.png",
  bullet: "player_bullet.png",
  laser: "player_laser.png",
  dart: "enemy_a_dart.png",
  stinger: "enemy_a_stinger.png",
  turret: "enemy_b_turret.png",
  eba: "enemy_bullet_a.png",
  ebb: "enemy_bullet_b.png",
  boss: "boss_core.png",
  bossEye: "boss_core_exposed.png",
  puWeapon: "powerup_weapon.png",
  puShield: "powerup_shield.png",
  bgFar: "bg_far_starfield.png",
  bgNebula: "bg_nebula_glow.png",
  bgMid: "bg_mid_structures.png",
  bgNear: "bg_near_foreground.png",
} as const;

export type ImageKey = keyof typeof IMAGE_FILES;
export type Sprite = HTMLImageElement | HTMLCanvasElement;
export type Assets = Record<ImageKey, Sprite>;

function placeholder(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = "#000";
  ctx.fillRect(4, 4, 24, 24);
  ctx.fillStyle = "#ff00ff";
  ctx.font = "10px monospace";
  ctx.fillText("?", 13, 20);
  return c;
}

function loadOne(src: string): Promise<Sprite> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[assets] failed to load ${src}`);
      resolve(placeholder());
    };
    img.src = src;
  });
}

export async function loadAssets(onProgress?: (loaded: number, total: number) => void): Promise<Assets> {
  const base = import.meta.env.BASE_URL; // "/" in dev, "/scrolling-game/" in prod
  const keys = Object.keys(IMAGE_FILES) as ImageKey[];
  let loaded = 0;
  const out = {} as Assets;
  await Promise.all(
    keys.map(async (key) => {
      const sprite = await loadOne(`${base}assets/${IMAGE_FILES[key]}`);
      out[key] = sprite;
      loaded++;
      onProgress?.(loaded, keys.length);
    })
  );
  return out;
}

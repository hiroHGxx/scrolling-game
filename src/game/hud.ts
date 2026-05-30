// Heads-up display: score, lives, power, shield pips, boss bar, charge meter,
// low-HP vignette and the pre-boss warning banner. Pure draw helpers — all
// state is passed in.

import P from "./palette.json";
import { VIEW } from "./spec";
import type { Assets } from "./assets";

const MONO = '"Consolas","SF Mono","Menlo",monospace';
const SANS = '"Segoe UI",system-ui,sans-serif';

export function neonText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    color?: string;
    glow?: string;
    align?: CanvasTextAlign;
    weight?: string;
    font?: string;
    alpha?: number;
    blur?: number;
  } = {}
) {
  const { size = 18, color = P.uiText, glow, align = "left", weight = "bold", font = MONO, alpha = 1, blur = 8 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function pad(n: number, len: number): string {
  return Math.max(0, Math.floor(n)).toString().padStart(len, "0");
}

export interface HudState {
  score: number;
  hi: number;
  lives: number;
  power: number;
  hp: number;
  maxHp: number;
  combo: number;
  multiplier: number;
}

export function drawHud(ctx: CanvasRenderingContext2D, s: HudState, assets: Assets) {
  // score
  neonText(ctx, "SCORE", 18, 30, { size: 12, color: P.uiAccent, glow: P.uiAccent, blur: 6 });
  neonText(ctx, pad(s.score, 8), 18, 54, { size: 26, color: P.uiText, glow: P.uiAccent });

  // hi-score
  neonText(ctx, "HI " + pad(s.hi, 8), VIEW.W / 2, 30, { size: 14, color: P.starDim, align: "center", glow: P.uiAccent, blur: 4 });

  // multiplier / combo
  if (s.multiplier > 1) {
    neonText(ctx, "x" + s.multiplier, 150, 54, { size: 20, color: P.bossBarFill, glow: P.enemyB_accent, align: "left" });
  }

  // shield pips (top-left under score)
  for (let i = 0; i < s.maxHp; i++) {
    const x = 20 + i * 18;
    const y = 70;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    if (i < s.hp) {
      ctx.shadowColor = P.uiBarFill;
      ctx.shadowBlur = 8;
      ctx.fillStyle = P.uiBarFill;
      ctx.fillRect(-5, -5, 10, 10);
    } else {
      ctx.strokeStyle = P.uiBarTrack;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }

  // power level (top-right)
  neonText(ctx, "PWR L" + s.power, VIEW.W - 18, 30, { size: 16, color: P.playerAccent, glow: P.playerAccent, align: "right" });

  // lives as small ship icons
  const ship = assets.player;
  for (let i = 0; i < s.lives; i++) {
    const x = VIEW.W - 30 - i * 34;
    const y = 44;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(ship as CanvasImageSource, x - 28, y - 7, 28, 14);
    ctx.restore();
  }
}

export function drawBossBar(ctx: CanvasRenderingContext2D, name: string, ratio: number, phase: number) {
  const w = 540;
  const x = (VIEW.W - w) / 2;
  const y = 84;
  ctx.save();
  // track
  ctx.fillStyle = "rgba(8,11,26,0.7)";
  ctx.fillRect(x - 2, y - 2, w + 4, 14);
  ctx.fillStyle = P.uiBarTrack;
  ctx.fillRect(x, y, w, 10);
  // fill
  const fw = Math.max(0, Math.min(1, ratio)) * w;
  ctx.shadowColor = P.bossBarFill;
  ctx.shadowBlur = 10;
  ctx.fillStyle = phase >= 3 ? P.explosionRed : P.bossBarFill;
  ctx.fillRect(x, y, fw, 10);
  ctx.shadowBlur = 0;
  // phase ticks
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  for (const t of [0.333, 0.667]) {
    ctx.beginPath();
    ctx.moveTo(x + w * t, y);
    ctx.lineTo(x + w * t, y + 10);
    ctx.stroke();
  }
  ctx.restore();
  neonText(ctx, name, VIEW.W / 2, y - 6, { size: 14, color: P.uiWarning, glow: P.uiWarning, align: "center", font: SANS, blur: 6 });
}

export function drawCharge(ctx: CanvasRenderingContext2D, ratio: number, full: boolean) {
  if (ratio <= 0.02) return;
  const w = 220;
  const x = (VIEW.W - w) / 2;
  const y = VIEW.H - 26;
  ctx.save();
  ctx.fillStyle = "rgba(8,11,26,0.6)";
  ctx.fillRect(x - 2, y - 2, w + 4, 12);
  const fw = ratio * w;
  ctx.shadowColor = full ? P.playerLaserCore : P.playerAccent;
  ctx.shadowBlur = full ? 14 : 8;
  ctx.fillStyle = full ? P.playerLaserCore : P.playerAccent;
  ctx.fillRect(x, y, fw, 8);
  ctx.restore();
  if (full) neonText(ctx, "CHARGE READY", VIEW.W / 2, y - 6, { size: 11, color: P.playerLaserCore, glow: P.playerLaserCore, align: "center" });
}

export function drawVignette(ctx: CanvasRenderingContext2D, intensity: number, color = "#FF2D7E") {
  if (intensity <= 0) return;
  ctx.save();
  const g = ctx.createRadialGradient(VIEW.W / 2, VIEW.H / 2, VIEW.H * 0.3, VIEW.W / 2, VIEW.H / 2, VIEW.H * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, color);
  ctx.globalAlpha = Math.min(0.6, intensity);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.restore();
}

export function drawWarningBanner(ctx: CanvasRenderingContext2D, t: number) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 8);
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.45 * pulse;
  ctx.fillStyle = P.uiWarning;
  ctx.fillRect(0, VIEW.H / 2 - 46, VIEW.W, 4);
  ctx.fillRect(0, VIEW.H / 2 + 42, VIEW.W, 4);
  ctx.restore();
  neonText(ctx, "⚠ WARNING ⚠", VIEW.W / 2, VIEW.H / 2 - 8, {
    size: 40,
    color: P.uiWarning,
    glow: P.uiWarning,
    align: "center",
    font: SANS,
    alpha: 0.6 + 0.4 * pulse,
    blur: 16,
  });
  neonText(ctx, "MASSIVE ENERGY SIGNATURE APPROACHING", VIEW.W / 2, VIEW.H / 2 + 26, {
    size: 16,
    color: P.uiText,
    align: "center",
    font: SANS,
    alpha: 0.7,
  });
}

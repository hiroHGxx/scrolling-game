import { loadAssets } from "./game/assets";
import { Game } from "./game/game";
import { VIEW } from "./game/spec";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const loading = document.getElementById("loading");

// CSS scales the canvas to fit the viewport; the backing store is enlarged by
// devicePixelRatio (capped) so it stays crisp on Retina / HiDPI / mobile.
// Rendering uses logical 960x540 coords — Game.render bakes the buffer-to-logical
// scale into its base transform.
const DPR = Math.min(window.devicePixelRatio || 1, 2);

function fit() {
  const scale = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  const cssW = Math.round(VIEW.W * scale);
  const cssH = Math.round(VIEW.H * scale);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
}
window.addEventListener("resize", fit);
fit();

async function boot() {
  const assets = await loadAssets((l, t) => {
    if (loading) loading.textContent = `Loading ${l}/${t}`;
  });
  if (loading) loading.style.display = "none";

  const game = new Game(canvas, assets);

  // Audio contexts must be (re)started from a user gesture.
  const resume = () => game.audio.resume();
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);

  // On-screen mute toggle (bottom-right corner) for touch devices.
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const lx = (e.clientX - r.left) * (VIEW.W / r.width);
    const ly = (e.clientY - r.top) * (VIEW.H / r.height);
    if (lx > VIEW.W - 48 && ly > VIEW.H - 44) {
      game.audio.toggleMute();
      game.input.consumePointer(); // don't let this tap also start/continue
    }
  });

  let last = performance.now();
  function loop(now: number) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // clamp after tab-switch / hitch
    game.update(dt);
    game.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  console.error(err);
  if (loading) {
    loading.style.display = "block";
    loading.textContent = "Failed to load. Check console.";
  }
});

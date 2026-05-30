# NEON DERELICT — Gorgon Core

A horizontal-scrolling action shooter (STG / shmup) for the browser, built with
**TypeScript + HTML5 Canvas + Vite**. Pilot a chrome fighter through a derelict
star-field, dodge the Crimson Swarm and Iron Hive, and tear down the **Gorgon
Core** boss by hitting its eye while it's exposed.

All art is generated procedurally (no external image services) — see
[Assets](#assets).

## Play

▶️ **Live:** https://hiroHGxx.github.io/scrolling-game/ (after the first Pages deploy)

### Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys / **WASD** |
| Fire (hold) | **Z** / **Space** / J |
| Charge beam (hold, release) | **X** / **Shift** |
| Pause | **P** |
| Mute | **M** |
| Start / Continue | **Enter** |

Touch: drag to move (auto-fires), tap to start, bottom-right corner toggles mute.

### Tips

- Your hitbox is tiny — weave through bullets.
- Collect **P** (orange) to raise weapon power (up to L3) and **S** (cyan) to
  restore shields.
- The boss eye only takes full damage **while it glows** (during its attack
  tells). Body hits do chip damage. Trade risk for DPS.

## Develop

```bash
npm install
npm run dev        # local dev server (Vite)
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build
```

## Assets

Every sprite and background is rendered to PNG by a committed set of Canvas2D
draw functions — fully reproducible, no network or model needed:

```bash
npm run gen:assets   # renders scripts/asset-fns.json -> public/assets/*.png
```

- `scripts/asset-fns.json` — the draw functions (one per asset)
- `src/game/palette.json` — the shared color palette
- `scripts/generate-assets.mjs` — the renderer (uses `@napi-rs/canvas`)

## Tech

- **Engine:** fixed-timestep (1/60) game loop with screen shake (trauma model),
  hitstop, and a slow-motion boss-kill sequence.
- **Entities:** velocity-based player with power levels + charge beam; five enemy
  types with distinct movement/fire patterns; a three-phase boss with an
  open/closed eye weak-point and sweep / rotating-cross lasers.
- **Audio:** fully procedural Web Audio SFX + a light looping soundtrack.
- **Rendering:** pure Canvas2D, parallax star-field, additive glows, particle
  pool.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to **GitHub Pages**. One-time setup: in the repo, go to
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

The Vite `base` is `/scrolling-game/` (set in `vite.config.ts`); override with the
`BASE_PATH` env var for a different host.

## License

MIT

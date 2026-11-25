# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asteroids-style arcade game on a pure HTML5 canvas. No dependencies, no bundler, no build step, no tests, no linter. UI text and code comments are in Spanish — keep new user-facing strings and comments in Spanish.

## Running

Open `index.html` directly in a browser, or serve the folder:

```bash
npx serve .   # then visit http://localhost:3000
```

## Architecture

All game logic lives in `game.js` (loaded as a classic script, `'use strict'`, no modules). `index.html` only provides an 800×600 `<canvas id="canvas">`; `W`/`H` in `game.js` are hardcoded to match, so change both together.

- **Main loop**: `requestAnimationFrame(loop)` → `update(dt)` then `draw()`. `dt` is in seconds and clamped to 0.05 — all velocities are px/s and timers are seconds.
- **Entities**: `Ship`, `Asteroid`, `Bullet`, `Particle` classes, each with `update(dt)` and `draw()` and (except Ship) a `dead` flag. Entities are removed by filtering `dead` out of the global arrays (`bullets`, `asteroids`, `particles`) — never splice mid-iteration.
- **Toroidal space**: positions go through `wrap()` for ship, bullets and asteroids (particles do not wrap).
- **Game state machine**: global `state` is `'playing' | 'dead' | 'gameover'`. `'dead'` is the respawn delay (`deadTimer`), during which asteroids/particles keep moving. `initGame()` resets everything; `nextLevel()` fires when `asteroids` is empty and spawns `3 + level` large asteroids away from the center (`SAFE_DIST`).
- **Asteroid sizes**: size 3/2/1 = large/medium/small, indexing the parallel arrays `RADII`, `SPEEDS`, `POINTS` (index 0 unused). `split()` produces two asteroids of `size - 1`.
- **Collisions**: circle-distance checks in `update()`. Ship-vs-asteroid uses `a.radius * 0.82` for forgiveness and is skipped while `ship.invincible > 0` (3 s after reset, rendered as blinking).
- **Input**: `keys[code]` for held keys; `pressed(code)` for edge-triggered presses (consumes the `justPressed` flag). Shooting is edge-triggered plus a 0.2 s `shootCooldown`.

## Notes

- The README mentions power-ups and a "shooting star" asteroid type; these are **not** implemented in `game.js` yet.

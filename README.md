# Sonar

A simple web-based game emulating Tom Clancy's The Hunt for Red October. Play it [here](sachinmeier.github.io/sonar). Read the [Telos](./TELOS.md) to learn more about the game or keep reading this doc for the technicals.

## Running Locally

No build tools, no dependencies, no server required. Just a browser.

```bash
git clone <repo-url>
cd submarine-sonar
open index.html
```

Or serve it if your browser blocks local file `<script>` loading:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The game is vanilla JavaScript, loaded via plain `<script>` tags. Everything runs in a single HTML5 Canvas. Zero asset files.

## Controls

| Key | Action |
|-----|--------|
| **W** | Accelerate forward |
| **A / D** | Turn |
| **S** | Reverse (slow) |
| **Space** | Sonar ping |
| **Shift** (hold) | Silent running — cuts engines, enemies lose track |
| **F** | Fire torpedo (3 per run) |
| **P / Esc** | Pause / Resume |
| **Enter** | Start / restart |

## Architecture

```
index.html        Entry point — canvas + script loading
js/
  config.js       Constants, zone configs, collision radii
  audio.js        Web Audio synthesis (ping, echo, engine, ambient, death, win)
  shapes.js       Shape generators + geometry helpers (raycasting, transforms)
  canyon.js        Procedural canyon generation, wall interpolation, rock formations
  objects.js       Object placement, collision detection
  enemies.js       Shark wandering AI, enemy sub patrol/intercept/listening AI
  sonar.js         720-ray pulse casting, batched contour rendering
  tutorial.js      5-phase guided tutorial state machine
  renderer.js      All rendering — HUD, screens, CRT effects, particles, minimap
  game.js          Game loop, state machine, input, camera
```

# Sonar

Navigate your submarine through treacherous waters to freedom. A sonar-driven stealth game inspired by *The Hunt for Red October*. You command a submarine navigating blind through a mine-filled canyon. The only way to see is to ping — but pinging reveals your position to enemy submarines that will hunt you down. Fire torpedoes to clear a path — they travel forward from your sub, emitting mini-pings that light up the area around them, but the noise alerts enemy subs to your presence.

## The Idea

You can't see anything. The ocean is black. Your submarine is the only thing on screen. Press spacebar, and a sonar pulse radiates outward — 720 rays fan out from your hull, bounce off the canyon walls, the mines, the sharks, the enemy subs, and return as brief red contour lines that fade after a few seconds. For that brief moment, you see the world. Then it goes dark again.

The core tension is a three-way tradeoff:

- **Ping** to see, but enemy submarines hear it and lock onto your heading
- **Run your engines** to move, but listening enemies can track the noise
- **Go silent** to disappear, but you're decelerating blind with sluggish controls

Every action has a cost. The game asks you to navigate a narrowing canyon, dodge stationary mines, avoid drifting sharks, and evade intelligent enemy submarines — all while deciding how much information is worth the risk of being found.

## The Journey

The canyon is divided into four zones, each with its own character:

**Open Waters** — Wide, safe, quiet. The game teaches you to move, ping, and go silent one mechanic at a time. No pressure.

**The Narrows** — The canyon tightens and begins to curve. Mines cluster at the turns. The first enemy submarines appear. You start to feel the tradeoff: the walls are close and you need to see, but pinging wakes up the hunters.

**Devil's Corridor** — Chokepoints, dense mines, aggressive enemies. The canyon pinches to barely wider than your sub. Torpedoes become valuable here. This is where most runs end.

**Freedom** — The canyon opens into a wide bay dotted with rock formations. The name is the reward. You can see the end. The enemies here are the fastest and most persistent, but the open water gives you room to maneuver. Thread between the rocks, reach the dock, and you're home.

When you arrive: *Welcome to America*.

## Controls

| Key | Action |
|-----|--------|
| **W** | Accelerate forward |
| **A / D** | Turn |
| **S** | Reverse (slow) |
| **Space** | Sonar ping |
| **Shift** (hold) | Silent running — cuts engines, enemies lose track |
| **F** | Fire torpedo (3 per run) |
| **P / Esc** | Pause |
| **Enter** | Start / restart |

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

The game is ~2600 lines of vanilla JavaScript split across 10 modules, loaded via plain `<script>` tags. Everything runs in a single HTML5 Canvas. All audio is synthesized in real-time via the Web Audio API — no asset files.

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

## Scoring

Your score rewards speed and penalizes sonar use:

```
Score = 1000 + max(0, 300 - time_seconds) - (pings × 5)
```

Ranks: **S** (1200+) / **A** (1100+) / **B** (950+) / **C** (800+) / **D**

High scores are saved to localStorage.

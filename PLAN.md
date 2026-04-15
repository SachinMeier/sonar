# Submarine Sonar: Canyon Run -- Implementation Plan

**Date**: 2026-04-14
**Game**: Single-file HTML5 Canvas2D submarine sonar game
**File**: `/Users/sachinmeier/Projects/Me/submarine-sonar/index.html`
**Theme**: Hunt for Red October -- navigate blind through a mine-filled canyon

---

## Current State Summary

The game today is a single-screen sandbox:
- Player sub (60x24 rounded rect, black fill, red stroke) at screen center
- WASD movement with acceleration/drag physics (max 100 px/s forward, 50 px/s reverse)
- Spacebar fires sonar: 720 rays, occlusion, red contour lines fade over 4s, max 5 pulses
- 3 enemy subs, 4 mines, 3 sharks -- all static, invisible until pinged
- Rectangular border walls, no scrolling
- Web Audio ping sound
- No collision detection, no win/loss, no game states

## Architecture Principles

1. All code stays in one `<script>` block inside `index.html`
2. No external dependencies, no image assets, no audio files
3. Every phase leaves the game fully playable
4. Each phase is one focused PR-sized chunk of work
5. Performance budget: 60fps on a 2020 MacBook at 1080p

---

## Phase 1: Game State Machine + Camera System

**Goal**: Transform from a single-screen sandbox to a scrollable world with game states.

### 1.1 Game State Machine

Add a state variable and transition logic. States:

```
TITLE -> PLAYING -> WIN
                 -> DEAD -> PLAYING (restart)
```

```javascript
const STATE = { TITLE: 0, PLAYING: 1, DEAD: 2, WIN: 3 };
let gameState = STATE.TITLE;
let stateTimer = 0; // seconds since entering current state
```

**TITLE state**:
- Render a title screen: "SUBMARINE SONAR" in large monospace text, red on black
- Subtitle: "NAVIGATE THE CANYON. REACH THE PORT."
- "PRESS ENTER TO BEGIN" blinking at 1Hz (toggle on `Math.floor(stateTimer * 2) % 2`)
- No game logic runs, no input except Enter

**PLAYING state**:
- All game logic runs (movement, sonar, AI, collision)
- Transition to DEAD on collision, WIN on reaching the dock

**DEAD state**:
- Freeze the scene
- Flash screen red briefly (0.15s overlay at alpha 0.5)
- Show "HULL BREACH" in large text, then "PRESS ENTER TO RESTART" after 1s delay
- Enter key calls `resetGame()` which re-initializes all mutable state and returns to PLAYING

**WIN state**:
- Show "WELCOME TO AMERICA" in large text (80s blocky style)
- Below it: distance traveled, pings used, time elapsed
- "PRESS ENTER TO PLAY AGAIN"

### 1.2 Camera System

Replace all direct world-coordinate rendering with camera-offset rendering.

```javascript
const camera = { x: 0, y: 0 }; // top-left corner of viewport in world coords
```

**Every frame during PLAYING**:
```javascript
// Camera follows player, centered on screen
camera.x = player.x - canvas.width / 2;
camera.y = player.y - canvas.height / 2;
```

**Coordinate transform helper**:
```javascript
function worldToScreen(wx, wy) {
    return [wx - camera.x, wy - camera.y];
}
```

**What changes**:
- `drawPoly` calls: transform all vertex arrays through `worldToScreen` before drawing
- Sonar pulse rendering: all hit points and origin stored in world coords, transformed at draw time
- Radial gradients (depth glow, bloom): create at screen-space player position
- HUD text: drawn in screen coords (no transform needed)
- `ctx.fillRect(0, 0, ...)` for background: stays in screen space

**Important**: The sonar `pulse.hits` array already stores world coordinates (good). The rendering loop must subtract `camera.x/y` when drawing them. The expanding ring `ctx.arc` also needs screen-space origin.

**Cull off-screen pulses**: Before drawing a pulse's hit segments, skip if the pulse origin is more than `MAX_RANGE + canvas.width` away from camera center. This prevents processing pulses the player has long left behind.

### 1.3 Player Position Clamping

Remove the old border-clamping code:
```javascript
// DELETE these lines:
player.x = Math.max(margin + 32, Math.min(canvas.width - margin - 32, player.x));
player.y = Math.max(margin + 32, Math.min(canvas.height - margin - 32, player.y));
```

Wall collision will be handled by the canyon geometry in Phase 2 (and by collision detection in Phase 4).

### 1.4 Reset Function

```javascript
function resetGame() {
    player.x = SPAWN_X;
    player.y = SPAWN_Y;
    player.rot = -Math.PI / 2; // facing north
    speed = 0;
    turnRate = 0;
    pulses.length = 0;
    // Reset enemies to initial state (positions, AI state)
    initEnemies();
    gameState = STATE.PLAYING;
    stateTimer = 0;
    pingCount = 0;
    startTime = performance.now() / 1000;
}
```

### 1.5 Verification

- Game starts at TITLE screen, press Enter to play
- Player sub is centered on screen, world scrolls as sub moves
- Moving far from origin shows the sub stays centered, background scrolls
- Sonar pulses render correctly even after scrolling away and back
- No visual glitches at viewport edges

---

## Phase 2: Canyon Map Generation

**Goal**: Replace the rectangular border with a scrolling canyon/strait. Generate land walls on left and right sides, a start zone at the bottom, and a dock at the top.

### 2.1 World Dimensions

```javascript
const WORLD_W = 1600;       // canyon width (pixel units)
const WORLD_H = 12000;      // canyon length (tall, scroll north)
const CANYON_MIN_W = 280;    // narrowest passage
const CANYON_MAX_W = 700;    // widest passage
const SPAWN_X = WORLD_W / 2;
const SPAWN_Y = WORLD_H - 200; // near bottom
const DOCK_Y = 150;          // near top
```

### 2.2 Canyon Wall Generation

Generate two polylines (left wall, right wall) as arrays of `[x, y]` vertices running from `y = 0` to `y = WORLD_H`.

Algorithm -- sample points every `STEP_Y = 60` pixels along Y:

```javascript
function generateCanyon() {
    const leftWall = [];
    const rightWall = [];
    const STEP_Y = 60;
    const steps = Math.ceil(WORLD_H / STEP_Y);

    // Use a seeded random for reproducibility (simple LCG)
    let seed = 42;
    function rand() {
        seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
        return seed / 0x7fffffff;
    }

    let centerX = WORLD_W / 2;
    let width = CANYON_MAX_W;

    for (let i = 0; i <= steps; i++) {
        const y = WORLD_H - i * STEP_Y;

        // Drift center with Perlin-like smoothness
        centerX += (rand() - 0.5) * 80;
        centerX = Math.max(CANYON_MAX_W / 2 + 50, Math.min(WORLD_W - CANYON_MAX_W / 2 - 50, centerX));

        // Narrow the canyon as player goes north (increases difficulty)
        const progress = i / steps; // 0 at start, 1 at dock
        const targetWidth = CANYON_MAX_W - (CANYON_MAX_W - CANYON_MIN_W) * Math.pow(progress, 0.7);
        width += (targetWidth - width) * 0.1;
        // Add local variation
        width += (rand() - 0.5) * 40;
        width = Math.max(CANYON_MIN_W, Math.min(CANYON_MAX_W, width));

        const halfW = width / 2;
        // Add jaggedness to walls
        const jagL = (rand() - 0.5) * 30;
        const jagR = (rand() - 0.5) * 30;

        leftWall.push([centerX - halfW + jagL, y]);
        rightWall.push([centerX + halfW + jagR, y]);
    }

    return { leftWall, rightWall };
}
```

**Wide start zone**: The first 5-6 sample points (bottom of map) should force `width = CANYON_MAX_W` and `centerX = WORLD_W / 2` so the player spawns in open water.

**Dock zone**: The last 3-4 points (top of map) should widen back out slightly and center, forming a natural harbor mouth.

### 2.3 Converting Walls to Segments

Convert each polyline into an array of line segments for raycasting:

```javascript
function polylineToSegments(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
        segs.push([pts[i], pts[i + 1]]);
    }
    return segs;
}
```

Also add a top wall and bottom wall (horizontal lines closing the canyon):

```javascript
// Bottom wall: connect leftWall[0] to rightWall[0]
// Top wall: connect leftWall[last] to rightWall[last]
```

**Store all wall segments in `wallSegs` array.** These replace the old `borders` array.

### 2.4 Segment Spatial Index (Performance)

With 200+ wall segments plus objects, raycasting 720 rays against all of them is expensive. Implement a simple grid-based spatial index:

```javascript
const GRID_SIZE = 200; // pixels per cell
const segGrid = new Map(); // "gx,gy" -> [seg, seg, ...]

function gridKey(x, y) {
    return `${Math.floor(x / GRID_SIZE)},${Math.floor(y / GRID_SIZE)}`;
}

function insertSegIntoGrid(seg) {
    // Rasterize the segment's bounding box into grid cells
    const [p1, p2] = seg;
    const minX = Math.min(p1[0], p2[0]), maxX = Math.max(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]), maxY = Math.max(p1[1], p2[1]);
    for (let gx = Math.floor(minX / GRID_SIZE); gx <= Math.floor(maxX / GRID_SIZE); gx++) {
        for (let gy = Math.floor(minY / GRID_SIZE); gy <= Math.floor(maxY / GRID_SIZE); gy++) {
            const key = `${gx},${gy}`;
            if (!segGrid.has(key)) segGrid.set(key, []);
            segGrid.get(key).push(seg);
        }
    }
}
```

At raycast time, only test segments in grid cells along the ray's path (collect cells the ray passes through up to `MAX_RANGE`). This brings raycast from O(720 * N_segs) to O(720 * ~20).

**Alternative simpler approach**: Since rays originate from the player, collect all segments within `MAX_RANGE` of the player once per frame (before casting all 720 rays). Store them in `nearbySegs`. This is simpler and sufficient:

```javascript
function collectNearbySegs(px, py, range) {
    const nearby = [];
    const r2 = range * range;
    for (const seg of allSegs) {
        // Check if either endpoint is within range (fast approximation)
        const dx1 = seg[0][0] - px, dy1 = seg[0][1] - py;
        const dx2 = seg[1][0] - px, dy2 = seg[1][1] - py;
        if (dx1*dx1 + dy1*dy1 < r2 || dx2*dx2 + dy2*dy2 < r2) {
            nearby.push(seg);
        }
    }
    return nearby;
}
```

Use `nearbySegs` instead of `allSegs` in `castPulse()`. The `allSegs` array is rebuilt whenever enemy positions change (Phase 3). Wall segments are static and always in `allSegs`.

### 2.5 Rendering Canyon Walls

Walls are invisible (this is sonar -- you can't see anything). They only appear when pinged, via the existing sonar contour system. However, draw a very faint static outline of the canyon in dark blue-gray (`rgba(30, 50, 70, 0.08)`) as a subtle navigational aid. This is optional and can be tuned.

**The dock at the top**: Draw a simple rectangular pier structure at `y = DOCK_Y`. Two horizontal lines forming a U-shape opening toward the canyon. Add it as segments in `allSegs` so it shows up on sonar. Mark the dock area with faint green glow when the player is close (within 300px):

```javascript
const DOCK_RECT = { x: WORLD_W/2 - 60, y: DOCK_Y - 40, w: 120, h: 80 };
```

### 2.6 Object Placement

Remove the old hardcoded `objects` array. Replace with procedural placement along the canyon.

**Placement rules**:
- Divide the canyon into vertical zones of ~400px each
- Each zone gets a random assortment: 1-3 mines, 0-1 shark, 0-1 enemy sub
- Objects placed at random x positions within the canyon width at that y-level
- Ensure minimum distance from walls (40px) and from each other (60px)
- No objects in the first 600px (spawn safe zone) or last 400px (dock approach)
- Difficulty scaling: zones closer to the dock (further north) have denser placement

**Object counts (approximate for a 12000px canyon)**:
- Mines: 40-60
- Sharks: 8-12
- Enemy submarines: 5-8

Each object gets a `type` field:

```javascript
const OBJ_TYPE = { MINE: 0, SHARK: 1, ENEMY_SUB: 2 };

const objects = []; // populated by generateObjects()

function generateObjects() {
    objects.length = 0;
    const ZONE_H = 400;
    const numZones = Math.floor((WORLD_H - 1000) / ZONE_H); // exclude safe zones

    for (let z = 0; z < numZones; z++) {
        const zoneY = WORLD_H - 600 - z * ZONE_H;
        const progress = z / numZones; // 0 = easy, 1 = hard
        // ... place objects using canyon width at zoneY
    }
}
```

### 2.7 Verification

- Canyon is visible via sonar pings
- Player spawns at bottom in open water
- Scrolling works -- moving north reveals more canyon
- Objects are scattered throughout
- Dock structure visible at top via sonar
- Performance holds at 60fps with the larger segment count

---

## Phase 3: Enemy Behaviors

**Goal**: Give sharks, mines, and enemy subs distinct behaviors.

### 3.1 Data Model

Extend each object with behavior state:

```javascript
// Shared fields for all objects:
// { x, y, rot, shape, type, alive: true }

// Shark-specific:
// { ...base, vx, vy, wanderTimer, wanderAngle }

// Enemy sub-specific:
// { ...base, state: 'patrol'|'intercept', patrolVx, patrolVy,
//   targetX, targetY, interceptHeading, interceptSpeed }
```

### 3.2 Shark AI -- Wandering

Sharks drift with constant velocity, changing direction periodically.

```javascript
const SHARK_SPEED = 25; // px/s -- slow drift
const SHARK_TURN_INTERVAL = [2, 5]; // seconds between direction changes

function updateShark(obj, dt) {
    // Count down wander timer
    obj.wanderTimer -= dt;
    if (obj.wanderTimer <= 0) {
        // Pick new random heading
        obj.wanderAngle += (Math.random() - 0.5) * Math.PI * 0.8;
        obj.wanderTimer = SHARK_TURN_INTERVAL[0] +
            Math.random() * (SHARK_TURN_INTERVAL[1] - SHARK_TURN_INTERVAL[0]);
    }

    // Smoothly rotate toward wander angle
    const angleDiff = normalizeAngle(obj.wanderAngle - obj.rot);
    obj.rot += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 1.5 * dt);

    // Move forward
    obj.x += Math.cos(obj.rot) * SHARK_SPEED * dt;
    obj.y += Math.sin(obj.rot) * SHARK_SPEED * dt;

    // Bounce off walls: if too close to canyon wall, reverse wanderAngle
    // (simple: check if x is within 40px of wall at current y)
    bounceOffWalls(obj);
}
```

**Wall avoidance**: Look up the canyon width at the shark's current Y, compute left and right wall X. If shark is within 50px of either wall, set `wanderAngle` to point toward canyon center.

### 3.3 Enemy Sub AI -- Patrol + Intercept

**Patrol mode** (default): Slow random drift, similar to sharks but even slower.

```javascript
const ESUB_PATROL_SPEED = 15;  // px/s
const ESUB_INTERCEPT_SPEED = 70; // px/s -- faster than player's max 100? No, make it 65-70 so player can outrun but barely
const ESUB_DETECT_RANGE = 800; // sonar ping detection radius
```

**Intercept trigger**: When the player fires a sonar ping, check each enemy sub:

```javascript
function onPlayerPing(playerX, playerY, playerRot, playerSpeed) {
    for (const obj of objects) {
        if (obj.type !== OBJ_TYPE.ENEMY_SUB || !obj.alive) continue;
        const dx = obj.x - playerX, dy = obj.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > ESUB_DETECT_RANGE) continue;

        // Enemy heard the ping -- calculate intercept
        obj.state = 'intercept';

        // Snapshot player's velocity vector at ping moment
        const pvx = Math.cos(playerRot) * playerSpeed;
        const pvy = Math.sin(playerRot) * playerSpeed;

        // Predict where player will be after (dist / ESUB_INTERCEPT_SPEED) seconds
        const timeToIntercept = dist / ESUB_INTERCEPT_SPEED;
        obj.targetX = playerX + pvx * timeToIntercept;
        obj.targetY = playerY + pvy * timeToIntercept;

        // Head toward predicted position
        obj.interceptHeading = Math.atan2(obj.targetY - obj.y, obj.targetX - obj.x);
    }
}
```

**Intercept mode update**:

```javascript
function updateEnemySub(obj, dt) {
    if (obj.state === 'intercept') {
        // Rotate toward intercept heading
        const angleDiff = normalizeAngle(obj.interceptHeading - obj.rot);
        obj.rot += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 2.0 * dt);

        // Move at intercept speed
        obj.x += Math.cos(obj.rot) * ESUB_INTERCEPT_SPEED * dt;
        obj.y += Math.sin(obj.rot) * ESUB_INTERCEPT_SPEED * dt;

        // If reached target area (within 80px) or traveled more than 6s, return to patrol
        const dx = obj.targetX - obj.x, dy = obj.targetY - obj.y;
        obj.interceptTimer = (obj.interceptTimer || 0) + dt;
        if (dx * dx + dy * dy < 80 * 80 || obj.interceptTimer > 6) {
            obj.state = 'patrol';
            obj.interceptTimer = 0;
        }
    } else {
        // Patrol: slow wander like shark but slower
        updatePatrol(obj, dt, ESUB_PATROL_SPEED);
    }

    bounceOffWalls(obj);
}
```

**Key design insight**: Enemy subs intercept based on where the player WAS and the velocity at ping time. If the player changes course after pinging, the sub heads to the wrong spot. This rewards: (a) pinging while stationary (enemy comes to where you are -- bad), (b) pinging while moving then turning (enemy goes to wrong place -- good), (c) not pinging at all (enemy stays passive -- safest but blind).

### 3.4 Mines -- No AI

Mines are stationary. No update function needed. They just exist as collision hazards.

### 3.5 Rebuild Segments on Movement

Since sharks and enemy subs now move, `allSegs` must be rebuilt each frame (or at least the object segments portion). 

**Optimization**: Split segments into `wallSegs` (static, computed once) and `objectSegs` (recomputed each frame from living objects).

```javascript
// Once at init:
const wallSegs = [...canyonLeftSegs, ...canyonRightSegs, ...topBottomSegs, ...dockSegs];

// Each frame:
function rebuildObjectSegs() {
    objectSegs.length = 0;
    for (const obj of objects) {
        if (!obj.alive) continue;
        const verts = transformVerts(obj.shape, obj.x, obj.y, obj.rot);
        obj.worldVerts = verts; // cache for collision detection
        objectSegs.push(...toSegments(verts));
    }
}

// For raycasting:
// nearbySegs = collectNearby(wallSegs, px, py, range)
//            .concat(collectNearby(objectSegs, px, py, range));
```

### 3.6 Calling AI Updates

In the main `frame()` function, during PLAYING state:

```javascript
for (const obj of objects) {
    if (!obj.alive) continue;
    if (obj.type === OBJ_TYPE.SHARK) updateShark(obj, dt);
    else if (obj.type === OBJ_TYPE.ENEMY_SUB) updateEnemySub(obj, dt);
    // mines: no update
}
rebuildObjectSegs();
```

And in `castPulse()`, after creating the pulse, call `onPlayerPing(player.x, player.y, player.rot, speed)`.

### 3.7 Verification

- Sharks visibly drift when pinged (sonar reveals them in different positions over time)
- Enemy subs sit still until pinged, then rush toward intercept point
- Enemy subs return to patrol after reaching intercept or timeout
- Pinging while moving then turning causes enemy subs to go to wrong location
- Mines stay put
- No performance degradation from per-frame segment rebuild

---

## Phase 4: Collision Detection + Death

**Goal**: Detect collisions between the player and obstacles/walls. Implement death and restart.

### 4.1 Collision Detection Approach

Use two layers:
1. **Circle-circle broad phase**: Each object has a bounding radius. Skip if distance > sum of radii.
2. **Polygon overlap narrow phase**: SAT (Separating Axis Theorem) or simpler point-in-polygon test.

For simplicity (and because the player sub is small), use **point-in-polygon** for the player's center point against each object's world-space polygon, plus **segment intersection** for the player's movement vector against object edges (to catch fast-moving tunneling).

**Simpler still**: Since objects are small, just use circle-circle collision with tuned radii. This is the 80s arcade approach.

```javascript
const COLLISION_RADII = {
    player: 14,    // half the sub's narrow dimension
    mine: 10,      // matches disc radius
    shark: 14,     // roughly half the shark's length
    enemySub: 16,  // half the enemy sub's narrow dimension
};

function checkCollisions() {
    for (const obj of objects) {
        if (!obj.alive) continue;
        const dx = player.x - obj.x, dy = player.y - obj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = COLLISION_RADII.player +
            (obj.type === OBJ_TYPE.MINE ? COLLISION_RADII.mine :
             obj.type === OBJ_TYPE.SHARK ? COLLISION_RADII.shark :
             COLLISION_RADII.enemySub);

        if (dist < minDist) {
            return obj; // collision!
        }
    }
    return null;
}
```

### 4.2 Wall Collision

Check if the player's position is outside the canyon walls:

```javascript
function isInsideCanyon(x, y) {
    // Find the two wall points bracketing this y-level
    // Interpolate leftWall x and rightWall x at this y
    // Return x > leftX + margin && x < rightX - margin
    const leftX = interpolateWallX(leftWall, y);
    const rightX = interpolateWallX(rightWall, y);
    return x > leftX + 15 && x < rightX - 15;
}

function interpolateWallX(wall, y) {
    // Binary search or linear scan for the two points bracketing y
    // Linear interpolate x between them
    // wall points are sorted by y (descending from WORLD_H to 0)
    for (let i = 0; i < wall.length - 1; i++) {
        if (y <= wall[i][1] && y >= wall[i+1][1]) {
            const t = (y - wall[i+1][1]) / (wall[i][1] - wall[i+1][1]);
            return wall[i+1][0] + t * (wall[i][0] - wall[i+1][0]);
        }
    }
    return WORLD_W / 2; // fallback
}
```

**Two modes for wall collision**:
- **Hard stop** (simpler, recommended): If player would move outside canyon, clamp position to canyon boundary. The sub slides along the wall.
- **Death on wall hit**: More punishing. Could do this for high-speed impacts only.

**Recommendation**: Hard stop (slide along walls). Death only on object collision. This is more fun than instant death on wall brush.

### 4.3 Death Sequence

```javascript
function die(cause) {
    gameState = STATE.DEAD;
    stateTimer = 0;
    deathCause = cause; // 'mine', 'shark', 'submarine', 'wall'
    playDeathSound();
}
```

**Death sound** (Web Audio):
```javascript
function playDeathSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    // Low rumble + crunch
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 1.0);

    // Noise burst (explosion bubbles)
    const bufSize = audioCtx.sampleRate * 0.3;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() - 0.5) * 0.4;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(ng).connect(audioCtx.destination);
    noise.start(t);
}
```

### 4.4 Death Screen Rendering

```javascript
// In DEAD state rendering:
if (stateTimer < 0.15) {
    ctx.fillStyle = `rgba(255, 0, 0, ${0.5 * (1 - stateTimer / 0.15)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

ctx.fillStyle = '#ff3030';
ctx.font = 'bold 48px monospace';
ctx.textAlign = 'center';
ctx.fillText('HULL BREACH', canvas.width / 2, canvas.height / 2 - 30);

if (stateTimer > 1.0) {
    ctx.font = '20px monospace';
    ctx.fillStyle = `rgba(255, 80, 60, ${0.5 + 0.5 * Math.sin(stateTimer * 4)})`;
    ctx.fillText('PRESS ENTER TO RETRY', canvas.width / 2, canvas.height / 2 + 30);
}
```

### 4.5 Integration into Frame Loop

```javascript
// In frame(), after movement update:
if (gameState === STATE.PLAYING) {
    // Wall collision (clamp, not death)
    if (!isInsideCanyon(player.x, player.y)) {
        // Push player back inside
        const leftX = interpolateWallX(leftWall, player.y);
        const rightX = interpolateWallX(rightWall, player.y);
        player.x = Math.max(leftX + 16, Math.min(rightX - 16, player.x));
        speed *= 0.3; // lose most speed on wall scrape
    }

    // Top/bottom bounds
    player.y = Math.max(30, Math.min(WORLD_H - 30, player.y));

    // Object collision
    const hit = checkCollisions();
    if (hit) {
        const causes = ['mine', 'shark', 'submarine'];
        die(causes[hit.type]);
    }

    // Win check
    if (player.y < DOCK_Y + 40) {
        gameState = STATE.WIN;
        stateTimer = 0;
    }
}
```

### 4.6 Verification

- Touching a mine kills the player immediately
- Touching a moving shark kills the player
- Enemy sub collision kills the player
- Bumping into canyon walls slides the player along them
- Death screen appears with red flash
- Pressing Enter restarts the game cleanly
- Reaching the dock triggers win state

---

## Phase 5: Win State + HUD

**Goal**: Implement the dock, win screen, and in-game HUD showing progress.

### 5.1 Dock Structure

The dock is a U-shaped structure at the top of the canyon:

```javascript
const DOCK_W = 140;
const DOCK_H = 100;
const DOCK_CX = WORLD_W / 2;
const DOCK_CY = DOCK_Y;

// Dock walls (three sides of a rectangle, open at bottom)
const dockSegs = [
    [[DOCK_CX - DOCK_W/2, DOCK_CY - DOCK_H/2], [DOCK_CX + DOCK_W/2, DOCK_CY - DOCK_H/2]], // top
    [[DOCK_CX - DOCK_W/2, DOCK_CY - DOCK_H/2], [DOCK_CX - DOCK_W/2, DOCK_CY + DOCK_H/2]], // left
    [[DOCK_CX + DOCK_W/2, DOCK_CY - DOCK_H/2], [DOCK_CX + DOCK_W/2, DOCK_CY + DOCK_H/2]], // right
];
```

These segments are added to `wallSegs` so they appear on sonar.

**Dock proximity indicator**: When player is within 500px of the dock, render a faint green glow at the dock's screen position -- a beacon:

```javascript
if (gameState === STATE.PLAYING) {
    const distToDock = Math.hypot(player.x - DOCK_CX, player.y - DOCK_CY);
    if (distToDock < 500) {
        const [sx, sy] = worldToScreen(DOCK_CX, DOCK_CY);
        const alpha = 0.15 * (1 - distToDock / 500);
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60);
        glow.addColorStop(0, `rgba(0, 255, 100, ${alpha})`);
        glow.addColorStop(1, 'rgba(0, 255, 100, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sx - 60, sy - 60, 120, 120);
    }
}
```

### 5.2 Win Screen

```javascript
// In WIN state rendering:
ctx.fillStyle = '#080c14';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// "WELCOME TO AMERICA" - large, 80s style
ctx.fillStyle = '#00ff66';
ctx.font = 'bold 52px monospace';
ctx.textAlign = 'center';
ctx.fillText('WELCOME TO AMERICA', canvas.width / 2, canvas.height / 2 - 80);

// Stats
const elapsed = winTime - startTime;
ctx.font = '18px monospace';
ctx.fillStyle = '#33aa55';
const statsY = canvas.height / 2;
ctx.fillText(`TIME: ${formatTime(elapsed)}`, canvas.width / 2, statsY);
ctx.fillText(`SONAR PINGS: ${pingCount}`, canvas.width / 2, statsY + 30);
ctx.fillText(`DISTANCE: ${Math.round(WORLD_H - DOCK_Y)} METERS`, canvas.width / 2, statsY + 60);

// Replay prompt
if (stateTimer > 2.0) {
    ctx.fillStyle = `rgba(0, 255, 100, ${0.5 + 0.5 * Math.sin(stateTimer * 3)})`;
    ctx.font = '20px monospace';
    ctx.fillText('PRESS ENTER TO PLAY AGAIN', canvas.width / 2, statsY + 120);
}
```

### 5.3 In-Game HUD

Minimal 80s arcade HUD. All drawn in screen space (no camera transform).

**Top-left: Depth/distance indicator**

```javascript
// Distance remaining (in "meters" -- just pixels / some scale)
const distRemaining = Math.max(0, player.y - DOCK_Y);
const progress = 1 - distRemaining / (SPAWN_Y - DOCK_Y);

ctx.fillStyle = 'rgba(200, 40, 30, 0.5)';
ctx.font = '14px monospace';
ctx.textAlign = 'left';
ctx.fillText(`DEPTH: ${Math.round(distRemaining)}m`, 20, 30);
```

**Top-left: Progress bar**

```javascript
// Thin red bar along top edge
const barW = 200;
const barH = 3;
ctx.fillStyle = 'rgba(100, 20, 15, 0.4)';
ctx.fillRect(20, 42, barW, barH);
ctx.fillStyle = 'rgba(255, 60, 40, 0.7)';
ctx.fillRect(20, 42, barW * progress, barH);
```

**Top-right: Ping count**

```javascript
ctx.textAlign = 'right';
ctx.fillStyle = 'rgba(200, 40, 30, 0.5)';
ctx.fillText(`PINGS: ${pingCount}`, canvas.width - 20, 30);
```

**Top-right: Speed indicator**

```javascript
const speedPct = Math.abs(speed) / MAX_SPEED;
ctx.fillText(`SPD: ${Math.round(speedPct * 100)}%`, canvas.width - 20, 50);
```

**Bottom-center: Controls (same as current, but only show for first 10 seconds)**

```javascript
if (stateTimer < 10) {
    const alpha = stateTimer < 8 ? 0.4 : 0.4 * (1 - (stateTimer - 8) / 2);
    ctx.fillStyle = `rgba(200, 40, 30, ${alpha})`;
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[ WASD ] MOVE    [ SPACE ] PING', canvas.width / 2, canvas.height - 25);
}
```

### 5.4 Compass Bearing

A small compass at the top-center showing the sub's heading:

```javascript
const headingDeg = (((-player.rot * 180 / Math.PI) + 90) % 360 + 360) % 360;
const cardinal = ['N','NE','E','SE','S','SW','W','NW'][Math.round(headingDeg / 45) % 8];
ctx.textAlign = 'center';
ctx.fillStyle = 'rgba(200, 40, 30, 0.5)';
ctx.fillText(`${cardinal} ${Math.round(headingDeg)}`, canvas.width / 2, 30);
```

### 5.5 Tracking Variables

Add these to global scope:

```javascript
let pingCount = 0;
let startTime = 0;
let winTime = 0;
```

Increment `pingCount` in `castPulse()`. Set `startTime` when entering PLAYING. Set `winTime` when entering WIN.

### 5.6 Verification

- HUD shows depth, progress bar, heading, speed, ping count
- Progress bar fills as player moves north
- Reaching the dock shows "WELCOME TO AMERICA" with stats
- Controls hint fades after 10 seconds
- All HUD elements are subtle and non-distracting

---

## Phase 6: Sound Design

**Goal**: Add atmospheric audio using Web Audio API. No audio files. All synthesized.

### 6.1 Ambient Engine Drone

A low continuous hum that increases in pitch/volume with speed:

```javascript
let engineOsc, engineGain;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    engineOsc.type = 'triangle';
    engineOsc.frequency.value = 40;
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(audioCtx.destination);
    engineOsc.start();
}

function updateEngineAudio(speed) {
    if (!engineOsc) return;
    const t = audioCtx.currentTime;
    const speedFrac = Math.abs(speed) / MAX_SPEED;
    engineOsc.frequency.setTargetAtTime(40 + speedFrac * 30, t, 0.1);
    engineGain.gain.setTargetAtTime(speedFrac * 0.04, t, 0.1);
}
```

Call `initAudio()` on first user interaction (Enter on title screen). Call `updateEngineAudio(speed)` every frame.

### 6.2 Sonar Return Echo

When sonar hits land on objects/walls, play a faint return echo. The existing `playPing()` handles the outgoing ping. Add a delayed return:

```javascript
function playEcho(delay, intensity) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.15);
    gain.gain.setValueAtTime(intensity * 0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
}
```

After casting a pulse, compute the closest hit distance and schedule an echo:

```javascript
// In castPulse(), after computing hits:
if (hits.length > 0) {
    const closest = hits.reduce((m, h) => Math.min(m, h.d), MAX_RANGE);
    playEcho(closest / PULSE_SPEED, 1 - closest / MAX_RANGE);
}
```

### 6.3 Proximity Warning

When close to an object (within 150px), play a faint low-frequency pulse. NOT continuous -- trigger once when entering proximity, do not retrigger for 3 seconds. This simulates passive sonar picking up nearby movement/noise. This is a gameplay hint -- it tells you something is close without telling you what or where.

```javascript
let lastProxWarnTime = 0;

function checkProximityWarning(now) {
    if (now - lastProxWarnTime < 3) return;
    for (const obj of objects) {
        if (!obj.alive) continue;
        const dx = player.x - obj.x, dy = player.y - obj.y;
        if (dx*dx + dy*dy < 150*150) {
            lastProxWarnTime = now;
            playProximityBlip();
            break;
        }
    }
}

function playProximityBlip() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
}
```

### 6.4 Win Fanfare

A simple ascending three-note chord when the player reaches the dock:

```javascript
function playWinFanfare() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t + i * 0.2);
        gain.gain.linearRampToValueAtTime(0.08, t + i * 0.2 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.8);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t + i * 0.2);
        osc.stop(t + i * 0.2 + 0.8);
    });
}
```

### 6.5 Verification

- Engine hum scales with speed, silent when stopped
- Sonar ping plays on spacebar (already works)
- Faint echo returns after ping, delayed by distance
- Low blip sounds when near an obstacle (passive sonar warning)
- Death sound plays: rumble + noise burst
- Win fanfare plays: ascending triad
- No audio glitches, no overlapping noise walls

---

## Phase 7: Visual Polish + 80s Aesthetic

**Goal**: Add visual details that enhance atmosphere without hurting performance.

### 7.1 Scanline Overlay

Classic 80s CRT effect -- very subtle horizontal lines:

```javascript
function drawScanlines() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    for (let y = 0; y < canvas.height; y += 3) {
        ctx.fillRect(0, y, canvas.width, 1);
    }
}
```

Call at the very end of the render pipeline, after all HUD draws. The 0.04 alpha is barely perceptible but adds texture.

### 7.2 Vignette

Darken the edges of the viewport:

```javascript
function drawVignette() {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const r = Math.max(cx, cy) * 1.1;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
```

### 7.3 Water Particle Drift

Very subtle particles drifting across the screen to show motion:

```javascript
const particles = Array.from({ length: 30 }, () => ({
    x: Math.random() * 2000,
    y: Math.random() * 2000,
    size: 1 + Math.random(),
    alpha: 0.03 + Math.random() * 0.04,
    drift: 5 + Math.random() * 10,
}));

function drawParticles() {
    for (const p of particles) {
        // Parallax: particles move slower than camera (they're in the water)
        const sx = ((p.x - camera.x * 0.3) % canvas.width + canvas.width) % canvas.width;
        const sy = ((p.y - camera.y * 0.3) % canvas.height + canvas.height) % canvas.height;
        ctx.fillStyle = `rgba(80, 120, 160, ${p.alpha})`;
        ctx.fillRect(sx, sy, p.size, p.size);
    }
}
```

### 7.4 Player Sub Wake

When moving, draw a faint trail behind the sub:

```javascript
const wake = []; // [{x, y, t}]

function updateWake(now) {
    if (Math.abs(speed) > 10) {
        // Emit from sub's rear
        const rearX = player.x - Math.cos(player.rot) * 30;
        const rearY = player.y - Math.sin(player.rot) * 30;
        wake.push({ x: rearX, y: rearY, t: now });
    }
    // Remove old wake points
    while (wake.length > 0 && now - wake[0].t > 2.0) wake.shift();
}

function drawWake() {
    for (const w of wake) {
        const age = performance.now() / 1000 - w.t;
        const alpha = 0.08 * (1 - age / 2);
        if (alpha <= 0) continue;
        const [sx, sy] = worldToScreen(w.x, w.y);
        ctx.fillStyle = `rgba(100, 150, 200, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + age * 3, 0, Math.PI * 2);
        ctx.fill();
    }
}
```

Limit wake array to 60 entries max. Only push a new point every ~50ms (check time since last push).

### 7.5 Enemy Sub Alert Indicator

When an enemy sub enters intercept mode, briefly flash a yellow warning direction indicator at the screen edge pointing toward the threat:

```javascript
function drawThreatIndicators() {
    for (const obj of objects) {
        if (obj.type !== OBJ_TYPE.ENEMY_SUB || obj.state !== 'intercept' || !obj.alive) continue;
        // Only show for 1.5s after intercept begins
        if (!obj.alertTime || performance.now()/1000 - obj.alertTime > 1.5) continue;

        const dx = obj.x - player.x, dy = obj.y - player.y;
        const angle = Math.atan2(dy, dx);
        const edgeX = canvas.width/2 + Math.cos(angle) * (canvas.width/2 - 30);
        const edgeY = canvas.height/2 + Math.sin(angle) * (canvas.height/2 - 30);

        // Pulsing yellow triangle
        const alpha = 0.6 * (0.5 + 0.5 * Math.sin(performance.now() / 100));
        ctx.fillStyle = `rgba(255, 200, 0, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(edgeX + Math.cos(angle) * 10, edgeY + Math.sin(angle) * 10);
        ctx.lineTo(edgeX + Math.cos(angle + 2.5) * 8, edgeY + Math.sin(angle + 2.5) * 8);
        ctx.lineTo(edgeX + Math.cos(angle - 2.5) * 8, edgeY + Math.sin(angle - 2.5) * 8);
        ctx.closePath();
        ctx.fill();
    }
}
```

Set `obj.alertTime = performance.now()/1000` in `onPlayerPing()` when switching to intercept.

### 7.6 Verification

- Scanlines visible but extremely subtle
- Vignette darkens edges naturally
- Faint particles drift across screen during movement
- Wake trail follows behind the sub
- Yellow threat arrows appear briefly at screen edge when enemy subs activate
- All effects combined still run at 60fps

---

## Phase 8: Difficulty Scaling + Game Feel

**Goal**: Tune the game to be challenging but fair, with escalating tension.

### 8.1 Canyon Difficulty Zones

Divide the canyon into 4 named zones. Display the zone name briefly when entering:

| Zone | Y Range | Canyon Width | Density | Notes |
|------|---------|-------------|---------|-------|
| **OPEN WATERS** | Bottom 25% | Wide (600-700) | Low | Tutorial area, few mines, no enemy subs |
| **THE NARROWS** | 25-50% | Medium (400-550) | Medium | First enemy subs, moderate mines |
| **DEVIL'S CORRIDOR** | 50-75% | Narrow (300-400) | High | Dense mines, multiple enemy subs, sharks |
| **THE GAUNTLET** | Top 25% | Tight (280-350) | Very High | Maximum density, fast enemy subs |

**Zone entry notification**:
```javascript
let currentZone = '';
let zoneNotifyTimer = 0;

function checkZone() {
    const progress = 1 - (player.y - DOCK_Y) / (SPAWN_Y - DOCK_Y);
    let zone = '';
    if (progress < 0.25) zone = 'OPEN WATERS';
    else if (progress < 0.50) zone = 'THE NARROWS';
    else if (progress < 0.75) zone = "DEVIL'S CORRIDOR";
    else zone = 'THE GAUNTLET';

    if (zone !== currentZone) {
        currentZone = zone;
        zoneNotifyTimer = 3.0; // show for 3 seconds
    }
}

// In render:
if (zoneNotifyTimer > 0) {
    const alpha = zoneNotifyTimer > 2.5 ? (3 - zoneNotifyTimer) * 2 : // fade in
                  zoneNotifyTimer < 0.5 ? zoneNotifyTimer * 2 : 1;     // fade out
    ctx.fillStyle = `rgba(255, 60, 40, ${alpha * 0.6})`;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(currentZone, canvas.width / 2, canvas.height / 2 - 120);
    zoneNotifyTimer -= dt;
}
```

### 8.2 Enemy Sub Speed Scaling

Enemy subs in later zones are faster and have longer pursuit times:

```javascript
function getEsubSpeedForY(y) {
    const progress = 1 - (y - DOCK_Y) / (SPAWN_Y - DOCK_Y);
    return 50 + progress * 30; // 50 px/s early, 80 px/s late
}
```

### 8.3 Sonar Range Reduction (Optional -- tuning knob)

Consider reducing sonar range in later zones (deeper water, murkier). This can be too punishing -- implement it but gate it behind a constant that can be toggled:

```javascript
const SONAR_RANGE_SCALING = true;
function getSonarRange(y) {
    if (!SONAR_RANGE_SCALING) return MAX_RANGE;
    const progress = 1 - (y - DOCK_Y) / (SPAWN_Y - DOCK_Y);
    return MAX_RANGE * (1 - progress * 0.25); // up to 25% reduction
}
```

### 8.4 Scoring System

Score = f(time, pings, zone_reached):

```javascript
function computeScore() {
    const timeBonus = Math.max(0, 300 - Math.floor(elapsed));    // faster = better
    const pingPenalty = pingCount * 5;                            // fewer pings = better
    const baseScore = 1000;                                       // for completing
    return baseScore + timeBonus - pingPenalty;
}
```

Display score on the WIN screen. Display "best score" using `localStorage`:

```javascript
const bestKey = 'subsonar_best';
let bestScore = parseInt(localStorage.getItem(bestKey) || '0');
const score = computeScore();
if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(bestKey, String(score));
}
```

### 8.5 Pause Support

Press `Escape` or `P` to pause:

```javascript
let paused = false;

// In keydown handler:
if (e.code === 'Escape' || e.code === 'KeyP') {
    if (gameState === STATE.PLAYING) paused = !paused;
}

// In frame():
if (paused) {
    // Draw "PAUSED" overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff3030';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    requestAnimationFrame(frame);
    return;
}
```

### 8.6 Minimap (Fog of War)

A tiny minimap in the bottom-right showing the full canyon as a thin vertical strip. Only areas the player has visited (scrolled past) are revealed. Unvisited areas are black.

```javascript
const MINIMAP_W = 20;
const MINIMAP_H = 160;
const MINIMAP_X = canvas.width - MINIMAP_W - 15;
const MINIMAP_Y = canvas.height - MINIMAP_H - 40;

// Track visited Y range
let visitedMinY = SPAWN_Y;
let visitedMaxY = SPAWN_Y;

function drawMinimap() {
    visitedMinY = Math.min(visitedMinY, player.y);
    visitedMaxY = Math.max(visitedMaxY, player.y);

    // Border
    ctx.strokeStyle = 'rgba(255, 60, 40, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(MINIMAP_X, MINIMAP_Y, MINIMAP_W, MINIMAP_H);

    // Visited range (red tint)
    const topFrac = 1 - visitedMinY / WORLD_H;
    const botFrac = 1 - visitedMaxY / WORLD_H;
    ctx.fillStyle = 'rgba(255, 40, 30, 0.12)';
    ctx.fillRect(MINIMAP_X, MINIMAP_Y + topFrac * MINIMAP_H,
                 MINIMAP_W, (botFrac - topFrac) * MINIMAP_H);

    // Player dot
    const playerFrac = 1 - player.y / WORLD_H;
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(MINIMAP_X + MINIMAP_W/2 - 1,
                 MINIMAP_Y + playerFrac * MINIMAP_H - 1, 3, 3);

    // Dock marker
    const dockFrac = 1 - DOCK_Y / WORLD_H;
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(MINIMAP_X, MINIMAP_Y + dockFrac * MINIMAP_H, MINIMAP_W, 2);
}
```

### 8.7 Verification

- Zone names appear and fade when crossing boundaries
- Enemy subs get faster in later zones
- Score displays on win screen with high score
- Pause works (Esc or P)
- Minimap shows progress, player position, dock position
- Game feels progressively harder going north

---

## Phase Summary

| Phase | Focus | Key Deliverables | Playable? |
|-------|-------|-----------------|-----------|
| 1 | State Machine + Camera | Title/death/win states, viewport scrolling | Yes (no death trigger yet) |
| 2 | Canyon Map | Procedural canyon, dock, object placement | Yes (can explore canyon) |
| 3 | Enemy AI | Shark wander, sub intercept-on-ping | Yes (enemies move) |
| 4 | Collision + Death | Hit detection, death screen, restart | Yes (can die and retry) |
| 5 | Win State + HUD | Dock goal, stats, compass, progress bar | Yes (can win) |
| 6 | Sound Design | Engine hum, echo, proximity, fanfare | Yes (atmospheric audio) |
| 7 | Visual Polish | Scanlines, vignette, wake, particles, threat arrows | Yes (looks polished) |
| 8 | Difficulty + Game Feel | Zones, scaling, scoring, pause, minimap | Yes (complete game) |

---

## Implementation Notes for Developer

### Performance Guardrails

- **Segment count**: With ~200 wall segments + ~60-80 object segments, the `collectNearbySegs` filter is critical. Test that `castPulse` takes <5ms.
- **Canvas draws per frame**: Target <300 draw calls. Batched sonar paths (existing bucket system) are essential.
- **Wake/particle arrays**: Hard-cap at 60 and 30 entries respectively. Use ring buffers or shift().
- **Object AI updates**: 50-70 objects with simple math -- negligible cost.

### Coordinate System

- World origin (0,0) is top-left of the world
- Y increases downward (standard canvas)
- Player starts at high Y (bottom of world), moves toward low Y (top)
- "North" in game terms = negative Y direction
- Player `rot = -Math.PI/2` faces north (upward on screen)

### State Isolation

All mutable game state must be resettable by `resetGame()`. Track every mutable variable:
- `player.x, .y, .rot`
- `speed, turnRate`
- `pulses[]`
- `objects[]` (positions, AI state, alive flags)
- `wake[]`
- `pingCount, startTime`
- `visitedMinY, visitedMaxY`
- `currentZone, zoneNotifyTimer`
- `paused`
- `lastProxWarnTime`

`wallSegs` and canyon geometry are immutable after generation (no need to reset unless you want a new map per run -- for now, same map every time is fine; seeded RNG makes it deterministic).

### Testing Cheats (Remove Before Ship)

Add a debug key during development:

```javascript
// Press 'T' to teleport north by 2000px (skip ahead for testing)
if (e.code === 'KeyT' && gameState === STATE.PLAYING) {
    player.y -= 2000;
}
// Press 'G' to toggle god mode (no collision)
if (e.code === 'KeyG') {
    godMode = !godMode;
}
```

### Key Design Decisions Baked In

1. **Wall collision = slide, not death**. Bumping walls is frustrating in narrow passages. Sliding is more fun.
2. **Enemy subs intercept based on ping-moment velocity**. Changing course after pinging is the counterplay.
3. **Proximity audio warning** gives passive intel without revealing position. Rewards cautious play.
4. **Sonar alerts ALL enemy subs in range**, not just the closest. Multiple simultaneous interceptors in dense zones creates real tension.
5. **Canyon narrows gradually**. The player feels the squeeze over time, not as a sudden wall.
6. **Same map every run** (seeded RNG). Players can learn the layout, developing skill. Randomized maps would prevent mastery.
7. **Score penalizes pings**. Reinforces the core tension: see vs. be seen.
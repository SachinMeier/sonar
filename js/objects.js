// objects.js -- generateObjects(), object types, collision detection

(function () {
    var G = window.G;

    G.objects = [];
    G.objectSegs = [];
    G.mineSegs = [];

    function generateObjects() {
        G.objects = [];
        var SLOT_H = 300;

        // Fresh seed every run — different object placement every time
        var seed = (Math.floor(Math.random() * 0x7fffffff)) | 1;
        function rand() {
            seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
            return seed / 0x7fffffff;
        }

        function placeMine(yCenter, ySpread) {
            var oy = yCenter + (rand() - 0.5) * ySpread;
            var lx = G.canyon.interpolateWallX(G.leftWall, oy) + 30;
            var rx = G.canyon.interpolateWallX(G.rightWall, oy) - 30;
            if (rx - lx < 50) return;
            var ox = lx + rand() * (rx - lx);
            var radius = 9 + rand() * 3;
            G.objects.push({
                x: ox, y: oy, rot: 0,
                shape: G.shapes.disc(radius, 14),
                type: G.OBJ_TYPE.MINE,
                alive: true,
                collisionRadius: radius,
            });
        }

        function placeMineCluster(yCenter, count) {
            for (var c = 0; c < count; c++) {
                var oy = yCenter + (rand() - 0.5) * 120;
                var lx = G.canyon.interpolateWallX(G.leftWall, oy) + 20;
                var rx = G.canyon.interpolateWallX(G.rightWall, oy) - 20;
                if (rx - lx < 50) continue;
                var wallBias = rand() < 0.5 ? 0.1 + rand() * 0.2 : 0.7 + rand() * 0.2;
                var ox = lx + (rx - lx) * wallBias;
                var radius = 9 + rand() * 3;
                G.objects.push({
                    x: ox, y: oy, rot: 0,
                    shape: G.shapes.disc(radius, 14),
                    type: G.OBJ_TYPE.MINE,
                    alive: true,
                    collisionRadius: radius,
                });
            }
        }

        function placeShark(yCenter, ySpread) {
            var oy = yCenter + (rand() - 0.5) * ySpread;
            var lx = G.canyon.interpolateWallX(G.leftWall, oy) + 50;
            var rx = G.canyon.interpolateWallX(G.rightWall, oy) - 50;
            if (rx - lx < 80) return;
            var ox = lx + rand() * (rx - lx);
            var s = 1.2 + rand() * 0.3;
            G.objects.push({
                x: ox, y: oy, rot: rand() * Math.PI * 2,
                shape: G.shapes.sharkShape(s),
                type: G.OBJ_TYPE.SHARK,
                alive: true,
                collisionRadius: 14,
                wanderTimer: rand() * 3,
                wanderAngle: rand() * Math.PI * 2,
            });
        }

        function placeEnemySub(yCenter, ySpread) {
            var oy = yCenter + (rand() - 0.5) * ySpread;
            var lx = G.canyon.interpolateWallX(G.leftWall, oy) + 50;
            var rx = G.canyon.interpolateWallX(G.rightWall, oy) - 50;
            if (rx - lx < 100) return;
            var ox = lx + rand() * (rx - lx);
            G.objects.push({
                x: ox, y: oy, rot: rand() * Math.PI * 2,
                shape: G.shapes.roundedRect(52, 20, 9),
                type: G.OBJ_TYPE.ENEMY_SUB,
                alive: true,
                collisionRadius: G.COLLISION_RADII.enemySub,
                aiState: 'patrol',
                wanderTimer: rand() * 3,
                wanderAngle: rand() * Math.PI * 2,
                targetX: 0, targetY: 0,
                interceptTimer: 0,
                listenTimer: 0,
            });
        }

        var zone1Top = G.zoneYBoundary(0.25);
        var zone2Top = G.zoneYBoundary(0.50);
        var zone3Top = G.zoneYBoundary(0.75);

        // === ZONE 0: OPEN WATERS (tutorial pacing) ===
        // Zone 0 ends at SPAWN_Y - ~2912. Mines live entirely inside that window
        // so the tutorial section is the one teaching the mine mechanic.
        // Sparse intro — the tutorial's mine warning appears at ~600px.
        placeMine(G.SPAWN_Y - 1100, 60);
        placeMine(G.SPAWN_Y - 1300, 60);
        placeMine(G.SPAWN_Y - 1500, 60);
        placeMine(G.SPAWN_Y - 1700, 80);
        placeMine(G.SPAWN_Y - 1900, 80);
        // Density rises as the player gets comfortable.
        placeMine(G.SPAWN_Y - 2050, 60);
        placeMine(G.SPAWN_Y - 2200, 60);
        placeMine(G.SPAWN_Y - 2350, 60);
        placeMine(G.SPAWN_Y - 2500, 60);
        // Tight pack at the end of Open Waters.
        placeMine(G.SPAWN_Y - 2600, 50);
        placeMine(G.SPAWN_Y - 2680, 50);
        placeMine(G.SPAWN_Y - 2760, 50);
        placeMine(G.SPAWN_Y - 2830, 50);
        placeMine(G.SPAWN_Y - 2890, 40);
        // Shark + sub intros happen at the very tail of Open Waters / start of Narrows.
        placeShark(G.SPAWN_Y - 3000, 200);
        // === ZONE 1 LEAD-IN: remaining mines spill into early Narrows. ===
        placeMine(G.SPAWN_Y - 3100, 60);
        placeMine(G.SPAWN_Y - 3300, 80);
        placeMine(G.SPAWN_Y - 3500, 80);
        placeMine(G.SPAWN_Y - 3700, 80);
        placeMine(G.SPAWN_Y - 3900, 80);
        placeMine(G.SPAWN_Y - 4100, 80);
        placeEnemySub(G.SPAWN_Y - 4200, 100);
        placeMine(G.SPAWN_Y - 4350, 80);
        placeMine(G.SPAWN_Y - 4550, 80);
        placeMine(G.SPAWN_Y - 4750, 80);
        placeMine(G.SPAWN_Y - 4950, 80);
        placeMine(G.SPAWN_Y - 5150, 80);
        placeMine(G.SPAWN_Y - 5350, 80);
        if (rand() < 0.5) {
            placeShark(zone1Top + 500, 300);
        }

        // === ZONE 2: THE NARROWS — gradual ramp ===
        var z2Span = zone1Top - zone2Top;
        var z2Slots = Math.floor(z2Span / SLOT_H);
        for (var s = 0; s < z2Slots; s++) {
            var slotY = zone1Top - s * SLOT_H - SLOT_H / 2;
            var slotProgress = s / z2Slots; // 0 = start of zone, 1 = end
            // Mines get denser as you go deeper
            if (slotProgress < 0.3) {
                // Early: sparse single mines
                if (rand() < 0.4) placeMine(slotY, SLOT_H * 0.7);
            } else if (slotProgress < 0.6) {
                // Middle: occasional clusters
                if (rand() < 0.5) placeMineCluster(slotY, 2);
                else if (rand() < 0.3) placeMine(slotY, SLOT_H * 0.6);
            } else {
                // Late: denser clusters
                placeMineCluster(slotY, 2 + Math.floor(rand() * 2));
            }
        }
        // Enemy sub in the back half only
        placeEnemySub(zone1Top - z2Span * 0.7, 300);
        // One shark mid-zone
        placeShark(zone1Top - z2Span * 0.4, 400);
        placeShark(zone1Top - z2Span * 0.75, 350);

        // === ZONE 3: DEVIL'S CORRIDOR — dense but ramping ===
        var z3Span = zone2Top - zone3Top;
        var z3Slots = Math.floor(z3Span / SLOT_H);
        for (var s = 0; s < z3Slots; s++) {
            var slotY = zone2Top - s * SLOT_H - SLOT_H / 2;
            var slotProgress = s / z3Slots;
            if (slotProgress < 0.25) {
                // Ease in from The Narrows density
                placeMineCluster(slotY, 2);
            } else {
                // Full density
                placeMineCluster(slotY, 2 + Math.floor(rand() * 3));
                if (rand() < 0.3) placeMine(slotY + 100, 150);
            }
        }
        // Enemy subs spread through zone
        placeEnemySub(zone2Top - z3Span * 0.35, 200);
        placeEnemySub(zone2Top - z3Span * 0.7, 200);
        if (rand() < 0.5) {
            placeEnemySub(zone2Top - z3Span * 0.9, 180);
        }
        // Sharks scattered
        for (var s = 0; s < 3; s++) {
            placeShark(zone2Top - z3Span * (0.2 + s * 0.3), 300);
        }

        // === ZONE 4: FREEDOM — open water, fewer mines, aggressive subs ===
        var z4Span = zone3Top - G.DOCK_Y - 400;
        var z4Slots = Math.floor(z4Span / (SLOT_H * 1.5));
        for (var s = 0; s < z4Slots; s++) {
            var slotY = zone3Top - 200 - s * SLOT_H * 1.5;
            // Sparse mines — open water
            if (rand() < 0.25) {
                placeMine(slotY, SLOT_H);
            }
        }
        // Aggressive enemy subs — the real threat in Freedom
        placeEnemySub(zone3Top - z4Span * 0.2, 350);
        placeEnemySub(zone3Top - z4Span * 0.5, 350);
        placeEnemySub(zone3Top - z4Span * 0.8, 300);
        // Sharks in the open water
        for (var s = 0; s < 3 + (rand() < 0.5 ? 1 : 0); s++) {
            placeShark(zone3Top - z4Span * (0.1 + s * 0.25), 400);
        }
    }

    function buildMineSegs() {
        G.mineSegs = [];
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (!obj.alive || obj.type !== G.OBJ_TYPE.MINE) continue;
            var verts = G.shapes.transformVerts(obj.shape, obj.x, obj.y, obj.rot);
            var segs = G.shapes.toSegments(verts);
            for (var j = 0; j < segs.length; j++) {
                segs[j]._objIdx = i;
                G.mineSegs.push(segs[j]);
            }
        }
    }

    function rebuildDynamicSegs() {
        var dynamicSegs = [];
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (!obj.alive || obj.type === G.OBJ_TYPE.MINE) continue;
            var verts = G.shapes.transformVerts(obj.shape, obj.x, obj.y, obj.rot);
            var segs = G.shapes.toSegments(verts);
            for (var j = 0; j < segs.length; j++) {
                segs[j]._objIdx = i;
                dynamicSegs.push(segs[j]);
            }
        }
        G.objectSegs = G.mineSegs.concat(dynamicSegs);
    }

    function rebuildObjectSegs() {
        buildMineSegs();
        rebuildDynamicSegs();
    }

    function checkCollisions(player, spawnSafeTimer) {
        if (spawnSafeTimer > 0) return null;

        // Precise collision against the sub's drawn shape — roundedRect(60, 24, 10).
        // Transform each object's center into the sub's local frame and compare
        // its collision radius to the signed distance from the rounded rect.
        var HW = 30, HH = 12, R = 10;
        var cosR = Math.cos(player.rot);
        var sinR = Math.sin(player.rot);

        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (!obj.alive) continue;
            var objRadius = obj.collisionRadius ||
                (obj.type === G.OBJ_TYPE.MINE ? G.COLLISION_RADII.mine :
                 obj.type === G.OBJ_TYPE.SHARK ? G.COLLISION_RADII.shark :
                 G.COLLISION_RADII.enemySub);

            var dx = obj.x - player.x;
            var dy = obj.y - player.y;
            var lx = dx * cosR + dy * sinR;
            var ly = -dx * sinR + dy * cosR;

            if (G.shapes.sdRoundedRect(lx, ly, HW, HH, R) < objRadius) return obj;
        }
        return null;
    }

    // Prevent objects from overlapping each other. Mines are static and push
    // movers fully out of overlap; two movers share the push equally. Called
    // after all AI motion updates, before segments are rebuilt for rendering.
    function separateObjects() {
        var objs = G.objects;
        var MINE = G.OBJ_TYPE.MINE;
        for (var i = 0; i < objs.length - 1; i++) {
            var a = objs[i];
            if (!a.alive) continue;
            for (var j = i + 1; j < objs.length; j++) {
                var b = objs[j];
                if (!b.alive) continue;
                var aStatic = a.type === MINE;
                var bStatic = b.type === MINE;
                if (aStatic && bStatic) continue;

                var dx = a.x - b.x;
                var dy = a.y - b.y;
                var minDist = a.collisionRadius + b.collisionRadius;
                var distSq = dx * dx + dy * dy;
                if (distSq > minDist * minDist) continue;

                var dist = Math.sqrt(distSq);
                var nx, ny;
                if (dist < 0.01) {
                    // Exactly coincident — pick an arbitrary axis to split
                    nx = 1; ny = 0; dist = 0;
                } else {
                    nx = dx / dist;
                    ny = dy / dist;
                }
                var overlap = minDist - dist;

                if (aStatic) {
                    b.x -= nx * overlap;
                    b.y -= ny * overlap;
                    if (b.wanderAngle !== undefined) {
                        b.wanderAngle = Math.atan2(-ny, -nx);
                    }
                } else if (bStatic) {
                    a.x += nx * overlap;
                    a.y += ny * overlap;
                    if (a.wanderAngle !== undefined) {
                        a.wanderAngle = Math.atan2(ny, nx);
                    }
                } else {
                    var half = overlap * 0.5;
                    a.x += nx * half;
                    a.y += ny * half;
                    b.x -= nx * half;
                    b.y -= ny * half;
                    if (a.wanderAngle !== undefined) a.wanderAngle = Math.atan2(ny, nx);
                    if (b.wanderAngle !== undefined) b.wanderAngle = Math.atan2(-ny, -nx);
                }
            }
        }
    }

    // Compute nearest threat distance for heartbeat audio
    function nearestThreatDist(player) {
        var best = Infinity;
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (!obj.alive) continue;
            var dx = player.x - obj.x, dy = player.y - obj.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < best) best = dist;
        }
        return best;
    }

    G.objs = {
        generateObjects: generateObjects,
        buildMineSegs: buildMineSegs,
        rebuildDynamicSegs: rebuildDynamicSegs,
        rebuildObjectSegs: rebuildObjectSegs,
        checkCollisions: checkCollisions,
        separateObjects: separateObjects,
        nearestThreatDist: nearestThreatDist,
    };
})();

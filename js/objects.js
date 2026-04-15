// objects.js -- generateObjects(), object types, collision detection

(function () {
    var G = window.G;

    G.objects = [];
    G.objectSegs = [];

    function generateObjects() {
        G.objects = [];
        var SLOT_H = 300;

        var seed = 137;
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

        // === ZONE 1: OPEN WATERS ===
        var tutMineY = G.SPAWN_Y - 2500;
        placeMine(tutMineY, 60);

        var tutEsubY = G.SPAWN_Y - 3500;
        placeEnemySub(tutEsubY, 80);

        var tutClusterY = G.SPAWN_Y - 4500;
        placeMineCluster(tutClusterY, 3);

        placeShark(G.SPAWN_Y - 3000, 300);
        if (rand() < 0.5) {
            placeShark(zone1Top + 500, 300);
        }

        // === ZONE 2: THE NARROWS ===
        var z2Span = zone1Top - zone2Top;
        var z2Slots = Math.floor(z2Span / SLOT_H);
        for (var s = 0; s < z2Slots; s++) {
            var slotY = zone1Top - s * SLOT_H - SLOT_H / 2;
            if (s % 2 === 0) {
                placeMineCluster(slotY, 2 + Math.floor(rand() * 2));
            } else {
                if (rand() < 0.5) placeMine(slotY, SLOT_H * 0.6);
            }
        }
        placeEnemySub(zone1Top - z2Span * 0.25, 300);
        placeEnemySub(zone1Top - z2Span * 0.65, 300);
        if (rand() < 0.5) {
            placeEnemySub(zone1Top - z2Span * 0.45, 200);
        }
        placeShark(zone1Top - z2Span * 0.3, 400);
        placeShark(zone1Top - z2Span * 0.7, 400);

        // === ZONE 3: DEVIL'S CORRIDOR ===
        var z3Span = zone2Top - zone3Top;
        var z3Slots = Math.floor(z3Span / SLOT_H);
        for (var s = 0; s < z3Slots; s++) {
            var slotY = zone2Top - s * SLOT_H - SLOT_H / 2;
            placeMineCluster(slotY, 2 + Math.floor(rand() * 3));
            if (rand() < 0.4) {
                placeMine(slotY + 100, 150);
            }
        }
        placeEnemySub(zone2Top - z3Span * 0.15, 200);
        placeEnemySub(zone2Top - z3Span * 0.4, 200);
        placeEnemySub(zone2Top - z3Span * 0.65, 200);
        if (rand() < 0.6) {
            placeEnemySub(zone2Top - z3Span * 0.85, 200);
        }
        for (var s = 0; s < 3 + (rand() < 0.5 ? 1 : 0); s++) {
            placeShark(zone2Top - z3Span * (0.15 + s * 0.25), 300);
        }

        // === ZONE 4: FREEDOM ===
        var z4Span = zone3Top - G.DOCK_Y - 400;
        var z4Slots = Math.floor(z4Span / (SLOT_H * 1.5));
        for (var s = 0; s < z4Slots; s++) {
            var slotY = zone3Top - 200 - s * SLOT_H * 1.5;
            if (rand() < 0.35) {
                placeMine(slotY, SLOT_H);
            }
        }
        placeEnemySub(zone3Top - z4Span * 0.2, 300);
        placeEnemySub(zone3Top - z4Span * 0.5, 300);
        placeEnemySub(zone3Top - z4Span * 0.8, 300);
        for (var s = 0; s < 4 + (rand() < 0.5 ? 1 : 0); s++) {
            placeShark(zone3Top - z4Span * (0.1 + s * 0.2), 400);
        }
    }

    function rebuildObjectSegs() {
        G.objectSegs = [];
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (!obj.alive) continue;
            var verts = G.shapes.transformVerts(obj.shape, obj.x, obj.y, obj.rot);
            var segs = G.shapes.toSegments(verts);
            for (var j = 0; j < segs.length; j++) {
                G.objectSegs.push(segs[j]);
            }
        }
    }

    function checkCollisions(player, spawnSafeTimer) {
        if (spawnSafeTimer > 0) return null;
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (!obj.alive) continue;
            var dx = player.x - obj.x, dy = player.y - obj.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var minDist = G.COLLISION_RADII.player +
                (obj.type === G.OBJ_TYPE.MINE ? G.COLLISION_RADII.mine :
                 obj.type === G.OBJ_TYPE.SHARK ? G.COLLISION_RADII.shark :
                 G.COLLISION_RADII.enemySub);
            if (dist < minDist) return obj;
        }
        return null;
    }

    function checkCloseCalls(now, player, lastCloseCallTime) {
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (!obj.alive) continue;
            var dx = player.x - obj.x, dy = player.y - obj.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var minDist = G.COLLISION_RADII.player +
                (obj.type === G.OBJ_TYPE.MINE ? G.COLLISION_RADII.mine :
                 obj.type === G.OBJ_TYPE.SHARK ? G.COLLISION_RADII.shark :
                 G.COLLISION_RADII.enemySub);
            var closeCallDist = minDist * G.CLOSE_CALL_MULT;
            if (dist > minDist && dist < closeCallDist) {
                return true;
            }
        }
        return false;
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
        rebuildObjectSegs: rebuildObjectSegs,
        checkCollisions: checkCollisions,
        checkCloseCalls: checkCloseCalls,
        nearestThreatDist: nearestThreatDist,
    };
})();

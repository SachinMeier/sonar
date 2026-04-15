// canyon.js -- generateCanyon(), wall interpolation, rock formations, collectNearbySegs

(function () {
    var G = window.G;

    G.leftWall = [];
    G.rightWall = [];
    G.wallSegs = [];
    G.dockSegs = [];
    G.rockFormations = [];

    function generateCanyon() {
        G.leftWall = [];
        G.rightWall = [];
        var leftWall = G.leftWall;
        var rightWall = G.rightWall;
        var STEP_Y = 60;
        var steps = Math.ceil(G.WORLD_H / STEP_Y);

        var seed = 42;
        function rand() {
            seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
            return seed / 0x7fffffff;
        }

        var zone1Top = G.zoneYBoundary(0.25);
        var zone2Top = G.zoneYBoundary(0.50);
        var zone3Top = G.zoneYBoundary(0.75);

        var alcoveCountdown = 0;
        var alcoveSide = 0;
        var alcoveStrength = 0;

        var chokeCountdown = 0;
        var inChoke = false;
        var chokeLength = 0;

        var FREEDOM_MAX_W = Math.min(G.CANYON_MAX_W * 2.5, G.WORLD_W - 80);

        var centerX = G.WORLD_W / 2;
        var width = G.CANYON_MAX_W;

        for (var i = 0; i <= steps; i++) {
            var y = G.WORLD_H - i * STEP_Y;
            var zone = G.getZoneIndex(y);

            if (i < 6) {
                centerX = G.WORLD_W / 2;
                width = G.CANYON_MAX_W;
                leftWall.push([centerX - width / 2, y]);
                rightWall.push([centerX + width / 2, y]);
                continue;
            }

            if (i > steps - 4) {
                centerX += (G.WORLD_W / 2 - centerX) * 0.4;
                width += (FREEDOM_MAX_W * 0.6 - width) * 0.4;
                leftWall.push([centerX - width / 2, y]);
                rightWall.push([centerX + width / 2, y]);
                continue;
            }

            if (zone === 0) {
                var distFromSpawn = G.SPAWN_Y - y;
                if (distFromSpawn < 1000) {
                    centerX = G.WORLD_W / 2;
                    var tutorialWidth = G.WORLD_W - 40;
                    width += (tutorialWidth - width) * 0.3;
                } else if (distFromSpawn < 2000) {
                    var narrowFrac = (distFromSpawn - 1000) / 1000;
                    centerX += (rand() - 0.5) * 10;
                    centerX += (G.WORLD_W / 2 - centerX) * 0.08;
                    var targetWidth = (G.WORLD_W - 40) * (1 - narrowFrac) + G.CANYON_MAX_W * narrowFrac;
                    width += (targetWidth - width) * 0.1;
                } else {
                    centerX += (rand() - 0.5) * 20;
                    centerX += (G.WORLD_W / 2 - centerX) * 0.05;
                    var targetWidth = G.CANYON_MAX_W * 0.95;
                    width += (targetWidth - width) * 0.08;
                    width += (rand() - 0.5) * 15;
                }
                width = Math.max(G.CANYON_MAX_W * 0.8, Math.min(G.WORLD_W - 40, width));

            } else if (zone === 1) {
                var curvePhase = y / 600;
                var curveDrift = Math.sin(curvePhase) * 45;
                centerX += (rand() - 0.5) * 30 + curveDrift * 0.08;

                var narrowProgress = (y - zone2Top) / (zone1Top - zone2Top);
                var targetWidth = G.CANYON_MAX_W * 0.7 - narrowProgress * (G.CANYON_MAX_W * 0.7 - G.CANYON_MIN_W * 1.3) * 0.5;
                width += (targetWidth - width) * 0.12;
                width += (rand() - 0.5) * 25;
                width = Math.max(G.CANYON_MIN_W * 1.1, Math.min(G.CANYON_MAX_W * 0.75, width));

                if (alcoveCountdown > 0) {
                    alcoveCountdown--;
                } else if (rand() < 0.06) {
                    alcoveCountdown = 2 + Math.floor(rand() * 2);
                    alcoveSide = rand() < 0.5 ? -1 : 1;
                    alcoveStrength = 60 + rand() * 40;
                }

            } else if (zone === 2) {
                var curvePhase1 = y / 400;
                var curvePhase2 = y / 250;
                var curveDrift = Math.sin(curvePhase1) * 55 + Math.sin(curvePhase2) * 25;
                centerX += (rand() - 0.5) * 40 + curveDrift * 0.1;

                var targetWidth = G.CANYON_MIN_W * 1.4 + (rand() - 0.5) * 30;

                if (chokeCountdown > 0) {
                    chokeCountdown--;
                    if (!inChoke && chokeCountdown <= 0 && rand() < 0.5) {
                        inChoke = true;
                        chokeLength = 3 + Math.floor(rand() * 2);
                    }
                } else if (inChoke) {
                    chokeLength--;
                    targetWidth = G.CANYON_MIN_W * 1.05 + rand() * 15;
                    if (chokeLength <= 0) {
                        inChoke = false;
                        chokeCountdown = 8 + Math.floor(rand() * 6);
                    }
                } else if (rand() < 0.12) {
                    inChoke = true;
                    chokeLength = 3 + Math.floor(rand() * 2);
                } else {
                    chokeCountdown = 0;
                }

                width += (targetWidth - width) * 0.15;
                width += (rand() - 0.5) * 20;
                width = Math.max(G.CANYON_MIN_W, Math.min(G.CANYON_MAX_W * 0.6, width));

            } else {
                var freedomProgress = (zone3Top - y) / (zone3Top - G.DOCK_Y);
                var clampedProgress = Math.max(0, Math.min(1, freedomProgress));
                // Ease-out curve: fast initial widening, gradual settling
                var easedProgress = 1 - Math.pow(1 - clampedProgress, 2);
                var targetWidth = G.CANYON_MIN_W * 1.3 + easedProgress * (FREEDOM_MAX_W - G.CANYON_MIN_W * 1.3);
                // Faster interpolation for a dramatic opening feel
                width += (targetWidth - width) * 0.15;
                width += (rand() - 0.5) * 20;
                width = Math.max(G.CANYON_MIN_W * 1.2, Math.min(FREEDOM_MAX_W, width));

                centerX += (rand() - 0.5) * 25;
                centerX += (G.WORLD_W / 2 - centerX) * 0.06;
            }

            var maxHalfW = Math.min(width / 2, FREEDOM_MAX_W / 2);
            centerX = Math.max(maxHalfW + 30, Math.min(G.WORLD_W - maxHalfW - 30, centerX));

            var halfW = width / 2;
            var jagL = (rand() - 0.5) * (zone === 0 ? 10 : zone === 2 ? 35 : 20);
            var jagR = (rand() - 0.5) * (zone === 0 ? 10 : zone === 2 ? 35 : 20);

            if (zone === 1 && alcoveCountdown > 0) {
                if (alcoveSide < 0) {
                    jagL -= alcoveStrength;
                } else {
                    jagR += alcoveStrength;
                }
            }

            leftWall.push([centerX - halfW + jagL, y]);
            rightWall.push([centerX + halfW + jagR, y]);
        }

        G.wallSegs = [];
        for (var i = 0; i < leftWall.length - 1; i++) {
            G.wallSegs.push([leftWall[i], leftWall[i + 1]]);
        }
        for (var i = 0; i < rightWall.length - 1; i++) {
            G.wallSegs.push([rightWall[i], rightWall[i + 1]]);
        }
        G.wallSegs.push([leftWall[0], rightWall[0]]);
        G.wallSegs.push([leftWall[leftWall.length - 1], rightWall[rightWall.length - 1]]);

        G.dockSegs = [
            [[G.DOCK_CX - G.DOCK_W / 2, G.DOCK_CY - G.DOCK_H / 2], [G.DOCK_CX + G.DOCK_W / 2, G.DOCK_CY - G.DOCK_H / 2]],
            [[G.DOCK_CX - G.DOCK_W / 2, G.DOCK_CY - G.DOCK_H / 2], [G.DOCK_CX - G.DOCK_W / 2, G.DOCK_CY + G.DOCK_H / 2]],
            [[G.DOCK_CX + G.DOCK_W / 2, G.DOCK_CY - G.DOCK_H / 2], [G.DOCK_CX + G.DOCK_W / 2, G.DOCK_CY + G.DOCK_H / 2]],
        ];
        G.wallSegs.push.apply(G.wallSegs, G.dockSegs);

        // Rock formations in the FREEDOM zone
        G.rockFormations = [];
        var freedomTop = G.DOCK_Y + 400;
        var freedomBottom = zone3Top - 200;
        // BUG FIX: guard against freedomBottom <= freedomTop
        if (freedomBottom <= freedomTop) {
            return;
        }
        var freedomSpan = freedomBottom - freedomTop;
        var numRocks = 8;
        for (var r = 0; r < numRocks; r++) {
            var ry = freedomTop + (r + 0.5) * (freedomSpan / numRocks) + (rand() - 0.5) * (freedomSpan / numRocks * 0.35);
            // BUG FIX: clamp ry to valid wall range before interpolation
            ry = Math.max(G.DOCK_Y + 10, Math.min(G.SPAWN_Y - 10, ry));
            var lx = interpolateWallX(leftWall, ry) + 80;
            var rx = interpolateWallX(rightWall, ry) - 80;
            if (rx - lx < 120) continue;
            var positions = [0.2, 0.5, 0.8];
            var side = positions[r % 3] + (rand() - 0.5) * 0.12;
            var rockX = lx + (rx - lx) * side;
            var rockY = ry;
            var numVerts = 5 + Math.floor(rand() * 5);
            var sizeClass = r % 3;
            var baseRadius = sizeClass === 0 ? (15 + rand() * 15) :
                             sizeClass === 1 ? (30 + rand() * 25) :
                             (22 + rand() * 20);
            var verts = [];
            for (var v = 0; v < numVerts; v++) {
                var a = (v / numVerts) * Math.PI * 2;
                var vr = baseRadius * (0.55 + rand() * 0.45);
                verts.push([rockX + Math.cos(a) * vr, rockY + Math.sin(a) * vr]);
            }
            G.rockFormations.push(verts);
            var segs = G.shapes.toSegments(verts);
            G.wallSegs.push.apply(G.wallSegs, segs);
        }
    }

    function interpolateWallX(wall, y) {
        // BUG FIX: guard against empty wall array
        if (wall.length < 2) return G.WORLD_W / 2;
        for (var i = 0; i < wall.length - 1; i++) {
            var y0 = wall[i][1], y1 = wall[i + 1][1];
            if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) {
                var span = y0 - y1;
                if (Math.abs(span) < 0.01) return wall[i][0];
                var t = (y - y1) / span;
                return wall[i + 1][0] + t * (wall[i][0] - wall[i + 1][0]);
            }
        }
        // BUG FIX: if y is outside wall range, clamp to nearest endpoint
        // instead of always returning center (which could cause snapping)
        if (wall.length > 0) {
            var firstY = wall[0][1];
            var lastY = wall[wall.length - 1][1];
            if (Math.abs(y - firstY) < Math.abs(y - lastY)) {
                return wall[0][0];
            }
            return wall[wall.length - 1][0];
        }
        return G.WORLD_W / 2;
    }

    function isInsideCanyon(x, y) {
        var leftX = interpolateWallX(G.leftWall, y);
        var rightX = interpolateWallX(G.rightWall, y);
        return x > leftX + 15 && x < rightX - 15;
    }

    function collectNearbySegs(segs, px, py, range) {
        var nearby = [];
        var r2 = range * range;
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var dx1 = seg[0][0] - px, dy1 = seg[0][1] - py;
            var dx2 = seg[1][0] - px, dy2 = seg[1][1] - py;
            if (dx1 * dx1 + dy1 * dy1 < r2 || dx2 * dx2 + dy2 * dy2 < r2) {
                nearby.push(seg);
            }
        }
        return nearby;
    }

    G.canyon = {
        generateCanyon: generateCanyon,
        interpolateWallX: interpolateWallX,
        isInsideCanyon: isInsideCanyon,
        collectNearbySegs: collectNearbySegs,
    };
})();

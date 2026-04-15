// renderer.js -- drawPoly, camera, background, HUD, title/death/win screens, CRT, particles, wake, threats

(function () {
    var G = window.G;

    // --- Camera ---
    G.camera = { x: 0, y: 0 };
    G.smoothCam = { x: G.SPAWN_X, y: G.SPAWN_Y };

    function worldToScreen(wx, wy) {
        return [wx - G.camera.x, wy - G.camera.y];
    }

    function drawPoly(ctx, pts, fill, stroke, lw) {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
    }

    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    // --- CRT Scanlines ---
    var scanlinePattern = null;

    function buildScanlinePattern(ctx) {
        var pCanvas = document.createElement('canvas');
        pCanvas.width = 1;
        pCanvas.height = 4;
        var pCtx = pCanvas.getContext('2d');
        pCtx.fillStyle = 'rgba(0,0,0,0)';
        pCtx.fillRect(0, 0, 1, 4);
        pCtx.fillStyle = 'rgba(0,0,0,0.04)';
        pCtx.fillRect(0, 0, 1, 1);
        scanlinePattern = ctx.createPattern(pCanvas, 'repeat');
    }

    function drawScanlines(ctx, canvasW, canvasH) {
        if (!scanlinePattern) buildScanlinePattern(ctx);
        ctx.fillStyle = scanlinePattern;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    function drawVignette(ctx, canvasW, canvasH) {
        var cx = canvasW / 2, cy = canvasH / 2;
        var r = Math.max(cx, cy) * 1.15;
        var grad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // --- Water Particles ---
    G.particles = [];
    for (var i = 0; i < 80; i++) {
        G.particles.push({
            x: Math.random() * 4000 - 1000,
            y: Math.random() * 4000 - 1000,
            size: 1 + Math.random(),
            alpha: 0.03 + Math.random() * 0.04,
        });
    }

    function drawParticles(ctx, camera, canvasW, canvasH) {
        for (var i = 0; i < G.particles.length; i++) {
            var p = G.particles[i];
            var sx = ((p.x - camera.x * 0.3) % canvasW + canvasW) % canvasW;
            var sy = ((p.y - camera.y * 0.3) % canvasH + canvasH) % canvasH;
            ctx.fillStyle = 'rgba(60,100,140,' + p.alpha + ')';
            ctx.fillRect(sx, sy, p.size, p.size);
        }
    }

    // --- Sub Wake Trail ---
    G.wake = [];
    G.lastWakeTime = 0;

    function updateWake(now, player, speed) {
        if (Math.abs(speed) > 10 && now - G.lastWakeTime > 0.04) {
            var rearX = player.x - Math.cos(player.rot) * 30;
            var rearY = player.y - Math.sin(player.rot) * 30;
            G.wake.push({ x: rearX, y: rearY, t: now });
            G.lastWakeTime = now;
            if (G.wake.length > 60) G.wake.shift();
        }
        while (G.wake.length > 0 && now - G.wake[0].t > 1.5) G.wake.shift();
    }

    function drawWake(ctx, now, camera) {
        if (G.wake.length === 0) return;
        for (var i = 0; i < G.wake.length; i++) {
            var w = G.wake[i];
            var age = now - w.t;
            var alpha = 0.07 * (1 - age / 1.5);
            if (alpha <= 0) continue;
            var sx = w.x - camera.x;
            var sy = w.y - camera.y;
            ctx.fillStyle = 'rgba(80,130,180,' + alpha + ')';
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5 + age * 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- Threat Direction Arrows ---
    function drawThreatIndicators(ctx, now, player, canvasW, canvasH) {
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (obj.type !== G.OBJ_TYPE.ENEMY_SUB || !obj.alive) continue;
            if (obj.aiState !== 'intercept' && obj.aiState !== 'listening') continue;
            if (!obj.alertTime) continue;

            var dx = obj.x - player.x, dy = obj.y - player.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            // Skip if enemy is on-screen (no need for edge arrow)
            if (Math.abs(dx) < canvasW / 2 - 50 && Math.abs(dy) < canvasH / 2 - 50) continue;
            var angle = Math.atan2(dy, dx);
            var marginX = canvasW / 2 - 35;
            var marginY = canvasH / 2 - 35;
            var edgeX = canvasW / 2 + Math.cos(angle) * marginX;
            var edgeY = canvasH / 2 + Math.sin(angle) * marginY;

            // Fade in on alert, stay visible while intercepting, fade when listening winds down
            var timeSinceAlert = now - obj.alertTime;
            var fadeAlpha;
            if (timeSinceAlert < 0.3) {
                fadeAlpha = timeSinceAlert / 0.3;
            } else if (obj.aiState === 'intercept') {
                fadeAlpha = 1;
            } else if (obj.aiState === 'listening') {
                fadeAlpha = Math.max(0, obj.listenTimer / 3);
            } else {
                fadeAlpha = 0;
            }
            var pulse = 0.5 + 0.5 * Math.sin(now * 8);
            var alpha = fadeAlpha * 0.7 * pulse;

            ctx.save();
            ctx.translate(edgeX, edgeY);
            ctx.rotate(angle);
            ctx.fillStyle = 'rgba(255,180,0,' + Math.max(0, alpha) + ')';
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-6, -7);
            ctx.lineTo(-3, 0);
            ctx.lineTo(-6, 7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // --- Blast Effects ---
    G.blastEffects = [];

    function drawBlastEffects(ctx, now, camera) {
        for (var i = G.blastEffects.length - 1; i >= 0; i--) {
            var b = G.blastEffects[i];
            var age = now - b.t;
            if (age > b.duration) {
                G.blastEffects.splice(i, 1);
                continue;
            }
            var progress = age / b.duration;
            var radius = G.DC_BLAST_RADIUS * (0.3 + progress * 0.7);
            var alpha = 0.6 * (1 - progress);
            var sx = b.x - camera.x;
            var sy = b.y - camera.y;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,60,20,' + (alpha * 0.3) + ')';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,80,30,' + alpha + ')';
            ctx.stroke();
            if (progress < 0.4) {
                var coreAlpha = 0.8 * (1 - progress / 0.4);
                ctx.beginPath();
                ctx.arc(sx, sy, radius * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,200,100,' + coreAlpha + ')';
                ctx.fill();
            }
        }
    }

    // --- Active Depth Charges ---
    function drawActiveCharges(ctx, now, activeCharges, camera) {
        for (var i = 0; i < activeCharges.length; i++) {
            var dc = activeCharges[i];
            var sx = dc.x - camera.x;
            var sy = dc.y - camera.y;
            var blink = Math.sin(dc.fuse * 12) > 0;
            var r = 4;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = blink ? 'rgba(255,100,30,0.8)' : 'rgba(255,40,20,0.4)';
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,80,30,0.6)';
            ctx.stroke();
        }
    }

    // --- Zone Notification ---
    function drawZoneNotification(ctx, canvasW, canvasH, currentZone, zoneNotifyTimer) {
        if (zoneNotifyTimer <= 0) return;
        var alpha;
        if (zoneNotifyTimer > 2.5) alpha = (3.0 - zoneNotifyTimer) * 2;
        else if (zoneNotifyTimer < 0.5) alpha = zoneNotifyTimer * 2;
        else alpha = 1;

        // POLISH: FREEDOM zone name in green, slightly larger
        var isFreedom = currentZone === 'FREEDOM';
        if (isFreedom) {
            ctx.fillStyle = 'rgba(0,255,100,' + (alpha * 0.7) + ')';
            ctx.font = 'bold 34px monospace';
        } else {
            ctx.fillStyle = 'rgba(255,60,40,' + (alpha * 0.6) + ')';
            ctx.font = 'bold 28px monospace';
        }
        ctx.textAlign = 'center';
        ctx.fillText(currentZone, canvasW / 2, canvasH / 2 - 140);
    }

    // --- Minimap ---
    // BUG FIX: minimap y-axis was inverted. The dock (low y in world) should be at
    // the TOP of the minimap, and spawn (high y) at the bottom.
    G.visitedMinY = G.SPAWN_Y;
    G.visitedMaxY = G.SPAWN_Y;

    function drawMinimap(ctx, player, canvasW, canvasH) {
        G.visitedMinY = Math.min(G.visitedMinY, player.y);
        G.visitedMaxY = Math.max(G.visitedMaxY, player.y);

        var mmW = 30, mmH = 160;
        var mmX = canvasW - mmW - 15;
        var mmY = canvasH - mmH - 40;

        // Dark background for readability
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(mmX - 1, mmY - 1, mmW + 2, mmH + 2);

        ctx.strokeStyle = 'rgba(255,60,40,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX, mmY, mmW, mmH);

        function yToMM(worldY) {
            return mmY + (worldY / G.WORLD_H) * mmH;
        }
        function xToMM(worldX) {
            return mmX + (worldX / G.WORLD_W) * mmW;
        }

        // Draw canyon walls (sampled every few points for performance)
        ctx.strokeStyle = 'rgba(255,60,40,0.2)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        var step = Math.max(1, Math.floor(G.leftWall.length / 40));
        for (var i = 0; i < G.leftWall.length; i += step) {
            var lp = G.leftWall[i];
            var mx = xToMM(lp[0]);
            var my = yToMM(lp[1]);
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
        }
        ctx.stroke();
        ctx.beginPath();
        for (var i = 0; i < G.rightWall.length; i += step) {
            var rp = G.rightWall[i];
            var mx = xToMM(rp[0]);
            var my = yToMM(rp[1]);
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
        }
        ctx.stroke();

        // Visited fog region
        var fogTop = yToMM(G.visitedMinY);
        var fogBot = yToMM(G.visitedMaxY);
        ctx.fillStyle = 'rgba(255,40,30,0.06)';
        ctx.fillRect(mmX, fogTop, mmW, fogBot - fogTop);

        // Player dot
        var playerMmX = xToMM(player.x);
        var playerMmY = yToMM(player.y);
        ctx.fillStyle = '#ff3030';
        ctx.beginPath();
        ctx.arc(playerMmX, playerMmY, 2, 0, Math.PI * 2);
        ctx.fill();

        // Dock indicator (at top of minimap)
        var dockMmY = yToMM(G.DOCK_Y);
        ctx.fillStyle = '#00ff66';
        ctx.fillRect(mmX, dockMmY, mmW, 2);
    }

    // --- Close-Call Flash ---
    function drawCloseCallFlash(ctx, closeCallTimer, canvasW, canvasH) {
        if (closeCallTimer <= 0) return;
        var alpha = closeCallTimer / 0.6;
        // Brief screen-edge warning flash
        if (alpha > 0.5) {
            var edgeAlpha = (alpha - 0.5) * 0.15;
            ctx.strokeStyle = 'rgba(255,200,0,' + edgeAlpha + ')';
            ctx.lineWidth = 3;
            ctx.strokeRect(2, 2, canvasW - 4, canvasH - 4);
        }
        var pulse = 0.7 + 0.3 * Math.sin(closeCallTimer * 25);
        ctx.fillStyle = 'rgba(255,220,0,' + (alpha * 0.5 * pulse) + ')';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', canvasW / 2, canvasH / 2 + 80);
    }

    // --- Title Screen ---
    var titleSweepAngle = 0;

    function drawTitleScreen(ctx, now, stateTimer, canvasW, canvasH, bestScore) {
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 52px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SONAR', canvasW / 2, canvasH / 2 - 100);

        ctx.fillStyle = 'rgba(255, 60, 40, 0.6)';
        ctx.font = '18px monospace';
        ctx.fillText('NAVIGATE THE CANYON. REACH THE PORT.', canvasW / 2, canvasH / 2 - 60);

        ctx.fillStyle = 'rgba(255, 60, 40, 0.35)';
        ctx.font = '13px monospace';
        var ctrlY = canvasH / 2 - 5;
        ctx.fillText('[ WASD ] MOVE    [ SPACE ] SONAR PING', canvasW / 2, ctrlY);
        ctx.fillText('[ SHIFT ] SILENT RUNNING    [ E ] DEPTH CHARGE', canvasW / 2, ctrlY + 18);
        ctx.fillText('[ P / ESC ] PAUSE', canvasW / 2, ctrlY + 36);

        ctx.fillStyle = 'rgba(255, 80, 60, 0.6)';
        ctx.font = '20px monospace';
        ctx.fillText('PRESS ENTER TO BEGIN', canvasW / 2, canvasH / 2 + 65);

        if (bestScore > 0) {
            ctx.fillStyle = 'rgba(255,180,0,0.5)';
            ctx.font = '15px monospace';
            ctx.fillText('BEST SCORE: ' + bestScore + '  RANK: ' + getRank(bestScore), canvasW / 2, canvasH / 2 + 100);
        }

        drawTitleRadar(ctx, now, canvasW, canvasH);
        drawScanlines(ctx, canvasW, canvasH);
        drawVignette(ctx, canvasW, canvasH);
    }

    // Fixed radar blips — static positions, light up when sweep passes
    var radarBlips = [
        { a: 0.4,  r: 0.7  },
        { a: 1.1,  r: 0.45 },
        { a: 1.8,  r: 0.82 },
        { a: 2.5,  r: 0.35 },
        { a: 3.3,  r: 0.6  },
        { a: 4.0,  r: 0.9  },
        { a: 4.9,  r: 0.5  },
        { a: 5.6,  r: 0.72 },
    ];

    function drawTitleRadar(ctx, now, canvasW, canvasH) {
        titleSweepAngle = (now * 0.8) % (Math.PI * 2);
        var cx = canvasW / 2;
        var cy = canvasH / 2 + 160;
        var r = 80;

        // Grid
        ctx.strokeStyle = 'rgba(255,40,30,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
        ctx.stroke();

        // Sweep wedge
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, titleSweepAngle - 0.5, titleSweepAngle);
        ctx.closePath();
        var sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        sweepGrad.addColorStop(0, 'rgba(255,40,30,0.15)');
        sweepGrad.addColorStop(1, 'rgba(255,40,30,0.03)');
        ctx.fillStyle = sweepGrad;
        ctx.fill();
        ctx.restore();

        // Sweep line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(titleSweepAngle) * r, cy + Math.sin(titleSweepAngle) * r);
        ctx.strokeStyle = 'rgba(255,60,30,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Blips — fixed positions, lit by sweep
        var BLIP_FADE = 1.5; // seconds to fade after sweep passes
        var TWO_PI = Math.PI * 2;
        for (var i = 0; i < radarBlips.length; i++) {
            var b = radarBlips[i];
            // How long ago did the sweep pass this blip's angle?
            var angleDiff = ((titleSweepAngle - b.a) % TWO_PI + TWO_PI) % TWO_PI;
            var timeSinceSweep = angleDiff / (0.8 * TWO_PI) * (TWO_PI / 0.8);
            // Convert angle difference to time: sweep speed is 0.8 rad/s
            timeSinceSweep = angleDiff / 0.8;
            var alpha = timeSinceSweep < BLIP_FADE ? 0.6 * (1 - timeSinceSweep / BLIP_FADE) : 0;
            if (alpha > 0.01) {
                var bx = cx + Math.cos(b.a) * r * b.r;
                var by = cy + Math.sin(b.a) * r * b.r;
                ctx.fillStyle = 'rgba(255,40,30,' + alpha + ')';
                ctx.beginPath();
                ctx.arc(bx, by, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // --- Win Screen ---
    function drawWinScreen(ctx, stateTimer, canvasW, canvasH, lastScore, bestScore, winTime, startTime, pingCount, scoreTimeBonus, scorePingPenalty) {
        ctx.fillStyle = '#080c14';
        ctx.fillRect(0, 0, canvasW, canvasH);

        var headerPulse = 0.85 + 0.15 * Math.sin(stateTimer * 2);
        ctx.fillStyle = 'rgba(0, 255, 100, ' + headerPulse + ')';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WELCOME TO AMERICA', canvasW / 2, canvasH / 2 - 120);

        ctx.fillStyle = 'rgba(0, 200, 80, 0.4)';
        ctx.font = '14px monospace';
        ctx.fillText('MISSION COMPLETE', canvasW / 2, canvasH / 2 - 90);

        var elapsed = winTime - startTime;
        ctx.font = '16px monospace';
        ctx.fillStyle = '#33aa55';
        var statsY = canvasH / 2 - 50;

        ctx.fillText('TIME: ' + formatTime(elapsed), canvasW / 2, statsY);
        ctx.fillText('SONAR PINGS: ' + pingCount, canvasW / 2, statsY + 24);

        ctx.fillStyle = 'rgba(100,200,100,0.5)';
        ctx.font = '14px monospace';
        ctx.fillText('TIME BONUS: +' + scoreTimeBonus, canvasW / 2, statsY + 52);
        ctx.fillStyle = 'rgba(255,100,80,0.5)';
        ctx.fillText('PING PENALTY: -' + scorePingPenalty, canvasW / 2, statsY + 72);

        var rank = getRank(lastScore);
        var rankColor = getRankColor(rank);
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('SCORE: ' + lastScore, canvasW / 2, statsY + 108);

        ctx.fillStyle = rankColor;
        ctx.font = 'bold 36px monospace';
        ctx.fillText('RANK: ' + rank, canvasW / 2, statsY + 148);

        if (lastScore >= bestScore) {
            var glow = 0.6 + 0.4 * Math.sin(stateTimer * 6);
            ctx.fillStyle = 'rgba(255,220,0,' + glow + ')';
            ctx.font = 'bold 18px monospace';
            ctx.fillText('--- NEW HIGH SCORE ---', canvasW / 2, statsY + 178);
        } else {
            ctx.fillStyle = 'rgba(255,180,0,0.5)';
            ctx.font = '15px monospace';
            ctx.fillText('BEST: ' + bestScore, canvasW / 2, statsY + 178);
        }

        if (stateTimer > 1.5) {
            ctx.fillStyle = 'rgba(0, 255, 100, ' + (0.5 + 0.5 * Math.sin(stateTimer * 3)) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('PRESS ENTER TO CONTINUE', canvasW / 2, statsY + 220);
        }

        drawScanlines(ctx, canvasW, canvasH);
        drawVignette(ctx, canvasW, canvasH);
    }

    // --- Death Screen ---
    function drawDeathScreen(ctx, stateTimer, canvasW, canvasH, player, deathCause, deathObj, camera, elapsedTime, deathZone) {
        // Death-reveal of killer
        if (deathObj) {
            var kVerts = G.shapes.transformVerts(deathObj.shape, deathObj.x, deathObj.y, deathObj.rot);
            var kScreen = [];
            for (var i = 0; i < kVerts.length; i++) {
                kScreen.push(worldToScreen(kVerts[i][0], kVerts[i][1]));
            }
            var glowAlpha = 0.3 + 0.15 * Math.sin(stateTimer * 5);
            var klPos = worldToScreen(deathObj.x, deathObj.y);
            var killGlow = ctx.createRadialGradient(klPos[0], klPos[1], 0, klPos[0], klPos[1], 50);
            killGlow.addColorStop(0, 'rgba(255,0,0,' + glowAlpha + ')');
            killGlow.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = killGlow;
            ctx.beginPath();
            ctx.arc(klPos[0], klPos[1], 50, 0, Math.PI * 2);
            ctx.fill();
            drawPoly(ctx, kScreen, null, '#ff0000', 2.5);
            ctx.fillStyle = 'rgba(255,80,60,0.85)';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            var labels = ['MINE', 'SHARK', 'ENEMY SUB'];
            ctx.fillText(labels[deathObj.type] || '', klPos[0], klPos[1] - 25);
        }

        // Overlay
        if (stateTimer < 0.15) {
            ctx.fillStyle = 'rgba(255, 0, 0, ' + (0.5 * (1 - stateTimer / 0.15)) + ')';
            ctx.fillRect(0, 0, canvasW, canvasH);
        }

        // Top section: title + stats
        ctx.fillStyle = '#ff3030';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HULL BREACH', canvasW / 2, canvasH * 0.18);

        var totalDist = G.SPAWN_Y - G.DOCK_Y;
        var traveled = Math.max(0, totalDist - (player.y - G.DOCK_Y));
        var totalMiles = Math.round(totalDist / 100);
        var traveledMiles = Math.round(traveled / 100);
        ctx.fillStyle = 'rgba(255,80,60,0.6)';
        ctx.font = '18px monospace';
        ctx.fillText(traveledMiles + ' / ' + totalMiles + ' MILES', canvasW / 2, canvasH * 0.18 + 35);

        ctx.fillStyle = 'rgba(255,80,60,0.4)';
        ctx.font = '14px monospace';
        if (elapsedTime > 0) {
            ctx.fillText('TIME: ' + formatTime(elapsedTime) + (deathZone ? '  |  ' + deathZone : ''), canvasW / 2, canvasH * 0.18 + 58);
        }

        // Bottom section: tip + retry (below the killer object in the center)
        var tip = getDeathTip(deathCause);
        if (tip) {
            ctx.fillStyle = 'rgba(255,180,100,0.45)';
            ctx.font = '13px monospace';
            ctx.fillText(tip, canvasW / 2, canvasH * 0.75);
        }

        if (stateTimer > 1.0) {
            ctx.font = '20px monospace';
            ctx.fillStyle = 'rgba(255, 80, 60, ' + (0.5 + 0.5 * Math.sin(stateTimer * 4)) + ')';
            ctx.fillText('PRESS ENTER TO RETRY', canvasW / 2, canvasH * 0.82);
        }
    }

    // --- HUD ---
    function drawHUD(ctx, now, stateTimer, canvasW, canvasH, player, speed, silentRunning, pingCount, depthCharges, currentZone, tutorialPhase) {
        var distRemaining = Math.max(0, player.y - G.DOCK_Y);
        var progress = 1 - distRemaining / (G.SPAWN_Y - G.DOCK_Y);

        ctx.fillStyle = 'rgba(200, 40, 30, 0.5)';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(Math.round(distRemaining / 100) + ' MILES TO PORT', 20, 30);

        var barW = 200, barH = 3;
        ctx.fillStyle = 'rgba(100, 20, 15, 0.4)';
        ctx.fillRect(20, 42, barW, barH);
        ctx.fillStyle = 'rgba(255, 60, 40, 0.7)';
        ctx.fillRect(20, 42, barW * Math.max(0, Math.min(1, progress)), barH);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(200, 40, 30, 0.5)';
        ctx.fillText('PINGS: ' + pingCount, canvasW - 20, 30);

        var speedPct = Math.abs(speed) / G.MAX_SPEED;
        ctx.fillText('SPD: ' + Math.round(speedPct * 100) + '%', canvasW - 20, 50);

        ctx.fillStyle = depthCharges > 0 ? 'rgba(255,140,40,0.5)' : 'rgba(100,40,30,0.3)';
        ctx.fillText('CHARGES: ' + depthCharges, canvasW - 20, 70);

        if (silentRunning) {
            var silentPulse = 0.5 + 0.3 * Math.sin(now * 6);
            ctx.fillStyle = 'rgba(100,180,255,' + silentPulse + ')';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('SILENT', 20, 65);
        }

        var headingDeg = (((-player.rot * 180 / Math.PI) + 90) % 360 + 360) % 360;
        var cardinal = ['N','NE','E','SE','S','SW','W','NW'][Math.round(headingDeg / 45) % 8];
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(200, 40, 30, 0.5)';
        ctx.font = '14px monospace';
        ctx.fillText(cardinal + ' ' + Math.round(headingDeg) + '\u00B0', canvasW / 2, 30);

        ctx.fillText(currentZone, canvasW / 2, 50);

        if (stateTimer < 10 && tutorialPhase < 1) {
            var alpha = stateTimer < 8 ? 0.4 : 0.4 * (1 - (stateTimer - 8) / 2);
            ctx.fillStyle = 'rgba(200, 40, 30, ' + Math.max(0, alpha) + ')';
            ctx.font = '13px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('[ WASD ] MOVE   [ SPACE ] PING   [ SHIFT ] SILENT   [ E ] CHARGE   [ P ] PAUSE', canvasW / 2, canvasH - 25);
        }
    }

    // --- Scoring helpers ---
    function getRank(score) {
        if (score >= 1200) return 'S';
        if (score >= 1100) return 'A';
        if (score >= 950) return 'B';
        if (score >= 800) return 'C';
        return 'D';
    }

    function getRankColor(rank) {
        switch (rank) {
            case 'S': return '#ffd700';
            case 'A': return '#00ff66';
            case 'B': return '#33aaff';
            case 'C': return '#ff8844';
            default: return '#ff4444';
        }
    }

    function getDeathTip(cause) {
        switch (cause) {
            case 'mine': return 'USE SONAR TO DETECT MINES AHEAD';
            case 'shark': return 'SHARKS DRIFT RANDOMLY - KEEP YOUR DISTANCE';
            case 'submarine': return 'ENEMY SUBS LISTEN FOR YOUR ENGINES - USE SILENT RUNNING';
            default: return '';
        }
    }

    G.renderer = {
        worldToScreen: worldToScreen,
        drawPoly: drawPoly,
        formatTime: formatTime,
        drawScanlines: drawScanlines,
        drawVignette: drawVignette,
        drawParticles: drawParticles,
        updateWake: updateWake,
        drawWake: drawWake,
        drawThreatIndicators: drawThreatIndicators,
        drawBlastEffects: drawBlastEffects,
        drawActiveCharges: drawActiveCharges,
        drawZoneNotification: drawZoneNotification,
        drawMinimap: drawMinimap,
        drawCloseCallFlash: drawCloseCallFlash,
        drawTitleScreen: drawTitleScreen,
        drawWinScreen: drawWinScreen,
        drawDeathScreen: drawDeathScreen,
        drawHUD: drawHUD,
        getRank: getRank,
        computeScore: function (elapsed) {
            var scoreTimeBonus = Math.max(0, 300 - Math.floor(elapsed));
            var scorePingPenalty = G.pingCount * 5;
            return {
                total: Math.max(0, 1000 + scoreTimeBonus - scorePingPenalty),
                timeBonus: scoreTimeBonus,
                pingPenalty: scorePingPenalty,
            };
        },
    };
})();

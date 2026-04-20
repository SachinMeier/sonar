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
            var radius = G.TORPEDO_BLAST_RADIUS * (0.3 + progress * 0.7);
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

    // --- Active Torpedoes ---
    function drawActiveTorpedoes(ctx, now, activeTorpedoes, camera) {
        for (var i = 0; i < activeTorpedoes.length; i++) {
            var torp = activeTorpedoes[i];
            var sx = torp.x - camera.x;
            var sy = torp.y - camera.y;
            var rot = torp.rot;
            var cosR = Math.cos(rot);
            var sinR = Math.sin(rot);
            // Missile shape: narrow pointed body ~12px long, 4px wide
            // Diamond/chevron pointing in torp.rot direction
            var len = 6;   // half-length
            var wid = 2;   // half-width
            ctx.beginPath();
            ctx.moveTo(sx + cosR * len,          sy + sinR * len);           // nose
            ctx.lineTo(sx - sinR * wid - cosR * 2, sy + cosR * wid - sinR * 2); // left shoulder
            ctx.lineTo(sx - cosR * len,          sy - sinR * len);           // tail
            ctx.lineTo(sx + sinR * wid - cosR * 2, sy - cosR * wid - sinR * 2); // right shoulder
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,30,20,0.9)';
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,60,30,0.8)';
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

        // POLISH: FREEDOM zone name in blue, slightly larger
        var isFreedom = currentZone === 'FREEDOM';
        if (isFreedom) {
            ctx.fillStyle = 'rgba(100,180,255,' + (alpha * 0.7) + ')';
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

    // --- Title Screen ---
    var titleSweepAngle = 0;

    function drawTitleScreen(ctx, now, stateTimer, canvasW, canvasH) {
        // Radar first (behind everything)
        drawTitleRadar(ctx, now, canvasW, canvasH);

        // Text on top of radar
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 52px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SONAR', canvasW / 2, canvasH / 2 - 60);

        ctx.fillStyle = 'rgba(255, 60, 40, 0.6)';
        ctx.font = '18px monospace';
        ctx.fillText('NAVIGATE THE CANYON. REACH THE PORT.', canvasW / 2, canvasH / 2 - 20);

        ctx.fillStyle = 'rgba(255, 80, 60, 0.6)';
        ctx.font = '20px monospace';
        ctx.fillText('PRESS ENTER TO BEGIN', canvasW / 2, canvasH / 2 + 50);

        drawScanlines(ctx, canvasW, canvasH);
        drawVignette(ctx, canvasW, canvasH);
    }

    // Fixed radar blips — static positions, light up when sweep passes
    // Soviet anthem opening: Bb(8th) Eb(qtr) Bb(8th) C(8th) D(8th) G(qtr held)
    // Duration weights: 8th=1, quarter=2, held quarter=2.8. Total = 1+2+1+1+1+2.8 = 9.8
    // Scale to fill 2π: unit = 2π/9.8 ≈ 0.641 rad
    var _u = Math.PI * 2 / 9.8;
    var radarBlips = [
        { a: 0,                r: 0.50, beeped: false, freq: 233, dur: 0.45 },  // Bb3 (8th)
        { a: 1 * _u,           r: 0.75, beeped: false, freq: 311, dur: 0.85 },  // Eb4 (quarter)
        { a: 3 * _u,           r: 0.45, beeped: false, freq: 233, dur: 0.45 },  // Bb3 (8th)
        { a: 4 * _u,           r: 0.65, beeped: false, freq: 262, dur: 0.45 },  // C4  (8th)
        { a: 5 * _u,           r: 0.85, beeped: false, freq: 294, dur: 0.45 },  // D4  (8th)
        { a: 6 * _u,           r: 0.60, beeped: false, freq: 196, dur: 1.1  },  // G3  (quarter, held)
    ];
    var lastTitleSweepAngle = 0;

    function drawTitleRadar(ctx, now, canvasW, canvasH) {
        titleSweepAngle = (now * 0.8) % (Math.PI * 2);
        var cx = canvasW / 2;
        var cy = canvasH / 2;
        var r = 240;

        // Grid
        ctx.strokeStyle = 'rgba(255,40,30,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.33, 0, Math.PI * 2); ctx.stroke();
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

        // Blips — fixed positions, lit by sweep, beep on first contact
        var BLIP_FADE = 1.5;
        var TWO_PI = Math.PI * 2;
        for (var i = 0; i < radarBlips.length; i++) {
            var b = radarBlips[i];
            var angleDiff = ((titleSweepAngle - b.a) % TWO_PI + TWO_PI) % TWO_PI;
            var timeSinceSweep = angleDiff / 0.8;

            // Detect fresh sweep crossing: was behind, now ahead
            if (timeSinceSweep < 0.15 && !b.beeped) {
                b.beeped = true;
                if (b.freq > 0) G.audio.playTitleBlip(b.freq, b.dur || 0.3);
            }
            // Reset once sweep has moved well past
            if (timeSinceSweep > 1.0) {
                b.beeped = false;
            }

            var alpha = timeSinceSweep < BLIP_FADE ? 0.6 * (1 - timeSinceSweep / BLIP_FADE) : 0;
            if (alpha > 0.01) {
                var bx = cx + Math.cos(b.a) * r * b.r;
                var by = cy + Math.sin(b.a) * r * b.r;
                ctx.fillStyle = 'rgba(255,40,30,' + alpha + ')';
                ctx.beginPath();
                ctx.arc(bx, by, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // --- Win Screen ---
    // --- ASCII American flag (drawn in red to match the game's palette) ---
    // cx,cy = center of flag
    function drawAsciiFlag(ctx, cx, cy, alpha, t) {
        var cellW = 18;
        var cellH = 26;
        var fontSize = 24;
        var starRows = 4, starCols = 6;
        var stripeRows = 7, stripeCols = 18;
        var unionW = starCols * cellW;
        var unionH = starRows * cellH;
        var totalW = stripeCols * cellW;
        var totalH = stripeRows * cellH;

        ctx.font = 'bold ' + fontSize + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        var originX = cx - totalW / 2;
        var originY = cy - totalH / 2;

        // Traveling wave: amplitude grows toward the fly edge (right side),
        // pole side (left) barely moves. This is how a real flag flutters.
        function waveY(col, row) {
            var edgeFactor = col / stripeCols;              // 0 at pole, 1 at fly edge
            var amp = 1.5 + edgeFactor * edgeFactor * 18;   // quadratic growth up to ~19.5px
            return Math.sin(t * 2.2 - col * 0.45 + row * 0.08) * amp;
        }
        function waveX(col, row) {
            // Slight horizontal compression at wave crests for 3D feel
            var edgeFactor = col / stripeCols;
            var amp = edgeFactor * edgeFactor * 3;
            return Math.cos(t * 2.2 - col * 0.45) * amp;
        }

        // Stripes (7 rows, full width)
        for (var r = 0; r < stripeRows; r++) {
            var isRed = r % 2 === 0;
            var stripeColor = isRed
                ? 'rgba(255, 0, 0, ' + (alpha * 0.95) + ')'
                : 'rgba(255, 80, 60, ' + (alpha * 0.28) + ')';
            var glyph = isRed ? '=' : '-';
            ctx.fillStyle = stripeColor;
            for (var c = 0; c < stripeCols; c++) {
                var baseX = originX + c * cellW + waveX(c, r);
                var baseY = originY + r * cellH + waveY(c, r);
                ctx.fillText(glyph, baseX, baseY);
            }
        }

        // Union (stars) - drawn with the same wave so it flutters with the stripes
        // Draw the union backdrop as a polygon following the wave
        ctx.fillStyle = 'rgba(30, 0, 0, ' + (alpha * 0.95) + ')';
        ctx.beginPath();
        // Top edge
        for (var c = 0; c <= starCols; c++) {
            var x = originX + c * cellW + waveX(c, 0) - 2;
            var y = originY + waveY(c, 0) - 2;
            if (c === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        // Right edge down
        for (var r = 0; r <= starRows; r++) {
            var x = originX + starCols * cellW + waveX(starCols, r) + 2;
            var y = originY + r * cellH + waveY(starCols, r);
            ctx.lineTo(x, y);
        }
        // Bottom edge back to pole
        for (var c = starCols; c >= 0; c--) {
            var x = originX + c * cellW + waveX(c, starRows) - 2;
            var y = originY + starRows * cellH + waveY(c, starRows) + 2;
            ctx.lineTo(x, y);
        }
        // Left edge back up (pole side)
        ctx.closePath();
        ctx.fill();

        // Union border
        ctx.strokeStyle = 'rgba(255, 40, 20, ' + (alpha * 0.6) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Stars — each star follows the wave at its cell position
        ctx.fillStyle = 'rgba(255, 60, 40, ' + (alpha * 0.95) + ')';
        for (var r = 0; r < starRows; r++) {
            for (var c = 0; c < starCols; c++) {
                var sx = originX + c * cellW + waveX(c, r) + 2;
                var sy = originY + r * cellH + waveY(c, r);
                ctx.fillText('*', sx, sy);
            }
        }

        // Restore default text state
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'center';
    }

    function drawWinScreen(ctx, stateTimer, canvasW, canvasH, winTime, startTime, pingCount, chargesUsed, milesTraveled) {
        // Dark ocean background
        ctx.fillStyle = '#080c14';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Faint radial glow behind the modal
        var glowGrad = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 0, canvasW / 2, canvasH / 2, 400);
        glowGrad.addColorStop(0, 'rgba(255, 20, 20, 0.12)');
        glowGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // --- Modal panel ---
        var modalW = 620;
        var modalH = 570;
        var modalX = canvasW / 2 - modalW / 2;
        var modalY = canvasH / 2 - modalH / 2;

        // Panel backdrop (slightly darker than bg, red-tinted)
        ctx.fillStyle = 'rgba(15, 5, 8, 0.85)';
        ctx.fillRect(modalX, modalY, modalW, modalH);

        // Panel border with double stroke (glow + core)
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.25)';
        ctx.lineWidth = 6;
        ctx.strokeRect(modalX, modalY, modalW, modalH);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(modalX, modalY, modalW, modalH);

        // Corner brackets (80s terminal aesthetic)
        var bracketLen = 18;
        ctx.strokeStyle = 'rgba(255, 80, 60, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // TL
        ctx.moveTo(modalX - 6, modalY + bracketLen); ctx.lineTo(modalX - 6, modalY - 6); ctx.lineTo(modalX + bracketLen, modalY - 6);
        // TR
        ctx.moveTo(modalX + modalW - bracketLen, modalY - 6); ctx.lineTo(modalX + modalW + 6, modalY - 6); ctx.lineTo(modalX + modalW + 6, modalY + bracketLen);
        // BL
        ctx.moveTo(modalX - 6, modalY + modalH - bracketLen); ctx.lineTo(modalX - 6, modalY + modalH + 6); ctx.lineTo(modalX + bracketLen, modalY + modalH + 6);
        // BR
        ctx.moveTo(modalX + modalW - bracketLen, modalY + modalH + 6); ctx.lineTo(modalX + modalW + 6, modalY + modalH + 6); ctx.lineTo(modalX + modalW + 6, modalY + modalH - bracketLen);
        ctx.stroke();

        ctx.textAlign = 'center';

        // --- Flag (centered horizontally, positioned in upper portion of modal) ---
        // Flag total dimensions: 18*18 = 324w, 7*26 = 182h
        var flagCx = canvasW / 2;
        var flagCy = modalY + 40 + 91; // 40 top padding + half of flag height (182/2)
        drawAsciiFlag(ctx, flagCx, flagCy, 1.0, stateTimer);

        // --- Header (below flag) ---
        var headerY = modalY + 295;
        var headerPulse = 0.85 + 0.15 * Math.sin(stateTimer * 2);
        ctx.fillStyle = 'rgba(255, 30, 20, ' + headerPulse + ')';
        ctx.font = 'bold 36px monospace';
        ctx.fillText('WELCOME TO AMERICA', canvasW / 2, headerY);

        // --- Stats list ---
        var elapsed = winTime - startTime;
        var statsY = headerY + 55;
        var lineH = 28;
        var labelX = canvasW / 2 - 140;
        var valueX = canvasW / 2 + 140;

        ctx.font = '16px monospace';

        function drawStat(label, value, y) {
            ctx.fillStyle = 'rgba(255, 80, 60, 0.55)';
            ctx.textAlign = 'left';
            ctx.fillText(label, labelX, y);
            ctx.fillStyle = 'rgba(255, 50, 30, 0.95)';
            ctx.textAlign = 'right';
            ctx.fillText(value, valueX, y);
        }

        drawStat('TIME',            formatTime(elapsed),                 statsY);
        drawStat('DISTANCE',        (milesTraveled != null ? milesTraveled : '?') + ' MILES', statsY + lineH);
        drawStat('PINGS',            String(pingCount),                   statsY + lineH * 2);
        drawStat('TORPEDOES',       (chargesUsed != null ? chargesUsed : 0) + ' / ' + G.MAX_TORPEDOES, statsY + lineH * 3);

        // --- Continue prompt (below modal) ---
        ctx.textAlign = 'center';
        if (stateTimer > 1.5) {
            ctx.fillStyle = 'rgba(255, 80, 60, 0.6)';
            ctx.font = '16px monospace';
            ctx.fillText('PRESS ENTER TO CONTINUE', canvasW / 2, modalY + modalH + 40);
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
        var traveledMiles = Math.round(traveled / 100);
        ctx.fillStyle = 'rgba(255,80,60,0.6)';
        ctx.font = '18px monospace';
        ctx.fillText(traveledMiles + ' MILES TRAVELED', canvasW / 2, canvasH * 0.18 + 35);

        ctx.fillStyle = 'rgba(255,80,60,0.4)';
        ctx.font = '14px monospace';
        if (elapsedTime > 0) {
            ctx.fillText('TIME: ' + formatTime(elapsedTime) + (deathZone ? '  |  ' + deathZone : ''), canvasW / 2, canvasH * 0.18 + 58);
        }

        // Bottom section: tip + retry (below the killer object in the center)
        var tip = getDeathTip(deathCause);
        if (tip) {
            ctx.fillStyle = 'rgba(255,180,100,0.5)';
            ctx.font = '18px monospace';
            ctx.fillText(tip, canvasW / 2, canvasH * 0.75);
        }

        if (stateTimer > 1.0) {
            ctx.font = '20px monospace';
            ctx.fillStyle = 'rgba(255, 80, 60, ' + (0.5 + 0.5 * Math.sin(stateTimer * 4)) + ')';
            ctx.fillText('PRESS ENTER TO RETRY', canvasW / 2, canvasH * 0.82);

            ctx.font = '16px monospace';
            ctx.fillStyle = 'rgba(255, 80, 60, 0.4)';
            ctx.fillText('ESC TO RETURN HOME', canvasW / 2, canvasH * 0.82 + 28);
        }
    }

    // --- HUD ---
    // Max outstanding non-mini pings (mirrors the cap enforced in sonar.js).
    var MAX_ACTIVE_PINGS = 10;

    function drawHUD(ctx, now, stateTimer, canvasW, canvasH, player, speed, silentRunning, pingCount, torpedoes, currentZone, tutorialPhase) {
        // --- Consolidated HUD box, top-right ---
        var hudW = 220;
        var hudPad = 12;
        var lineH = 22;
        var rowCount = 5;
        var hudH = 32 + rowCount * lineH + 6;
        var hudX = canvasW - hudW - 15;
        var hudY = 15;

        // Backdrop for legibility against the red sonar noise
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(hudX, hudY, hudW, hudH);

        // Red square outline, no rounding
        ctx.strokeStyle = 'rgba(255, 50, 35, 0.75)';
        ctx.lineWidth = 1;
        ctx.strokeRect(hudX + 0.5, hudY + 0.5, hudW, hudH);

        // Header: current zone
        ctx.fillStyle = 'rgba(255, 60, 40, 1.0)';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(currentZone || '', hudX + hudW / 2, hudY + 21);

        // Divider under header
        ctx.strokeStyle = 'rgba(255, 40, 30, 0.5)';
        ctx.beginPath();
        ctx.moveTo(hudX + 8, hudY + 30);
        ctx.lineTo(hudX + hudW - 8, hudY + 30);
        ctx.stroke();

        // Rows (label left, value right)
        ctx.font = '15px monospace';
        var yStart = hudY + 52;
        function drawRow(label, value, rowIdx, valueColor) {
            var ry = yStart + rowIdx * lineH;
            ctx.fillStyle = 'rgba(255, 60, 40, 0.9)';
            ctx.textAlign = 'left';
            ctx.fillText(label, hudX + hudPad, ry);
            ctx.fillStyle = valueColor || 'rgba(255, 80, 55, 1.0)';
            ctx.textAlign = 'right';
            ctx.fillText(value, hudX + hudW - hudPad, ry);
        }

        var distTraveled = Math.max(0, G.SPAWN_Y - player.y);
        var distMiles = Math.round(distTraveled / 100);
        drawRow('DISTANCE', distMiles + ' MI', 0);

        var headingDeg = (((-player.rot * 180 / Math.PI) + 90) % 360 + 360) % 360;
        var cardinal = ['N','NE','E','SE','S','SW','W','NW'][Math.round(headingDeg / 45) % 8];
        var hdgNum = Math.round(headingDeg);
        var hdgPad = hdgNum < 10 ? '00' : (hdgNum < 100 ? '0' : '');
        drawRow('HEADING', cardinal + ' ' + hdgPad + hdgNum + '\u00B0', 1);

        var speedPct = Math.round(Math.abs(speed) / G.MAX_SPEED * 100);
        drawRow('SPEED', speedPct + '%', 2);

        // PINGS row — stacked bars, one per available slot. Bars disappear as
        // pings are fired and reappear as the pulses expire.
        var pingRy = yStart + 3 * lineH;
        ctx.fillStyle = 'rgba(255, 60, 40, 0.9)';
        ctx.textAlign = 'left';
        ctx.fillText('PINGS', hudX + hudPad, pingRy);

        var activePings = 0;
        for (var pi = 0; pi < G.pulses.length; pi++) {
            if (!G.pulses[pi].mini) activePings++;
        }
        var availablePings = Math.max(0, MAX_ACTIVE_PINGS - activePings);

        var pbW = 5;
        var pbH = 11;
        var pbGap = 2;
        var pbTotalW = MAX_ACTIVE_PINGS * pbW + (MAX_ACTIVE_PINGS - 1) * pbGap;
        var pbX = hudX + hudW - hudPad - pbTotalW;
        var pbY = pingRy - pbH + 1;
        for (var bi = 0; bi < MAX_ACTIVE_PINGS; bi++) {
            var bx = pbX + bi * (pbW + pbGap);
            var isAvailable = bi < availablePings;
            ctx.fillStyle = isAvailable
                ? 'rgba(255, 80, 55, 1.0)'
                : 'rgba(255, 80, 55, 0.18)';
            ctx.fillRect(bx, pbY, pbW, pbH);
        }

        var torpColor = torpedoes > 0
            ? 'rgba(255, 140, 40, 1.0)'
            : 'rgba(160, 60, 50, 0.8)';
        drawRow('TORPEDO', torpedoes + '/' + G.MAX_TORPEDOES, 4, torpColor);

        // --- Silent running indicator (kept separate, unobtrusive) ---
        if (silentRunning) {
            var silentPulse = 0.5 + 0.3 * Math.sin(now * 6);
            ctx.fillStyle = 'rgba(100, 180, 255, ' + silentPulse + ')';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('SILENT', 20, 30);
        }

        // Bottom-center control hint on first run
        if (stateTimer < 10 && tutorialPhase < 1) {
            var alpha = stateTimer < 8 ? 0.4 : 0.4 * (1 - (stateTimer - 8) / 2);
            ctx.fillStyle = 'rgba(200, 40, 30, ' + Math.max(0, alpha) + ')';
            ctx.font = '13px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('[ WASD ] MOVE   [ SPACE ] PING   [ SHIFT ] SILENT   [ F ] TORPEDO   [ P ] PAUSE', canvasW / 2, canvasH - 25);
        }
    }

    function getDeathTip(cause) {
        switch (cause) {
            case 'mine': return 'USE SONAR TO DETECT MINES AHEAD';
            case 'shark': return 'SHARKS GO WHERE THEY PLEASE - KEEP YOUR DISTANCE';
            case 'submarine': return 'ENEMY SUBS LISTEN FOR YOUR ENGINES - USE SILENT RUNNING';
            case 'wall': return 'USE SONAR TO SEE THE CANYON WALLS';
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
        drawBlastEffects: drawBlastEffects,
        drawActiveTorpedoes: drawActiveTorpedoes,
        drawZoneNotification: drawZoneNotification,
        drawMinimap: drawMinimap,
        drawTitleScreen: drawTitleScreen,
        drawWinScreen: drawWinScreen,
        drawDeathScreen: drawDeathScreen,
        drawHUD: drawHUD,
    };
})();

// sonar.js -- castPulse(), sonar rendering (batched alpha buckets, contour lines)

(function () {
    var G = window.G;

    G.pulses = [];
    G.echoRings = [];
    G.pingCount = 0;

    function castPulse(player, gameState, speed, spawnSafeTimer) {
        if (G.pulses.length >= 5) return;
        if (gameState !== G.STATE.PLAYING) return;

        var hits = [];
        var ox = player.x, oy = player.y;

        var nearSegs = G.canyon.collectNearbySegs(G.wallSegs, ox, oy, G.MAX_RANGE)
            .concat(G.canyon.collectNearbySegs(G.objectSegs, ox, oy, G.MAX_RANGE));

        for (var i = 0; i < G.NUM_RAYS; i++) {
            var angle = (i / G.NUM_RAYS) * Math.PI * 2;
            var dx = Math.cos(angle), dy = Math.sin(angle);

            var best = G.MAX_RANGE;
            for (var j = 0; j < nearSegs.length; j++) {
                var seg = nearSegs[j];
                var t = G.shapes.rayVsSeg(ox, oy, dx, dy, seg[0][0], seg[0][1], seg[1][0], seg[1][1]);
                if (t < best) best = t;
            }

            if (best < G.MAX_RANGE) {
                hits.push({ x: ox + dx * best, y: oy + dy * best, d: best });
            }
        }

        G.pulses.push({ t0: performance.now() / 1000, hits: hits, ox: ox, oy: oy, _lastEchoR: 0 });
        G.audio.playPing();
        G.pingCount++;

        if (hits.length > 0) {
            var closest = G.MAX_RANGE;
            for (var i = 0; i < hits.length; i++) {
                if (hits[i].d < closest) closest = hits[i].d;
            }
            G.audio.playEcho(closest / G.PULSE_SPEED, 1 - closest / G.MAX_RANGE);
        }

        G.enemies.onPlayerPing(player.x, player.y, player.rot, speed, spawnSafeTimer);
    }

    function updateEchoRings(now) {
        while (G.echoRings.length > 0 && now - G.echoRings[0].t > 3.5) G.echoRings.shift();
        if (G.echoRings.length > 20) G.echoRings.splice(0, G.echoRings.length - 20);
    }

    function renderPulses(ctx, now, player, camera, canvasW, canvasH) {
        function worldToScreen(wx, wy) {
            return [wx - camera.x, wy - camera.y];
        }

        for (var pi = G.pulses.length - 1; pi >= 0; pi--) {
            var pulse = G.pulses[pi];
            var elapsed = now - pulse.t0;
            var ringR = elapsed * G.PULSE_SPEED;

            var pulseDx = pulse.ox - player.x;
            var pulseDy = pulse.oy - player.y;
            if (pulseDx * pulseDx + pulseDy * pulseDy > (G.MAX_RANGE + canvasW) * (G.MAX_RANGE + canvasW)) {
                var maxDist = 0;
                for (var hi = 0; hi < pulse.hits.length; hi++) {
                    if (pulse.hits[hi].d > maxDist) maxDist = pulse.hits[hi].d;
                }
                if (elapsed > maxDist / G.PULSE_SPEED + G.FADE_DURATION + 0.5) {
                    G.pulses.splice(pi, 1);
                }
                continue;
            }

            var sox = pulse.ox - camera.x;
            var soy = pulse.oy - camera.y;
            var ringAlpha = ringR < G.MAX_RANGE ? Math.max(0, 0.35 * (1 - ringR / G.MAX_RANGE)) : 0;
            if (ringAlpha > 0 && ringR > 0) {
                // Main ring
                ctx.beginPath();
                ctx.arc(sox, soy, ringR, 0, Math.PI * 2);
                ctx.lineWidth = 12;
                ctx.strokeStyle = 'rgba(255,0,0,' + (ringAlpha * 0.25) + ')';
                ctx.stroke();
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(255,0,0,' + ringAlpha + ')';
                ctx.stroke();

                // POLISH: trailing ripple ring (slightly behind, thinner, dimmer)
                var trailR = ringR - 12;
                if (trailR > 0) {
                    ctx.beginPath();
                    ctx.arc(sox, soy, trailR, 0, Math.PI * 2);
                    ctx.lineWidth = 0.8;
                    ctx.strokeStyle = 'rgba(255,0,0,' + (ringAlpha * 0.15) + ')';
                    ctx.stroke();
                }

                // POLISH: slight thickness variation via second ring slightly offset
                var thickR = ringR + 3;
                ctx.beginPath();
                ctx.arc(sox, soy, thickR, 0, Math.PI * 2);
                ctx.lineWidth = 0.5;
                ctx.strokeStyle = 'rgba(255,0,0,' + (ringAlpha * 0.1) + ')';
                ctx.stroke();

                var echoStep = 300;
                var lastEchoR = pulse._lastEchoR || 0;
                if (Math.floor(ringR / echoStep) > Math.floor(lastEchoR / echoStep)) {
                    G.echoRings.push({ ox: pulse.ox, oy: pulse.oy, r: ringR, t: now });
                    if (G.echoRings.length > 20) G.echoRings.shift();
                }
                pulse._lastEchoR = ringR;
            }

            // Bloom flash on initial ping
            if (elapsed < 0.2) {
                var bloomA = 0.5 * (1 - elapsed / 0.2);
                var bloom = ctx.createRadialGradient(sox, soy, 0, sox, soy, 40);
                bloom.addColorStop(0, 'rgba(255,0,0,' + bloomA + ')');
                bloom.addColorStop(1, 'rgba(255,0,0,0)');
                ctx.fillStyle = bloom;
                ctx.beginPath();
                ctx.arc(sox, soy, 40, 0, Math.PI * 2);
                ctx.fill();
            }

            // Batched alpha bucket rendering of hit points
            var buckets = new Map();
            var hits = pulse.hits;
            for (var i = 0; i < hits.length; i++) {
                var h = hits[i];
                var h2 = hits[(i + 1) % hits.length];
                if (h.d > ringR || h2.d > ringR) continue;
                var a1 = 1 - (elapsed - h.d / G.PULSE_SPEED) / G.FADE_DURATION;
                var a2 = 1 - (elapsed - h2.d / G.PULSE_SPEED) / G.FADE_DURATION;
                if (a1 <= 0 || a2 <= 0) continue;
                var dx = h.x - h2.x, dy = h.y - h2.y;
                if (dx * dx + dy * dy > G.CONNECT_GAP_SQ) continue;
                var key = Math.round(Math.min(a1, a2) * 8);
                if (key <= 0) continue;
                var arr = buckets.get(key);
                if (!arr) { arr = []; buckets.set(key, arr); }
                var s1 = worldToScreen(h.x, h.y);
                var s2 = worldToScreen(h2.x, h2.y);
                var jit = 0.8;
                arr.push(
                    s1[0] + (Math.random() - 0.5) * jit,
                    s1[1] + (Math.random() - 0.5) * jit,
                    s2[0] + (Math.random() - 0.5) * jit,
                    s2[1] + (Math.random() - 0.5) * jit
                );
            }

            buckets.forEach(function(segs, key) {
                var alpha = key / 8;
                ctx.beginPath();
                for (var i = 0; i < segs.length; i += 4) {
                    ctx.moveTo(segs[i], segs[i + 1]);
                    ctx.lineTo(segs[i + 2], segs[i + 3]);
                }
                ctx.lineWidth = 5;
                ctx.strokeStyle = 'rgba(255,0,0,' + (alpha * 0.18) + ')';
                ctx.stroke();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(255,0,0,' + (alpha * 0.85) + ')';
                ctx.stroke();
            });

            // Prune expired pulse
            var maxDist = 0;
            for (var hi = 0; hi < hits.length; hi++) {
                if (hits[hi].d > maxDist) maxDist = hits[hi].d;
            }
            if (elapsed > maxDist / G.PULSE_SPEED + G.FADE_DURATION + 0.5) {
                G.pulses.splice(pi, 1);
            }
        }
    }

    function drawEchoRings(ctx, now, camera) {
        for (var i = 0; i < G.echoRings.length; i++) {
            var er = G.echoRings[i];
            var age = now - er.t;
            var alpha = 0.06 * (1 - age / 3.5);
            if (alpha <= 0) continue;
            var sx = er.ox - camera.x;
            var sy = er.oy - camera.y;
            ctx.beginPath();
            ctx.arc(sx, sy, er.r, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,0,0,' + alpha + ')';
            ctx.stroke();
        }
    }

    G.sonar = {
        castPulse: castPulse,
        updateEchoRings: updateEchoRings,
        renderPulses: renderPulses,
        drawEchoRings: drawEchoRings,
    };
})();

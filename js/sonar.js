// sonar.js -- castPulse(), sonar rendering (batched alpha buckets, contour lines)

(function () {
    var G = window.G;

    G.pulses = [];
    G.echoRings = [];
    G.pingCount = 0;
    var _buckets = new Map();

    function castPulse(player, gameState, speed, spawnSafeTimer) {
        if (G.pulses.length >= 10) return;
        if (gameState !== G.STATE.PLAYING) return;

        var hits = [];
        var ox = player.x, oy = player.y;

        var nearWallSegs = G.canyon.collectNearbySegs(G.wallSegs, ox, oy, G.MAX_RANGE);
        var nearObjSegs = G.canyon.collectNearbySegs(G.objectSegs, ox, oy, G.MAX_RANGE);

        // Track which objects get hit (for per-object echo sounds)
        var objectHitDists = {}; // objIndex -> closest distance

        // Hits on moving objects, stored in each object's local frame so the
        // same contour can be re-illuminated at intervals to show trajectory.
        var ghostsByObj = {};

        for (var i = 0; i < G.NUM_RAYS; i++) {
            var angle = (i / G.NUM_RAYS) * Math.PI * 2;
            var dx = Math.cos(angle), dy = Math.sin(angle);

            var best = G.MAX_RANGE;

            // Test wall segments
            for (var j = 0; j < nearWallSegs.length; j++) {
                var seg = nearWallSegs[j];
                var t = G.shapes.rayVsSeg(ox, oy, dx, dy, seg[0][0], seg[0][1], seg[1][0], seg[1][1]);
                if (t < best) best = t;
            }

            // Test object segments — track which object was hit closest
            var bestObjIdx = -1;
            for (var j = 0; j < nearObjSegs.length; j++) {
                var seg = nearObjSegs[j];
                var t = G.shapes.rayVsSeg(ox, oy, dx, dy, seg[0][0], seg[0][1], seg[1][0], seg[1][1]);
                if (t < best) {
                    best = t;
                    bestObjIdx = seg._objIdx !== undefined ? seg._objIdx : -1;
                }
            }

            if (best < G.MAX_RANGE) {
                var hx = ox + dx * best;
                var hy = oy + dy * best;
                var isMoving = false;

                // Moving-object hit → record in object-local frame for snapshots.
                // Flag the world-space hit so the main render skips it (the
                // snapshot system handles its reveal/fade separately).
                if (bestObjIdx >= 0) {
                    var hObj = G.objects[bestObjIdx];
                    if (hObj && hObj.alive && hObj.type !== G.OBJ_TYPE.MINE) {
                        isMoving = true;
                        var ghost = ghostsByObj[bestObjIdx];
                        if (!ghost) {
                            ghost = { localHits: [], snapshots: [], firstRevealT: 0 };
                            ghostsByObj[bestObjIdx] = ghost;
                        }
                        var rpx = hx - hObj.x;
                        var rpy = hy - hObj.y;
                        var rc = Math.cos(hObj.rot);
                        var rs = Math.sin(hObj.rot);
                        ghost.localHits.push({
                            lx: rpx * rc + rpy * rs,
                            ly: -rpx * rs + rpy * rc,
                            d: best,
                        });
                    }
                }

                hits.push({ x: hx, y: hy, d: best, movingObj: isMoving });
            }

            // Record closest hit per object for echo sounds
            if (bestObjIdx >= 0 && best < G.MAX_RANGE) {
                if (objectHitDists[bestObjIdx] === undefined || best < objectHitDists[bestObjIdx]) {
                    objectHitDists[bestObjIdx] = best;
                }
            }
        }

        // Initialize each ghost's first-reveal time and ping-time snapshot.
        var _gkeys = Object.keys(ghostsByObj);
        for (var _gi = 0; _gi < _gkeys.length; _gi++) {
            var _g = ghostsByObj[_gkeys[_gi]];
            var _minD = Infinity;
            for (var _lhi = 0; _lhi < _g.localHits.length; _lhi++) {
                if (_g.localHits[_lhi].d < _minD) _minD = _g.localHits[_lhi].d;
            }
            _g.firstRevealT = _minD / G.PULSE_SPEED;
            var _o = G.objects[_gkeys[_gi]];
            _g.snapshots.push({ x: _o.x, y: _o.y, rot: _o.rot, t: _g.firstRevealT });
        }

        G.pulses.push({ t0: performance.now() / 1000, hits: hits, ox: ox, oy: oy, _lastEchoR: 0, ghostsByObj: ghostsByObj });
        G.audio.playPing();
        G.pingCount++;

        // Play one echo per object hit (not walls)
        var echoKeys = Object.keys(objectHitDists);
        for (var i = 0; i < echoKeys.length; i++) {
            var dist = objectHitDists[echoKeys[i]];
            G.audio.playEcho(dist / G.PULSE_SPEED, Math.max(0.15, 1 - dist / G.MAX_RANGE));
        }

        G.enemies.onPlayerPing(player.x, player.y, player.rot, speed, spawnSafeTimer);
    }

    // Mini sonar pulse from torpedoes — shorter range, fewer rays, no ping count increment
    function castMiniPulse(ox, oy, now) {
        if (G.pulses.length >= 8) return; // allow more pulses for torpedo pings

        var hits = [];
        var range = G.TORPEDO_PING_RANGE;
        var numRays = G.TORPEDO_PING_RAYS;

        var nearSegs = G.canyon.collectNearbySegs(G.wallSegs, ox, oy, range)
            .concat(G.canyon.collectNearbySegs(G.objectSegs, ox, oy, range));

        for (var i = 0; i < numRays; i++) {
            var angle = (i / numRays) * Math.PI * 2;
            var dx = Math.cos(angle), dy = Math.sin(angle);

            var best = range;
            for (var j = 0; j < nearSegs.length; j++) {
                var seg = nearSegs[j];
                var t = G.shapes.rayVsSeg(ox, oy, dx, dy, seg[0][0], seg[0][1], seg[1][0], seg[1][1]);
                if (t < best) best = t;
            }

            if (best < range) {
                hits.push({ x: ox + dx * best, y: oy + dy * best, d: best });
            }
        }

        if (hits.length > 0) {
            G.pulses.push({ t0: now, hits: hits, ox: ox, oy: oy, _lastEchoR: 0, mini: true });
        }
    }

    function updateEchoRings(now) {
        while (G.echoRings.length > 0 && now - G.echoRings[0].t > 3.5) G.echoRings.shift();
        if (G.echoRings.length > 20) G.echoRings.splice(0, G.echoRings.length - 20);
    }

    function renderPulses(ctx, now, player, camera, canvasW, canvasH) {
        for (var pi = G.pulses.length - 1; pi >= 0; pi--) {
            var pulse = G.pulses[pi];
            var elapsed = now - pulse.t0;
            var ringR = elapsed * G.PULSE_SPEED;
            var isMini = pulse.mini === true;
            var pulseMaxRange = isMini ? G.TORPEDO_PING_RANGE : G.MAX_RANGE;
            var pulseFadeDuration = isMini ? 1.5 : G.FADE_DURATION;

            var pulseDx = pulse.ox - player.x;
            var pulseDy = pulse.oy - player.y;
            if (pulseDx * pulseDx + pulseDy * pulseDy > (pulseMaxRange + canvasW) * (pulseMaxRange + canvasW)) {
                var maxDist = 0;
                for (var hi = 0; hi < pulse.hits.length; hi++) {
                    if (pulse.hits[hi].d > maxDist) maxDist = pulse.hits[hi].d;
                }
                if (elapsed > maxDist / G.PULSE_SPEED + pulseFadeDuration + 0.5) {
                    G.pulses.splice(pi, 1);
                }
                continue;
            }

            var sox = pulse.ox - camera.x;
            var soy = pulse.oy - camera.y;
            var ringAlpha = ringR < pulseMaxRange ? Math.max(0, 0.35 * (1 - ringR / pulseMaxRange)) : 0;
            if (ringAlpha > 0 && ringR > 0) {
                if (isMini) {
                    // Mini pulse: thinner ring, no echo rings
                    ctx.beginPath();
                    ctx.arc(sox, soy, ringR, 0, Math.PI * 2);
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = 'rgba(255,0,0,' + (ringAlpha * 0.25) + ')';
                    ctx.stroke();
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255,0,0,' + ringAlpha + ')';
                    ctx.stroke();
                } else {
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
            }

            // Bloom flash on initial ping (smaller for mini)
            if (elapsed < 0.2) {
                var bloomR = isMini ? 15 : 40;
                var bloomA = (isMini ? 0.3 : 0.5) * (1 - elapsed / 0.2);
                var bloom = ctx.createRadialGradient(sox, soy, 0, sox, soy, bloomR);
                bloom.addColorStop(0, 'rgba(255,0,0,' + bloomA + ')');
                bloom.addColorStop(1, 'rgba(255,0,0,0)');
                ctx.fillStyle = bloom;
                ctx.beginPath();
                ctx.arc(sox, soy, bloomR, 0, Math.PI * 2);
                ctx.fill();
            }

            // Batched alpha bucket rendering of hit points
            _buckets.clear();
            var hits = pulse.hits;
            for (var i = 0; i < hits.length; i++) {
                var h = hits[i];
                var h2 = hits[(i + 1) % hits.length];
                if (h.d > ringR || h2.d > ringR) continue;
                // Moving-object hits render via the snapshot system instead.
                if (h.movingObj || h2.movingObj) continue;
                var a1 = 1 - (elapsed - h.d / G.PULSE_SPEED) / pulseFadeDuration;
                var a2 = 1 - (elapsed - h2.d / G.PULSE_SPEED) / pulseFadeDuration;
                if (a1 <= 0 || a2 <= 0) continue;
                var dx = h.x - h2.x, dy = h.y - h2.y;
                if (dx * dx + dy * dy > G.CONNECT_GAP_SQ) continue;
                var key = Math.round(Math.min(a1, a2) * 8);
                if (key <= 0) continue;
                var arr = _buckets.get(key);
                if (!arr) { arr = []; _buckets.set(key, arr); }
                var jit = 0.8;
                arr.push(
                    h.x - camera.x + (Math.random() - 0.5) * jit,
                    h.y - camera.y + (Math.random() - 0.5) * jit,
                    h2.x - camera.x + (Math.random() - 0.5) * jit,
                    h2.y - camera.y + (Math.random() - 0.5) * jit
                );
            }

            _buckets.forEach(function(segs, key) {
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

            // --- Trajectory snapshots ---
            // Re-illuminate the ping's partial contour at 0.5s intervals after
            // the ring first reveals the object. Oldest snapshot (original
            // ping) is dim and fades fast; newest is bright and lingers.
            if (!isMini && pulse.ghostsByObj) {
                var POSITION_STYLES = [
                    { fade: 1.5, alphaMul: 0.25 },
                    { fade: 3.0, alphaMul: 0.50 },
                    { fade: 5.0, alphaMul: 0.75 },
                    { fade: 7.0, alphaMul: 1.00 },
                ];
                var SNAPSHOT_OFFSETS = [0.5, 1.0, 1.5];
                var N_OFFSETS = SNAPSHOT_OFFSETS.length;

                var ghostKeys = Object.keys(pulse.ghostsByObj);
                for (var gk = 0; gk < ghostKeys.length; gk++) {
                    var oidx = ghostKeys[gk];
                    var gObj = G.objects[oidx];
                    var gData = pulse.ghostsByObj[oidx];

                    // Capture due snapshots — only if the object is still alive.
                    while (gObj && gObj.alive && gData.snapshots.length <= N_OFFSETS) {
                        var schedIdx = gData.snapshots.length - 1;
                        if (schedIdx < 0 || schedIdx >= N_OFFSETS) break;
                        var captureT = gData.firstRevealT + SNAPSHOT_OFFSETS[schedIdx];
                        if (elapsed < captureT) break;
                        gData.snapshots.push({
                            x: gObj.x, y: gObj.y, rot: gObj.rot, t: captureT,
                        });
                    }

                    // Render every captured snapshot with its position style.
                    for (var si = 0; si < gData.snapshots.length; si++) {
                        var snap = gData.snapshots[si];
                        var style = POSITION_STYLES[si] || POSITION_STYLES[POSITION_STYLES.length - 1];
                        var sc = Math.cos(snap.rot);
                        var ss = Math.sin(snap.rot);

                        _buckets.clear();
                        for (var lhi = 0; lhi < gData.localHits.length - 1; lhi++) {
                            var gh = gData.localHits[lhi];
                            var gh2 = gData.localHits[lhi + 1];

                            // si === 0 reveals per-hit as the ring expands;
                            // later snapshots reveal all hits at capture time.
                            var rev1 = si === 0 ? gh.d / G.PULSE_SPEED : snap.t;
                            var rev2 = si === 0 ? gh2.d / G.PULSE_SPEED : snap.t;
                            var ga1 = 1 - (elapsed - rev1) / style.fade;
                            var ga2 = 1 - (elapsed - rev2) / style.fade;
                            if (ga1 <= 0 || ga2 <= 0) continue;
                            if (si === 0 && (gh.d > ringR || gh2.d > ringR)) continue;

                            var ldx = gh.lx - gh2.lx, ldy = gh.ly - gh2.ly;
                            if (ldx * ldx + ldy * ldy > G.CONNECT_GAP_SQ) continue;

                            var wx1 = snap.x + gh.lx * sc - gh.ly * ss;
                            var wy1 = snap.y + gh.lx * ss + gh.ly * sc;
                            var wx2 = snap.x + gh2.lx * sc - gh2.ly * ss;
                            var wy2 = snap.y + gh2.lx * ss + gh2.ly * sc;

                            var gkey = Math.round(Math.min(ga1, ga2) * 8);
                            if (gkey <= 0) continue;
                            var garr = _buckets.get(gkey);
                            if (!garr) { garr = []; _buckets.set(gkey, garr); }
                            garr.push(
                                wx1 - camera.x, wy1 - camera.y,
                                wx2 - camera.x, wy2 - camera.y
                            );
                        }

                        var aMul = style.alphaMul;
                        _buckets.forEach(function(segs, key) {
                            var alpha = (key / 8) * aMul;
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
                    }
                }
            }

            // Prune expired pulse
            var maxDist = 0;
            for (var hi = 0; hi < hits.length; hi++) {
                if (hits[hi].d > maxDist) maxDist = hits[hi].d;
            }
            if (elapsed > maxDist / G.PULSE_SPEED + pulseFadeDuration + 0.5) {
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
        castMiniPulse: castMiniPulse,
        updateEchoRings: updateEchoRings,
        renderPulses: renderPulses,
        drawEchoRings: drawEchoRings,
    };
})();

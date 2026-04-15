// game.js -- game state machine, resetGame(), input handling, main loop

(function () {
    var G = window.G;

    var canvas = document.getElementById('c');
    var ctx = canvas.getContext('2d');

    // --- Canvas resize ---
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // --- Game State ---
    var gameState = G.STATE.TITLE;
    var stateTimer = 0;

    // --- Player ---
    var player = { x: G.SPAWN_X, y: G.SPAWN_Y, rot: -Math.PI / 2, shape: G.shapes.roundedRect(60, 24, 10) };
    var speed = 0;
    var turnRate = 0;

    // --- Silent Running ---
    var silentRunning = false;

    // --- Depth Charges ---
    var depthCharges = G.MAX_DEPTH_CHARGES;
    var activeCharges = [];

    // --- Close-Call State ---
    var closeCallTimer = 0;
    var lastCloseCallTime = 0;

    // --- Timing ---
    var startTime = 0;
    var winTime = 0;
    var paused = false;

    // --- Zones & Scoring ---
    var currentZone = '';
    var zoneNotifyTimer = 0;
    var bestScore = parseInt(localStorage.getItem(G.BEST_KEY) || '0', 10);
    var lastScore = 0;
    var scoreTimeBonus = 0;
    var scorePingPenalty = 0;

    // --- Spawn safety ---
    var spawnSafeTimer = 0;

    // --- Tutorial ---
    var hasPlayedBefore = localStorage.getItem(G.TUTORIAL_PLAYED_KEY) === '1';

    // --- Screen Shake ---
    var shakeTimer = 0;
    var shakeIntensity = 0;
    var shakeDuration = 0.4; // BUG FIX: track original duration for proper ratio

    // --- Death ---
    var deathCause = '';
    var deathObj = null;
    var deathElapsed = 0;
    var deathZone = '';

    // --- Initialize canyon on load ---
    G.canyon.generateCanyon();
    G.objs.generateObjects();
    G.objs.rebuildObjectSegs();

    // --- Zone check ---
    function checkZone(dt) {
        var progress = 1 - (player.y - G.DOCK_Y) / (G.SPAWN_Y - G.DOCK_Y);
        var zone;
        if (progress < 0.25) zone = G.ZONES[0];
        else if (progress < 0.50) zone = G.ZONES[1];
        else if (progress < 0.75) zone = G.ZONES[2];
        else zone = G.ZONES[3];

        if (zone !== currentZone) {
            currentZone = zone;
            zoneNotifyTimer = 3.0;
        }
        if (zoneNotifyTimer > 0) zoneNotifyTimer -= dt;
    }

    // --- Depth Charge Logic ---
    function dropDepthCharge() {
        if (depthCharges <= 0) return;
        if (gameState !== G.STATE.PLAYING) return;
        depthCharges--;
        activeCharges.push({
            x: player.x,
            y: player.y,
            fuse: G.DC_FUSE_TIME,
        });
    }

    function updateDepthCharges(dt, now) {
        for (var i = activeCharges.length - 1; i >= 0; i--) {
            var dc = activeCharges[i];
            dc.fuse -= dt;
            if (dc.fuse <= 0) {
                G.audio.playDepthChargeBoom();
                shakeTimer = 0.3;
                shakeDuration = 0.3;
                shakeIntensity = 6;
                G.blastEffects.push({ x: dc.x, y: dc.y, t: now, duration: G.DC_VISUAL_DURATION });
                if (G.blastEffects.length > 10) G.blastEffects.shift();

                for (var j = 0; j < G.objects.length; j++) {
                    var obj = G.objects[j];
                    if (!obj.alive) continue;
                    var dx = dc.x - obj.x, dy = dc.y - obj.y;
                    if (dx * dx + dy * dy < G.DC_BLAST_RADIUS * G.DC_BLAST_RADIUS) {
                        obj.alive = false;
                    }
                }
                G.objs.rebuildObjectSegs();
                activeCharges.splice(i, 1);
            }
        }
    }

    // --- Death ---
    function die(cause, killerObj) {
        gameState = G.STATE.DEAD;
        stateTimer = 0;
        deathCause = cause;
        deathElapsed = performance.now() / 1000 - startTime;
        deathZone = currentZone;
        shakeTimer = 0.4;
        shakeDuration = 0.4;
        shakeIntensity = 8;
        deathObj = killerObj || null;
        G.audio.updateEngineAudio(0, true, 0);
        G.audio.updateHeartbeat(0);
        G.audio.playDeathSound();
        hasPlayedBefore = true;
        localStorage.setItem(G.TUTORIAL_PLAYED_KEY, '1');
    }

    // --- Reset ---
    function resetGame() {
        player.x = G.SPAWN_X;
        player.y = G.SPAWN_Y;
        player.rot = -Math.PI / 2;
        speed = 0;
        turnRate = 0;
        G.pulses.length = 0;
        G.canyon.generateCanyon();
        G.objs.generateObjects();
        G.objs.rebuildObjectSegs();
        gameState = G.STATE.PLAYING;
        stateTimer = 0;
        G.pingCount = 0;
        startTime = performance.now() / 1000;
        winTime = 0;
        deathCause = '';
        deathObj = null;
        deathElapsed = 0;
        deathZone = '';
        paused = false;
        currentZone = '';
        zoneNotifyTimer = 0;
        lastScore = 0;
        scoreTimeBonus = 0;
        scorePingPenalty = 0;
        G.wake.length = 0;
        G.echoRings.length = 0;
        G.audio.resetProxWarnTime();
        G.lastWakeTime = 0;
        shakeTimer = 0;
        shakeIntensity = 0;
        G.smoothCam.x = G.SPAWN_X;
        G.smoothCam.y = G.SPAWN_Y;
        G.visitedMinY = G.SPAWN_Y;
        G.visitedMaxY = G.SPAWN_Y;
        silentRunning = false;
        depthCharges = G.MAX_DEPTH_CHARGES;
        activeCharges.length = 0;
        G.blastEffects.length = 0;
        closeCallTimer = 0;
        lastCloseCallTime = 0;
        spawnSafeTimer = 3.0;

        G.tutorialModule.resetTutorial(hasPlayedBefore);
    }

    // --- Input ---
    var keys = {};
    document.addEventListener('keydown', function (e) {
        keys[e.code] = true;
        if (e.code === 'Space' && gameState === G.STATE.PLAYING && !paused) {
            e.preventDefault();
            G.sonar.castPulse(player, gameState, speed, spawnSafeTimer);
        }
        if (e.code === 'KeyE' && gameState === G.STATE.PLAYING && !paused) {
            dropDepthCharge();
        }
        if ((e.code === 'KeyP' || e.code === 'Escape') && gameState === G.STATE.PLAYING) {
            paused = !paused;
            if (paused) {
                G.audio.suspendAudio();
            } else {
                G.audio.resumeAudio();
                lastTime = 0; // Reset to avoid dt spike on unpause
            }
        }
        if (e.code === 'Enter') {
            if (gameState === G.STATE.TITLE) {
                G.audio.initAudio();
                resetGame();
            } else if (gameState === G.STATE.DEAD && stateTimer > 1.0) {
                resetGame();
            } else if (gameState === G.STATE.WIN && stateTimer > 1.5) {
                gameState = G.STATE.TITLE;
                stateTimer = 0;
            }
        }
    });
    document.addEventListener('keyup', function (e) { keys[e.code] = false; });

    // --- Page title updates ---
    var lastDocTitle = '';
    function updateDocTitle(title) {
        if (title !== lastDocTitle) {
            document.title = title;
            lastDocTitle = title;
        }
    }

    // --- Main Loop ---
    var lastTime = 0;

    function frame(ts) {
        var now = ts / 1000;
        var dt = lastTime ? Math.min(now - lastTime, 0.05) : 0;
        lastTime = now;
        if (!paused) stateTimer += dt;

        var canvasW = canvas.width;
        var canvasH = canvas.height;

        // --- Background: zone-tinted ---
        var zoneIdx = G.getZoneIndex(player.y);
        var bgColor = G.ZONE_BG_COLORS[zoneIdx] || '#080c14';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // --- TITLE STATE ---
        if (gameState === G.STATE.TITLE) {
            updateDocTitle('Sonar');
            G.renderer.drawTitleScreen(ctx, now, stateTimer, canvasW, canvasH, bestScore);
            requestAnimationFrame(frame);
            return;
        }

        // --- WIN STATE ---
        if (gameState === G.STATE.WIN) {
            updateDocTitle('Sonar - MISSION COMPLETE');
            G.renderer.drawWinScreen(ctx, stateTimer, canvasW, canvasH, lastScore, bestScore, winTime, startTime, G.pingCount, scoreTimeBonus, scorePingPenalty);
            requestAnimationFrame(frame);
            return;
        }

        // --- PLAYING or DEAD ---

        // --- Page title for playing/dead ---
        if (gameState === G.STATE.DEAD) {
            updateDocTitle('Sonar - HULL BREACH');
        } else if (paused) {
            updateDocTitle('Sonar - PAUSED');
        } else {
            updateDocTitle('Sonar - ' + (currentZone || 'DIVING'));
        }

        // --- Pause ---
        if (paused && gameState === G.STATE.PLAYING) {
            var spxp = player.x - G.camera.x;
            var spyp = player.y - G.camera.y;
            var depthGrad2 = ctx.createRadialGradient(spxp, spyp, 0, spxp, spyp, 350);
            depthGrad2.addColorStop(0, 'rgba(12, 20, 35, 0.4)');
            depthGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = depthGrad2;
            ctx.fillRect(0, 0, canvasW, canvasH);

            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.fillStyle = '#ff3030';
            ctx.font = 'bold 36px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', canvasW / 2, canvasH / 2 - 10);
            ctx.fillStyle = 'rgba(255,80,60,0.5)';
            ctx.font = '16px monospace';
            ctx.fillText('PRESS P TO RESUME', canvasW / 2, canvasH / 2 + 25);
            G.renderer.drawScanlines(ctx, canvasW, canvasH);
            G.renderer.drawVignette(ctx, canvasW, canvasH);
            requestAnimationFrame(frame);
            return;
        }

        if (gameState === G.STATE.PLAYING) {
            // --- Silent running ---
            silentRunning = !!(keys['ShiftLeft'] || keys['ShiftRight']);

            // --- Spawn safety ---
            if (spawnSafeTimer > 0) spawnSafeTimer -= dt;

            // --- Movement ---
            var turnInput = 0;
            if (keys['KeyA']) turnInput -= 1;
            if (keys['KeyD']) turnInput += 1;
            var turnAccel = silentRunning ? G.TURN_ACCEL * 0.4 : G.TURN_ACCEL;
            var maxTurn = silentRunning ? G.MAX_TURN * 0.4 : G.MAX_TURN;
            if (turnInput) {
                turnRate += turnInput * turnAccel * dt;
                turnRate = Math.max(-maxTurn, Math.min(maxTurn, turnRate));
            } else {
                var drag = G.TURN_DRAG * dt;
                if (Math.abs(turnRate) < drag) turnRate = 0;
                else turnRate -= Math.sign(turnRate) * drag;
            }
            player.rot += turnRate * dt;

            var moveInput = 0;
            if (keys['KeyW']) moveInput += 1;
            if (keys['KeyS']) moveInput -= 1;

            if (silentRunning && moveInput) {
                // Silent running: can still accelerate but slower, lower top speed
                speed += moveInput * G.ACCEL * 0.4 * dt;
                speed = Math.max(-G.MAX_SPEED * 0.2, Math.min(G.MAX_SPEED * 0.4, speed));
            } else if (silentRunning) {
                // Silent running, no input: coast down faster
                var brakeDrag = G.SILENT_BRAKE * dt;
                if (Math.abs(speed) < brakeDrag) speed = 0;
                else speed -= Math.sign(speed) * brakeDrag;
            } else if (moveInput) {
                speed += moveInput * G.ACCEL * dt;
                speed = Math.max(-G.MAX_SPEED * 0.5, Math.min(G.MAX_SPEED, speed));
            } else {
                var drag = G.BRAKE * dt;
                if (Math.abs(speed) < drag) speed = 0;
                else speed -= Math.sign(speed) * drag;
            }

            if (speed !== 0) {
                player.x += Math.cos(player.rot) * speed * dt;
                player.y += Math.sin(player.rot) * speed * dt;
            }

            // --- Wall collision (slide along wall, don't brick-stop) ---
            if (!G.canyon.isInsideCanyon(player.x, player.y)) {
                var leftX = G.canyon.interpolateWallX(G.leftWall, player.y);
                var rightX = G.canyon.interpolateWallX(G.rightWall, player.y);
                var wasLeft = player.x <= leftX + 16;
                player.x = Math.max(leftX + 16, Math.min(rightX - 16, player.x));
                // Only kill the lateral component; preserve forward slide along wall
                var wallNx = wasLeft ? 1 : -1;
                var dot = Math.cos(player.rot) * wallNx;
                if (dot < 0) {
                    // Heading into the wall -- dampen proportional to how head-on
                    speed *= Math.max(0.4, 1 + dot * 0.6);
                }
            }
            player.y = Math.max(30, Math.min(G.WORLD_H - 30, player.y));

            // --- Update AI ---
            for (var i = 0; i < G.objects.length; i++) {
                var obj = G.objects[i];
                if (!obj.alive) continue;
                if (obj.type === G.OBJ_TYPE.SHARK) G.enemies.updateShark(obj, dt);
                else if (obj.type === G.OBJ_TYPE.ENEMY_SUB) G.enemies.updateEnemySub(obj, dt, player, speed, silentRunning);
            }
            G.objs.rebuildObjectSegs();

            // --- Depth charges ---
            updateDepthCharges(dt, now);

            // --- Object collision (death) ---
            var hit = G.objs.checkCollisions(player, spawnSafeTimer);
            if (hit) {
                var causes = ['mine', 'shark', 'submarine'];
                die(causes[hit.type], hit);
            }

            // --- Close-call detection ---
            if (!hit) {
                if (now - lastCloseCallTime >= 1.5) {
                    var closeCall = G.objs.checkCloseCalls(now, player, lastCloseCallTime);
                    if (closeCall) {
                        closeCallTimer = 0.6;
                        lastCloseCallTime = now;
                        G.audio.playCloseCallChirp();
                    }
                }
            }
            if (closeCallTimer > 0) closeCallTimer -= dt;

            // --- Win check ---
            if (player.y < G.DOCK_Y + 40) {
                gameState = G.STATE.WIN;
                stateTimer = 0;
                winTime = performance.now() / 1000;
                var elapsed = winTime - startTime;
                var scoreResult = G.renderer.computeScore(elapsed);
                lastScore = scoreResult.total;
                scoreTimeBonus = scoreResult.timeBonus;
                scorePingPenalty = scoreResult.pingPenalty;
                if (lastScore > bestScore) {
                    bestScore = lastScore;
                    localStorage.setItem(G.BEST_KEY, String(bestScore));
                }
                G.audio.updateEngineAudio(0, true, 0);
                G.audio.updateHeartbeat(0);
                G.audio.playWinFanfare();
                hasPlayedBefore = true;
                localStorage.setItem(G.TUTORIAL_PLAYED_KEY, '1');
            }

            // --- Engine audio ---
            // POLISH: dock proximity increases engine pitch
            var distToDock = Math.hypot(player.x - G.DOCK_CX, player.y - G.DOCK_CY);
            var dockProximity = distToDock < 200 ? (1 - distToDock / 200) : 0;
            G.audio.updateEngineAudio(speed, silentRunning, dockProximity);

            // --- Heartbeat audio (near-death low pulse) ---
            var nearDist = G.objs.nearestThreatDist(player);
            var heartbeatRange = 120;
            var heartbeatIntensity = nearDist < heartbeatRange ? (1 - nearDist / heartbeatRange) : 0;
            G.audio.updateHeartbeat(heartbeatIntensity);

            // --- Proximity warning ---
            G.audio.checkProximityWarning(now, G.objects, player);

            // --- Wake trail ---
            G.renderer.updateWake(now, player, speed);

            // --- Zone check ---
            checkZone(dt);

            // --- Tutorial ---
            G.tutorialModule.updateTutorial(dt, keys, player, depthCharges);
        }

        // --- Screen shake ---
        var shaking = false;
        if (shakeTimer > 0) {
            shakeTimer -= dt;
            if (shakeTimer > 0) {
                shaking = true;
                // BUG FIX: use tracked shakeDuration instead of hardcoded 0.4
                var ratio = shakeTimer / shakeDuration;
                var sx = (Math.random() - 0.5) * shakeIntensity * ratio;
                var sy = (Math.random() - 0.5) * shakeIntensity * ratio;
                ctx.save();
                ctx.translate(sx, sy);
            }
        }

        // --- Camera (smooth lerp) ---
        var targetCamX = player.x - canvasW / 2;
        var targetCamY = player.y - canvasH / 2;
        var lerpFactor = 1 - Math.pow(0.02, dt);
        G.smoothCam.x += (targetCamX - G.smoothCam.x) * lerpFactor;
        G.smoothCam.y += (targetCamY - G.smoothCam.y) * lerpFactor;
        G.camera.x = G.smoothCam.x;
        G.camera.y = G.smoothCam.y;

        // --- Background gradient centered on player ---
        var spx = player.x - G.camera.x;
        var spy = player.y - G.camera.y;
        var depthGrad = ctx.createRadialGradient(spx, spy, 0, spx, spy, 350);
        depthGrad.addColorStop(0, 'rgba(12, 20, 35, 0.4)');
        depthGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = depthGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // --- Player submarine ---
        var pVerts = G.shapes.transformVerts(player.shape, player.x, player.y, player.rot);
        var pScreen = [];
        for (var i = 0; i < pVerts.length; i++) {
            pScreen.push(G.renderer.worldToScreen(pVerts[i][0], pVerts[i][1]));
        }
        var subStroke = silentRunning ? 'rgba(255,0,0,0.35)' : '#ff0000';
        G.renderer.drawPoly(ctx, pScreen, '#000', subStroke, 2);

        // Heading indicator: subtle line from sub nose
        if (gameState === G.STATE.PLAYING) {
            var noseLen = 18;
            var noseX = spx + Math.cos(player.rot) * 32;
            var noseY = spy + Math.sin(player.rot) * 32;
            var tipX = spx + Math.cos(player.rot) * (32 + noseLen);
            var tipY = spy + Math.sin(player.rot) * (32 + noseLen);
            ctx.beginPath();
            ctx.moveTo(noseX, noseY);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = silentRunning ? 'rgba(255,0,0,0.1)' : 'rgba(255,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // --- Dock proximity glow (green) ---
        if (gameState === G.STATE.PLAYING) {
            var distToDockGlow = Math.hypot(player.x - G.DOCK_CX, player.y - G.DOCK_CY);
            // POLISH: brighter glow when very close (within 200px)
            var glowRange = 500;
            if (distToDockGlow < glowRange) {
                var dsx = G.DOCK_CX - G.camera.x;
                var dsy = G.DOCK_CY - G.camera.y;
                var baseFrac = 1 - distToDockGlow / glowRange;
                // POLISH: within 200px, alpha ramps up more aggressively
                var alpha;
                if (distToDockGlow < 200) {
                    alpha = 0.15 + 0.15 * (1 - distToDockGlow / 200);
                } else {
                    alpha = 0.15 * baseFrac;
                }
                var glowR = 60 + (distToDockGlow < 200 ? (1 - distToDockGlow / 200) * 30 : 0);
                var glow = ctx.createRadialGradient(dsx, dsy, 0, dsx, dsy, glowR);
                glow.addColorStop(0, 'rgba(0, 255, 100, ' + alpha + ')');
                glow.addColorStop(1, 'rgba(0, 255, 100, 0)');
                ctx.fillStyle = glow;
                ctx.fillRect(dsx - glowR, dsy - glowR, glowR * 2, glowR * 2);
            }
        }

        // --- Sonar pulses ---
        G.sonar.renderPulses(ctx, now, player, G.camera, canvasW, canvasH);

        // --- Water particles ---
        G.renderer.drawParticles(ctx, G.camera, canvasW, canvasH);

        // --- Wake trail ---
        G.renderer.drawWake(ctx, now, G.camera);

        // --- Echo rings ---
        G.sonar.updateEchoRings(now);
        G.sonar.drawEchoRings(ctx, now, G.camera);

        // --- Blast effects ---
        G.renderer.drawBlastEffects(ctx, now, G.camera);

        // --- Active depth charges ---
        G.renderer.drawActiveCharges(ctx, now, activeCharges, G.camera);

        // --- Death-reveal + overlay ---
        if (gameState === G.STATE.DEAD) {
            G.renderer.drawDeathScreen(ctx, stateTimer, canvasW, canvasH, player, deathCause, deathObj, G.camera, deathElapsed, deathZone);
        }

        // Threat direction arrows disabled


        // --- Close-call flash ---
        if (gameState === G.STATE.PLAYING) {
            G.renderer.drawCloseCallFlash(ctx, closeCallTimer, canvasW, canvasH);
        }

        // --- HUD ---
        if (gameState === G.STATE.PLAYING) {
            G.renderer.drawHUD(ctx, now, stateTimer, canvasW, canvasH, player, speed, silentRunning, G.pingCount, depthCharges, currentZone, G.tutorial.phase);
            G.tutorialModule.drawTutorialPrompts(ctx, now, canvasW, canvasH, depthCharges);
            G.renderer.drawZoneNotification(ctx, canvasW, canvasH, currentZone, zoneNotifyTimer);
            G.renderer.drawMinimap(ctx, player, canvasW, canvasH);
        }

        // --- Restore screen shake ---
        if (shaking) {
            ctx.restore();
        }

        // --- Post-processing ---
        G.renderer.drawScanlines(ctx, canvasW, canvasH);
        G.renderer.drawVignette(ctx, canvasW, canvasH);

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
})();

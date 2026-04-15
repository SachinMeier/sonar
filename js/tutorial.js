// tutorial.js -- tutorial state machine, prompt rendering

(function () {
    var G = window.G;

    G.tutorial = {
        phase: -1,           // -1 = complete/skipped, 1-5 = active
        promptAlpha: 0,
        hasTurned: false,
        distanceMoved: 0,
        startY: 0,
    };

    function resetTutorial(hasPlayedBefore) {
        if (hasPlayedBefore) {
            G.tutorial.phase = -1;
        } else {
            G.tutorial.phase = 1;
            G.tutorial.promptAlpha = 0;
            G.tutorial.hasTurned = false;
            G.tutorial.distanceMoved = 0;
            G.tutorial.startY = G.SPAWN_Y;
        }
    }

    function updateTutorial(dt, keys, player, depthCharges) {
        var tut = G.tutorial;
        if (tut.phase < 1) return;

        var distFromSpawn = tut.startY - player.y;

        if (keys['KeyA'] || keys['KeyD']) tut.hasTurned = true;

        if (tut.phase === 1) {
            tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            if (distFromSpawn > 500 && tut.hasTurned) {
                tut.phase = 2;
                tut.promptAlpha = 1;
            }
        } else if (tut.phase === 2) {
            // Brief transition: fade out controls, show heading north hint
            if (distFromSpawn < 1200) {
                tut.promptAlpha = Math.max(0, tut.promptAlpha - dt * 2);
            } else {
                tut.promptAlpha = Math.min(0.7, tut.promptAlpha + dt * 2);
            }
            if (distFromSpawn > 2000) {
                tut.phase = 3;
                tut.promptAlpha = 0;
            }
        } else if (tut.phase === 3) {
            tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            if (G.pingCount > 0) {
                tut.phase = 4;
                tut.promptAlpha = 1;
            }
        } else if (tut.phase === 4) {
            var anyAlerted = false;
            for (var i = 0; i < G.objects.length; i++) {
                var o = G.objects[i];
                if (o.type === G.OBJ_TYPE.ENEMY_SUB && o.alive &&
                    (o.aiState === 'intercept' || o.aiState === 'listening')) {
                    anyAlerted = true;
                    break;
                }
            }
            if (anyAlerted) {
                tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            } else {
                tut.promptAlpha = Math.max(0, tut.promptAlpha - dt * 1.5);
            }
            if (distFromSpawn > 4000) {
                tut.phase = 5;
                tut.promptAlpha = 0;
            }
        } else if (tut.phase === 5) {
            tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            if (distFromSpawn > 5000 || depthCharges < G.MAX_DEPTH_CHARGES) {
                tut.phase = -1;
                tut.promptAlpha = 0;
            }
        }
    }

    function drawTutorialPrompts(ctx, now, canvasW, canvasH, depthCharges) {
        var tut = G.tutorial;
        if (tut.phase < 1 || tut.promptAlpha < 0.01) return;

        var ta = tut.promptAlpha;
        ctx.textAlign = 'center';
        var promptY = canvasH / 2 + 60;

        if (tut.phase === 1) {
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.7) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('W - ACCELERATE', canvasW / 2, promptY);
            ctx.fillText('A / D - TURN', canvasW / 2, promptY + 28);

            var arrowPulse = 0.4 + 0.3 * Math.sin(now * 4);
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * arrowPulse) + ')';
            ctx.font = 'bold 28px monospace';
            ctx.fillText('\u25B2', canvasW / 2, promptY - 46);

        } else if (tut.phase === 2) {
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.45) + ')';
            ctx.font = '16px monospace';
            ctx.fillText('REACH THE PORT - HEAD NORTH', canvasW / 2, promptY);

        } else if (tut.phase === 3) {
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.7) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('SPACE - SONAR PING', canvasW / 2, promptY);

        } else if (tut.phase === 4) {
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.7) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('SHIFT - SILENT RUNNING', canvasW / 2, promptY);
            ctx.fillStyle = 'rgba(255, 140, 80, ' + (ta * 0.4) + ')';
            ctx.font = '14px monospace';
            ctx.fillText('ENEMY SUBS TRACK YOUR ENGINE NOISE', canvasW / 2, promptY + 28);

        } else if (tut.phase === 5) {
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.7) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('E - DEPTH CHARGE', canvasW / 2, promptY);
            ctx.fillStyle = 'rgba(255, 140, 80, ' + (ta * 0.4) + ')';
            ctx.font = '14px monospace';
            ctx.fillText('(' + depthCharges + ' REMAINING)', canvasW / 2, promptY + 28);
        }
    }

    G.tutorialModule = {
        resetTutorial: resetTutorial,
        updateTutorial: updateTutorial,
        drawTutorialPrompts: drawTutorialPrompts,
    };
})();

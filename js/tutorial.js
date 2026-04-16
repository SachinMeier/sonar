// tutorial.js -- tutorial state machine, prompt rendering
//
// Each phase introduces ONE concept with ONE sentence.
// Objects are placed to match: mines at ~1200px, sharks at ~3000px, enemy subs at ~4200px.
//
// Phase flow:
//   1. Movement (W/A/D)                 — 0-500px
//   2. Sonar (Space)                    — 500px+, completes on first ping
//   3. Mine warning (icon + sentence)   — ~1000px, hold 4s
//   4. Shark warning (icon + sentence)  — ~2600px, hold 4s
//   5. Sub warning (icon + sentence)    — ~3800px, hold 4s
//   6. Silent running (Shift)           — ~4200px or enemy alert
//   7. Torpedoes (E)                    — ~5000px

(function () {
    var G = window.G;

    G.tutorial = {
        phase: -1,
        promptAlpha: 0,
        hasTurned: false,
        startY: 0,
        phaseTimer: 0,
    };

    function resetTutorial() {
        G.tutorial.phase = 1;
        G.tutorial.promptAlpha = 0;
        G.tutorial.hasTurned = false;
        G.tutorial.startY = G.SPAWN_Y;
        G.tutorial.phaseTimer = 0;
    }

    function updateTutorial(dt, keys, player, torpedoes) {
        var tut = G.tutorial;
        if (tut.phase < 1) return;

        var dist = tut.startY - player.y;

        if (keys['KeyA'] || keys['KeyD']) tut.hasTurned = true;

        if (tut.phase === 1) {
            // Movement
            tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            if (dist > 100) {
                tut.phase = 2;
                tut.promptAlpha = 0;
            }

        } else if (tut.phase === 2) {
            // Sonar — teach before they reach the first mine at 1200px
            tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            if (G.pingCount > 0) {
                tut.phase = 3;
                tut.promptAlpha = 0;
                tut.phaseTimer = 0;
            }

        } else if (tut.phase === 3) {
            // Mine warning — appears near 600px, holds 4s
            if (dist > 600) {
                tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
                tut.phaseTimer += dt;
            }
            if (tut.phaseTimer > 4) {
                tut.phase = 4;
                tut.promptAlpha = 0;
                tut.phaseTimer = 0;
            }

        } else if (tut.phase === 4) {
            // Shark warning — appears near 2000px, holds 4s
            if (dist > 2000) {
                tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
                tut.phaseTimer += dt;
            }
            if (tut.phaseTimer > 4) {
                tut.phase = 5;
                tut.promptAlpha = 0;
                tut.phaseTimer = 0;
            }

        } else if (tut.phase === 5) {
            // Enemy sub warning — appears near 3200px, holds 4s
            if (dist > 3200) {
                tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
                tut.phaseTimer += dt;
            }
            if (tut.phaseTimer > 4) {
                tut.phase = 6;
                tut.promptAlpha = 0;
            }

        } else if (tut.phase === 6) {
            // Silent running — show on enemy alert or distance
            var anyAlerted = false;
            for (var i = 0; i < G.objects.length; i++) {
                var o = G.objects[i];
                if (o.type === G.OBJ_TYPE.ENEMY_SUB && o.alive &&
                    (o.aiState === 'intercept' || o.aiState === 'listening')) {
                    anyAlerted = true;
                    break;
                }
            }
            if (anyAlerted || dist > 3800) {
                tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            }
            if (dist > 4400) {
                tut.phase = 7;
                tut.promptAlpha = 0;
            }

        } else if (tut.phase === 7) {
            // Torpedoes — shortly after silent running
            tut.promptAlpha = Math.min(1, tut.promptAlpha + dt * 2);
            if (dist > 5000 || torpedoes < G.MAX_TORPEDOES) {
                tut.phase = -1;
                tut.promptAlpha = 0;
            }
        }
    }

    // --- Icon drawers ---

    function drawMineIcon(ctx, x, y, alpha) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 60, 40, ' + alpha + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function drawSubIcon(ctx, x, y, alpha) {
        var w = 22, h = 9, r = 4;
        ctx.beginPath();
        ctx.moveTo(x - w/2 + r, y - h/2);
        ctx.lineTo(x + w/2 - r, y - h/2);
        ctx.quadraticCurveTo(x + w/2, y - h/2, x + w/2, y - h/2 + r);
        ctx.lineTo(x + w/2, y + h/2 - r);
        ctx.quadraticCurveTo(x + w/2, y + h/2, x + w/2 - r, y + h/2);
        ctx.lineTo(x - w/2 + r, y + h/2);
        ctx.quadraticCurveTo(x - w/2, y + h/2, x - w/2, y + h/2 - r);
        ctx.lineTo(x - w/2, y - h/2 + r);
        ctx.quadraticCurveTo(x - w/2, y - h/2, x - w/2 + r, y - h/2);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 60, 40, ' + alpha + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function drawSharkIcon(ctx, x, y, alpha) {
        ctx.beginPath();
        ctx.moveTo(x + 11, y);
        ctx.lineTo(x - 7, y - 7);
        ctx.lineTo(x - 3, y);
        ctx.lineTo(x - 7, y + 7);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 60, 40, ' + alpha + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // --- Rendering ---

    function drawIconAndText(ctx, icon, text, canvasW, promptY, alpha) {
        // Measure text so we can center the icon+text block as a unit
        ctx.font = '16px monospace';
        var textWidth = ctx.measureText(text).width;
        var iconWidth = 18;   // visual width of icons
        var gap = 14;          // space between icon and text
        var totalWidth = iconWidth + gap + textWidth;
        var startX = canvasW / 2 - totalWidth / 2;

        var iconCx = startX + iconWidth / 2;
        var textStartX = startX + iconWidth + gap;

        icon(ctx, iconCx, promptY - 5, alpha * 0.8);
        ctx.fillStyle = 'rgba(255, 60, 40, ' + (alpha * 0.65) + ')';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, textStartX, promptY);
        ctx.textAlign = 'center'; // restore for other draws
    }

    function drawTutorialPrompts(ctx, now, canvasW, canvasH, torpedoes) {
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
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.7) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('SPACE - SONAR PING', canvasW / 2, promptY);

        } else if (tut.phase === 3) {
            drawIconAndText(ctx, drawMineIcon, 'MINES - DEADLY ON CONTACT', canvasW, promptY, ta);

        } else if (tut.phase === 4) {
            drawIconAndText(ctx, drawSharkIcon, 'SHARKS - THEY BITE', canvasW, promptY, ta);

        } else if (tut.phase === 5) {
            drawIconAndText(ctx, drawSubIcon, 'ENEMY SUBS HEAR YOUR PINGS', canvasW, promptY, ta);

        } else if (tut.phase === 6) {
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.7) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('HOLD SHIFT - RUN SILENTLY', canvasW / 2, promptY);
            ctx.fillStyle = 'rgba(255, 140, 80, ' + (ta * 0.4) + ')';
            ctx.font = '14px monospace';
            ctx.fillText('SLOWER MOVEMENT - ENEMIES LOSE TRACK OF YOU', canvasW / 2, promptY + 26);

        } else if (tut.phase === 7) {
            ctx.fillStyle = 'rgba(255, 60, 40, ' + (ta * 0.7) + ')';
            ctx.font = '20px monospace';
            ctx.fillText('F - FIRE TORPEDO', canvasW / 2, promptY);
            ctx.fillStyle = 'rgba(255, 140, 80, ' + (ta * 0.4) + ')';
            ctx.font = '14px monospace';
            ctx.fillText(torpedoes + ' AVAILABLE - USE THEM WISELY', canvasW / 2, promptY + 26);
        }
    }

    G.tutorialModule = {
        resetTutorial: resetTutorial,
        updateTutorial: updateTutorial,
        drawTutorialPrompts: drawTutorialPrompts,
    };
})();

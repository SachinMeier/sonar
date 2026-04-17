// enemies.js -- shark AI, enemy sub AI, bounceOffWalls, onPlayerPing

(function () {
    var G = window.G;

    const BOUNCE_WALL_INSET = 50;
    const BOUNCE_DOCK_Y_OFFSET = 300;
    const BOUNCE_BOTTOM_INSET = 500;

    function onPlayerPing(px, py, prot, pspeed, spawnSafeTimer) {
        for (var i = 0; i < G.objects.length; i++) {
            var obj = G.objects[i];
            if (obj.type !== G.OBJ_TYPE.ENEMY_SUB || !obj.alive) continue;
            var dx = obj.x - px, dy = obj.y - py;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > G.ESUB_DETECT_RANGE) continue;
            if (spawnSafeTimer > 0 && obj.y > G.WORLD_H - 700) continue;

            var zone = G.getZoneIndex(obj.y);
            var interceptSpeed = G.ZONE_ESUB_INTERCEPT_SPEED[zone] || G.ESUB_INTERCEPT_SPEED_BASE;

            var wasPatrol = obj.aiState === 'patrol';
            obj.aiState = 'intercept';
            obj.interceptTimer = 0;
            obj.alertTime = performance.now() / 1000;

            var pvx = Math.cos(prot) * pspeed;
            var pvy = Math.sin(prot) * pspeed;
            // BUG FIX: guard against zero interceptSpeed causing Infinity timeToIntercept
            var timeToIntercept = interceptSpeed > 0 ? dist / interceptSpeed : 5;
            obj.targetX = px + pvx * timeToIntercept;
            obj.targetY = py + pvy * timeToIntercept;

            if (wasPatrol) {
                G.audio.playInterceptAlarm();
            }
        }
    }

    function updateShark(obj, dt) {
        var zone = G.getZoneIndex(obj.y);
        var sharkSpeed = G.ZONE_SHARK_SPEED[zone];
        var turnMult = G.ZONE_SHARK_TURN_MULT[zone];

        obj.wanderTimer -= dt;
        if (obj.wanderTimer <= 0) {
            obj.wanderAngle += (Math.random() - 0.5) * Math.PI * 0.8 * turnMult;
            var interval = G.SHARK_TURN_INTERVAL[0] +
                Math.random() * (G.SHARK_TURN_INTERVAL[1] - G.SHARK_TURN_INTERVAL[0]);
            // BUG FIX: guard against zero turnMult causing Infinity timer
            obj.wanderTimer = turnMult > 0 ? interval / turnMult : interval;
        }

        var angleDiff = G.shapes.normalizeAngle(obj.wanderAngle - obj.rot);
        obj.rot += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 1.5 * turnMult * dt);

        obj.x += Math.cos(obj.rot) * sharkSpeed * dt;
        obj.y += Math.sin(obj.rot) * sharkSpeed * dt;

        bounceOffWalls(obj);
    }

    function updateEnemySub(obj, dt, player, speed, silentRunning) {
        var zone = G.getZoneIndex(obj.y);
        var interceptSpeed = G.ZONE_ESUB_INTERCEPT_SPEED[zone] || G.ESUB_INTERCEPT_SPEED_BASE;
        var listenDuration = G.ZONE_ESUB_LISTEN_DURATION[zone] || G.ESUB_LISTEN_DURATION_BASE;

        if (obj.aiState === 'intercept') {
            var heading = Math.atan2(obj.targetY - obj.y, obj.targetX - obj.x);
            var angleDiff = G.shapes.normalizeAngle(heading - obj.rot);
            obj.rot += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 2.0 * dt);

            obj.x += Math.cos(obj.rot) * interceptSpeed * dt;
            obj.y += Math.sin(obj.rot) * interceptSpeed * dt;

            obj.interceptTimer += dt;
            var dx = obj.targetX - obj.x, dy = obj.targetY - obj.y;
            if (dx * dx + dy * dy < 80 * 80 || obj.interceptTimer > 6) {
                obj.aiState = 'listening';
                obj.listenTimer = listenDuration;
                obj.interceptTimer = 0;
            }
        } else if (obj.aiState === 'listening') {
            obj.x += Math.cos(obj.rot) * G.ESUB_PATROL_SPEED * 0.4 * dt;
            obj.y += Math.sin(obj.rot) * G.ESUB_PATROL_SPEED * 0.4 * dt;

            obj.listenTimer -= dt;

            if (!silentRunning && Math.abs(speed) > G.ESUB_ENGINE_NOISE_THRESHOLD) {
                var dx = obj.x - player.x, dy = obj.y - player.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < G.ESUB_LISTEN_RANGE) {
                    obj.aiState = 'intercept';
                    obj.interceptTimer = 0;
                    obj.alertTime = performance.now() / 1000;
                    var pvx = Math.cos(player.rot) * speed;
                    var pvy = Math.sin(player.rot) * speed;
                    var timeToIntercept = interceptSpeed > 0 ? dist / interceptSpeed : 5;
                    obj.targetX = player.x + pvx * timeToIntercept;
                    obj.targetY = player.y + pvy * timeToIntercept;
                    G.audio.playInterceptAlarm();
                }
            }

            if (obj.listenTimer <= 0) {
                obj.aiState = 'patrol';
                obj.wanderAngle = obj.rot;
            }
        } else {
            obj.wanderTimer -= dt;
            if (obj.wanderTimer <= 0) {
                obj.wanderAngle += (Math.random() - 0.5) * Math.PI * 0.6;
                obj.wanderTimer = 3 + Math.random() * 4;
            }

            var angleDiff = G.shapes.normalizeAngle(obj.wanderAngle - obj.rot);
            obj.rot += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 1.0 * dt);

            obj.x += Math.cos(obj.rot) * G.ESUB_PATROL_SPEED * dt;
            obj.y += Math.sin(obj.rot) * G.ESUB_PATROL_SPEED * dt;
        }

        bounceOffWalls(obj);
    }

    function bounceOffWalls(obj) {
        var lx = G.canyon.interpolateWallX(G.leftWall, obj.y);
        var rx = G.canyon.interpolateWallX(G.rightWall, obj.y);
        var minY = G.DOCK_Y + BOUNCE_DOCK_Y_OFFSET;
        var maxY = G.WORLD_H - BOUNCE_BOTTOM_INSET;
        if (obj.x < lx + BOUNCE_WALL_INSET) {
            obj.wanderAngle = 0;
            obj.x = lx + BOUNCE_WALL_INSET;
        }
        if (obj.x > rx - BOUNCE_WALL_INSET) {
            obj.wanderAngle = Math.PI;
            obj.x = rx - BOUNCE_WALL_INSET;
        }
        if (obj.y < minY) {
            obj.wanderAngle = Math.PI / 2;
            obj.y = minY;
        }
        if (obj.y > maxY) {
            obj.wanderAngle = -Math.PI / 2;
            obj.y = maxY;
        }
    }

    G.enemies = {
        onPlayerPing: onPlayerPing,
        updateShark: updateShark,
        updateEnemySub: updateEnemySub,
    };
})();

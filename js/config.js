// config.js -- all constants, zone config, geometry, state enums

(function () {
    const G = window.G;

    // --- Sonar ---
    G.PULSE_SPEED = 350;
    G.FADE_DURATION = 7.0;
    G.NUM_RAYS = 720;
    G.MAX_RANGE = 1200;
    G.CONNECT_GAP_SQ = 25 * 25;

    // --- Movement ---
    G.ACCEL = 80;
    G.BRAKE = 15;
    G.MAX_SPEED = 100;
    G.TURN_ACCEL = 1.0;
    G.TURN_DRAG = 1.5;
    G.MAX_TURN = 0.8;

    // --- World ---
    G.WORLD_W = 1600;
    G.WORLD_H = 12000;
    G.CANYON_MIN_W = 280;
    G.CANYON_MAX_W = 700;
    G.SPAWN_X = G.WORLD_W / 2;
    G.SPAWN_Y = G.WORLD_H - 200;
    G.DOCK_Y = 150;

    // --- Dock ---
    G.DOCK_W = 140;
    G.DOCK_H = 100;
    G.DOCK_CX = G.WORLD_W / 2;
    G.DOCK_CY = G.DOCK_Y;

    // --- Object Types ---
    G.OBJ_TYPE = { MINE: 0, SHARK: 1, ENEMY_SUB: 2 };

    // --- Enemy Config (base values, overridden per-zone) ---
    G.SHARK_SPEED_BASE = 25;
    G.SHARK_TURN_INTERVAL = [2, 5];
    G.ESUB_PATROL_SPEED = 15;
    G.ESUB_INTERCEPT_SPEED_BASE = 67;
    G.ESUB_DETECT_RANGE = 800;
    G.ESUB_LISTEN_RANGE = 350;
    G.ESUB_LISTEN_DURATION_BASE = 9;
    G.ESUB_ENGINE_NOISE_THRESHOLD = 15;

    // --- Zone Y boundary helper ---
    G.zoneYBoundary = function (progress) {
        return G.SPAWN_Y - progress * (G.SPAWN_Y - G.DOCK_Y);
    };

    G.getZoneIndex = function (y) {
        var progress = 1 - (y - G.DOCK_Y) / (G.SPAWN_Y - G.DOCK_Y);
        if (progress < 0.25) return 0;
        if (progress < 0.50) return 1;
        if (progress < 0.75) return 2;
        return 3;
    };

    // Per-zone enemy sub behavior
    G.ZONE_ESUB_INTERCEPT_SPEED = [40, 55, 70, 75];
    G.ZONE_ESUB_LISTEN_DURATION = [4, 6, 10, 12];

    // Per-zone shark speed
    G.ZONE_SHARK_SPEED = [15, 25, 35, 25];
    G.ZONE_SHARK_TURN_MULT = [0.4, 1.0, 1.6, 1.0];

    // --- Collision Radii ---
    G.COLLISION_RADII = {
        player: 12,
        mine: 9,
        shark: 12,
        enemySub: 14,
    };

    // --- Torpedoes ---
    G.MAX_TORPEDOES = 3;
    G.TORPEDO_SPEED = 220;       // px/s
    G.TORPEDO_RANGE = 400;       // max distance before self-destruct
    G.TORPEDO_BLAST_RADIUS = 80;
    G.TORPEDO_VISUAL_DURATION = 0.8;
    G.TORPEDO_RECOIL = 25;       // speed reduction on fire
    G.TORPEDO_PING_INTERVAL = 0.15; // seconds between mini-pings
    G.TORPEDO_PING_RANGE = 200;     // mini-ping sonar range
    G.TORPEDO_PING_RAYS = 120;      // rays per mini-ping (fewer than player's 720)

    // --- Game States ---
    G.STATE = { TITLE: 0, PLAYING: 1, DEAD: 2, WIN: 3 };

    // --- Zones ---
    G.ZONES = ['OPEN WATERS', 'THE NARROWS', "DEVIL'S CORRIDOR", 'FREEDOM'];

    // --- Zone background tints (feel polish: subtle per-zone atmosphere) ---
    // These are used as the base background fill each frame
    G.ZONE_BG_COLORS = [
        '#0a0e18', // Open Waters: slightly blue-ish deep
        '#080c14', // The Narrows: standard dark
        '#060810', // Devil's Corridor: darker, more oppressive
        '#0c1018', // Freedom: slightly lighter, hint of dawn
    ];

    // --- Storage Keys ---
    G.TUTORIAL_PLAYED_KEY = 'subsonar_played';
})();

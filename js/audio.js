// audio.js -- Web Audio synthesis (ping, echo, proximity, death, win, engine, ambient, alarm, heartbeat)

(function () {
    var G = window.G;

    var audioCtx;
    var engineOsc, engineGain;
    var ambientNoise, ambientGain;
    var audioInitialized = false;
    var lastProxWarnTime = 0;

    // Heartbeat state (near-death low pulse)
    var heartbeatOsc = null;
    var heartbeatGain = null;
    var heartbeatActive = false;

    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function initAudio() {
        if (audioInitialized) return;
        ensureAudio();

        // Engine drone
        engineOsc = audioCtx.createOscillator();
        engineGain = audioCtx.createGain();
        engineOsc.type = 'triangle';
        engineOsc.frequency.value = 40;
        engineGain.gain.value = 0;
        engineOsc.connect(engineGain).connect(audioCtx.destination);
        engineOsc.start();

        // Ambient ocean noise (filtered white noise, very quiet)
        var bufSize = audioCtx.sampleRate * 2;
        var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) data[i] = (Math.random() - 0.5) * 2;
        ambientNoise = audioCtx.createBufferSource();
        ambientNoise.buffer = buf;
        ambientNoise.loop = true;
        ambientGain = audioCtx.createGain();
        ambientGain.gain.value = 0.012;
        var lpf = audioCtx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = 180;
        lpf.Q.value = 0.7;
        ambientNoise.connect(lpf).connect(ambientGain).connect(audioCtx.destination);
        ambientNoise.start();

        // Heartbeat oscillator (always running, gain controlled)
        heartbeatOsc = audioCtx.createOscillator();
        heartbeatGain = audioCtx.createGain();
        heartbeatOsc.type = 'sine';
        heartbeatOsc.frequency.value = 35;
        heartbeatGain.gain.value = 0;
        heartbeatOsc.connect(heartbeatGain).connect(audioCtx.destination);
        heartbeatOsc.start();

        audioInitialized = true;
    }

    function updateEngineAudio(speed, silentRunning, dockProximity) {
        if (!engineOsc || !audioCtx) return;
        var t = audioCtx.currentTime;
        var speedFrac = Math.abs(speed) / G.MAX_SPEED;
        var targetVol = silentRunning ? 0 : speedFrac * 0.03;
        var basePitch = 40 + speedFrac * 30;
        // Dock approach: engine pitch rises subtly as you get close
        if (dockProximity > 0) {
            basePitch += dockProximity * 15;
        }
        engineOsc.frequency.setTargetAtTime(basePitch, t, 0.1);
        engineGain.gain.setTargetAtTime(targetVol, t, 0.08);
    }

    // Immediately silence the engine — used on death so the drone cuts out
    // rather than asymptoting over ~0.5s via setTargetAtTime.
    function silenceEngine() {
        if (!engineGain || !audioCtx) return;
        var t = audioCtx.currentTime;
        engineGain.gain.cancelScheduledValues(t);
        engineGain.gain.setValueAtTime(0, t);
    }

    // Update heartbeat: intensity 0-1 based on how close a threat is
    function updateHeartbeat(intensity) {
        if (!heartbeatOsc || !audioCtx) return;
        var t = audioCtx.currentTime;
        if (intensity > 0) {
            // Pulsating effect via gain modulation at ~70 BPM
            var beat = Math.pow(Math.sin(t * Math.PI * 1.17), 8);
            var vol = intensity * 0.04 * beat;
            heartbeatGain.gain.setTargetAtTime(vol, t, 0.02);
            heartbeatOsc.frequency.setTargetAtTime(30 + intensity * 10, t, 0.05);
        } else {
            heartbeatGain.gain.setTargetAtTime(0, t, 0.1);
        }
    }

    function playPing() {
        ensureAudio();
        var t = audioCtx.currentTime;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.4);
        // Tiny ramp-up to avoid click/pop on oscillator start
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.15, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.6);
    }

    function playEcho(delay, intensity) {
        if (!audioCtx) return;
        var t = audioCtx.currentTime + delay;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.15);
        var vol = Math.min(0.06, intensity * 0.06);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
    }

    function playProximityBlip() {
        if (!audioCtx) return;
        var t = audioCtx.currentTime;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 200;
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
    }

    function playInterceptAlarm() {
        if (!audioCtx) return;
        var t = audioCtx.currentTime;
        for (var i = 0; i < 3; i++) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 280;
            var start = t + i * 0.12;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.025, start + 0.02);
            gain.gain.linearRampToValueAtTime(0, start + 0.08);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(start);
            osc.stop(start + 0.1);
        }
    }

    function playTorpedoBoom() {
        ensureAudio();
        var t = audioCtx.currentTime;
        // Low thud
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + 0.6);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.35, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.7);
        // Crackle
        var bufSize = audioCtx.sampleRate * 0.2;
        var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) d[i] = (Math.random() - 0.5) * 0.5;
        var noise = audioCtx.createBufferSource();
        noise.buffer = buf;
        var ng = audioCtx.createGain();
        ng.gain.setValueAtTime(0.2, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        noise.connect(ng).connect(audioCtx.destination);
        noise.start(t);
    }

    function playTorpedoLaunch() {
        ensureAudio();
        var t = audioCtx.currentTime;
        // Noise burst: short pressurized whoosh
        var bufSize = Math.floor(audioCtx.sampleRate * 0.08);
        var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) d[i] = (Math.random() - 0.5) * 0.6;
        var noise = audioCtx.createBufferSource();
        noise.buffer = buf;
        var noiseBpf = audioCtx.createBiquadFilter();
        noiseBpf.type = 'bandpass';
        noiseBpf.frequency.value = 600;
        noiseBpf.Q.value = 1.0;
        var noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.001, t);
        noiseGain.gain.linearRampToValueAtTime(0.18, t + 0.01);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        noise.connect(noiseBpf).connect(noiseGain).connect(audioCtx.destination);
        noise.start(t);
        // Low sine sweep: tube launch thump
        var osc = audioCtx.createOscillator();
        var oscGain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
        oscGain.gain.setValueAtTime(0.001, t);
        oscGain.gain.linearRampToValueAtTime(0.12, t + 0.015);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(oscGain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.35);
    }

    function checkProximityWarning(now, objects, player) {
        if (now - lastProxWarnTime < 3) return;
        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];
            if (!obj.alive) continue;
            var dx = player.x - obj.x, dy = player.y - obj.y;
            if (dx * dx + dy * dy < 150 * 150) {
                lastProxWarnTime = now;
                playProximityBlip();
                break;
            }
        }
    }

    function playDeathSound() {
        ensureAudio();
        var t = audioCtx.currentTime;

        // Kill ambient ocean noise
        if (ambientGain) ambientGain.gain.setTargetAtTime(0, t, 0.1);

        // Low rumble — longer sustain, slow decay
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + 2.0);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 2.5);

        // Initial crunch — noise burst
        var bufSize = Math.floor(audioCtx.sampleRate * 0.6);
        var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) data[i] = (Math.random() - 0.5) * 0.4;
        var noise = audioCtx.createBufferSource();
        noise.buffer = buf;
        var ng = audioCtx.createGain();
        ng.gain.setValueAtTime(0.001, t);
        ng.gain.linearRampToValueAtTime(0.2, t + 0.005);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        noise.connect(ng).connect(audioCtx.destination);
        noise.start(t);

        // Secondary groan — delayed, deeper, gives it weight
        var osc2 = audioCtx.createOscillator();
        var gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(45, t + 0.3);
        osc2.frequency.exponentialRampToValueAtTime(18, t + 2.5);
        gain2.gain.setValueAtTime(0, t);
        gain2.gain.linearRampToValueAtTime(0.12, t + 0.4);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
        osc2.connect(gain2).connect(audioCtx.destination);
        osc2.start(t + 0.3);
        osc2.stop(t + 2.5);
    }

    function playWinFanfare() {
        if (!audioCtx) return;
        var t = audioCtx.currentTime;
        var notes = [523, 659, 784, 1047];
        for (var i = 0; i < notes.length; i++) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = notes[i];
            gain.gain.setValueAtTime(0, t + i * 0.25);
            gain.gain.linearRampToValueAtTime(0.08, t + i * 0.25 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.25 + (i === 3 ? 1.2 : 0.6));
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t + i * 0.25);
            osc.stop(t + i * 0.25 + (i === 3 ? 1.2 : 0.6));
        }
    }

    function resetProxWarnTime() {
        lastProxWarnTime = 0;
        // Restore ambient ocean noise (muted on death)
        if (ambientGain && audioCtx) ambientGain.gain.setTargetAtTime(0.012, audioCtx.currentTime, 0.3);
    }

    function suspendAudio() {
        if (audioCtx) audioCtx.suspend();
    }

    function resumeAudio() {
        if (audioCtx) audioCtx.resume();
    }

    // Title screen radar blip — plays Soviet anthem notes with duration
    function playTitleBlip(freq, dur) {
        ensureAudio();
        if (!audioCtx) return;
        dur = dur || 0.3;
        var t = audioCtx.currentTime;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.05, t + 0.008);
        gain.gain.setValueAtTime(0.05, t + dur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    G.audio = {
        initAudio: initAudio,
        updateEngineAudio: updateEngineAudio,
        silenceEngine: silenceEngine,
        updateHeartbeat: updateHeartbeat,
        playPing: playPing,
        playEcho: playEcho,
        playProximityBlip: playProximityBlip,
        playInterceptAlarm: playInterceptAlarm,
        playTorpedoBoom: playTorpedoBoom,
        playTorpedoLaunch: playTorpedoLaunch,
        checkProximityWarning: checkProximityWarning,
        playDeathSound: playDeathSound,
        playWinFanfare: playWinFanfare,
        playTitleBlip: playTitleBlip,
        resetProxWarnTime: resetProxWarnTime,
        suspendAudio: suspendAudio,
        resumeAudio: resumeAudio,
    };
})();

/**
 * audio.js — Procedural Sound Design via Web Audio API
 * =====================================================
 * Every sound is synthesised in real-time — no external audio files.
 * Must be initialised on a user gesture (touch / click).
 */

export class AudioManager {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        this._initialised = false;

        // Persistent nodes
        this._engineGain = null;
        this._engineNoise = null;
        this._engineOsc = null;
        this._windGain = null;
        this._windNoise = null;
        this._fuelGain = null;
        this._fuelNoise = null;
        this._masterGain = null;

        // Countdown voice buffer cache
        this._countdownBuffers = {};
        this._preloadStarted = false;

        // Background Music (2.55m ambient track)
        this._bgmAudio = null;
        this._bgmLoaded = false;
        this._bgmPlaying = false;
        this._bgmShouldPlay = false;
        this._bgmVolume = 0.175; // Yarı yarıya kısıldı (0.35 -> 0.175)
        this._bgmFadeInterval = null;

        // Single Unified Countdown Audio ("3, 2, 1, Liftoff")
        this._singleCountdownBuffer = null;
        this.hasSingleCountdown = false;
    }

    /* ------------------------------------------------------------------ */
    /*  Initialise (MUST be called from a user gesture handler)            */
    /* ------------------------------------------------------------------ */
    init() {
        if (this._initialised) {
            this._initBGM();
            return;
        }
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._masterGain = this.ctx.createGain();
            this._masterGain.gain.value = 0.6;
            this._masterGain.connect(this.ctx.destination);
            this._initialised = true;
            this._preloadCountdownVoice();
            this._initBGM();
        } catch (e) {
            console.warn('Web Audio API not available:', e);
            this._initBGM();
        }
    }

    /**
     * Preload and decode NASA radio countdown voice clips into RAM
     */
    async _preloadCountdownVoice() {
        if (!this.ctx || this._preloadStarted) return;
        this._preloadStarted = true;

        // 1. Check for single unified countdown clip ("3, 2, 1, Liftoff" in one file)
        const singleCandidates = [
            '/static/audio/countdown.mp3',
            '/static/audio/countdown.wav',
            '/static/audio/countdown.ogg',
            '/static/audio/countdown_all.wav',
            '/static/audio/countdown_all.mp3',
            '/static/audio/liftoff.mp3',
            '/static/audio/liftoff.wav'
        ];

        for (const url of singleCandidates) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.ok) {
                    const fullRes = await fetch(url);
                    const arrayBuf = await fullRes.arrayBuffer();
                    this._singleCountdownBuffer = await this.ctx.decodeAudioData(arrayBuf);
                    this.hasSingleCountdown = true;
                    this.singleCountdownDuration = this._singleCountdownBuffer.duration;
                    console.log(`[AudioManager] Single unified countdown audio loaded: ${url} (${this.singleCountdownDuration.toFixed(2)}s)`);
                    break;
                }
            } catch (_) {
                // Not found or network error, silently continue
            }
        }

        // 2. Individual clips fallback
        const voiceClips = {
            '3': '/static/audio/voice_three.wav',
            '2': '/static/audio/voice_two.wav',
            '1': '/static/audio/voice_one.wav',
            'liftoff': '/static/audio/voice_liftoff.wav'
        };

        for (const [key, url] of Object.entries(voiceClips)) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const arrayBuf = await response.arrayBuffer();
                const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
                this._countdownBuffers[key] = audioBuf;
            } catch (err) {
                console.warn(`[AudioManager] Failed to load voice clip "${key}":`, err);
            }
        }
    }

    /* ================================================================== */
    /*  Background Music (BGM) Manager                                    */
    /* ================================================================== */
    _initBGM() {
        if (this._bgmAudio) return;
        this._bgmAudio = new Audio();
        this._bgmAudio.loop = true;
        this._bgmAudio.volume = 0;
        this._bgmAudio.preload = 'auto';

        const candidates = [
            '/static/audio/music_bg.mp3',
            '/static/audio/music_bg.wav',
            '/static/audio/music_bg.ogg',
            '/static/audio/bgm.mp3',
            '/static/audio/bgm.wav',
            '/static/audio/music.mp3',
            '/static/audio/music.wav',
            '/static/audio/soundtrack.mp3',
            '/static/audio/theme.mp3'
        ];

        this._bgmCandidates = candidates;
        this._bgmCandidateIndex = 0;
        this._tryLoadBGM();
    }

    _tryLoadBGM() {
        if (this._bgmCandidateIndex >= this._bgmCandidates.length) return;
        const url = this._bgmCandidates[this._bgmCandidateIndex];

        fetch(url, { method: 'HEAD' })
            .then(res => {
                if (res.ok) {
                    this._bgmAudio.src = url;
                    this._bgmLoaded = true;
                    console.log(`[AudioManager] Background music track loaded: ${url}`);
                    if (this._bgmShouldPlay) {
                        this.playBGM();
                    }
                } else {
                    this._bgmCandidateIndex++;
                    this._tryLoadBGM();
                }
            })
            .catch(() => {
                this._bgmCandidateIndex++;
                this._tryLoadBGM();
            });
    }

    /**
     * Start playing background music with gentle fade-in
     * @param {number} fadeDuration in seconds
     */
    playBGM(fadeDuration = 1.2) {
        this._bgmShouldPlay = true;
        if (!this._bgmAudio) this._initBGM();
        if (!this._bgmAudio || !this._bgmLoaded) return;

        clearInterval(this._bgmFadeInterval);
        this._bgmAudio.play().then(() => {
            this._bgmPlaying = true;
            this._fadeBGMVolume(this._bgmVolume, fadeDuration);
        }).catch(err => {
            // Autoplay policy prevented playback, will resume on user gesture
        });
    }

    /**
     * Pause background music with gentle fade-out (e.g. for cinematic prologue)
     * @param {number} fadeDuration in seconds
     */
    pauseBGM(fadeDuration = 0.5) {
        this._bgmShouldPlay = false;
        if (!this._bgmAudio || !this._bgmPlaying) return;

        this._fadeBGMVolume(0, fadeDuration, () => {
            if (this._bgmAudio) {
                this._bgmAudio.pause();
                this._bgmPlaying = false;
            }
        });
    }

    /**
     * Resume background music after cinematic sequence
     * @param {number} fadeDuration in seconds
     */
    resumeBGM(fadeDuration = 1.0) {
        this._bgmShouldPlay = true;
        if (!this._bgmAudio) this._initBGM();
        if (!this._bgmAudio || !this._bgmLoaded) return;

        clearInterval(this._bgmFadeInterval);
        this._bgmAudio.play().then(() => {
            this._bgmPlaying = true;
            this._fadeBGMVolume(this._bgmVolume, fadeDuration);
        }).catch(err => {
            // Deferred until gesture
        });
    }

    /**
     * Change BGM volume directly (e.g. from 0.0 to 1.0)
     * @param {number} vol
     */
    setBGMVolume(vol) {
        this._bgmVolume = Math.max(0, Math.min(1, vol));
        if (this._bgmAudio && this._bgmPlaying) {
            this._bgmAudio.volume = this._bgmVolume;
        }
    }

    _fadeBGMVolume(targetVol, durationSec, onComplete) {
        if (!this._bgmAudio) return;
        clearInterval(this._bgmFadeInterval);

        const startVol = this._bgmAudio.volume;
        const startTime = Date.now();
        const durationMs = durationSec * 1000;

        if (durationMs <= 0) {
            this._bgmAudio.volume = targetVol;
            if (onComplete) onComplete();
            return;
        }

        this._bgmFadeInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const current = startVol + (targetVol - startVol) * progress;
            if (this._bgmAudio) {
                this._bgmAudio.volume = Math.max(0, Math.min(1, current));
            }

            if (progress >= 1) {
                clearInterval(this._bgmFadeInterval);
                this._bgmFadeInterval = null;
                if (onComplete) onComplete();
            }
        }, 30);
    }

    /** Resume context if suspended (iOS requirement). */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    get ready() { return this._initialised; }

    /* ================================================================== */
    /*  ENGINE ROAR — continuous, gain-controlled                          */
    /* ================================================================== */
    startEngineRoar() {
        if (!this.ready) return;
        if (this._engineNoise) return; // already running

        // White noise source
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        // Bandpass filter for "roar" character
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 450;
        bp.Q.value = 0.8;

        // Sub-bass oscillator for rumble
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 42;

        const oscGain = this.ctx.createGain();
        oscGain.gain.value = 0.15;

        // Master gain for engine sound
        const gain = this.ctx.createGain();
        gain.gain.value = 0;

        noise.connect(bp).connect(gain);
        osc.connect(oscGain).connect(gain);
        gain.connect(this._masterGain);

        noise.start();
        osc.start();

        this._engineNoise = noise;
        this._engineOsc = osc;
        this._engineGain = gain;
        this._engineFilter = bp;
    }

    /** Set engine roar intensity (0 = silent, 1 = full). */
    setEngineIntensity(v) {
        if (!this._engineGain) return;
        this._engineGain.gain.linearRampToValueAtTime(
            Math.max(0, Math.min(1, v)) * 0.55,
            this.ctx.currentTime + 0.05
        );
    }

    stopEngineRoar() {
        if (this._engineNoise) {
            this._engineGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
            const n = this._engineNoise;
            const o = this._engineOsc;
            const g = this._engineGain;
            setTimeout(() => {
                try { n.stop(); } catch (_) { }
                try { o.stop(); } catch (_) { }
                try { g.disconnect(); } catch (_) { }
            }, 400);
            this._engineNoise = null;
            this._engineOsc = null;
            this._engineGain = null;
        }
    }

    /* ================================================================== */
    /*  WIND — continuous, speed-reactive                                  */
    /* ================================================================== */
    startWindLoop() {
        if (!this.ready || this._windNoise) return;

        const bufLen = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200;
        bp.Q.value = 0.6;

        const gain = this.ctx.createGain();
        gain.gain.value = 0;

        src.connect(bp).connect(gain).connect(this._masterGain);
        src.start();

        this._windNoise = src;
        this._windGain = gain;
        this._windFilter = bp;
    }

    /** Set wind intensity 0–1 and filter tone from the current airspeed. */
    setWindIntensity(v) {
        if (!this._windGain) return;
        const intensity = Math.max(0, Math.min(1, v));
        const now = this.ctx.currentTime;
        this._windGain.gain.linearRampToValueAtTime(
            intensity * 0.35,
            now + 0.08
        );
        if (this._windFilter) {
            this._windFilter.frequency.linearRampToValueAtTime(
                850 + intensity * 2500,
                now + 0.12
            );
        }
    }

    stopWindLoop() {
        if (this._windNoise) {
            this._windGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
            const s = this._windNoise;
            const g = this._windGain;
            setTimeout(() => {
                try { s.stop(); } catch (_) { }
                try { g.disconnect(); } catch (_) { }
            }, 600);
            this._windNoise = null;
            this._windGain = null;
        }
    }

    /* ================================================================== */
    /*  FUEL PUMP HISS                                                     */
    /* ================================================================== */
    startFuelPump() {
        if (!this.ready || this._fuelNoise) return;

        const bufLen = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2200;
        bp.Q.value = 2.0;

        // LFO for pumping character
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 3.5;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.06;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.12;

        lfo.connect(lfoGain).connect(gain.gain);
        src.connect(bp).connect(gain).connect(this._masterGain);
        lfo.start();
        src.start();

        this._fuelNoise = src;
        this._fuelGain = gain;
        this._fuelLfo = lfo;
    }

    stopFuelPump() {
        if (this._fuelNoise) {
            this._fuelGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
            const s = this._fuelNoise;
            const l = this._fuelLfo;
            const g = this._fuelGain;
            setTimeout(() => {
                try { s.stop(); } catch (_) { }
                try { l.stop(); } catch (_) { }
                try { g.disconnect(); } catch (_) { }
            }, 200);
            this._fuelNoise = null;
            this._fuelGain = null;
            this._fuelLfo = null;
        }
    }

    /* ================================================================== */
    /*  ONE-SHOT SOUNDS                                                    */
    /* ================================================================== */

    /** Countdown beep (880 Hz, final beep 1760 Hz). */
    playCountdownBeep(final = false) {
        this._playSine(final ? 1760 : 880, 0.12, 0.3);
    }

    /**
     * Play single unified countdown audio file (all 3-2-1-liftoff in one clip)
     */
    playSingleCountdown() {
        if (!this.ready || !this.ctx || !this._singleCountdownBuffer) return;
        this.resume();

        const src = this.ctx.createBufferSource();
        src.buffer = this._singleCountdownBuffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.95;
        src.connect(gain).connect(this._masterGain);
        src.start();
    }

    /**
     * Play NASA radio countdown voice clip ('3', '2', '1', 'liftoff').
     * Falls back to procedural beep if clip is loading.
     * @param {string|number} step
     */
    playVoiceCountdown(step) {
        if (!this.ready || !this.ctx) return;
        this.resume();

        const raw = String(step).toLowerCase();
        const key = (raw === '0' || raw === 'launch' || raw === 'launch!') ? 'liftoff' : raw;
        const buf = this._countdownBuffers[key];

        if (buf) {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;

            const gain = this.ctx.createGain();
            // Pristine, prominent mission control radio announcement level
            gain.gain.value = 0.95;

            src.connect(gain).connect(this._masterGain);
            src.start();
        } else {
            // Graceful fallback to sine beep if network delay occurs
            this.playCountdownBeep(key === 'liftoff');
        }
    }

    /** Ignition burst — noise sweep + sine sweep. */
    playIgnition() {
        if (!this.ready) return;

        const now = this.ctx.currentTime;

        // Reusable noise burst buffer (avoids audio thread allocation hitch)
        if (!this._ignitionBuf) {
            const bufLen = Math.floor(this.ctx.sampleRate * 0.6);
            this._ignitionBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
            const d = this._ignitionBuf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
        }

        const src = this.ctx.createBufferSource();
        src.buffer = this._ignitionBuf;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(4000, now);
        bp.frequency.exponentialRampToValueAtTime(200, now + 0.6);
        bp.Q.value = 1.2;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

        src.connect(bp).connect(gain).connect(this._masterGain);
        src.start(now);
        src.stop(now + 0.8);
    }

    /** Chute deployment pop. */
    playChutePopDrogue() { this._playPop(3000, 0.08, 0.25); }
    playChutePopMain() { this._playPop(2000, 0.12, 0.35); }

    /** Touchdown thud (sine sweep 200→40 Hz). */
    playTouchdown() {
        if (!this.ready) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.connect(gain).connect(this._masterGain);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    /** Explosion — layered noise bursts. */
    playExplosion() {
        if (!this.ready) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const offset = i * 0.12;
            const bufLen = this.ctx.sampleRate;
            const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let j = 0; j < bufLen; j++) d[j] = Math.random() * 2 - 1;

            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.45 - i * 0.1, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.6);
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 800 - i * 200;
            src.connect(lp).connect(gain).connect(this._masterGain);
            src.start(now + offset);
            src.stop(now + offset + 0.7);
        }
    }

    /** Success chime — C E G C arpeggio. */
    playSuccessChime() {
        if (!this.ready) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            this._playSine(freq, 0.25 + i * 0.18, 0.2);
        });
    }

    /** Warning beep — urgent square wave. */
    playWarningBeep() {
        if (!this.ready) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 600;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.setValueAtTime(0, now + 0.08);
        gain.gain.setValueAtTime(0.2, now + 0.16);
        gain.gain.setValueAtTime(0, now + 0.24);
        osc.connect(gain).connect(this._masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
    }

    /* ================================================================== */
    /*  Cinematic Audio Sequence                                          */
    /* ================================================================== */
    /** Radio comms squelch & subtle NASA Quindar tone */
    playRadioCommsIntro() {
        if (!this.ready) return;
        const now = this.ctx.currentTime;

        // 1. Radio mic click / squelch burst (bandpass filtered noise)
        this._playRadioBurst(0.12, 0.16);

        // 2. NASA Quindar tone (intro beep: 2525 Hz)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2525, now + 0.14);
        gain.gain.setValueAtTime(0.08, now + 0.14);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain).connect(this._masterGain);
        osc.start(now + 0.14);
        osc.stop(now + 0.40);
    }

    /** Telemetry data diagnostic beep (dual clean blip) */
    playTelemetryBeep(pitch = 1760) {
        if (!this.ready) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.setValueAtTime(pitch * 1.25, now + 0.05);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain).connect(this._masterGain);
        osc.start(now);
        osc.stop(now + 0.14);
    }

    /**
     * Typewriter / terminal keypress beep sound.
     * Crisp, high-tech terminal blip with subtle frequency variance.
     */
    playTypewriterBeep() {
            if (!this.ready) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        // 1. Dalga Formu: Klasik PC donanımı ve retro işlemci karakteri
        osc.type = 'square';

        // 2. Frekans Zarfı (Orta Frekanstan Basa Hızlı İniş):
        // ~500 Hz (dijital çip tınısı) başlar, 25 ms'de ~140 Hz'e (tok taban) çöker.
        const startFreq = 4180 + Math.random() * 60; // 480 - 540 Hz mikro varyasyon
        const endFreq = 3900 + Math.random() * 20;   // 130 - 150 Hz
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.025);

        // 3. Alçak Geçiren Filtre (Lowpass Filter):
        // Kare dalganın kulak tırmalayan tizlerini keser, tokluğu öne çıkarır.
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(16000, now); // 1.1 kHz tavanı
        filter.Q.setValueAtTime(25.0, now);          // Hafif rezonans (tıkırtıya metalik/dijital klik katar)

        // 4. Genlik Zarfı (Gain):
        // Kare dalga enerjik olduğu için patlama yapmaması adına kontrollü 35 ms sönüm
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

        // Bağlantı Zinciri: Osilatör -> Filtre -> Gain -> Master
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this._masterGain);

        osc.start(now);
        osc.stop(now + 0.035);
    }

    _playRadioBurst(duration = 0.12, volume = 0.15) {
        if (!this.ready) return;
        const now = this.ctx.currentTime;
        const bufLen = Math.floor(this.ctx.sampleRate * duration);
        const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < bufLen; j++) d[j] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2400;
        bp.Q.value = 2.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        src.connect(bp).connect(gain).connect(this._masterGain);
        src.start(now);
        src.stop(now + duration + 0.02);
    }

    /* ================================================================== */
    /*  Internal helpers                                                   */
    /* ================================================================== */
    _playSine(freq, startOffset, duration) {
        if (!this.ready) return;
        const now = this.ctx.currentTime + startOffset;
        const osc = this.ctx.createOscillator();
        osc.frequency.value = freq;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        osc.connect(gain).connect(this._masterGain);
        osc.start(now);
        osc.stop(now + duration);
    }

    _playPop(freq, duration, volume) {
        if (!this.ready) return;
        const now = this.ctx.currentTime;

        // Noise burst through resonant filter
        const bufLen = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < bufLen; j++) d[j] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = 3;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        src.connect(bp).connect(gain).connect(this._masterGain);
        src.start(now);
        src.stop(now + duration + 0.05);
    }

    /* ================================================================== */
    /*  Cleanup                                                            */
    /* ================================================================== */
    stopAll() {
        this.stopEngineRoar();
        this.stopWindLoop();
        this.stopFuelPump();
    }
}

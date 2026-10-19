/**
 * game.js — Main Game Engine & State Machine Orchestrator
 * ========================================================
 * Implements the 13-stage flight sequence of "Thrust The Rocket".
 * Integrates physics, camera, rendering, particles, procedural audio,
 * unified input, and DOM HUD/debrief overlays.
 *
 * Strictly adheres to the Production Plan Blueprint (v2.0).
 */

import { PHYSICS, createRocket, PhysicsEngine, calculateScore } from './physics.js?v=3.9';
import { Camera } from './camera.js?v=3.9';
import { Renderer } from './renderer.js?v=3.9';
import { ParticleSystem } from './particles.js?v=3.9';
import { AudioManager } from './audio.js?v=3.9';
import { InputManager } from './input.js?v=3.9';
import { UIManager } from './ui.js?v=3.9';
import { Rocket3D } from './rocket3d.js?v=3.9';

/* ====================================================================== */
/*  Game State Enum                                                       */
/* ====================================================================== */
export const STATE = {
    TITLE:            'TITLE',
    CINEMATIC:        'CINEMATIC',
    PAD_READY:        'PAD_READY',
    FUELING:          'FUELING',
    IGNITION:         'IGNITION',
    ASCENT:           'ASCENT',
    COASTING:         'COASTING',
    APOGEE_WAIT:      'APOGEE_WAIT',
    DROGUE_DEPLOYED:  'DROGUE_DEPLOYED',
    FREEFALL:         'FREEFALL',
    MAIN_READY:       'MAIN_READY',
    MAIN_DEPLOYED:    'MAIN_DEPLOYED',
    NO_CHUTE_DESCENT: 'NO_CHUTE_DESCENT',
    TOUCHDOWN:        'TOUCHDOWN',
    CRASH:            'CRASH',
    DEBRIEF:          'DEBRIEF',
};

/* ====================================================================== */
/*  ⏱️ 3-2-1 LIFTOFF GERİ SAYIM VE SENKRONİZASYON AYARLARI (Saniye)        */
/* ====================================================================== */
// Ses dosyanızdaki (countdown.mp3) kelimelerin başladığı saniyeler:
export const COUNTDOWN_TIMINGS = {
    THREE:   0.25,  // Ekranda "3" çıktığı ve sesin başladığı an
    TWO:     1.50,  // Ekranda "2" çıktığı ve sesin başladığı an
    ONE:     2.65,  // Ekranda "1" çıktığı ve sesin başladığı an
    LIFTOFF: 3.70,  // Ekranda "LIFTOFF!" çıktığı, motorun ateşlendiği an
    ASCENT:  4.55,  // Ses bittiğinde roketin rampadan göğe fırladığı an
};

/* ====================================================================== */
/*  Game Engine Class                                                     */
/* ====================================================================== */
class GameEngine {
    constructor() {
        /** @type {HTMLCanvasElement} */
        this.canvas = document.getElementById('gameCanvas');
        /** @type {CanvasRenderingContext2D} */
        this.ctx    = this.canvas.getContext('2d');

        // Subsystems
        this.camera    = new Camera(this.canvas);
        this.renderer  = new Renderer(this.canvas, this.ctx);
        this.particles = new ParticleSystem();
        this.audio     = new AudioManager();
        this.input     = new InputManager(this.canvas);
        this.physics   = new PhysicsEngine();
        this.bootLoader = document.getElementById('boot-loader');
        const isMobileScreen = window.matchMedia('(max-width: 768px)').matches;
        this.rocket3d = null;
        const loadRocketPreview = () => {
            this.rocket3d = new Rocket3D();
            this.rocket3d.mountPreview(document.getElementById('rocket-preview'));
        };

        loadRocketPreview();
        this.titleRevealFallback = setTimeout(() => this._revealTitle(), isMobileScreen ? 4000 : 3000);
        this.bootRevealFallback = setTimeout(() => this._hideBootLoader(), 6000);

        // UI Manager with callback wiring
        this.ui = new UIManager({
            onStart:         () => this.onStartMission(),
            onRetry:         () => this.onRetryMission(),
            onMenu:          () => this.onReturnToMenu(),
            onSubmitScore:   (name, data) => this.onSubmitScore(name, data),
            onLeaderboard:   () => this.ui.showLeaderboard(),
            onSkipCinematic: () => this.onSkipCinematic(),
        });

        // Game Simulation State
        this.state          = STATE.TITLE;
        this.rocket         = createRocket();
        this.engineOn       = false;
        this.chuteState     = 'none';   // 'none' | 'drogue' | 'main'
        this.apogee         = 0;
        this.chutePenalty   = 0;
        this.finalVy        = 0;
        this.finalX         = 0;
        this.lastScoreData  = null;

        // Timers & counters
        this.stateTimer     = 0;
        this.countdownStep  = 3;
        this.lastTime       = performance.now();

        // Window resize handler with DPR scaling
        this._initResize();

        // User gesture listener to activate Web Audio context
        this._initAudioUnlock();

        // Attempt background music immediately (will begin seamlessly on first user interaction if restricted by browser)
        this.audio.playBGM();

        // Start game loop
        requestAnimationFrame((t) => this._loop(t));
    }

    /* ------------------------------------------------------------------ */
    /*  Setup & Event Listeners                                           */
    /* ------------------------------------------------------------------ */
    _initResize() {
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const w   = window.innerWidth;
            const h   = window.innerHeight;

            this.canvas.width  = Math.floor(w * dpr);
            this.canvas.height = Math.floor(h * dpr);
            this.canvas.style.width  = w + 'px';
            this.canvas.style.height = h + 'px';

            // Scale drawing context so logical units match CSS pixels
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            this.camera.resize(w, h);
            this.renderer.resize(w, h);
        };

        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);
        resize();
    }

    _initAudioUnlock() {
        const unlock = () => {
            this.audio.init();
            this.audio.resume();
            if (this.state === STATE.TITLE) {
                this.audio.playBGM();
            }
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
        window.addEventListener('pointerdown', unlock, { passive: true });
        window.addEventListener('keydown', unlock, { passive: true });
    }

    /* ------------------------------------------------------------------ */
    /*  UI Callbacks                                                      */
    /* ------------------------------------------------------------------ */
    onStartMission() {
        this.audio.init();
        this.audio.resume();
        this.ui.hideTitle();
        this.transitionTo(STATE.CINEMATIC);
    }

    _revealTitle() {
        const titleScreen = document.getElementById('title-screen');
        if (!titleScreen) return;
        titleScreen.classList.remove('loading-model');
        clearTimeout(this.titleRevealFallback);
    }

    _hideBootLoader() {
        if (!this.bootLoader) return;
        this.bootLoader.classList.add('hidden');
        clearTimeout(this.bootRevealFallback);
    }

    onSkipCinematic() {
        if (this.state === STATE.CINEMATIC) {
            this.ui.cancelPrologue();
            this.ui.hideCinematic();
            this.transitionTo(STATE.PAD_READY);
        }
    }

    onRetryMission() {
        this.ui.hideDebrief();
        this.transitionTo(STATE.PAD_READY);
    }

    onReturnToMenu() {
        this.ui.hideDebrief();
        this.ui.hideHUD();
        this.ui.hideFuelBar();
        this.ui.hideActionPrompt();
        this.transitionTo(STATE.TITLE);
    }

    async onSubmitScore(name, data) {
        if (!data) data = this.lastScoreData;
        await this.ui.submitScore(name, data);
    }

    /* ------------------------------------------------------------------ */
    /*  State Machine Transitions                                         */
    /* ------------------------------------------------------------------ */
    transitionTo(nextState) {
        this.state = nextState;

        switch (nextState) {
            case STATE.TITLE:
                this.audio.playBGM();
                this.rocket       = createRocket();
                this.engineOn     = false;
                this.chuteState   = 'none';
                this.particles.clear();
                this.camera.setPadPreset();
                this.ui.showTitle();
                this.ui.hideHUD();
                this.ui.hideFuelBar();
                this.ui.hideActionPrompt();
                this.ui.hideCountdown();
                this.ui.hideCinematic();
                break;

            case STATE.CINEMATIC:
                this.audio.pauseBGM();
                this.rocket          = createRocket();
                this.engineOn        = false;
                this.chuteState      = 'none';
                this.particles.clear();
                this.physics.wind.reset();
                this._cinematicStage = 'PROLOGUE';
                this._cinematicPhase = 0;
                this.stateTimer      = 0;

                this.camera.startCinematic();
                this.ui.hideTitle();
                this.ui.hideDebrief();
                this.ui.hideHUD();
                this.ui.hideFuelBar();
                this.ui.hideActionPrompt();
                this.ui.hideCountdown();
                this.ui.showCinematic();

                // Start typewriter terminal sequence on pure black screen
                this.ui.startPrologueTypewriter(
                    () => this.audio.playTypewriterBeep(),
                    () => this._onPrologueFinished()
                );
                break;

            case STATE.PAD_READY:
                this.audio.resumeBGM();
                this.rocket       = createRocket();
                this.engineOn     = false;
                this.chuteState   = 'none';
                this.apogee       = 0;
                this.chutePenalty = 0;
                this.finalVy      = 0;
                this.finalX       = 0;
                this.particles.clear();
                this.physics.wind.reset();
                this.camera.setPadPreset();

                this.ui.hideTitle();
                this.ui.hideDebrief();
                this.ui.hideCinematic();
                this.ui.showHUD();
                this.ui.showFuelBar();
                this.ui.updateFuelBar(0);
                this.ui.showActionPrompt('HOLD TO TIME THE 10K LAUNCH');
                this.ui.updateHUD({
                    altitude: 0,
                    speed:    0,
                    stage:    'PAD READY',
                    wind:     0,
                    apogee:   0,
                });
                break;

            case STATE.FUELING:
                this.audio.startFuelPump();
                this.ui.showActionPrompt('TIME THE 10K MARKER · RELEASE TO LAUNCH');
                break;

            case STATE.IGNITION:
                this.audio.stopFuelPump();
                this.ui.hideFuelBar();
                this.ui.hideActionPrompt();
                this.ignitionElapsed = 0;
                this.countdownStep   = 4; // Henüz 3 gösterilmedi
                this.camera.setIgnitionPreset();
                if (this.audio.hasSingleCountdown) {
                    this.audio.playSingleCountdown();
                }
                break;

            case STATE.ASCENT:
                this.ui.hideCountdown();
                this.engineOn = true;
                this.camera.addShake(8, 1.2, 28);
                this.audio.startEngineRoar();
                this.audio.setEngineIntensity(1.0);
                break;

            case STATE.COASTING:
                this.engineOn = false;
                this.audio.stopEngineRoar();
                this.audio.startWindLoop();
                break;

            case STATE.APOGEE_WAIT:
                this.input.flush();
                this.engineOn    = false;
                this.apogee      = Math.max(this.apogee, this.rocket.y);
                this.stateTimer  = 3.0; // 3-second timing window
                this.camera.setApogeePreset(this.rocket.x, this.apogee);
                this.audio.playWarningBeep();
                this.ui.showActionPrompt('TAP TO DEPLOY DROGUE CHUTE! (EARLIER = STABLE DESCENT)', true);
                break;

            case STATE.DROGUE_DEPLOYED:
                this.chuteState = 'drogue';
                this.rocket.drogueDeploySpeed = Math.abs(this.rocket.vy);
                this.rocket.drogueTimer = 0;
                this.rocket.drogueInflation = 0;
                this.rocket.drogueOscillation = 0;
                this.audio.playChutePopDrogue();
                this.camera.addShake(8, 0.3);
                this.ui.hideActionPrompt();
                this.physics.wind.active = true;
                break;

            case STATE.FREEFALL:
                this.chuteState    = 'none';
                this.chutePenalty += 1500; // Degraded performance penalty
                this.physics.wind.active = true;
                this.ui.showActionPrompt('MISSED DROGUE! FREEFALL TUMBLE', true);
                break;

            case STATE.MAIN_READY:
                this.input.flush();
                this.stateTimer = 0.12; // Grace window so previous touches don't auto-deploy
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);
                this.audio.playWarningBeep();
                this.ui.showActionPrompt('TAP TO DEPLOY MAIN CHUTE! (EARLIER = SOFTER LANDING)', true);
                break;

            case STATE.MAIN_DEPLOYED:
                this.chuteState = 'main';
                this.rocket.chuteDeployAlt = this.rocket.y;
                this.rocket.chuteTimer = 0;
                this.rocket.chuteInflation = 0;
                this.rocket.chuteOscillation = 0;
                this.audio.playChutePopMain();
                this.camera.addShake(8, 0.3);
                this.ui.hideActionPrompt();
                break;

            case STATE.NO_CHUTE_DESCENT:
                this.chutePenalty += 2000;
                this.ui.showActionPrompt('TOO LATE! MAIN CHUTE FAILED', true);
                break;

            case STATE.TOUCHDOWN:
                this.finalVy = this.rocket.impactVy || Math.abs(this.rocket.vy);
                this.finalX  = this.rocket.x;
                this.audio.stopAll();
                this.audio.playTouchdown();
                this.physics.wind.active = false;
                this.camera.setLandingPreset(this.rocket.x, this.rocket.y);
                this.particles.emitDustCloud(this.rocket.x, 0, 1.2);

                if (this.finalVy <= PHYSICS.SAFE_LANDING_VY) {
                    // <= 15 ft/s: Başarılı İniş!
                    this.audio.playSuccessChime();
                    this.particles.emitConfetti(this.rocket.x, 0);
                    this.ui.showActionPrompt(`Başarılı İniş! Hız: ${this.finalVy.toFixed(1)} ft/s`, false);
                } else {
                    // 15 - 40 ft/s: Sert İniş (Hasarlı)!
                    this.particles.emitDebris(this.rocket.x, 0, 4);
                    this.particles.emitSparks(this.rocket.x, 0);
                    this.ui.showActionPrompt(`Sert İniş (Hasarlı)! Hız: ${this.finalVy.toFixed(1)} ft/s`, true);
                }
                this.stateTimer = 2.0;
                break;

            case STATE.CRASH:
                this.finalVy = this.rocket.impactVy || Math.abs(this.rocket.vy);
                this.finalX  = this.rocket.x;
                this.audio.stopAll();
                this.audio.playExplosion();
                this.physics.wind.active = false;
                this.camera.setCrashPreset(this.rocket.x, this.rocket.y);
                this.camera.addShake(16, 2.0, 40);
                this.particles.emitDustCloud(this.rocket.x, 0, 1.5);
                this.particles.emitDebris(this.rocket.x, 0);
                this.particles.emitSparks(this.rocket.x, 0);
                this.ui.showActionPrompt(`Kırım / Çakılma! Hız: ${this.finalVy.toFixed(1)} ft/s`, true);
                this.stateTimer = 2.0;
                break;

            case STATE.DEBRIEF:
                this.ui.hideActionPrompt();
                this.showDebriefReport();
                break;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Debrief Calculation                                               */
    /* ------------------------------------------------------------------ */
    showDebriefReport() {
        const isCrashed = (this.state === STATE.CRASH || (this.rocket.y <= 0 && this.finalVy > PHYSICS.HARD_LANDING_VY));
        const score = calculateScore(
            this.apogee,
            this.finalVy,
            Math.abs(this.finalX),
            this.chutePenalty,
            isCrashed
        );

        this.lastScoreData = {
            crashed:          isCrashed,
            apogee:           this.apogee,
            deviation:        this.apogee - PHYSICS.TARGET_ALTITUDE,
            altitudeScore:    score.altitudeScore,
            touchdownSpeed:   this.finalVy,
            touchdownScore:   score.touchdownScore,
            padOffset:        Math.abs(this.finalX),
            padScore:         score.padScore,
            chutePenalty:     score.chutePenalty,
            altitudeAccuracy: score.altitudeAccuracy,
            total:            score.total,
            stars:            score.stars,
            status:           score.status,
        };

        this.ui.showDebrief(this.lastScoreData);
    }

    /* ------------------------------------------------------------------ */
    /*  Main Update Loop                                                  */
    /* ------------------------------------------------------------------ */
    _update(dt) {
        this.input.update(dt);

        switch (this.state) {
            case STATE.TITLE:
                // Ambient title screen
                break;

            case STATE.CINEMATIC: {
                if (this._cinematicStage === 'PROLOGUE') {
                    // Holding camera at high drone vista while terminal text is typing
                    break;
                }

                this.stateTimer -= dt;
                const elapsed = 5.4 - this.stateTimer;
                const progress = Math.max(0, Math.min(1, elapsed / 5.4));

                // Advance smooth cinematic camera along drone trajectory
                this.camera.updateCinematic(progress);

                // Live simulated UTC time string
                const now = new Date();
                const ms = Math.floor(now.getMilliseconds() / 100);
                const utcStr = `UTC ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}.${ms}`;

                if (elapsed >= 1.9 && this._cinematicPhase === 0) {
                    this._cinematicPhase = 1;
                    this.audio.playTelemetryBeep(1760);
                    this._updateCinematicTelemetry(1, utcStr);
                } else if (elapsed >= 3.7 && this._cinematicPhase === 1) {
                    this._cinematicPhase = 2;
                    this.audio.playTelemetryBeep(2200);
                    this._updateCinematicTelemetry(2, utcStr);
                } else if (elapsed >= 5.0 && this._cinematicPhase === 2) {
                    this._cinematicPhase = 3;
                    this.ui.hideCinematic(); // Start smooth letterbox retraction right before handover
                } else {
                    this.ui.updateCinematicTelemetry(null, null, null, null, utcStr);
                }

                if (this.stateTimer <= 0) {
                    this.transitionTo(STATE.PAD_READY);
                }
                break;
            }

            case STATE.PAD_READY:
                this.fuelDirection = 1;
                if (this.input.isHolding) {
                    this.transitionTo(STATE.FUELING);
                }
                break;

            case STATE.FUELING:
                if (this.input.isDown) {
                    // İleri-Geri (Ping-Pong / Osilasyon) Hızlı Dolum Mekaniği:
                    this.fuelDirection = this.fuelDirection || 1;
                    this.rocket.fuel += this.fuelDirection * PHYSICS.FUEL_FILL_RATE * dt;

                    if (this.rocket.fuel >= PHYSICS.FUEL_MAX) {
                        this.rocket.fuel = PHYSICS.FUEL_MAX;
                        this.fuelDirection = -1; // 100'e vurunca geri dön
                    } else if (this.rocket.fuel <= 0) {
                        this.rocket.fuel = 0;
                        this.fuelDirection = 1; // 0'a vurunca tekrar ileri git
                    }

                    this.ui.updateFuelBar(this.rocket.fuel);
                    this.camera.addShake(1.2, 0.08, 40, false);
                }

                if (this.input.justReleased || !this.input.isDown) {
                    if (this.rocket.fuel < 5) {
                        // Çok erken bırakıldıysa yakıtı sıfırla
                        this.audio.stopFuelPump();
                        this.rocket.fuel = 0;
                        this.ui.updateFuelBar(0);
                        this.transitionTo(STATE.PAD_READY);
                    } else {
                        // Fırlatma onaylandı!
                        // Her atışa gerçekçi roket motoru ve atmosfer sapması (±%5 rastgele)
                        // Örn: 0.95 ile 1.05 arasında rastgele bir faktör
                        const randomVariance = (Math.random() * 0.10) - 0.05; // -0.05 ile +0.05
                        this.rocket.thrustFactor = 1.0 + randomVariance;
                        console.log(`[Launch Confirmed] Fuel: ${this.rocket.fuel.toFixed(1)}%, Motor Thrust Factor: ${this.rocket.thrustFactor.toFixed(3)} (Variance: ${(randomVariance * 100).toFixed(2)}%)`);
                        this.transitionTo(STATE.IGNITION);
                    }
                }
                break;

            case STATE.IGNITION:
                this.ignitionElapsed = (this.ignitionElapsed || 0) + dt;
                const t = this.ignitionElapsed;

                // 1. "3" Adımı
                if (t >= COUNTDOWN_TIMINGS.THREE && this.countdownStep > 3) {
                    this.countdownStep = 3;
                    this.ui.showCountdown(3);
                    if (!this.audio.hasSingleCountdown) {
                        this.audio.playVoiceCountdown(3);
                    }
                }
                // 2. "2" Adımı
                else if (t >= COUNTDOWN_TIMINGS.TWO && this.countdownStep > 2) {
                    this.countdownStep = 2;
                    this.ui.showCountdown(2);
                    if (!this.audio.hasSingleCountdown) {
                        this.audio.playVoiceCountdown(2);
                    }
                }
                // 3. "1" Adımı
                else if (t >= COUNTDOWN_TIMINGS.ONE && this.countdownStep > 1) {
                    this.countdownStep = 1;
                    this.ui.showCountdown(1);
                    if (!this.audio.hasSingleCountdown) {
                        this.audio.playVoiceCountdown(1);
                    }
                }
                // 4. "LIFTOFF!" Adımı (Motor ateşleme, toz ve sarsıntı)
                else if (t >= COUNTDOWN_TIMINGS.LIFTOFF && this.countdownStep > 0) {
                    this.countdownStep = 0;
                    this.ui.showCountdown('LIFTOFF!');
                    if (!this.audio.hasSingleCountdown) {
                        this.audio.playVoiceCountdown('liftoff');
                    }
                    this.audio.playIgnition();
                    this.particles.emitDustCloud(this.rocket.x, 0, 0.6);
                    this.camera.addShake(4, 0.8, 30);
                }

                // Liftoff anından rampadan ayrılış anına kadar motor alevi ve duman
                if (t >= COUNTDOWN_TIMINGS.LIFTOFF) {
                    this.particles.emitExhaust(this.rocket.x, this.rocket.y, this.rocket.angle, 0.6);
                    this.particles.emitSmoke(this.rocket.x, this.rocket.y);
                }

                // 5. Rampadan Havalanış (Ascent)
                if (t >= COUNTDOWN_TIMINGS.ASCENT) {
                    this.transitionTo(STATE.ASCENT);
                }
                break;

            case STATE.ASCENT:
                this.camera.setFollowPreset(this.rocket.x, this.rocket.y, this.rocket.vy);

                // Continuous burn VFX
                this.particles.emitExhaust(this.rocket.x, this.rocket.y, this.rocket.angle, 1.0);
                this.particles.emitSmoke(this.rocket.x, this.rocket.y);
                this.particles.emitSmokeTrail(this.rocket.x, this.rocket.y);

                if (Math.abs(this.rocket.vy) > 80) {
                    this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);
                }

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'STAGE 1: ASCENT',
                    wind:     0,
                    apogee:   this.rocket.y,
                });

                if (this.rocket.fuel <= 0) {
                    this.transitionTo(STATE.COASTING);
                }
                break;

            case STATE.COASTING:
                this.camera.setFollowPreset(this.rocket.x, this.rocket.y, this.rocket.vy);
                this.audio.setWindIntensity(Math.min(1, Math.abs(this.rocket.vy) / 350));

                this.particles.emitSmokeTrail(this.rocket.x, this.rocket.y);
                if (Math.abs(this.rocket.vy) > 80) {
                    this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);
                }

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'COASTING TO APOGEE',
                    wind:     0,
                    apogee:   this.rocket.y,
                });

                // Apogee reached when vertical velocity turns zero or negative
                if (this.rocket.vy <= 0) {
                    this.apogee = this.rocket.y;
                    this.transitionTo(STATE.APOGEE_WAIT);
                }
                break;

            case STATE.APOGEE_WAIT:
                this.camera.setApogeePreset(this.rocket.x, this.apogee);
                this.stateTimer -= dt;
                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'APOGEE REACHED',
                    wind:     0,
                    apogee:   this.apogee,
                });

                if (this.input.consumeTap()) {
                    this.transitionTo(STATE.DROGUE_DEPLOYED);
                } else if (this.stateTimer <= 0) {
                    this.transitionTo(STATE.FREEFALL);
                }
                break;

            case STATE.DROGUE_DEPLOYED:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);
                this.audio.setWindIntensity(Math.min(1, Math.abs(this.rocket.vy) / 250));

                if (Math.abs(this.rocket.vy) > 80) {
                    this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);
                }
                if (Math.abs(this.rocket.vy) > 150) {
                    this.particles.emitReentryGlow(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy));
                }

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'STAGE 2: DROGUE DESCENT',
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.rocket.y <= PHYSICS.MAIN_CHUTE_ALT) {
                    this.transitionTo(STATE.MAIN_READY);
                }
                break;

            case STATE.FREEFALL:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);
                this.audio.setWindIntensity(Math.min(1, Math.abs(this.rocket.vy) / 200));

                this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);
                if (Math.abs(this.rocket.vy) > 150) {
                    this.particles.emitReentryGlow(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy));
                }

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'WARNING: FREEFALL',
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.rocket.y <= PHYSICS.MAIN_CHUTE_ALT) {
                    this.transitionTo(STATE.MAIN_READY);
                }
                break;

            case STATE.MAIN_READY:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);
                this.audio.setWindIntensity(Math.min(1, Math.abs(this.rocket.vy) / 250));

                if (Math.abs(this.rocket.vy) > 80) {
                    this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);
                }

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    `ARMED (${Math.round(this.rocket.y)} FT)`,
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.stateTimer > 0) {
                    this.stateTimer -= dt;
                    this.input.flush();
                } else {
                    if (this.input.consumeTap()) {
                        this.transitionTo(STATE.MAIN_DEPLOYED);
                    } else if (this.rocket.y <= 100) {
                        // Altitude too low to deploy main canopy
                        this.transitionTo(STATE.NO_CHUTE_DESCENT);
                    }
                }
                break;

            case STATE.MAIN_DEPLOYED:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);
                this.audio.setWindIntensity(Math.min(0.4, Math.abs(this.rocket.vy) / 250));

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'STAGE 3: FINAL APPROACH',
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.rocket.y <= 0) {
                    const impactSpeed = this.rocket.impactVy || Math.abs(this.rocket.vy);
                    const safeAngle = Math.abs(this.rocket.angle * 180 / Math.PI) <= PHYSICS.SAFE_LANDING_ANGLE;

                    // Yere Temas Kontrolü:
                    // <= 40 ft/s ve dengeli açı: TOUCHDOWN (<= 15 Başarılı, 15-40 Sert İniş Hasarlı)
                    // > 40 ft/s veya takla açısı: CRASH (Kırım / Çakılma)
                    if (impactSpeed <= PHYSICS.HARD_LANDING_VY && safeAngle) {
                        this.transitionTo(STATE.TOUCHDOWN);
                    } else {
                        this.transitionTo(STATE.CRASH);
                    }
                }
                break;

            case STATE.NO_CHUTE_DESCENT:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);
                this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'FATAL DIVE',
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.rocket.y <= 0) {
                    this.transitionTo(STATE.CRASH);
                }
                break;

            case STATE.TOUCHDOWN:
            case STATE.CRASH:
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    this.transitionTo(STATE.DEBRIEF);
                }
                break;

            case STATE.DEBRIEF:
                // Waiting for user action
                break;
        }

        // Run physics integration (if in flight)
        if (this.state !== STATE.TITLE &&
            this.state !== STATE.CINEMATIC &&
            this.state !== STATE.PAD_READY &&
            this.state !== STATE.FUELING &&
            this.state !== STATE.IGNITION &&
            this.state !== STATE.TOUCHDOWN &&
            this.state !== STATE.CRASH &&
            this.state !== STATE.DEBRIEF) {

            this.physics.update(this.rocket, dt, this.engineOn, this.chuteState);
            this.apogee = Math.max(this.apogee, this.rocket.y);
        }

        // Render the menu preview separately from the in-game rocket pose.
        if (this.rocket3d && this.state === STATE.TITLE) {
            this.rocket3d.updateMenuPreview(dt);
            if (this.rocket3d.isReady || this.rocket3d.loadFailed) {
                this._revealTitle();
            }
        } else if (this.rocket3d) {
            this.rocket3d.updateAndRender(this.rocket.angle, dt, this.engineOn, this.rocket.vy);
        }

        const modelReady = this.rocket3d && (this.rocket3d.isReady || this.rocket3d.loadFailed);
        if (modelReady && this.renderer.areVegetationAssetsReady()) {
            this._hideBootLoader();
        }

        // Update camera (skip during cinematic as updateCinematic handles exact trajectory)
        if (this.state !== STATE.CINEMATIC) {
            this.camera.update(dt);
        }
        this.particles.update(dt);

        this.input.lateUpdate();
    }

    _onPrologueFinished() {
        if (this.state !== STATE.CINEMATIC) return;
        this._cinematicStage = 'DRONE';
        this.stateTimer = 5.4;
        this._cinematicPhase = 0;

        // Smoothly fade out the black screen revealing the desert and drone shot
        this.ui.fadeOutPrologue();

        // Radio squelch comms burst & Quindar tone
        this.audio.playRadioCommsIntro();
        this._updateCinematicTelemetry(0);
    }

    _updateCinematicTelemetry(phase, timeStr) {
        if (phase === 0) {
            this.ui.updateCinematicTelemetry(
                'FACILITY OVERVIEW',
                'IREC LAUNCH COMPLEX',
                'CHIHUAHUAN DESERT · TEXAS FLIGHT RANGE',
                'LAT 31.0299°N · LON 103.5403°W · ELEV 2,850 FT',
                timeStr
            );
        } else if (phase === 1) {
            this.ui.updateCinematicTelemetry(
                'VEHICLE DIAGNOSTICS',
                'TURKISH AEROSPACE · VEGA-1',
                'STAGE 1 SOLID PROPELLANT MOTOR',
                'AVIONICS: NOMINAL · GUIDANCE: LOCKED · TARGET: 10,000 FT',
                timeStr
            );
        } else if (phase === 2) {
            this.ui.updateCinematicTelemetry(
                'RANGE CLEARANCE',
                'FLIGHT DECK CLEAR',
                'UMBILICAL TOWER POWER NOMINAL',
                'HANDING OVER CONTROL TO LAUNCH OFFICER...',
                timeStr
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Main Render Loop                                                  */
    /* ------------------------------------------------------------------ */
    _render() {
        this.renderer.clear();

        // 1. Sky & atmosphere
        this.renderer.drawSky(this.camera);

        // 2. Desert ground floor & landing pad (with realistic vegetation and horizon)
        this.renderer.drawGround(this.camera, this.state === STATE.TITLE);
        if (this.state !== STATE.TITLE) {
            this.renderer.drawFieldOperations(this.camera, this.state, this.rocket);
            this.renderer.drawLandingPad(this.camera);
        }

        // 4. Altitude lines & target markers
        this.renderer.drawAltitudeMarkers(this.camera, this.rocket.y);

        // 5. Rocket & parachutes (3D PBR Model with 2D fallback)
        if (this.state !== STATE.TITLE && this.state !== STATE.CRASH) {
            this.renderer.drawRocket(this.rocket, this.camera, this.engineOn, this.chuteState, this.rocket3d);
        }

        // 6. World-space particles & VFX
        this.particles.render(this.ctx, this.camera);

        // 7. Cinematic VFX (Anamorphic lens flare & atmospheric sun glint)
        if (this.state === STATE.CINEMATIC) {
            const progress = Math.max(0, Math.min(1, (5.4 - this.stateTimer) / 5.4));
            this.renderer.drawCinematicVFX(this.camera, progress);
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Animation Loop Frame                                              */
    /* ------------------------------------------------------------------ */
    _loop(now) {
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Cap dt to prevent physics explosions after tab-switching (Plan §15)
        dt = Math.min(dt, 1 / 30);

        this._update(dt);
        this._render();

        requestAnimationFrame((t) => this._loop(t));
    }
}

/* ====================================================================== */
/*  Entry Point                                                           */
/* ====================================================================== */
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new GameEngine();
});

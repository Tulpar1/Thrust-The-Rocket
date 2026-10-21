/**
 * game.js — Main Game Engine & State Machine Orchestrator
 * ========================================================
 * Implements the responsive flight sequence of "Thrust The Rocket".
 * Integrates realistic kinematics, canopy steering, sweet-spot courage
 * mechanics, manual recovery fallback, and scoring precision.
 */

import { PHYSICS, createRocket, PhysicsEngine, calculateScore } from './physics.js?v=4.0';
import { Camera } from './camera.js?v=4.0';
import { Renderer } from './renderer.js?v=4.0';
import { ParticleSystem } from './particles.js?v=4.0';
import { AudioManager } from './audio.js?v=4.0';
import { InputManager } from './input.js?v=4.0';
import { UIManager } from './ui.js?v=4.0';
import { Rocket3D } from './rocket3d.js?v=4.0';

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

export const COUNTDOWN_TIMINGS = {
    THREE:   0.25,
    TWO:     1.50,
    ONE:     2.65,
    LIFTOFF: 3.70,
    ASCENT:  4.55,
};

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

        this.ui = new UIManager({
            onStart:         () => this.onStartMission(),
            onRetry:         () => this.onRetryMission(),
            onMenu:          () => this.onReturnToMenu(),
            onSubmitScore:   (name, data) => this.onSubmitScore(name, data),
            onLeaderboard:   () => this.ui.showLeaderboard(),
            onSkipCinematic: () => this.onSkipCinematic(),
        });

        this.state          = STATE.TITLE;
        this.rocket         = createRocket();
        this.engineOn       = false;
        this.chuteState     = 'none';
        this.apogee         = 0;
        this.chutePenalty   = 0;
        this.finalVy        = 0;
        this.finalX         = 0;
        this.failureType    = 'NONE';
        this.lastScoreData  = null;

        this.stateTimer     = 0;
        this.countdownStep  = 3;
        this.lastTime       = performance.now();

        this._initResize();
        this._initAudioUnlock();
        this.audio.playBGM();

        requestAnimationFrame((t) => this._loop(t));
    }

    _initResize() {
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const w   = window.innerWidth;
            const h   = window.innerHeight;

            this.canvas.width  = Math.floor(w * dpr);
            this.canvas.height = Math.floor(h * dpr);
            this.canvas.style.width  = w + 'px';
            this.canvas.style.height = h + 'px';

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

    transitionTo(nextState) {
        this.state = nextState;

        switch (nextState) {
            case STATE.TITLE:
                this.audio.playBGM();
                this.rocket       = createRocket();
                this.engineOn     = false;
                this.chuteState   = 'none';
                this.failureType  = 'NONE';
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
                this.failureType     = 'NONE';
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
                this.failureType  = 'NONE';
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
                this.countdownStep   = 4;
                this.camera.setIgnitionPreset();
                if (this.audio.hasSingleCountdown) {
                    this.audio.playSingleCountdown();
                }
                break;

            case STATE.ASCENT:
                this.ui.hideCountdown();
                this.engineOn = true;
                if (this.failureType === 'FIN_FLUTTER') {
                    this.ui.showActionPrompt('FIN FLUTTER DETECTED · ATTITUDE UNSTABLE', true);
                }
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
                this.stateTimer  = 3.2;
                this.camera.setApogeePreset(this.rocket.x, this.apogee);
                if (this.rocket.avionicsFailed) {
                    this.ui.hideActionPrompt();
                } else {
                    this.audio.playWarningBeep();
                    this.ui.showActionPrompt('TAP TO DEPLOY DROGUE CHUTE!', true);
                }
                break;

            case STATE.DROGUE_DEPLOYED:
                this.chuteState = 'drogue';
                this.rocket.drogueDeploySpeed = Math.abs(this.rocket.vy);
                this.rocket.drogueTimer = 0;
                this.rocket.drogueInflation = 0;
                this.rocket.drogueOscillation = 0;
                this.audio.playChutePopDrogue();
                this.camera.addShake(8, 0.3);
                this.physics.wind.active = true;
                this.ui.hideActionPrompt();
                break;

            case STATE.FREEFALL:
                this.chuteState    = 'none';
                this.chutePenalty += 1500;
                this.physics.wind.active = true;
                this.ui.showActionPrompt('MISSED DROGUE! RAPID TUMBLE DIVE', true);
                break;

            case STATE.MAIN_READY:
                this.input.flush();
                this.stateTimer = 0.10;
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);
                if (this.rocket.avionicsFailed) {
                    this.ui.hideActionPrompt();
                } else {
                    this.audio.playWarningBeep();
                    this.ui.showActionPrompt('TAP TO DEPLOY MAIN CHUTE!', true);
                }
                break;

            case STATE.MAIN_DEPLOYED:
                this.chuteState = 'main';
                this.rocket.chuteDeployAlt = this.rocket.y;
                this.rocket.chuteTimer = 0;
                this.rocket.chuteInflation = 0;
                this.rocket.chuteOscillation = 0;
                this.audio.playChutePopMain();
                this.camera.addShake(10, 0.35);
                this.ui.hideActionPrompt();
                break;

            case STATE.NO_CHUTE_DESCENT:
                this.chutePenalty += 2000;
                this.ui.showActionPrompt('TOO LATE! MAIN CHUTE FAILED TO OPEN', true);
                break;

            case STATE.TOUCHDOWN:
                this.finalVy = this.rocket.impactVy || Math.abs(this.rocket.vy);
                this.finalX  = this.rocket.x;
                const touchdownTargetX = this.rocket.targetPadX || this.rocket.randomPadX || 0;
                const touchdownOffset = Math.abs(this.finalX - touchdownTargetX);
                this.audio.stopAll();
                this.audio.playTouchdown();
                this.physics.wind.active = false;
                this.camera.setLandingPreset(this.rocket.x, this.rocket.y);
                this.particles.emitDustCloud(this.rocket.x, 0, 1.2);

                if (this.finalVy <= PHYSICS.SAFE_LANDING_VY) {
                    this.audio.playSuccessChime();
                    this.particles.emitConfetti(this.rocket.x, 0);
                    this.ui.showActionPrompt(`Kusursuz İniş! Hız: ${this.finalVy.toFixed(1)} ft/s · Hedef Sapması: ${touchdownOffset.toFixed(0)} ft`, false);
                } else {
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

    showDebriefReport() {
        const isCrashed = (this.state === STATE.CRASH || (this.rocket.y <= 0 && this.finalVy > PHYSICS.HARD_LANDING_VY));
        const targetX = this.rocket.targetPadX || this.rocket.randomPadX || 0;
        const score = calculateScore(
            this.apogee,
            this.finalVy,
            0,
            this.chutePenalty,
            isCrashed,
            this.finalX,
            this.rocket.chuteDeployAlt,
            this.rocket.avionicsFailed,
            targetX
        );

        this.lastScoreData = {
            crashed:          isCrashed,
            apogee:           this.apogee,
            deviation:        this.apogee - PHYSICS.TARGET_ALTITUDE,
            altitudeScore:    score.altitudeScore,
            touchdownSpeed:   this.finalVy,
            touchdownScore:   score.touchdownScore,
            targetOffsetScore: score.targetOffsetScore,
            courageBonus:     score.courageBonus,
            manualHeroBonus:  score.manualHeroBonus,
            distanceFromTarget: Math.abs(this.finalX - targetX),
            targetOffset:      Math.abs(this.finalX - targetX),
            chuteDeployAlt:   this.rocket.chuteDeployAlt || 0,
            damageAmount:     score.damageAmount,
            damagePenalty:    score.damagePenalty,
            failureType:      this.failureType,
            chutePenalty:     score.chutePenalty,
            altitudeAccuracy: score.altitudeAccuracy,
            total:            score.total,
            stars:            score.stars,
            status:           score.status,
            targetX:           targetX,
        };

        this.ui.showDebrief(this.lastScoreData);
    }

    _update(dt) {
        this.input.update(dt);
        // Kullanıcı yönlendirmesini doğrudan rokete aktar
        this.rocket.steerInput = this.input.steerInput;

        switch (this.state) {
            case STATE.TITLE:
                break;

            case STATE.CINEMATIC: {
                if (this._cinematicStage === 'PROLOGUE') break;

                this.stateTimer -= dt;
                const elapsed = 5.4 - this.stateTimer;
                const progress = Math.max(0, Math.min(1, elapsed / 5.4));

                this.camera.updateCinematic(progress);
                this.ui.updateCinematicView(progress);

                if (elapsed >= 5.0 && this._cinematicPhase === 0) {
                    this._cinematicPhase = 1;
                    this.ui.hideCinematic();
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
                    this.fuelDirection = this.fuelDirection || 1;
                    this.rocket.fuel += this.fuelDirection * PHYSICS.FUEL_FILL_RATE * dt;

                    if (this.rocket.fuel >= PHYSICS.FUEL_MAX) {
                        this.rocket.fuel = PHYSICS.FUEL_MAX;
                        this.fuelDirection = -1;
                    } else if (this.rocket.fuel <= 0) {
                        this.rocket.fuel = 0;
                        this.fuelDirection = 1;
                    }

                    this.ui.updateFuelBar(this.rocket.fuel);
                    this.camera.addShake(1.2, 0.08, 40, false);
                }

                if (this.input.justReleased || !this.input.isDown) {
                    if (this.rocket.fuel < 5) {
                        this.audio.stopFuelPump();
                        this.rocket.fuel = 0;
                        this.ui.updateFuelBar(0);
                        this.transitionTo(STATE.PAD_READY);
                    } else {
                        const randomVariance = (Math.random() * 0.10) - 0.05;
                        this.rocket.thrustFactor = 1.0 + randomVariance;
                        const failureRoll = Math.random();
                        this.failureType = failureRoll < 0.10 ? 'AVIONICS' : failureRoll < 0.20 ? 'FIN_FLUTTER' : 'NONE';
                        this.rocket.failureType = this.failureType;
                        this.rocket.avionicsFailed = this.failureType === 'AVIONICS';
                        this.rocket.flutterActive = this.failureType === 'FIN_FLUTTER';
                        this.rocket.telemetryLost = this.rocket.avionicsFailed;
                        if (this.rocket.telemetryLost) this.ui.setTelemetryLost();
                        this.transitionTo(STATE.IGNITION);
                    }
                }
                break;

            case STATE.IGNITION:
                this.ignitionElapsed = (this.ignitionElapsed || 0) + dt;
                const t = this.ignitionElapsed;

                if (t >= COUNTDOWN_TIMINGS.THREE && this.countdownStep > 3) {
                    this.countdownStep = 3;
                    this.ui.showCountdown(3);
                    if (!this.audio.hasSingleCountdown) this.audio.playVoiceCountdown(3);
                } else if (t >= COUNTDOWN_TIMINGS.TWO && this.countdownStep > 2) {
                    this.countdownStep = 2;
                    this.ui.showCountdown(2);
                    if (!this.audio.hasSingleCountdown) this.audio.playVoiceCountdown(2);
                } else if (t >= COUNTDOWN_TIMINGS.ONE && this.countdownStep > 1) {
                    this.countdownStep = 1;
                    this.ui.showCountdown(1);
                    if (!this.audio.hasSingleCountdown) this.audio.playVoiceCountdown(1);
                } else if (t >= COUNTDOWN_TIMINGS.LIFTOFF && this.countdownStep > 0) {
                    this.countdownStep = 0;
                    this.ui.showCountdown('LIFTOFF!');
                    if (!this.audio.hasSingleCountdown) this.audio.playVoiceCountdown('liftoff');
                    this.audio.playIgnition();
                    this.particles.emitDustCloud(this.rocket.x, 0, 0.6);
                    this.camera.addShake(4, 0.8, 30);
                }

                if (t >= COUNTDOWN_TIMINGS.LIFTOFF) {
                    this.particles.emitExhaust(this.rocket.x, this.rocket.y, this.rocket.angle, 0.6);
                    this.particles.emitSmoke(this.rocket.x, this.rocket.y);
                }

                if (t >= COUNTDOWN_TIMINGS.ASCENT) {
                    this.transitionTo(STATE.ASCENT);
                }
                break;

            case STATE.ASCENT:
                this.camera.setFollowPreset(this.rocket.x, this.rocket.y, this.rocket.vy);

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

                // Aviyonik çökse bile oyuncu manuel basabilir!
                if (this.input.consumeTap()) {
                    this.transitionTo(STATE.DROGUE_DEPLOYED);
                } else if (this.stateTimer <= 0) {
                    this.transitionTo(STATE.FREEFALL);
                }
                break;

            case STATE.DROGUE_DEPLOYED:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);

                if (Math.abs(this.rocket.vy) > 80) {
                    this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);
                }

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'STAGE 2: DROGUE DESCENT',
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.rocket.y <= PHYSICS.MAIN_CHUTE_ARM_ALT) {
                    this.transitionTo(STATE.MAIN_READY);
                }
                break;

            case STATE.FREEFALL:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);

                this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    'WARNING: FREEFALL',
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.rocket.y <= PHYSICS.MAIN_CHUTE_ARM_ALT) {
                    this.transitionTo(STATE.MAIN_READY);
                }
                break;

            case STATE.MAIN_READY:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);

                if (Math.abs(this.rocket.vy) > 80) {
                    this.particles.emitWindStreaks(this.rocket.x, this.rocket.y, Math.abs(this.rocket.vy), this.rocket.vy);
                }

                // Dinamik HUD uyarısı: Tatlı noktada olduğunu oyuncuya renkli hissettir
                const inSweetSpot = this.rocket.y >= PHYSICS.SWEET_SPOT_MIN && this.rocket.y <= PHYSICS.SWEET_SPOT_MAX;
                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    inSweetSpot ? '★ SWEET SPOT ACTIVE ★' : `ARMED (${Math.round(this.rocket.y)} FT)`,
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.stateTimer > 0) {
                    this.stateTimer -= dt;
                    this.input.flush();
                } else {
                    if (this.input.consumeTap()) {
                        this.transitionTo(STATE.MAIN_DEPLOYED);
                    } else if (this.rocket.y <= 120) {
                        this.transitionTo(STATE.NO_CHUTE_DESCENT);
                    }
                }
                break;

            case STATE.MAIN_DEPLOYED:
                this.camera.setDescentPreset(this.rocket.x, this.rocket.y);

                this.ui.updateHUD({
                    altitude: this.rocket.y,
                    speed:    this.rocket.vy,
                    stage:    `STAGE 3: FINAL (TARGET: ${Math.abs(this.rocket.x - (this.rocket.targetPadX || this.rocket.randomPadX || 0)).toFixed(0)} FT)`,
                    wind:     this.physics.wind.currentForce,
                    apogee:   this.apogee,
                });

                if (this.rocket.y <= 0) {
                    const impactSpeed = this.rocket.impactVy || Math.abs(this.rocket.vy);
                    const safeAngle = Math.abs(this.rocket.angle * 180 / Math.PI) <= PHYSICS.SAFE_LANDING_ANGLE;

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
                break;
        }

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
            if (this.state !== STATE.ASCENT && this.state !== STATE.IGNITION) {
                const airspeed = Math.hypot(this.rocket.vx, this.rocket.vy);
                const chuteFactor = this.chuteState === 'main' ? 1.12 : 1;
                const windIntensity = Math.min(1, Math.pow((airspeed * chuteFactor) / 350, 0.72));
                this.audio.setWindIntensity(windIntensity);
            }
        }

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

        if (this.state !== STATE.CINEMATIC) {
            this.camera.update(dt);
        }
        this.particles.update(dt);
        this.input.lateUpdate();
    }

    _onPrologueFinished() {
        if (this.state !== STATE.CINEMATIC) return;
        this._cinematicStage = 'OPTICAL_SCOPE';
        this.stateTimer = 5.4;
        this._cinematicPhase = 0;
        this.ui.fadeOutPrologue();
    }

    _render() {
        this.renderer.clear();
        this.renderer.drawSky(this.camera);

        this.renderer.drawGround(this.camera, this.state === STATE.TITLE);
        if (this.state !== STATE.TITLE) {
            this.renderer.drawFieldOperations(this.camera, this.state, this.rocket);
            this.renderer.drawLandingPad(this.camera);
        }

        this.renderer.drawAltitudeMarkers(this.camera, this.rocket.y);

        if (this.state !== STATE.TITLE && this.state !== STATE.CRASH) {
            this.renderer.drawRocket(this.rocket, this.camera, this.engineOn, this.chuteState, this.rocket3d);
        }

        this.particles.render(this.ctx, this.camera);

        // 7. SpaceX Landing Target & Waypoint HUD
        if (this.state !== STATE.TITLE && this.state !== STATE.CINEMATIC) {
            this._drawLandingTargetHUD();
        }

        if (this.state === STATE.CINEMATIC) {
            const progress = Math.max(0, Math.min(1, (5.4 - this.stateTimer) / 5.4));
            this.renderer.drawCinematicVFX(this.camera, progress);
        }
    }

    /**
     * Yerdeki SpaceX İniş Platformunu (Landing Zone) ve 
     * havadayken hedefi gösteren dinamik kılavuz oku (Waypoint) çizer.
     */
    _drawLandingTargetHUD() {
        const ctx = this.ctx;
        const targetX = this.rocket.targetPadX || this.rocket.randomPadX || 0;
        const dx = targetX - this.rocket.x;
        const absDx = Math.abs(dx);
        const isAligned = absDx <= 25;

        ctx.save();

        if (this.camera.worldToScreen) {
            const padScreen = this.camera.worldToScreen(targetX, 0);
            const w = this.camera.screenW || window.innerWidth;
            const h = this.camera.screenH || window.innerHeight;

            if (padScreen.y >= 0 && padScreen.y <= h + 40) {
                const padHalfWidth = 35 * (this.camera.zoom || 1);
                
                ctx.strokeStyle = isAligned ? '#00ff88' : '#ff9900';
                ctx.fillStyle = isAligned ? 'rgba(0, 255, 136, 0.22)' : 'rgba(255, 153, 0, 0.18)';
                ctx.lineWidth = 3;

                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(padScreen.x - padHalfWidth, padScreen.y - 6, padHalfWidth * 2, 12, 4);
                } else {
                    ctx.rect(padScreen.x - padHalfWidth, padScreen.y - 6, padHalfWidth * 2, 12);
                }
                ctx.fill();
                ctx.stroke();

                const beamGrad = ctx.createLinearGradient(0, padScreen.y - 180, 0, padScreen.y);
                beamGrad.addColorStop(0, 'rgba(0, 255, 136, 0)');
                beamGrad.addColorStop(1, isAligned ? 'rgba(0, 255, 136, 0.35)' : 'rgba(255, 153, 0, 0.25)');
                ctx.fillStyle = beamGrad;
                ctx.fillRect(padScreen.x - padHalfWidth * 0.7, padScreen.y - 180, padHalfWidth * 1.4, 180);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('🎯 TARGET', padScreen.x, padScreen.y + 22);
            }

            if (this.rocket.y > 80) {
                const margin = 75;
                const clampedX = Math.max(margin, Math.min(w - margin, padScreen.x));
                const indicatorY = h - 85;

                const color = isAligned ? '#00ff88' : (absDx < 100 ? '#ffdd00' : '#ff6600');

                ctx.fillStyle = 'rgba(10, 15, 25, 0.82)';
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(clampedX - 68, indicatorY - 26, 136, 42, 8);
                } else {
                    ctx.rect(clampedX - 68, indicatorY - 26, 136, 42);
                }
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'center';
                const dirText = isAligned ? '✅' : (dx > 0 ? `→` : `←`);
                ctx.fillText(dirText, clampedX, indicatorY - 8);

                ctx.fillStyle = '#ffffff';
                ctx.font = '11px monospace';
                ctx.fillText(`TARGET: ${Math.round(absDx)} FT`, clampedX, indicatorY + 8);

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(clampedX - 10, indicatorY + 18);
                ctx.lineTo(clampedX + 10, indicatorY + 18);
                ctx.lineTo(clampedX, indicatorY + 30);
                ctx.closePath();
                ctx.fill();
            }
        }

        ctx.restore();
    }

    _loop(now) {
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        dt = Math.min(dt, 1 / 30);

        this._update(dt);
        this._render();

        requestAnimationFrame((t) => this._loop(t));
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new GameEngine();
});
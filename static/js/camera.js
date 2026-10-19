/**
 * camera.js — Cinematic Camera System
 * =====================================
 * Zoom presets per game state, smooth lerp transitions,
 * screen shake, and world ↔ screen coordinate transforms.
 */

export class Camera {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;

        // Logical (CSS) viewport dimensions
        this.screenW = canvas.clientWidth || window.innerWidth;
        this.screenH = canvas.clientHeight || window.innerHeight;

        // Camera position in world space (center of viewport)
        this.x = 0;
        this.y = 36;

        // Zoom = pixels per foot.  Higher = closer.
        this.zoom = 2.7;

        // Smooth-lerp targets
        this.targetX = 0;
        this.targetY = 36;
        this.targetZoom = 2.7;
        this.lerpSpeed = 2.5;   // how fast we interpolate (per second)

        // Screen shake
        this.shakeAmplitude = 0;
        this.shakeDuration = 0;
        this.shakeFrequency = 30;
        this.shakeTimer = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
        this.shakeDecay = true;
    }

    /* ------------------------------------------------------------------ */
    /*  Resize                                                             */
    /* ------------------------------------------------------------------ */
    resize(w, h) {
        this.screenW = w;
        this.screenH = h;
    }

    /* ------------------------------------------------------------------ */
    /*  Presets (called by game state machine)                              */
    /* ------------------------------------------------------------------ */
    /** Set camera to high wide desert drone perspective for cinematic intro. */
    startCinematic() {
        this.x = -80;
        this.y = 115;
        this.zoom = 0.95;
        this.targetX = -80;
        this.targetY = 115;
        this.targetZoom = 0.95;
        this.lerpSpeed = 1.6;
        this.shakeAmplitude = 0;
        this.shakeDuration = 0;
    }

    /**
     * Compute smooth cinematic camera position along multi-phase trajectory.
     * @param {number} progress – normalized progress from 0.0 to 1.0 (over ~5.2 seconds)
     */
    updateCinematic(progress) {
        const p = Math.max(0, Math.min(1, progress));

        const smoothstep = (t) => t * t * (3 - 2 * t);
        const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        if (p < 0.40) {
            // Phase 1 (0.0 to 0.40): Slow atmospheric aerial glide across high desert landscape
            const t = p / 0.40;
            const ease = smoothstep(t);
            this.x = -80 + ease * 35;       // -80 to -45
            this.y = 115 - ease * 25;       // 115 to 90
            this.zoom = 0.95 + ease * 0.35; // 0.95 to 1.30
        } else if (p < 0.78) {
            // Phase 2 (0.40 to 0.78): Descending drone sweep toward the launch tower & rocket
            const t = (p - 0.40) / 0.38;
            const ease = easeInOutCubic(t);
            this.x = -45 + ease * 48;       // -45 to +3
            this.y = 90 - ease * 46;        // 90 to 44
            this.zoom = 1.30 + ease * 0.95; // 1.30 to 2.25
        } else {
            // Phase 3 (0.78 to 1.0): Gentle ease-in and lock onto launch pad preset (x: 0, y: 36, zoom: 2.7)
            const t = (p - 0.78) / 0.22;
            const ease = smoothstep(t);
            this.x = 3 - ease * 3;          // 3 to 0
            this.y = 44 - ease * 8;         // 44 to 36
            this.zoom = 2.25 + ease * 0.45; // 2.25 to 2.70
        }

        // Keep targets aligned so transitioning out is seamless
        this.targetX = this.x;
        this.targetY = this.y;
        this.targetZoom = this.zoom;
    }

    /** Close-up on the launch pad. */
    setPadPreset() {
        this.targetX = 0;
        this.targetY = 36;   // Lower camera so desert floor, pad, and plants are prominently visible
        this.targetZoom = 2.7;
        this.lerpSpeed = 2.2;
    }

    /** Follow the rocket dynamically during powered ascent and coasting. */
    setFollowPreset(rocketX, rocketY, rocketVy = 0) {
        if (rocketY === undefined) { rocketY = rocketX; rocketX = 0; }
        this.targetX = rocketX;
        this.targetY = rocketY;

        // Smooth zoom curve:
        // Launch pad liftoff (0 to 500 ft): gently pulls back from pad close-up (2.70) to hero flight zoom (1.35)
        // High altitude flight (500 to 10k+ ft): stays comfortably framed (~1.34), NEVER zooms out into outer space!
        if (rocketY < 500) {
            const t = Math.max(0, rocketY / 500);
            this.targetZoom = 2.70 - t * (2.70 - 1.35);
        } else {
            this.targetZoom = 1.34;
        }

        // Velocity-adaptive tracking speed:
        // While burning and fast, smooth tracking (3.5).
        // As speed drops approaching apogee (|vy| < 120), smoothly ramp up lerpSpeed (up to 7.5)
        // so camera and rocket arrive and STOP in perfect sync at apogee without drifting or rubber-banding!
        const speed = Math.abs(rocketVy);
        if (speed < 120) {
            const stopEase = 1.0 - (speed / 120);
            this.lerpSpeed = 3.5 + stopEase * 4.0; // 3.5 -> 7.5
        } else {
            this.lerpSpeed = 3.5;
        }
    }

    /** Keep camera focused on the rocket at apogee with zero jump and rock-solid lock. */
    setApogeePreset(rocketX, rocketY) {
        if (rocketY === undefined) { rocketY = rocketX; rocketX = 0; }
        this.targetX = rocketX;
        this.targetY = rocketY;
        this.targetZoom = 1.35; // Seamless with flight zoom (1.34), no jarring sudden jump
        this.lerpSpeed = 7.0;   // Locked in place with the stopped rocket
    }

    /** Follow the rocket strictly during descent with clear parachute visibility and ground approach. */
    setDescentPreset(rocketX, rocketY) {
        if (rocketY === undefined) { rocketY = rocketX; rocketX = 0; }
        this.targetX = rocketX;
        this.targetY = Math.max(28, rocketY);

        // Descent zoom curve:
        // High altitude (750 ft to 10,000+ ft): comfortable hero zoom (~1.30) where rocket + chute are clearly visible
        // Final approach (below 750 ft down to pad): smoothly zooms in from 1.30 to 2.35 as ground approaches
        if (rocketY > 750) {
            this.targetZoom = 1.30;
        } else {
            const t = Math.max(0, rocketY / 750);
            this.targetZoom = 2.35 - t * (2.35 - 1.30);
        }
        this.lerpSpeed = 5.0; // Responsive tracking so camera stays locked on falling rocket
    }

    /** Slight pull-back for ignition sequence. */
    setIgnitionPreset() {
        this.targetX = 0;
        this.targetY = 40;
        this.targetZoom = 2.5;
        this.lerpSpeed = 2.5;
    }

    /** Close-up for landing. */
    setLandingPreset(rocketX = 0, rocketY = 0) {
        this.targetX = rocketX;
        this.targetY = Math.max(28, rocketY);
        this.targetZoom = 2.35;
        this.lerpSpeed = 4.0;
    }

    /** Focus on crash / wreckage. */
    setCrashPreset(rocketX = 0, rocketY = 0) {
        this.targetX = rocketX;
        this.targetY = Math.max(28, rocketY);
        this.targetZoom = 2.45;
        this.lerpSpeed = 4.2;
    }

    /* ------------------------------------------------------------------ */
    /*  Screen Shake                                                       */
    /* ------------------------------------------------------------------ */
    /**
     * Trigger a screen shake.
     * @param {number} amplitude – max pixel offset
     * @param {number} duration  – seconds
     * @param {number} freq      – oscillations per second
     * @param {boolean} decay    – if true, amplitude decays over time
     */
    addShake(amplitude, duration, freq = 30, decay = true) {
        this.shakeAmplitude = amplitude;
        this.shakeDuration = duration;
        this.shakeFrequency = freq;
        this.shakeTimer = 0;
        this.shakeDecay = decay;
    }

    /* ------------------------------------------------------------------ */
    /*  Per-frame update                                                   */
    /* ------------------------------------------------------------------ */
    update(dt) {
        // Smooth interpolation toward targets
        this.x = _lerp(this.x, this.targetX, dt * this.lerpSpeed);
        this.y = _lerp(this.y, this.targetY, dt * this.lerpSpeed);
        this.zoom = _lerp(this.zoom, this.targetZoom, dt * this.lerpSpeed);

        // Screen shake
        if (this.shakeDuration > 0) {
            this.shakeDuration -= dt;
            this.shakeTimer += dt;
            const progress = this.shakeDecay
                ? Math.max(0, this.shakeDuration / (this.shakeDuration + this.shakeTimer))
                : 1;
            const amp = this.shakeAmplitude * progress;
            const t = this.shakeTimer * this.shakeFrequency * Math.PI * 2;
            this.shakeOffsetX = Math.sin(t * 1.1) * amp * (Math.random() * 0.4 + 0.8);
            this.shakeOffsetY = Math.cos(t) * amp * (Math.random() * 0.4 + 0.8);
        } else {
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Coordinate transforms                                              */
    /* ------------------------------------------------------------------ */
    /**
     * Convert world coordinates (feet) to screen coordinates (CSS pixels).
     * @param {number} wx – world X (0 = pad center)
     * @param {number} wy – world Y (0 = ground, positive = up)
     * @returns {{ x: number, y: number }}
     */
    worldToScreen(wx, wy) {
        return {
            x: (wx - this.x) * this.zoom + this.screenW / 2 + this.shakeOffsetX,
            y: this.screenH / 2 - (wy - this.y) * this.zoom + this.shakeOffsetY,
        };
    }

    /**
     * How many feet are visible vertically.
     */
    get viewHeight() {
        return this.screenH / this.zoom;
    }

    /**
     * How many feet are visible horizontally.
     */
    get viewWidth() {
        return this.screenW / this.zoom;
    }

    /**
     * The world-Y at the bottom of the visible area.
     */
    get bottomY() {
        return this.y - this.viewHeight / 2;
    }

    /**
     * The world-Y at the top of the visible area.
     */
    get topY() {
        return this.y + this.viewHeight / 2;
    }
}

/* ---------------------------------------------------------------------- */
function _lerp(a, b, t) {
    return a + (b - a) * Math.min(t, 1);
}

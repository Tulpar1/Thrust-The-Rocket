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
    /** Set camera to the launch pad before the optical close-up begins. */
    startCinematic() {
        this.x = 0;
        this.y = 36;
        this.zoom = 2.7;
        this.targetX = 0;
        this.targetY = 36;
        this.targetZoom = 2.7;
        this.lerpSpeed = 2.4;
        this.shakeAmplitude = 0;
        this.shakeDuration = 0;
    }

    /**
     * Search right and left through the binoculars, then center on the rocket.
     * @param {number} progress – normalized progress from 0.0 to 1.0 (over 5.4 seconds)
     */
    updateCinematic(progress) {
        const p = Math.max(0, Math.min(1, progress));

        const smoothstep = (t) => t * t * (3 - 2 * t);
        if (p < 0.25) {
            const ease = smoothstep(p / 0.25);
            this.x = ease * 22;
            this.y = 36;
            this.zoom = 3.8 + ease * 0.7;
        } else if (p < 0.55) {
            const ease = smoothstep((p - 0.25) / 0.30);
            this.x = 22 - ease * 44;
            this.y = 36;
            this.zoom = 4.5;
        } else if (p < 0.72) {
            const ease = smoothstep((p - 0.55) / 0.17);
            this.x = -22 + ease * 22;
            this.y = 36;
            this.zoom = 4.5;
        } else {
            const ease = smoothstep((p - 0.72) / 0.28);
            this.x = 0;
            this.y = 36;
            this.zoom = 4.5 - ease * 1.8;
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

    /** Follow the slowing rocket after engine cutoff with a closer flight frame. */
    setCoastingPreset(rocketX, rocketY, rocketVy = 0) {
        if (rocketY === undefined) { rocketY = rocketX; rocketX = 0; }
        this.targetX = rocketX;
        this.targetY = rocketY;

        if (rocketY < 500) {
            const t = Math.max(0, rocketY / 500);
            this.targetZoom = 2.70 - t * (2.70 - 1.55);
        } else {
            const speed = Math.min(500, Math.abs(rocketVy));
            const slowDown = 1 - speed / 500;
            this.targetZoom = 1.55 + slowDown * 0.35;
        }

        this.lerpSpeed = 4.5;
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

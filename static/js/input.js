/**
 * input.js — Unified Input Manager with Canopy Steering
 * ======================================================
 * Handles touch, mouse, and keyboard input.
 * Supports:
 * - Fuel hold & release to launch
 * - Tap to deploy chutes
 * - Left / Right canopy steering (Mobile screen halves & A/D tuşları)
 */

export class InputManager {
    constructor(canvas) {
        /** @type {HTMLCanvasElement} */
        this.canvas = canvas;

        // --- Core State ---
        this.isDown        = false;
        this.holdTime      = 0;
        this._tapQueued    = false;
        this._tapTimer     = 0;
        this._justPressed  = false;
        this._wasDown      = false;

        // --- Steering State (-1: Sol, 0: Boşta, +1: Sağ) ---
        this.steerInput    = 0;
        this._keyLeft      = false;
        this._keyRight     = false;
        this._touchSteer   = 0;

        this._bindEvents();
    }

    /* ------------------------------------------------------------------ */
    /*  Event binding                                                      */
    /* ------------------------------------------------------------------ */
    _bindEvents() {
        const opts = { passive: false };

        // 1. Dokunmatik Kontroller (Mobil Öncelikli)
        window.addEventListener('touchstart', (e) => {
            if (e.target.closest && e.target.closest('.overlay:not(.hidden)')) return;
            const touch = e.touches[0];
            this._updateTouchSteer(touch.clientX);
            this._onDown(e);
        }, opts);

        window.addEventListener('touchmove', (e) => {
            if (this.isDown && e.touches.length > 0) {
                this._updateTouchSteer(e.touches[0].clientX);
            }
        }, opts);

        window.addEventListener('touchend', (e) => {
            this._touchSteer = 0;
            this._onUp(e);
        }, opts);

        window.addEventListener('touchcancel', (e) => {
            this._touchSteer = 0;
            this._onUp(e);
        }, opts);

        // 2. Fare Kontrolleri (Desktop)
        window.addEventListener('mousedown', (e) => {
            if (e.target.closest && (e.target.closest('button') || e.target.closest('input') || e.target.closest('.overlay:not(.hidden)'))) return;
            this._updateTouchSteer(e.clientX);
            this._onDown(e);
        }, opts);

        window.addEventListener('mousemove', (e) => {
            if (this.isDown) {
                this._updateTouchSteer(e.clientX);
            }
        }, opts);

        window.addEventListener('mouseup', (e) => {
            this._touchSteer = 0;
            this._onUp(e);
        }, opts);

        // 3. Klavye Kontrolleri (Space = Fırlatma/Paraşüt, A/D veya Sol/Sağ Ok = Yönlendirme)
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                this._pressDown();
            } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
                e.preventDefault();
                this._keyLeft = true;
            } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
                e.preventDefault();
                this._keyRight = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault();
                this._pressUp();
            } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
                e.preventDefault();
                this._keyLeft = false;
            } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
                e.preventDefault();
                this._keyRight = false;
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _updateTouchSteer(clientX) {
        const screenWidth = window.innerWidth;
        // Ekranın sol %45'i SOLA çekiş, sağ %45'i SAĞA çekiş, ortadaki %10 nötr bölge
        if (clientX < screenWidth * 0.44) {
            this._touchSteer = -1.0;
        } else if (clientX > screenWidth * 0.56) {
            this._touchSteer = 1.0;
        } else {
            this._touchSteer = 0;
        }
    }

    _onDown(e) {
        if (e.cancelable && e.type !== 'touchstart') e.preventDefault();
        this._pressDown();
    }

    _onUp(e) {
        if (e.cancelable && e.type !== 'touchend') e.preventDefault();
        this._pressUp();
    }

    _pressDown() {
        if (!this.isDown) {
            this.isDown       = true;
            this.holdTime     = 0;
            this._justPressed = true;
        }
    }

    _pressUp() {
        if (this.isDown) {
            if (this.holdTime < 0.55) {
                this._tapQueued = true;
                this._tapTimer  = 0.35;
            }
            this.isDown   = false;
            this.holdTime = 0;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Per-frame update                                                   */
    /* ------------------------------------------------------------------ */
    update(dt) {
        if (this.isDown) {
            this.holdTime += dt;
        }
        if (this._tapTimer > 0) {
            this._tapTimer -= dt;
            if (this._tapTimer <= 0) {
                this._tapQueued = false;
            }
        }

        // Klavye veya Dokunmatik yönlendirmeyi birleştir
        let targetSteer = 0;
        if (this._keyLeft) targetSteer -= 1.0;
        if (this._keyRight) targetSteer += 1.0;

        if (this.isDown && this._touchSteer !== 0) {
            targetSteer = this._touchSteer;
        }

        // Yumuşak tepki (Lerp)
        this.steerInput += (targetSteer - this.steerInput) * Math.min(1.0, dt * 12.0);
    }

    flush() {
        this._tapQueued   = false;
        this._justPressed = false;
        this._tapTimer    = 0;
        this._touchSteer  = 0;
    }

    get isHolding() {
        return this.isDown && this.holdTime >= 0.08;
    }

    consumeTap() {
        if (this._tapQueued || this._justPressed) {
            this._tapQueued   = false;
            this._justPressed = false;
            this._tapTimer    = 0;
            return true;
        }
        return false;
    }

    get justReleased() {
        return this._wasDown && !this.isDown;
    }

    lateUpdate() {
        this._wasDown     = this.isDown;
        this._justPressed = false;
    }
}
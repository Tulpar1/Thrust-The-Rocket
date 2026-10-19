/**
 * input.js — Unified Input Manager
 * =================================
 * Handles touch, mouse, and keyboard input with hold/tap detection.
 * Mobile-first: touch is primary, mouse & keyboard are secondary.
 */

export class InputManager {
    constructor(canvas) {
        /** @type {HTMLCanvasElement} */
        this.canvas = canvas;

        // --- State ---
        this.isDown      = false;   // Is the user currently pressing/holding?
        this.holdTime    = 0;       // How long the current hold has lasted (seconds)
        this._tapQueued  = false;   // A tap occurred this frame (consumed by consumeTap)
        this._tapTimer   = 0;       // Auto-expiry timer for queued taps

        this._bindEvents();
    }

    /* ------------------------------------------------------------------ */
    /*  Event binding                                                      */
    /* ------------------------------------------------------------------ */
    _bindEvents() {
        const opts = { passive: false };

        // Touch events (primary)
        window.addEventListener('touchstart', (e) => {
            if (e.target.closest && e.target.closest('.overlay:not(.hidden)')) return;
            this._onDown(e);
        }, opts);
        window.addEventListener('touchend', (e) => this._onUp(e), opts);
        window.addEventListener('touchcancel', (e) => this._onUp(e), opts);

        // Mouse events (secondary — desktop fallback)
        window.addEventListener('mousedown', (e) => {
            // Avoid capturing clicks on buttons or interactive inputs in modals
            if (e.target.closest && (e.target.closest('button') || e.target.closest('input') || e.target.closest('.overlay:not(.hidden)'))) return;
            this._onDown(e);
        }, opts);
        window.addEventListener('mouseup', (e) => this._onUp(e), opts);

        // Keyboard (Space bar)
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                e.preventDefault();
                this._pressDown();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                e.preventDefault();
                this._pressUp();
            }
        });

        // Prevent context menu on long press
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
            // If the hold was relatively short (< 0.55s), treat as a tap
            if (this.holdTime < 0.55) {
                this._tapQueued = true;
                this._tapTimer  = 0.35; // Expire within 350ms so stale taps don't trigger future stages
            }
            this.isDown   = false;
            this.holdTime = 0;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Per-frame update                                                   */
    /* ------------------------------------------------------------------ */
    /**
     * Call once per frame before game logic.
     * @param {number} dt - Delta time in seconds
     */
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
    }

    /* ------------------------------------------------------------------ */
    /*  Queries                                                            */
    /* ------------------------------------------------------------------ */

    /** Flush any pending or queued taps (call on stage transitions). */
    flush() {
        this._tapQueued   = false;
        this._justPressed = false;
        this._tapTimer    = 0;
    }

    /** True if the user is currently holding (press duration ≥ threshold). */
    get isHolding() {
        return this.isDown && this.holdTime >= 0.08;
    }

    /**
     * Returns true once after a tap occurs, then resets.
     * Can trigger immediately on touch-down or after quick tap-release.
     */
    consumeTap() {
        if (this._tapQueued || this._justPressed) {
            this._tapQueued   = false;
            this._justPressed = false;
            this._tapTimer    = 0;
            return true;
        }
        return false;
    }

    /**
     * Returns true on the first frame the user releases after holding.
     * Useful for the "release to launch" mechanic.
     */
    get justReleased() {
        return this._wasDown && !this.isDown;
    }

    /**
     * Call at the END of each frame to record previous state.
     */
    lateUpdate() {
        this._wasDown     = this.isDown;
        this._justPressed = false;
    }
}

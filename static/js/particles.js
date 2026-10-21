/**
 * particles.js — Over-the-Top Particle & VFX System
 * ===================================================
 * Object-pooled particles for exhaust flames, smoke trails,
 * wind streaks, re-entry glow, dust clouds, debris, sparks, and confetti.
 */

const POOL_SIZE = 800;

/* ====================================================================== */
/*  Particle pool                                                          */
/* ====================================================================== */
class Particle {
    constructor() { this.active = false; }

    init(x, y, vx, vy, life, size, color, type, extra = {}) {
        this.active   = true;
        this.x        = x;
        this.y        = y;
        this.vx       = vx;
        this.vy       = vy;
        this.life     = life;
        this.maxLife  = life;
        this.size     = size;
        this.color    = color;     // [r, g, b]
        this.colorRgb = `rgb(${color[0]},${color[1]},${color[2]})`;
        this.type     = type;      // 'circle' | 'streak' | 'shard' | 'confetti'
        this.alpha    = extra.alpha    ?? 1;
        this.gravity  = extra.gravity  ?? 0;
        this.drag     = extra.drag     ?? 0;
        this.growRate = extra.growRate ?? 0;
        this.rotation = extra.rotation ?? 0;
        this.rotSpeed = extra.rotSpeed ?? 0;
        this.fadeIn   = extra.fadeIn   ?? false;
    }
}

/* ====================================================================== */
/*  Particle System                                                        */
/* ====================================================================== */
export class ParticleSystem {
    constructor() {
        /** @type {Particle[]} */
        this.pool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            this.pool.push(new Particle());
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Pool management                                                    */
    /* ------------------------------------------------------------------ */
    _get() {
        for (let i = 0; i < this.pool.length; i++) {
            if (!this.pool[i].active) return this.pool[i];
        }
        return null; // pool exhausted — skip particle
    }

    /** Kill all particles. */
    clear() {
        for (const p of this.pool) p.active = false;
    }

    /* ------------------------------------------------------------------ */
    /*  Emitters (all coordinates in WORLD space — feet)                   */
    /* ------------------------------------------------------------------ */

    /**
     * Exhaust flame — cone spray downward from nozzle.
     * @param {number} x  – nozzle world X
     * @param {number} y  – nozzle world Y
     * @param {number} angle – rocket angle (radians)
     * @param {number} intensity – 0–1
     */
    emitExhaust(x, y, angle, intensity) {
        const count = Math.floor(25 * intensity);
        for (let i = 0; i < count; i++) {
            const p = this._get();
            if (!p) return;
            const spread = (_rand(-0.4, 0.4)) + angle + Math.PI; // downward
            const speed  = _rand(80, 220) * intensity;
            // Color: white core → yellow → orange
            const t = Math.random();
            const r = 255;
            const g = Math.floor(180 + 75 * t);
            const b = Math.floor(50 * t);
            p.init(
                x + _rand(-1, 1), y + _rand(-1, 1),
                Math.sin(spread) * speed,
                Math.cos(spread) * speed,
                _rand(0.08, 0.25), _rand(2, 5),
                [r, g, b], 'circle',
                { alpha: 0.9, gravity: 0, drag: 0.02, growRate: -3 }
            );
        }
    }

    /**
     * Smoke behind the rocket during burn.
     */
    emitSmoke(x, y) {
        for (let i = 0; i < 5; i++) {
            const p = this._get();
            if (!p) return;
            p.init(
                x + _rand(-3, 3), y + _rand(-5, 0),
                _rand(-6, 6), _rand(-10, 10),
                _rand(1.5, 3.5), _rand(4, 10),
                [180, 180, 180], 'circle',
                { alpha: 0.35, gravity: 3, drag: 0.008, growRate: 12 }
            );
        }
    }

    /**
     * Smoke trail left in world space as rocket climbs.
     */
    emitSmokeTrail(x, y) {
        const p = this._get();
        if (!p) return;
        p.init(
            x + _rand(-1.5, 1.5), y,
            _rand(-1, 1), _rand(-2, 2),
            _rand(4, 9), _rand(3, 7),
            [210, 210, 210], 'circle',
            { alpha: 0.22, gravity: 0.5, drag: 0.001, growRate: 6 }
        );
    }

    /**
     * Wind streaks during high-speed flight.
     * @param {number} x  – rocket X
     * @param {number} y  – rocket Y
     * @param {number} speed – magnitude of rocket speed
     * @param {number} vy – vertical velocity (positive = up)
     */
    emitWindStreaks(x, y, speed, vy) {
        if (speed < 80) return;
        const count = Math.min(8, Math.floor(speed / 60));
        for (let i = 0; i < count; i++) {
            const p = this._get();
            if (!p) return;
            const dir = vy > 0 ? -1 : 1; // streaks go opposite to travel
            p.init(
                x + _rand(-40, 40), y + _rand(-60, 60) * dir,
                _rand(-5, 5), -vy * _rand(0.3, 0.6),
                _rand(0.1, 0.3), _rand(1, 2),
                [255, 255, 255], 'streak',
                { alpha: 0.25, gravity: 0, drag: 0 }
            );
        }
    }

    /**
     * Visible lateral wind flow around the rocket.
     * @param {number} x – rocket X
     * @param {number} y – rocket Y
     * @param {number} force – signed wind force
     */
    emitWindFlow(x, y, force) {
        const strength = Math.abs(force);
        if (strength < 1.5) return;

        const direction = force > 0 ? 1 : -1;
        const count = Math.min(5, Math.max(2, Math.floor(strength / 5)));
        for (let i = 0; i < count; i++) {
            const p = this._get();
            if (!p) return;
            const speed = 35 + strength * 4;
            p.init(
                x - direction * _rand(20, 75) + _rand(-10, 10),
                y + _rand(-55, 55),
                direction * _rand(speed * 0.75, speed * 1.25),
                _rand(-4, 4),
                _rand(0.35, 0.7),
                _rand(1.2, 2.4),
                [150, 215, 255],
                'streak',
                { alpha: 0.55, gravity: 0, drag: 0.01 }
            );
        }
    }

    /**
     * Re-entry glow around nose during fast descent.
     */
    emitReentryGlow(x, y, speed) {
        if (speed < 150) return;
        const intensity = Math.min(1, (speed - 150) / 300);
        const count = Math.floor(18 * intensity);
        for (let i = 0; i < count; i++) {
            const p = this._get();
            if (!p) return;
            const angle = _rand(0, Math.PI * 2);
            const dist  = _rand(2, 8);
            const t     = Math.random();
            p.init(
                x + Math.cos(angle) * dist, y + 15 + Math.sin(angle) * dist,
                _rand(-15, 15), _rand(20, 60),
                _rand(0.08, 0.2), _rand(2, 5),
                [255, Math.floor(80 + 120 * t), Math.floor(20 * t)], 'circle',
                { alpha: 0.7 * intensity, gravity: 0, drag: 0.01 }
            );
        }
    }

    /**
     * Dust cloud on landing / crash.
     */
    emitDustCloud(x, y, intensity = 1) {
        const count = Math.floor(60 * intensity);
        for (let i = 0; i < count; i++) {
            const p = this._get();
            if (!p) return;
            const angle = _rand(0, Math.PI * 2);
            const speed = _rand(15, 70) * intensity;
            p.init(
                x + _rand(-5, 5), y + _rand(0, 3),
                Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed * 0.6,
                _rand(1.5, 3.5), _rand(5, 15),
                [210, 195, 170], 'circle',
                { alpha: 0.5, gravity: -6, drag: 0.02, growRate: 15 }
            );
        }
    }

    /**
     * Debris shards on crash.
     */
    emitDebris(x, y) {
        for (let i = 0; i < 35; i++) {
            const p = this._get();
            if (!p) return;
            const angle = _rand(0, Math.PI * 2);
            const speed = _rand(40, 160);
            p.init(
                x + _rand(-3, 3), y + _rand(0, 10),
                Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed,
                _rand(1.5, 4), _rand(2, 6),
                [150 + _rand(0,50), 150 + _rand(0,50), 150 + _rand(0,50)], 'shard',
                { alpha: 0.9, gravity: -32, drag: 0.005, rotation: _rand(0, 6.28), rotSpeed: _rand(-10, 10) }
            );
        }
    }

    /**
     * Sparks on crash.
     */
    emitSparks(x, y) {
        for (let i = 0; i < 25; i++) {
            const p = this._get();
            if (!p) return;
            const angle = _rand(-Math.PI, 0); // upward hemisphere
            const speed = _rand(60, 200);
            p.init(
                x, y + 5,
                Math.cos(angle) * speed, Math.sin(angle) * speed * -1,
                _rand(0.4, 1.2), _rand(1, 3),
                [255, _rand(120, 200), 0], 'circle',
                { alpha: 1, gravity: -45, drag: 0.01 }
            );
        }
    }

    /**
     * Confetti on successful landing.
     */
    emitConfetti(x, y) {
        const colors = [
            [231, 76, 60], [241, 196, 15], [46, 204, 113],
            [52, 152, 219], [155, 89, 182], [255, 255, 255],
        ];
        for (let i = 0; i < 50; i++) {
            const p = this._get();
            if (!p) return;
            p.init(
                x + _rand(-30, 30), y + _rand(30, 80),
                _rand(-25, 25), _rand(10, 50),
                _rand(2.5, 4.5), _rand(3, 6),
                colors[Math.floor(Math.random() * colors.length)], 'confetti',
                { alpha: 0.9, gravity: -8, drag: 0.02, rotation: _rand(0, 6.28), rotSpeed: _rand(-5, 5) }
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Update all active particles                                        */
    /* ------------------------------------------------------------------ */
    update(dt) {
        for (const p of this.pool) {
            if (!p.active) continue;

            p.life -= dt;
            if (p.life <= 0) { p.active = false; continue; }

            // Physics
            p.vy  += p.gravity * dt;
            p.vx  -= p.vx * p.drag * dt;
            p.vy  -= p.vy * p.drag * dt;
            p.x   += p.vx * dt;
            p.y   += p.vy * dt;
            p.size += p.growRate * dt;
            if (p.size < 0.5) p.size = 0.5;
            if (p.size > 20)  p.size = 20;
            p.rotation += p.rotSpeed * dt;

            // Ground clamp
            if (p.y < 0 && p.gravity < 0) {
                p.y  = 0;
                p.vy = Math.abs(p.vy) * 0.3;
                p.vx *= 0.7;
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Render all active particles                                        */
    /* ------------------------------------------------------------------ */
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {import('./camera.js').Camera} camera
     */
    render(ctx, camera) {
        for (const p of this.pool) {
            if (!p.active) continue;

            const life01 = p.life / p.maxLife;
            let   alpha  = p.alpha * (p.fadeIn ? (1 - life01) : life01);
            if (alpha < 0.02) continue;
            alpha = Math.min(1, alpha);

            const screen = camera.worldToScreen(p.x, p.y);
            const sz     = Math.max(1, p.size * camera.zoom);

            // Screen boundary culling
            if (screen.x < -sz || screen.x > camera.screenW + sz || screen.y < -sz || screen.y > camera.screenH + sz) {
                continue;
            }

            if (p.type === 'circle') {
                // High-performance direct path fill without save/restore
                ctx.globalAlpha = alpha;
                ctx.fillStyle   = p.colorRgb;
                ctx.beginPath();
                ctx.arc(screen.x, screen.y, sz, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.save();
                ctx.globalAlpha = alpha;

                switch (p.type) {
                    case 'streak': {
                        const len = Math.max(sz * 3, 6);
                        const angle = Math.atan2(-p.vy, p.vx);
                        ctx.translate(screen.x, screen.y);
                        ctx.rotate(angle);
                        ctx.beginPath();
                        ctx.moveTo(-len / 2, 0);
                        ctx.lineTo(len / 2, 0);
                        ctx.strokeStyle = p.colorRgb;
                        ctx.lineWidth   = Math.max(1, sz * 0.5);
                        ctx.stroke();
                        break;
                    }

                    case 'shard': {
                        ctx.translate(screen.x, screen.y);
                        ctx.rotate(p.rotation);
                        ctx.fillStyle = p.colorRgb;
                        ctx.fillRect(-sz * 0.6, -sz * 0.3, sz * 1.2, sz * 0.6);
                        break;
                    }

                    case 'confetti': {
                        ctx.translate(screen.x, screen.y);
                        ctx.rotate(p.rotation);
                        ctx.fillStyle = p.colorRgb;
                        ctx.fillRect(-sz * 0.5, -sz * 0.25, sz, sz * 0.5);
                        break;
                    }
                }

                ctx.restore();
            }
        }
        ctx.globalAlpha = 1.0;
    }
}

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */
function _rand(min, max) {
    return min + Math.random() * (max - min);
}

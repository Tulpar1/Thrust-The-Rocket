/**
 * renderer.js — Canvas Rendering Engine
 * =======================================
 * Draws sky, parallax dunes, desert floor, landing pad, rocket,
 * parachutes, altitude markers, and on-canvas HUD elements.
 * White Sands visual theme.
 */

export class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} ctx
     */
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.w = canvas.clientWidth || window.innerWidth;
        this.h = canvas.clientHeight || window.innerHeight;
        this.bushSprites = this._initBushSprites();
        this.bushes = this._generateDesertVegetation();
        this.padVegetation = this._generatePadVegetation();

        // Field operations custom transparent PNG sprites
        this.opsSprites = {
            team: this._loadSprite('/static/img/team_station.png'),
            tent1: this._loadSprite('/static/img/field_tent1.png'),
            tent2: this._loadSprite('/static/img/field_tent2.png'),
            pad: this._loadSprite('/static/img/pad.png'),
        };
        this.parachuteSprites = {
            drogue: [
                this._loadSprite('/static/img/parachutes/drogue_00_packed.png'),
                this._loadSprite('/static/img/parachutes/drogue_01_pulling.png'),
                this._loadSprite('/static/img/parachutes/drogue_02_opening.png'),
                this._loadSprite('/static/img/parachutes/drogue_03_full.png'),
            ],
            main: [
                this._loadSprite('/static/img/parachutes/main_00_packed.png'),
                this._loadSprite('/static/img/parachutes/main_01_pulling.png'),
                this._loadSprite('/static/img/parachutes/main_02_opening.png'),
                this._loadSprite('/static/img/parachutes/main_03_inflated.png'),
                this._loadSprite('/static/img/parachutes/main_04_full.png'),
            ],
        };
    }

    _loadSprite(src) {
        const img = new Image();
        img.src = src;
        return img;
    }

    resize(w, h) {
        this.w = w;
        this.h = h;
    }

    areVegetationAssetsReady() {
        return Object.values(this.bushSprites)
            .flat()
            .every((sprite) => sprite.complete && sprite.naturalWidth > 0);
    }

    _generatePadVegetation() {
        const plants = [
            [-22, -3, 7.5, 5.2, 'large', 0],
            [-13, 1, 5.4, 4.1, 'medium', 1],
            [-4, -2, 4.6, 3.5, 'small', 0],
            [5, 0, 4.8, 3.7, 'small', 1],
            [14, -2, 6.2, 4.5, 'medium', 0],
            [23, 1, 7.8, 5.4, 'large', 1],
        ];

        return plants.map(([wx, wy, w, h, type, spriteIndex]) => ({
            wx,
            wy,
            w,
            h,
            type,
            sprite: this.bushSprites[type][spriteIndex],
        }));
    }

    /* ================================================================== */
    /*  Clear                                                              */
    /* ================================================================== */
    clear() {
        this.ctx.clearRect(0, 0, this.w, this.h);
    }

    /* ================================================================== */
    /*  Sky Gradient                                                       */
    /* ================================================================== */
    /**
     * Draw the sky — color shifts with altitude.
     * @param {import('./camera.js').Camera} camera
     */
    drawSky(camera) {
        const ctx = this.ctx;
        const altFactor = Math.min(1, Math.max(0, camera.y / 12000));

        // Interpolate sky colours based on altitude
        const topR = _lerpC(91, 27, altFactor);   // #5B9BD5 → #1B2838
        const topG = _lerpC(155, 40, altFactor);
        const topB = _lerpC(213, 56, altFactor);
        const botR = _lerpC(212, 91, altFactor);   // #D4C5A9 → #5B9BD5
        const botG = _lerpC(197, 155, altFactor);
        const botB = _lerpC(169, 213, altFactor);

        const grad = ctx.createLinearGradient(0, 0, 0, this.h);
        grad.addColorStop(0, `rgb(${topR},${topG},${topB})`);
        grad.addColorStop(1, `rgb(${botR},${botG},${botB})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.w, this.h);

        // Subtle cloud wisps (only visible at low-mid altitude)
        if (altFactor < 0.6) {
            this._drawClouds(camera, 1 - altFactor);
        }
    }

    _drawClouds(camera, opacity) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = opacity * 0.12;
        ctx.fillStyle = '#FFFFFF';

        // A few procedural cloud patches
        const clouds = [
            { wx: -200, wy: 800, rw: 120, rh: 20 },
            { wx: 300, wy: 1200, rw: 180, rh: 25 },
            { wx: -100, wy: 2000, rw: 150, rh: 18 },
            { wx: 150, wy: 3500, rw: 200, rh: 22 },
            { wx: -300, wy: 5000, rw: 160, rh: 20 },
        ];

        for (const c of clouds) {
            const s = camera.worldToScreen(c.wx, c.wy);
            const sw = c.rw * camera.zoom;
            const sh = c.rh * camera.zoom;
            if (s.y < -sh || s.y > this.h + sh) continue;

            ctx.beginPath();
            ctx.ellipse(s.x, s.y, sw, sh, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /* ================================================================== */
    /*  Deprecated Dunes Stub (Dunes removed per user request)             */
    /* ================================================================== */
    drawDunes(camera) {
        // Sand dunes removed completely per aerospace realism requirements
    }

    /* ================================================================== */
    /*  Authentic Desert Vegetation Sprites (High-Res PNG Textures)      */
    /* ================================================================== */
    _initBushSprites() {
        const loadImg = (src) => {
            const img = new Image();
            img.src = src;
            return img;
        };

        return {
            maki: [
                loadImg('/static/img/bushes/bush_maki_1.png'),
                loadImg('/static/img/bushes/bush_maki_2.png'),
                loadImg('/static/img/bushes/bush_maki_3.png'),
            ],
            small: [
                loadImg('/static/img/bushes/bush_tuft_1.png'),
                loadImg('/static/img/bushes/bush_tuft_2.png'),
            ],
            medium: [
                loadImg('/static/img/bushes/bush_sage_1.png'),
                loadImg('/static/img/bushes/bush_sage_2.png'),
            ],
            large: [
                loadImg('/static/img/bushes/bush_creosote_1.png'),
                loadImg('/static/img/bushes/bush_creosote_2.png'),
            ],
        };
    }

    /* ================================================================== */
    /*  Procedural Desert Vegetation Generator                            */
    /* ================================================================== */
    _generateDesertVegetation() {
        const bushes = [];
        let seed = 52837;
        const rand = () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };

        // Helper to generate horizontal position across visible viewport tiers:
        // Tier 1 (30%): Mobile view (|wx|: minX to 90)
        // Tier 2 (50%): Desktop screen view (|wx|: 90 to 370)
        // Tier 3 (20%): Outer desert flanks (|wx|: 370 to 950)
        const getWx = (minX) => {
            const side = rand() > 0.5 ? 1 : -1;
            const rTier = rand();
            if (rTier < 0.32) {
                return side * (minX + rand() * (90 - minX));
            } else if (rTier < 0.82) {
                return side * (90 + rand() * 280);
            } else {
                return side * (370 + rand() * 580);
            }
        };

        // Layer specifications:
        // 1. Foreground floor (wy: -18 to -1) -> 68 plants (reduced by ~22 plants from foreground)
        // 2. Midground around pad (wy: 0 to 14) -> 76 plants (comfortable spacing around pad)
        // 3. Distant plain (wy: 14 to 28) -> 82 plants (sparsely dotting mid-distance plain)
        // 4. Far horizon plain (wy: 28 to 41.5) -> 84 plants (receding all the way to the horizon dunes at 42 ft)
        const layers = [
            { count: 36, yMin: -100, yMax: -18, padBuffer: 45, minDist: 16, isDistant: false, isNearOps: true },
            { count: 68, yMin: -18, yMax: -1, padBuffer: 24, minDist: 13, isDistant: false },
            { count: 76, yMin: 0, yMax: 14, padBuffer: 24, minDist: 10, isDistant: false },
            { count: 82, yMin: 14, yMax: 28, padBuffer: 16, minDist: 7.5, isDistant: true },
            { count: 84, yMin: 28, yMax: 41.5, padBuffer: 8, minDist: 6.0, isDistant: true },
        ];

        for (const layer of layers) {
            let placed = 0;
            let attempts = 0;
            const maxAttempts = layer.count * 15;

            while (placed < layer.count && attempts < maxAttempts) {
                attempts++;
                const wy = layer.yMin + rand() * (layer.yMax - layer.yMin);
                const wx = getWx(layer.padBuffer);

                // Pad clearance
                if (Math.abs(wx) < layer.padBuffer && wy > -6 && wy < 12) continue;

                // Minimum distance check to prevent clustering
                let tooClose = false;
                for (let j = 0; j < bushes.length; j++) {
                    const ob = bushes[j];
                    const dx = wx - ob.wx;
                    const dy = (wy - ob.wy) * 2.5; // Depth-weighted Euclidean distance
                    if (Math.hypot(dx, dy) < layer.minDist) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                // Variety selection:
                const rType = rand();
                let type, w, h, spriteArr;

                if (layer.isNearOps) {
                    if (rType < 0.65) {
                        type = 'small';
                        w = 2.8 + rand() * 1.6;
                        h = 2.0 + rand() * 1.2;
                        spriteArr = this.bushSprites.small;
                    } else if (rType < 0.90) {
                        type = 'medium';
                        w = 4.2 + rand() * 1.8;
                        h = 3.0 + rand() * 1.4;
                        spriteArr = this.bushSprites.medium;
                    } else {
                        type = 'maki';
                        w = 4.8 + rand() * 1.8;
                        h = 3.6 + rand() * 1.4;
                        spriteArr = this.bushSprites.maki;
                    }
                } else if (layer.isDistant) {
                    if (rType < 0.52) {
                        // Round maquis dome shrub (tombul yuvarlak maki)
                        type = 'maki';
                        w = 5.4 + rand() * 2.4;
                        h = 4.2 + rand() * 1.8;
                        spriteArr = this.bushSprites.maki;
                    } else if (rType < 0.76) {
                        // Small arid snakeweed / bunchgrass tuft
                        type = 'small';
                        w = 3.2 + rand() * 1.8;
                        h = 2.4 + rand() * 1.4;
                        spriteArr = this.bushSprites.small;
                    } else if (rType < 0.90) {
                        // Low desert sagebrush
                        type = 'medium';
                        w = 4.8 + rand() * 2.0;
                        h = 3.4 + rand() * 1.5;
                        spriteArr = this.bushSprites.medium;
                    } else {
                        // Low creosote shrub
                        type = 'large';
                        w = 6.6 + rand() * 2.2;
                        h = 4.2 + rand() * 1.6;
                        spriteArr = this.bushSprites.large;
                    }
                } else {
                    if (rType < 0.44) {
                        // Round maquis dome shrub
                        type = 'maki';
                        w = 5.8 + rand() * 2.8;
                        h = 4.6 + rand() * 2.2;
                        spriteArr = this.bushSprites.maki;
                    } else if (rType < 0.70) {
                        // Small arid tuft
                        type = 'small';
                        w = 3.2 + rand() * 2.0;
                        h = 2.4 + rand() * 1.5;
                        spriteArr = this.bushSprites.small;
                    } else if (rType < 0.88) {
                        // Low desert sagebrush
                        type = 'medium';
                        w = 5.2 + rand() * 2.4;
                        h = 3.6 + rand() * 1.6;
                        spriteArr = this.bushSprites.medium;
                    } else {
                        // Low creosote shrub
                        type = 'large';
                        w = 7.4 + rand() * 2.6;
                        h = 4.6 + rand() * 1.6;
                        spriteArr = this.bushSprites.large;
                    }
                }

                const sprite = spriteArr[Math.floor(rand() * spriteArr.length)];

                bushes.push({
                    wx,
                    wy,
                    w,
                    h,
                    type,
                    sprite,
                });
                placed++;
            }
        }

        // Sort ascending by wy so background (high wy) is drawn first (painter's algorithm)
        bushes.sort((a, b) => b.wy - a.wy);
        return bushes;
    }

    _drawBush(ctx, b, camera) {
        if (!b.sprite) return;

        const s = camera.worldToScreen(b.wx, b.wy);

        // Perspective factor: Shrink smoothly towards the distant horizon (wy approaching 42 ft)
        // b.wy ranges from -18 (foreground) to +41.5 (far horizon)
        const horizonFactor = Math.max(0, Math.min(1, (b.wy + 18) / 59.5));
        const pScale = Math.max(0.42, 1.06 - horizonFactor * 0.60);

        const sw = b.w * camera.zoom * pScale;
        const sh = b.h * camera.zoom * pScale;

        // Viewport culling with margin
        if (s.x < -sw - 30 || s.x > this.w + sw + 30 || s.y < -sh - 30 || s.y > this.h + sh + 30) {
            return;
        }
        if (sw < 0.8) return;

        // Atmospheric heat haze fade: keep them clearly visible (min 70% opacity) all the way to the horizon
        const alpha = Math.max(0.70, 1.0 - horizonFactor * 0.28);

        if (alpha < 0.98) {
            ctx.globalAlpha = alpha;
            ctx.drawImage(b.sprite, s.x - sw * 0.5, s.y - sh * 0.88, sw, sh);
            ctx.globalAlpha = 1.0;
        } else {
            ctx.drawImage(b.sprite, s.x - sw * 0.5, s.y - sh * 0.88, sw, sh);
        }
    }

    _drawOpBush(ctx, sprite, x, y, w, h, alpha = 1.0) {
        if (!sprite || !sprite.complete || sprite.naturalWidth === 0) return;
        if (alpha < 0.99) {
            ctx.globalAlpha = alpha;
            ctx.drawImage(sprite, x, y, w, h);
            ctx.globalAlpha = 1.0;
        } else {
            ctx.drawImage(sprite, x, y, w, h);
        }
    }

    _drawDistantMountains(camera, hy) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = '#C9BCAB'; // Muted desert mountain ridge
        ctx.beginPath();
        ctx.moveTo(0, hy + 2);

        const px = camera.x * 0.02;
        const totalW = this.w + 60;
        for (let x = -30; x <= totalW; x += 32) {
            const worldOffset = (x + px * 20) * 0.008;
            const elev = Math.sin(worldOffset * 1.5) * 16 +
                Math.sin(worldOffset * 3.2 + 1.2) * 8 +
                Math.sin(worldOffset * 7.0) * 3;
            ctx.lineTo(x, hy - Math.max(2, elev));
        }
        ctx.lineTo(this.w + 50, hy + 2);
        ctx.closePath();
        ctx.fill();

        // Farther second layer
        ctx.fillStyle = '#D2C6B6';
        ctx.beginPath();
        ctx.moveTo(0, hy + 2);
        for (let x = -30; x <= totalW; x += 44) {
            const worldOffset = (x + px * 10 + 200) * 0.005;
            const elev = Math.sin(worldOffset * 1.1) * 24 + Math.sin(worldOffset * 2.5) * 10;
            ctx.lineTo(x, hy - Math.max(4, elev));
        }
        ctx.lineTo(this.w + 50, hy + 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    /* ================================================================== */
    /*  Extended Desert Floor & Realistic Vegetation                      */
    /* ================================================================== */
    drawGround(camera, showPadVegetation = false) {
        const ctx = this.ctx;
        const gs = camera.worldToScreen(0, 0);
        const gy = gs.y;

        ctx.save();

        // 1. EXTENDED DESERT HORIZON PLAIN (Behind pad, extending to horizon)
        // Horizon elevation in world space: 42 ft (creates natural aerospace plain depth)
        const horizon = camera.worldToScreen(0, 42);
        const hy = horizon.y;

        if (hy < this.h + 80) {
            // Distant mountain silhouette on far horizon
            this._drawDistantMountains(camera, hy);

            // Vast extended desert plain (from horizon hy down to pad line gy)
            const plainH = Math.max(0, gy - hy);
            if (plainH > 0 && hy < this.h) {
                const plainGrad = ctx.createLinearGradient(0, hy, 0, Math.min(this.h, gy));
                plainGrad.addColorStop(0, '#E6DAC7'); // Distant atmospheric sand
                plainGrad.addColorStop(0.4, '#DFCFB8');
                plainGrad.addColorStop(1, '#D5C4A9'); // Near pad sand
                ctx.fillStyle = plainGrad;
                ctx.fillRect(0, hy, this.w, plainH);

                // Distant salt flats / heat strata lines in perspective
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.lineWidth = 1;
                for (let i = 1; i <= 4; i++) {
                    const py = hy + plainH * (i / 5);
                    if (py > -10 && py < this.h + 10) {
                        ctx.beginPath();
                        ctx.moveTo(0, py);
                        ctx.lineTo(this.w, py);
                        ctx.stroke();
                    }
                }

                // Atmospheric horizon haze band
                const hazeGrad = ctx.createLinearGradient(0, hy - 15, 0, hy + 25);
                hazeGrad.addColorStop(0, 'rgba(235, 222, 205, 0)');
                hazeGrad.addColorStop(0.4, 'rgba(235, 222, 205, 0.6)');
                hazeGrad.addColorStop(1, 'rgba(235, 222, 205, 0)');
                ctx.fillStyle = hazeGrad;
                ctx.fillRect(0, hy - 15, this.w, 40);
            }
        }

        // 2. FOREGROUND DESERT FLOOR (From pad line gy down to bottom of screen)
        if (gy < this.h + 80) {
            const fgH = Math.max(0, this.h - gy + 10);
            if (fgH > 0) {
                const fgGrad = ctx.createLinearGradient(0, Math.max(0, gy), 0, this.h);
                fgGrad.addColorStop(0, '#D6C4A8'); // Sunlit desert surface crust
                fgGrad.addColorStop(0.15, '#CEBA9C');
                fgGrad.addColorStop(0.6, '#BCA484'); // Subsurface earthy soil
                fgGrad.addColorStop(1, '#A98F6E');
                ctx.fillStyle = fgGrad;
                ctx.fillRect(0, gy, this.w, fgH);

                // Ground surface crust highlight line
                ctx.fillStyle = '#E4D6BE';
                ctx.fillRect(0, gy, this.w, Math.max(1, 1.5 * camera.zoom));

                // Realistic ground texture: fine sand ripples and desert strata
                ctx.strokeStyle = 'rgba(170, 142, 108, 0.28)';
                ctx.lineWidth = 1;
                const step = Math.max(18, 40 * camera.zoom);
                const startX = -((camera.x * camera.zoom) % step);
                for (let sx = startX - step; sx < this.w + step; sx += step) {
                    ctx.beginPath();
                    ctx.moveTo(sx - 15, gy + 8);
                    ctx.lineTo(sx + 15, gy + 8);
                    ctx.stroke();
                }
            }
        }

        // 3. DESERT VEGETATION
        // Draw bushes in correct depth order (background first, foreground last).
        // Each bush handles its own position and smooth viewport culling, completely
        // eliminating any flickering or popping during liftoff and camera shake.
        for (let i = 0; i < this.bushes.length; i++) {
            this._drawBush(ctx, this.bushes[i], camera);
        }

        if (showPadVegetation) {
            for (let i = 0; i < this.padVegetation.length; i++) {
                this._drawBush(ctx, this.padVegetation[i], camera);
            }
        }

        ctx.restore();
    }

    /* ================================================================== */
    /*  Industrial Launch Pad & Umbilical Tower                           */
    /* ================================================================== */
    drawLandingPad(camera) {
        const padImg = this.opsSprites.pad;
        if (!padImg.complete || padImg.naturalWidth === 0) return;

        // Ground anchor point in screen coordinates (World: x = 0, y = 0)
        const padCenter = camera.worldToScreen(0, 0);

        // Frustum culling: skip if pad ground is completely off-screen
        if (padCenter.y < -150 || padCenter.y > this.h + 200) return;

        const ctx = this.ctx;
        ctx.save();

        // =====================================================================
        // 🛠️ PAD HİZALAMA VE BOYUT AYARLARI (Buradan İstediğin Gibi Değiştirebilirsin)
        // =====================================================================
        // 1. BOYUT (Kule Yüksekliği):
        // Büyütmek için 52'yi artır (örn: 60 veya 70), küçültmek için düşür (örn: 45).
        const padHeight = 52 * camera.zoom;
        const padWidth = padHeight * (100 / 300); // 1:3 en-boy oranı (100x300 piksel)

        // 2. X KONUMU (Sol / Sağ Hizalama):
        // 0 = Roketin tam ortası.
        // Eksi (-) kuleyi roketin soluna çeker, artı (+) sağa iter.
        const offsetX = -3 * camera.zoom;
        const padX = padCenter.x + offsetX - (padWidth / 2);

        // 3. Y KONUMU (Yukarı / Aşağı Zemin Hizalama):
        // 0 = Ayaklar tam roketin alt zemin çizgisine basar.
        // Eksi (-) kuleyi havaya kaldırır, artı (+) zemine doğru indirir.
        const offsetY = 0 * camera.zoom;
        const padY = padCenter.y + offsetY - padHeight;
        // =====================================================================

        // Pad PNG kulesini çiz
        ctx.drawImage(padImg, padX, padY, padWidth, padHeight);

        ctx.restore();
    }

    /* ================================================================== */
    /*  Launch Field Operations — Team Telemetry (Left) & Tents (Right)   */
    /* ================================================================== */
    drawFieldOperations(camera, gameState = 'pad_ready', rocket = null) {
        // Calculate ground anchor Y:
        // When on pad preset (camera.y ≈ 36, zoom ≈ 2.7), sprites are aligned directly
        // to the bottom of the screen (baseY = this.h).
        // As the rocket launches and camera ascends (camera.y rises above 36),
        // they smoothly scroll downward with the ground and exit the viewport.
        const padCameraY = 36;
        const currentZoom = camera.zoom || 2.7;
        const camRise = Math.max(0, camera.y - padCameraY);
        const shakeY = camera.shakeOffsetY || 0;
        const shakeX = camera.shakeOffsetX || 0;
        const baseY = this.h + camRise * currentZoom + shakeY;

        // Frustum culling: if sprites are completely below or above the viewport
        if (baseY < -50 || baseY - Math.min(260, this.h * 0.30) > this.h + 60) return;

        const ctx = this.ctx;
        ctx.save();

        // Responsive sizing:
        // Fuel bar width is min(88vw, 420px), centered at w/2 (so ±210px max).
        // We ensure a generous center clearance so controls and 3D rocket stay 100% visible:
        const centerClearance = Math.min(235, Math.max(140, this.w * 0.20));
        const maxWBySide = Math.max(90, (this.w / 2) - centerClearance - 20);
        const maxH = Math.min(310, Math.max(75, this.h * 0.235));
        const spriteW = Math.max(100, Math.min(maxH * 2.0, maxWBySide));
        const spriteH = spriteW / 2.0;

        const bTuft1 = this.bushSprites?.small?.[0];
        const bTuft2 = this.bushSprites?.small?.[1];
        const bSage1 = this.bushSprites?.medium?.[0];
        const bSage2 = this.bushSprites?.medium?.[1];

        // 1. --- LEFT: TELEMETRY TEAM STATION ---
        const teamImg = this.opsSprites.team;
        if (teamImg.complete && teamImg.naturalWidth > 0) {
            const teamX = Math.max(34, this.w * 0.02) + shakeX;
            const teamY = baseY - spriteH - 50;

            // (A) Çalılar - Takım Arkası & Yanları (Derinlik Katmanı)
            this._drawOpBush(ctx, bSage1, teamX - 22, teamY + spriteH * 0.42, 28, 20, 0.9);
            this._drawOpBush(ctx, bTuft1, teamX + 38, teamY + spriteH * 0.36, 22, 16, 0.85);
            this._drawOpBush(ctx, bSage2, teamX + spriteW * 0.42, teamY + spriteH * 0.44, 26, 19, 0.9);
            this._drawOpBush(ctx, bTuft2, teamX + spriteW - 14, teamY + spriteH * 0.48, 22, 16, 0.85);
            this._drawOpBush(ctx, bSage1, teamX + spriteW + 22, teamY + spriteH * 0.62, 30, 22, 0.95);

            // Takım görseli
            ctx.drawImage(teamImg, teamX, teamY, spriteW, spriteH);

            // (B) Çalılar - Takım Önü (Zemin / Ayak Hizası)
            this._drawOpBush(ctx, bTuft1, teamX + spriteW * 0.20, teamY + spriteH - 10, 20, 15);
            this._drawOpBush(ctx, bTuft2, teamX + spriteW * 0.58, teamY + spriteH - 8, 22, 16);
        }

        // 2. --- RIGHT: FIELD TENTS (CAMPSITE) ---
        const tent1Img = this.opsSprites.tent1;
        const hasTent1 = tent1Img.complete && tent1Img.naturalWidth > 0;

        // =====================================================================
        // ⛺ SAĞ TARAF ÇADIR AYARLARI (field_tent1.png)
        // =====================================================================

        // --- ÇADIR 1 (Ön Çadır - field_tent1.png) ---
        // 1. Boyut:
        // Orantılı büyütmek/küçültmek için t1Scale çarpanını kullanın (Örn: 1.0, 1.25, 1.4).
        // En-boy oranı (2:1) otomatik korunur, böylece yayvan veya basık olmaz!
        const t1Scale = 1;
        const t1Width = spriteW * t1Scale;
        const t1Height = t1Width / 2.0; // 800x400 doğal 2:1 en-boy oranı

        // 2. X Konumu (Sağ Kenardan Mesafe): Sayıyı artırdıkça sola kayar, azalttıkça sağa yanaşır
        const t1RightMargin = 20;
        const t1X = this.w - t1Width - t1RightMargin - shakeX;

        // 3. Y Konumu: Eksi (-) yukarı kaldırır, artı (+) aşağı indirir
        const t1OffsetY = -40;
        const t1Y = baseY - t1Height + t1OffsetY;

        // --- ÇADIR 2 (field_tent2.png) - İsteğiniz üzerine renderlama tamamen kapatıldı ---
        const renderTent2 = false;
        if (renderTent2 && this.opsSprites.tent2.complete && this.opsSprites.tent2.naturalWidth > 0) {
            const t2Scale = 0.85;
            const t2Width = spriteW * t2Scale;
            const t2Height = t2Width / 2.0;
            const t2RightMargin = 320;
            const t2X = this.w - t2Width - t2RightMargin - shakeX;
            const t2OffsetY = -15;
            const t2Y = baseY - t2Height + t2OffsetY;
            ctx.drawImage(this.opsSprites.tent2, t2X, t2Y, t2Width, t2Height);
        }

        // Çadır 1 çizimi ve etrafındaki çöl bitkileri
        if (hasTent1) {
            // (A) Çalılar - Çadır Arkası & Yanları (Derinlik Katmanı)
            this._drawOpBush(ctx, bSage2, t1X - 75, t1Y + t1Height * 0.52, 32, 23, 0.9);
            this._drawOpBush(ctx, bTuft1, t1X - 25, t1Y + t1Height * 0.60, 24, 18, 0.88);
            this._drawOpBush(ctx, bSage1, t1X + t1Width * 0.36, t1Y + t1Height * 0.65, 28, 20, 0.85);
            this._drawOpBush(ctx, bTuft2, t1X + t1Width * 0.70, t1Y + t1Height * 0.60, 24, 18, 0.88);
            this._drawOpBush(ctx, bSage2, t1X + t1Width - 12, t1Y + t1Height * 0.64, 28, 21, 0.9);
            this._drawOpBush(ctx, bTuft1, t1X + t1Width + 26, t1Y + t1Height * 0.70, 26, 19, 0.95);

            // Çadır 1 görseli
            ctx.drawImage(tent1Img, t1X, t1Y, t1Width, t1Height);

            // (B) Çalılar - Çadır Önü (Zemin / Ayak Hizası)
            this._drawOpBush(ctx, bTuft1, t1X + 12, t1Y + t1Height - 12, 22, 16);
            this._drawOpBush(ctx, bTuft2, t1X + t1Width * 0.45, t1Y + t1Height - 10, 24, 18);
            this._drawOpBush(ctx, bSage1, t1X + t1Width * 0.82, t1Y + t1Height - 12, 26, 19);
        }

        ctx.restore();
    }

    /* ================================================================== */
    /*  Rocket                                                             */
    /* ================================================================== */
    /**
     * Draw the rocket (3D PBR model or 2D procedural sketch fallback).
     * @param {Object} rocket    – rocket state { x, y, vx, vy, angle, fuel }
     * @param {import('./camera.js').Camera} camera
     * @param {boolean} engineOn
     * @param {string}  chuteState – 'none' | 'drogue' | 'main'
     * @param {import('./rocket3d.js').Rocket3D} [rocket3d]
     */
    drawRocket(rocket, camera, engineOn, chuteState, rocket3d = null) {
        const ctx = this.ctx;
        const screen = camera.worldToScreen(rocket.x, rocket.y);

        // =====================================================================
        // 🚀 ROKET HİZALAMA VE KONUM AYARLARI (Buradan Değiştirebilirsin)
        // =====================================================================
        // 1. X Konumu: 0 = Normal merkez. Sola kaydırmak için eksi (-), sağa kaydırmak için artı (+)
        const rocketOffsetX = 0 * camera.zoom;

        // 2. Y Konumu: 0 = Normal zemin. Yukarı kaldırmak için eksi (-), aşağı indirmek için artı (+)
        const rocketOffsetY = -25 * camera.zoom;

        const rx = screen.x + rocketOffsetX;
        const ry = screen.y + rocketOffsetY;
        // =====================================================================

        // Rocket pixel height — clamped for visibility
        const worldH = 35; // feet
        let rocketPxH = worldH * camera.zoom;
        const minPxH = 28;
        const scale = Math.max(rocketPxH, minPxH) / 100;

        // Render 3D Model if loaded, else fallback to 2D sketch
        if (rocket3d && rocket3d.isReady) {
            const drawSize = Math.max(rocketPxH * 1.28, minPxH * 1.28);
            ctx.drawImage(
                rocket3d.canvas,
                rx - drawSize / 2,
                ry - drawSize / 2,
                drawSize,
                drawSize
            );
        } else {
            ctx.save();
            ctx.translate(rx, ry);
            ctx.rotate(-rocket.angle);
            ctx.scale(scale, scale);

            // Fins (behind body)
            this._drawFins(ctx);

            // Body tube
            this._drawBody(ctx);

            // Nose cone
            this._drawNoseCone(ctx);

            // Engine nozzle
            this._drawNozzle(ctx, engineOn);

            // Team brand orange stripe (#D95623)
            ctx.fillStyle = '#D95623';
            ctx.fillRect(-9, -8, 18, 5);

            // Panel lines
            ctx.strokeStyle = 'rgba(120, 120, 120, 0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
            ctx.moveTo(-10, 15); ctx.lineTo(10, 15);
            ctx.stroke();

            ctx.restore();
        }

        // Draw parachutes (outside rocket transform)
        if (chuteState === 'drogue') {
            this._drawDrogueChute(ctx, { x: rx, y: ry }, scale, rocket.angle, rocket.drogueInflation, rocket.drogueOscillation);
        } else if (chuteState === 'main') {
            this._drawMainChute(ctx, { x: rx, y: ry }, scale, rocket.angle, rocket.chuteInflation, rocket.chuteOscillation);
        }
    }

    _drawNoseCone(ctx) {
        ctx.save();
        // Metallic gradient
        const grad = ctx.createLinearGradient(-10, -50, 10, -50);
        grad.addColorStop(0, '#B0B8C0');
        grad.addColorStop(0.4, '#E8ECF0');
        grad.addColorStop(0.6, '#D5D8DC');
        grad.addColorStop(1, '#A0A8B0');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(0, -55);
        ctx.bezierCurveTo(4, -48, 9, -38, 10, -28);
        ctx.lineTo(-10, -28);
        ctx.bezierCurveTo(-9, -38, -4, -48, 0, -55);
        ctx.closePath();
        ctx.fill();

        // Nose tip highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -54);
        ctx.bezierCurveTo(2, -48, 5, -42, 6, -35);
        ctx.stroke();
        ctx.restore();
    }

    _drawBody(ctx) {
        ctx.save();
        // Metallic body gradient
        const grad = ctx.createLinearGradient(-10, 0, 10, 0);
        grad.addColorStop(0, '#B8BFC6');
        grad.addColorStop(0.3, '#DCE0E5');
        grad.addColorStop(0.5, '#D0D5DA');
        grad.addColorStop(1, '#A8B0B8');
        ctx.fillStyle = grad;
        ctx.fillRect(-10, -28, 20, 60);

        // Body outline
        ctx.strokeStyle = 'rgba(100, 110, 120, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-10, -28, 20, 60);
        ctx.restore();
    }

    _drawFins(ctx) {
        ctx.save();
        ctx.fillStyle = '#7F8C8D';

        // Left fin
        ctx.beginPath();
        ctx.moveTo(-10, 28);
        ctx.lineTo(-22, 38);
        ctx.lineTo(-18, 28);
        ctx.lineTo(-10, 20);
        ctx.closePath();
        ctx.fill();

        // Right fin
        ctx.beginPath();
        ctx.moveTo(10, 28);
        ctx.lineTo(22, 38);
        ctx.lineTo(18, 28);
        ctx.lineTo(10, 20);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(60,70,80,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
    }

    _drawNozzle(ctx, engineOn) {
        ctx.save();

        // Nozzle bell shape
        ctx.fillStyle = '#5D6D7E';
        ctx.beginPath();
        ctx.moveTo(-7, 32);
        ctx.lineTo(-10, 42);
        ctx.lineTo(10, 42);
        ctx.lineTo(7, 32);
        ctx.closePath();
        ctx.fill();

        // Inner glow when engine is on
        if (engineOn) {
            const glowGrad = ctx.createRadialGradient(0, 40, 0, 0, 40, 12);
            glowGrad.addColorStop(0, 'rgba(255, 200, 50, 0.9)');
            glowGrad.addColorStop(0.5, 'rgba(255, 120, 20, 0.5)');
            glowGrad.addColorStop(1, 'rgba(255, 60, 10, 0)');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(0, 42, 12, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _drawDrogueChute(ctx, rocketScreen, scale, angle, inflation = 1.0, oscillation = 0) {
        const sprites = this.parachuteSprites.drogue;
        if (sprites.every((sprite) => sprite.complete && sprite.naturalWidth > 0)) {
            this._drawParachuteSprite(ctx, rocketScreen, scale, angle, inflation, oscillation, sprites, 'drogue');
            return;
        }

        ctx.save();
        const infl = Math.max(0.20, Math.min(1.0, inflation));
        // Yüksek hızlı hava akımında dinamik kanat titreşimi ve nefes alma
        const flutter = 1.0 + 0.05 * Math.sin((oscillation || 0) * 5.8) + 0.02 * Math.cos((oscillation || 0) * 8.4);
        const size = Math.max(16, 44 * scale * infl * flutter);
        const ropeLen = Math.max(28, 36 * scale);
        // Rüzgarda ve hücum açısında salınan kanopi merkezi
        const cx = rocketScreen.x - Math.sin(angle) * ropeLen * 0.50;
        const cy = rocketScreen.y - ropeLen;

        // Shroud lines (4 Kevlar suspension lines)
        ctx.strokeStyle = 'rgba(210, 210, 210, 0.65)';
        ctx.lineWidth = 1;
        const lines = 4;
        for (let i = 0; i < lines; i++) {
            const lx = cx + (i / (lines - 1) - 0.5) * size * 0.88;
            ctx.beginPath();
            ctx.moveTo(rocketScreen.x + (i / (lines - 1) - 0.5) * 6 * scale, rocketScreen.y - 50 * scale);
            ctx.lineTo(lx, cy);
            ctx.stroke();
        }

        // Drogue canopy - conical aerodynamic drag shape with high-vis panels
        const coneH = size * 0.72;
        const halfW = size * 0.5;

        // Base conical canopy fill (Darker Orange / Red underside)
        ctx.fillStyle = '#C0392B';
        ctx.beginPath();
        ctx.moveTo(cx, cy - coneH);
        ctx.lineTo(cx - halfW, cy);
        ctx.lineTo(cx + halfW, cy);
        ctx.closePath();
        ctx.fill();

        // High-vis bright center panel (Safety Dayglo Orange)
        ctx.fillStyle = '#E67E22';
        ctx.beginPath();
        ctx.moveTo(cx, cy - coneH);
        ctx.lineTo(cx - halfW * 0.45, cy);
        ctx.lineTo(cx + halfW * 0.45, cy);
        ctx.closePath();
        ctx.fill();

        // Canopy outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - coneH);
        ctx.lineTo(cx - halfW, cy);
        ctx.lineTo(cx + halfW, cy);
        ctx.closePath();
        ctx.stroke();

        // Tepe hava tahliye deliği (Apex Spill Vent - girdap ve takla önleyici)
        ctx.fillStyle = '#1A252F';
        ctx.beginPath();
        ctx.arc(cx, cy - coneH + 1.5, Math.max(1.5, 3 * scale * infl), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawMainChute(ctx, rocketScreen, scale, angle, inflation = 1.0, oscillation = 0) {
        const sprites = this.parachuteSprites.main;
        if (sprites.every((sprite) => sprite.complete && sprite.naturalWidth > 0)) {
            this._drawParachuteSprite(ctx, rocketScreen, scale, angle, inflation, oscillation, sprites, 'main');
            return;
        }

        ctx.save();
        const infl = Math.max(0.25, Math.min(1.0, inflation));
        // Doğal kanat nefes alma ve hava dalgalanması
        const breathing = 1.0 + 0.04 * Math.sin((oscillation || 0) * 2.5);
        const size = Math.max(22, 92 * scale * infl * breathing);
        const ropeLen = Math.max(38, 55 * scale);
        // Rüzgarda salınan kanopi merkezi
        const cx = rocketScreen.x - Math.sin(angle) * ropeLen * 0.45;
        const cy = rocketScreen.y - ropeLen;

        // Shroud lines
        ctx.strokeStyle = 'rgba(180,180,180,0.55)';
        ctx.lineWidth = 1;
        const lines = 6;
        for (let i = 0; i < lines; i++) {
            const lx = cx + (i / (lines - 1) - 0.5) * size * 0.92;
            ctx.beginPath();
            ctx.moveTo(rocketScreen.x + (i / (lines - 1) - 0.5) * 8 * scale, rocketScreen.y - 50 * scale);
            ctx.lineTo(lx, cy);
            ctx.stroke();
        }

        // Main canopy (large dome, red & white stripes)
        const domeHeight = size * 0.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, size * 0.5, domeHeight, 0, Math.PI, 0);
        ctx.closePath();

        // Red and white striped fill
        const stripes = 8;
        const stripeW = size / stripes;
        ctx.save();
        ctx.clip();
        for (let i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#E74C3C' : '#FFFFFF';
            ctx.fillRect(cx - size * 0.5 + i * stripeW, cy - domeHeight, stripeW, domeHeight + 2);
        }
        ctx.restore();

        // Canopy outline
        ctx.beginPath();
        ctx.ellipse(cx, cy, size * 0.5, domeHeight, 0, Math.PI, 0);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Tepe hava tahliye deliği (Apex Vent)
        ctx.fillStyle = '#2C3E50';
        ctx.beginPath();
        ctx.arc(cx, cy - domeHeight + 1.5, Math.max(2, 4 * scale * infl), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawParachuteSprite(ctx, rocketScreen, scale, angle, inflation, oscillation, sprites, type) {
        const infl = Math.max(0, Math.min(1, inflation));
        const frameIndex = Math.min(
            sprites.length - 1,
            Math.floor(infl * sprites.length)
        );
        const sprite = sprites[frameIndex];
        const isMain = type === 'main';
        const breathing = isMain
            ? 1 + Math.sin(oscillation * 2.5) * 0.025
            : 1 + Math.sin(oscillation * 5.8) * 0.035;
        const size = (isMain ? 122 : 68) * scale * breathing;
        const ropeLength = (isMain ? 68 : 69) * scale;
        const sway = Math.sin(oscillation * (isMain ? 2.5 : 5.0)) * (isMain ? 0.07 : 0.11);
        const canopyAngle = sway;
        const cx = rocketScreen.x - Math.sin(angle) * ropeLength * 0.35;
        const cy = rocketScreen.y - ropeLength;
        const boxTop = cy - size * 0.82;
        const boxBottom = boxTop + size;
        const rocketAnchorY = rocketScreen.y - 48 * scale;
        const lineCount = isMain ? 6 : 4;
        const packedLineWidth = isMain ? 2.5 : 2;
        const openLineWidth = size * (isMain ? 0.78 : 0.12);
        const canopyWidth = packedLineWidth + (openLineWidth - packedLineWidth) * infl;
        const rocketLineWidth = isMain
            ? 1.5 + infl * 8.5 * scale
            : 1.2 + infl * 10 * scale;

        ctx.save();
        ctx.lineWidth = Math.max(0.8, scale * 0.9);
        ctx.strokeStyle = isMain
            ? 'rgba(220, 225, 230, 0.78)'
            : 'rgba(205, 215, 220, 0.72)';
        ctx.lineCap = 'round';

        for (let i = 0; i < lineCount; i++) {
            const t = lineCount === 1 ? 0.5 : i / (lineCount - 1);
            const rocketX = rocketScreen.x + (t - 0.5) * rocketLineWidth;
            const canopyX = cx + (t - 0.5) * canopyWidth;
            const controlX = rocketX + (canopyX - rocketX) * 0.22
                + Math.sin(oscillation * 2 + i) * 0.6 * scale;
            const controlY = rocketAnchorY + (boxBottom - rocketAnchorY) * 0.32;

            ctx.beginPath();
            ctx.moveTo(rocketX, rocketAnchorY);
            ctx.quadraticCurveTo(controlX, controlY, canopyX, boxBottom - size * 0.08);
            ctx.stroke();
        }

        ctx.translate(cx, boxTop + size * 0.5);
        ctx.rotate(canopyAngle);
        ctx.globalAlpha = Math.max(0.45, 0.35 + infl * 0.65);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = Math.max(1, 4 * scale);
        ctx.shadowOffsetY = Math.max(1, 2 * scale);
        ctx.drawImage(sprite, -size * 0.5, -size * 0.5, size, size);
        ctx.restore();
    }

    /* ================================================================== */
    /*  Altitude Markers                                                   */
    /* ================================================================== */
    drawAltitudeMarkers(camera, rocketAlt) {
        const ctx = this.ctx;

        // Draw markers every 500 ft up to 13,000 ft, plus special markers at 400 ft (main chute) and 10,000 ft (target)
        const markers = [];
        for (let a = 500; a <= 13000; a += 500) markers.push(a);
        if (!markers.includes(400)) markers.push(400);
        markers.sort((a, b) => a - b);

        ctx.save();
        ctx.font = `600 ${Math.max(9, 11)}px 'Inter', sans-serif`;
        ctx.textBaseline = 'middle';

        for (const alt of markers) {
            const s = camera.worldToScreen(0, alt);
            if (s.y < -20 || s.y > this.h + 20) continue;

            const isTarget = alt === 10000;
            const isMainArmed = alt === 400;
            const isMajor = alt % 1000 === 0;

            const alpha = isTarget ? 0.85 : (isMainArmed ? 0.70 : (isMajor ? 0.30 : 0.12));

            // Dashed line across screen
            if (isTarget) {
                ctx.strokeStyle = '#F1C40F';
                ctx.lineWidth = 1.8;
                ctx.setLineDash([8, 4]);
            } else if (isMainArmed) {
                ctx.strokeStyle = '#2ECC71';
                ctx.lineWidth = 1.4;
                ctx.setLineDash([6, 4]);
            } else if (isMajor) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = 0.8;
                ctx.setLineDash([4, 6]);
            } else {
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = 0.5;
                ctx.setLineDash([2, 8]);
            }

            ctx.beginPath();
            ctx.moveTo(0, s.y);
            ctx.lineTo(this.w, s.y);
            ctx.stroke();

            // Label on right edge
            ctx.setLineDash([]);
            if (isTarget) {
                ctx.fillStyle = '#F1C40F';
                ctx.textAlign = 'right';
                ctx.font = `bold 12px 'Inter', sans-serif`;
                ctx.fillText('★ 10,000 FT TARGET', this.w - 12, s.y - 8);
                ctx.font = `600 11px 'Inter', sans-serif`;
            } else if (isMainArmed) {
                ctx.fillStyle = '#2ECC71';
                ctx.textAlign = 'right';
                ctx.fillText('MAIN CHUTE (400 FT)', this.w - 12, s.y - 7);
            } else if (isMajor) {
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.25})`;
                ctx.textAlign = 'right';
                const label = alt >= 1000 ? `${(alt / 1000).toFixed(0)}K` : `${alt}`;
                ctx.fillText(label + ' ft', this.w - 12, s.y - 6);
            } else {
                // Subtle 500 ft sub-marker
                ctx.fillStyle = `rgba(255, 255, 255, 0.22)`;
                ctx.textAlign = 'right';
                const label = `${(alt / 1000).toFixed(1)}K`;
                ctx.fillText(label, this.w - 12, s.y - 5);
            }
        }

        ctx.restore();
    }

    /* ================================================================== */
    /*  Cinematic Atmospheric VFX (Anamorphic flare & sun glint)          */
    /* ================================================================== */
    drawCinematicVFX(camera, progress) {
        const ctx = this.ctx;
        ctx.save();

        // 1. Desert sun position in screen coordinates
        const sunPos = camera.worldToScreen(20, 160);
        const p = Math.max(0, Math.min(1, progress || 0));

        // Soft sun glint
        if (sunPos.y > -50 && sunPos.y < this.h + 50) {
            const glintGrad = ctx.createRadialGradient(sunPos.x, sunPos.y, 4, sunPos.x, sunPos.y, 140);
            glintGrad.addColorStop(0, 'rgba(255, 248, 220, 0.45)');
            glintGrad.addColorStop(0.3, 'rgba(255, 180, 80, 0.20)');
            glintGrad.addColorStop(1, 'rgba(255, 180, 80, 0)');
            ctx.fillStyle = glintGrad;
            ctx.beginPath();
            ctx.arc(sunPos.x, sunPos.y, 140, 0, Math.PI * 2);
            ctx.fill();

            // Anamorphic horizontal lens flare streak
            const flareAlpha = (0.24 - Math.abs(p - 0.5) * 0.15) * 0.85;
            if (flareAlpha > 0.02) {
                const flareGrad = ctx.createLinearGradient(0, sunPos.y, this.w, sunPos.y);
                flareGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
                flareGrad.addColorStop(0.35, `rgba(56, 189, 248, ${flareAlpha * 0.7})`);
                flareGrad.addColorStop(0.5, `rgba(255, 255, 255, ${flareAlpha * 1.4})`);
                flareGrad.addColorStop(0.65, `rgba(251, 146, 60, ${flareAlpha * 0.8})`);
                flareGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
                ctx.fillStyle = flareGrad;
                ctx.fillRect(0, sunPos.y - 1.5, this.w, 3);
            }
        }

        ctx.restore();
    }
}

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */
function _lerpC(a, b, t) {
    return Math.round(a + (b - a) * t);
}

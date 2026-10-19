/**
 * physics.js — Kinematics & Physics Engine
 * ==========================================
 * Handles gravity, thrust, drag, fuel, wind gusts, and Euler integration.
 * All units are in feet and seconds.
 */

/* ====================================================================== */
/*  Constants                                                              */
/* ====================================================================== */
export const PHYSICS = {
    // Core forces
    GRAVITY: 32.174,      // ft/s²  (Earth standard)
    THRUST_ACCEL: 450.0,       // ft/s²  acceleration during burn (62% fuel -> 10,000 ft)

    // Fuel
    FUEL_MAX: 100,         // percentage (0–100)
    FUEL_FILL_RATE: 85.0,        // %/second
    FUEL_BURN_RATE: 20.0,        // %/second during powered ascent

    // Aerodynamic clean profile (Ascent)
    DRAG_CLEAN: 0.0001,      // rocket body low-drag profile

    // ======================================================================
    // 🪂 PARAŞÜT VE İNİŞ PARAMETRELERİ (AYARLANABİLİR PARAMETRELER)
    // ======================================================================
    // 1. Serbest Düşüş (Paraşütsüz)
    SERBEST_DUSUS_HIZI: 150.0,       // ft/s (Paraşüt açılmadığında serbest düşüş terminal hızı)

    // 2. Drogue (Drag) Paraşütü
    DROGUE_HEDEF_HIZ: 100.2,        // ft/s (Drogue açıldığında ineceği terminal hız)
    DROGUE_FRENLEME_GUCU: 0.5,         // Drogue yavaşlama katsayısı (k)
    DROGUE_SISME_SURESI: 0.8,         // Drogue kanopisinin tam şişme süresi (sn)

    // 3. Ana Paraşüt (Main Chute)
    PARASUT_HEDEF_HIZ: 20.0,        // ft/s (Tam açıldığında ineceği hedef hız)
    PARASUT_FRENLEME_GUCU: 0.7,        // Ne kadar çabuk yavaşlayacağı (k katsayısı)
    PARASUT_SISME_SURESI: 1.0,         // Kanopinin tam şişmesi için gereken süre (sn)

    // 4. İniş Eşikleri (Yere Temas Kontrolü)
    SAFE_LANDING_VY: 30.0,        // ft/s (<= 15 ft/s: Başarılı İniş!)
    HARD_LANDING_VY: 40.0,        // ft/s (15 - 40 ft/s: Sert İniş / Hasarlı)
    // (> 40 ft/s: Kırım / Çakılma!)
    SAFE_LANDING_ANGLE: 12.0,        // degrees max tilt

    // Wind gusts (descent only)
    WIND_GUST_MIN: -9.0,        // ft/s²  lateral  (left)
    WIND_GUST_MAX: 9.0,        // ft/s²  lateral  (right)
    WIND_GUST_INTERVAL: [2.0, 5.5],  // seconds between gusts
    WIND_GUST_DURATION: [0.4, 2.0],  // seconds per gust

    // Altitude markers
    TARGET_ALTITUDE: 10000,       // ft — the bullseye
    MAIN_CHUTE_ALT: 800,         // ft — main chute arming altitude (window from 800 down to 100 ft)
};

/* ====================================================================== */
/*  Rocket state factory                                                   */
/* ====================================================================== */
/**
 * Create a fresh rocket state object.
 * @returns {Object} rocket
 */
export function createRocket() {
    return {
        x: 0,        // ft  (0 = pad center)
        y: 0,        // ft  (0 = ground)
        vx: 0,        // ft/s
        vy: 0,        // ft/s (+ yukarı, - aşağı)
        angle: 0,        // radians (0 = upright)
        fuel: 0,        // 0–100
        thrustFactor: 1.0,      // ±5% motor/aerodynamic flight variance
        drogueTimer: 0,        // drogue açılış süresi sayacı (sn)
        drogueInflation: 0,        // 0.0 to 1.0 drogue şişme oranı
        drogueOscillation: 0,        // drogue kanat hava salınımı
        chuteTimer: 0,        // ana paraşüt açılış süresi sayacı (sn)
        chuteInflation: 0,        // 0.0 to 1.0 ana paraşüt şişme oranı
        chuteOscillation: 0,        // ana paraşüt kanat nefes alma osilasyonu
        chuteDeployAlt: 0,        // açıldığı irtifa (ft)
        impactVy: 0,        // ground touchdown impact velocity (ft/s)
    };
}

/* ====================================================================== */
/*  Wind System                                                            */
/* ====================================================================== */
export class WindSystem {
    constructor() {
        this.currentForce = 0;       // current lateral acceleration (ft/s²)
        this.gustTarget = 0;       // target force of current gust
        this.gustTimer = 3.0;     // time until next gust starts
        this.gustRemaining = 0;      // seconds left in current gust
        this.active = false;  // only active during descent
    }

    reset() {
        this.currentForce = 0;
        this.gustTarget = 0;
        this.gustTimer = _rand(2.0, 4.0);
        this.gustRemaining = 0;
        this.active = false;
    }

    /**
     * Update wind and return the lateral force to apply.
     * @param {number} dt
     * @returns {number} lateral acceleration in ft/s²
     */
    update(dt) {
        if (!this.active) { this.currentForce = 0; return 0; }

        // Count down to next gust
        if (this.gustRemaining <= 0) {
            this.gustTimer -= dt;
            if (this.gustTimer <= 0) {
                // Start a new gust
                this.gustTarget = _rand(PHYSICS.WIND_GUST_MIN, PHYSICS.WIND_GUST_MAX);
                this.gustRemaining = _rand(...PHYSICS.WIND_GUST_DURATION);
                this.gustTimer = _rand(...PHYSICS.WIND_GUST_INTERVAL);
            }
        }

        // Apply gust or decay
        if (this.gustRemaining > 0) {
            this.gustRemaining -= dt;
            this.currentForce = _lerp(this.currentForce, this.gustTarget, dt * 5);
        } else {
            this.currentForce = _lerp(this.currentForce, 0, dt * 3);
        }

        return this.currentForce;
    }
}

/* ====================================================================== */
/*  Physics Engine                                                         */
/* ====================================================================== */
export class PhysicsEngine {
    constructor() {
        this.wind = new WindSystem();
    }

    /**
     * Integrate one physics step.
     * @param {Object}  rocket       – mutable rocket state
     * @param {number}  dt           – seconds (should be capped ≤ 1/30)
     * @param {boolean} engineOn     – is the engine firing?
     * @param {string}  chuteState   – 'none' | 'drogue' | 'main'
     * @returns {{ windForce: number }}
     */
    update(rocket, dt, engineOn, chuteState) {
        const stepDt = Math.min(dt, 0.05);

        // 1. Tırmanış / Motor Evresi (Ascent / Powered Burn / Coasting to Apogee)
        if (engineOn || rocket.vy > 0) {
            // Yerçekimi
            rocket.vy -= PHYSICS.GRAVITY * stepDt;

            // Motor itkisi (Açı ve rastgele ±%5 motor faktörü ile)
            if (engineOn && rocket.fuel > 0) {
                const thrust = PHYSICS.THRUST_ACCEL * (rocket.thrustFactor ?? 1.0);
                rocket.vy += thrust * Math.cos(rocket.angle) * stepDt;
                rocket.vx += thrust * Math.sin(rocket.angle) * stepDt;
                rocket.fuel -= PHYSICS.FUEL_BURN_RATE * stepDt;
                if (rocket.fuel < 0) rocket.fuel = 0;
            }

            // Aerodinamik gövde sürtünmesi (Yükselirken)
            const speedY = Math.abs(rocket.vy);
            const speedX = Math.abs(rocket.vx);
            rocket.vy -= PHYSICS.DRAG_CLEAN * speedY * rocket.vy * stepDt;
            rocket.vx -= PHYSICS.DRAG_CLEAN * speedX * rocket.vx * stepDt;
        }
        // 2. İniş Evresi (Descent: Apogee sonrası düşüş, paraşüt ve serbest düşüş)
        else {
            let mevcutHiz = Math.abs(rocket.vy); // Aşağı yönlü hız (ft/s)

            if (chuteState === 'main') {
                // 1. Paraşüt şişme oranı (0'dan 1'e kadar PARASUT_SISME_SURESI içinde artar)
                rocket.chuteTimer = (rocket.chuteTimer || 0) + stepDt;
                const sismeOrani = Math.min(1.0, Math.max(0, rocket.chuteTimer / PHYSICS.PARASUT_SISME_SURESI));
                rocket.chuteInflation = sismeOrani;
                rocket.chuteOscillation = (rocket.chuteOscillation || 0) + stepDt;

                // 2. Şişme oranına göre anlık frenleme gücü
                const aktifFrenGucu = PHYSICS.PARASUT_FRENLEME_GUCU * sismeOrani;

                // 3. Hızı eksponansiyel olarak PARASUT_HEDEF_HIZ'e (10 ft/s) yaklaştır
                mevcutHiz -= (mevcutHiz - PHYSICS.PARASUT_HEDEF_HIZ) * aktifFrenGucu * stepDt;
                rocket.vy = -Math.max(0, mevcutHiz);
            }
            else if (chuteState === 'drogue') {
                // 1. Drogue şişme oranı (0'dan 1'e kadar DROGUE_SISME_SURESI içinde artar)
                rocket.drogueTimer = (rocket.drogueTimer || 0) + stepDt;
                const sismeOrani = Math.min(1.0, Math.max(0, rocket.drogueTimer / PHYSICS.DROGUE_SISME_SURESI));
                rocket.drogueInflation = sismeOrani;
                rocket.drogueOscillation = (rocket.drogueOscillation || 0) + stepDt;

                // 2. Drogue anlık frenleme gücü
                const aktifFrenGucu = PHYSICS.DROGUE_FRENLEME_GUCU * sismeOrani;

                // 3. Hızı eksponansiyel olarak DROGUE_HEDEF_HIZ'e (55 ft/s) yaklaştır
                mevcutHiz -= (mevcutHiz - PHYSICS.DROGUE_HEDEF_HIZ) * aktifFrenGucu * stepDt;
                rocket.vy = -Math.max(0, mevcutHiz);
            }
            else {
                // Paraşüt kapalıyken hızı serbest düşüş terminal hızına yaklaştır (32.2 * dt)
                if (mevcutHiz < PHYSICS.SERBEST_DUSUS_HIZI) {
                    mevcutHiz = Math.min(PHYSICS.SERBEST_DUSUS_HIZI, mevcutHiz + PHYSICS.GRAVITY * stepDt);
                } else {
                    mevcutHiz = Math.max(PHYSICS.SERBEST_DUSUS_HIZI, mevcutHiz - PHYSICS.GRAVITY * stepDt);
                }
                rocket.vy = -mevcutHiz;
            }
        }

        // 3. Rüzgar ve Yatay Hareket (Descent lateral wind & tilt)
        const windForce = this.wind.update(stepDt);
        if (chuteState !== 'none') {
            // Paraşüt açıkken rüzgar roketi sürükler, yatay hızı rüzgara dengeler
            rocket.vx = _lerp(rocket.vx, windForce, stepDt * 2.5);
            const windAngle = windForce * 0.008;
            rocket.angle = _lerp(rocket.angle, windAngle, stepDt * 2.5);
        } else {
            rocket.vx += windForce * stepDt;
            rocket.vx = _lerp(rocket.vx, 0, stepDt * 0.5);
            if (rocket.y > 0 && !engineOn) {
                rocket.angle += rocket.vx * 0.0003 * stepDt;
            }
        }

        // 4. Konum İntegrasyonu (Position Integration)
        rocket.y += rocket.vy * stepDt;
        rocket.x += rocket.vx * stepDt;

        // 5. Yere Temas Kontrolü (Ground Touchdown Check)
        if (rocket.y <= 0) {
            rocket.impactVy = Math.abs(rocket.vy);
            rocket.y = 0;
            rocket.vy = 0;
            rocket.vx *= 0.5; // Zemin sürtünmesi
        }

        return { windForce };
    }
}

/* ====================================================================== */
/*  Scoring                                                                */
/* ====================================================================== */
export function calculateScore(apogee, touchdownVy, padOffset, chutePenalty = 0, isCrashed = false) {
    const rawAltScore = Math.max(0, 5000 - Math.abs(apogee - PHYSICS.TARGET_ALTITUDE) * 2);
    const altitudeScore = Math.max(0, rawAltScore - chutePenalty);

    // Yere Temas Kontrolü ve Puanlama:
    let touchdownScore = 0;
    let padScore = 0;
    let status = 'LANDED'; // 'LANDED' (Başarılı İniş) | 'DAMAGED' (Sert İniş Hasarlı) | 'CRASHED' (Kırım / Çakılma)

    if (isCrashed || touchdownVy > PHYSICS.HARD_LANDING_VY) {
        // Kırım / Çakılma (> 40 ft/s)
        status = 'CRASHED';
        touchdownScore = 0;
        padScore = 0;
    } else if (touchdownVy > PHYSICS.SAFE_LANDING_VY) {
        // Sert İniş (Hasarlı) (15 - 40 ft/s)
        status = 'DAMAGED';
        touchdownScore = Math.max(0, 1600 - (touchdownVy - PHYSICS.SAFE_LANDING_VY) * 55);
        padScore = Math.max(0, 1500 - padOffset * 40);
    } else {
        // Başarılı İniş (<= 15 ft/s)
        status = 'LANDED';
        touchdownScore = Math.max(0, 3000 - touchdownVy * 100);
        padScore = Math.max(0, 2000 - padOffset * 50);
    }

    const total = Math.round(altitudeScore + touchdownScore + padScore);

    // Accuracy percentage to 10k ft (0-100%)
    const deviation = Math.abs(apogee - PHYSICS.TARGET_ALTITUDE);
    const altitudeAccuracy = Math.max(0, Math.min(100, +(100 - (deviation / PHYSICS.TARGET_ALTITUDE) * 100).toFixed(2)));

    let stars = 1;
    if (status === 'CRASHED') {
        stars = 1;
    } else if (status === 'DAMAGED') {
        stars = total >= 4000 ? 3 : 2;
    } else {
        if (total >= 2000) stars = 2;
        if (total >= 4500) stars = 3;
        if (total >= 7000) stars = 4;
        if (total >= 8800) stars = 5;
    }

    return {
        total,
        altitudeScore: Math.round(altitudeScore),
        touchdownScore: Math.round(touchdownScore),
        padScore: Math.round(padScore),
        chutePenalty: Math.round(chutePenalty),
        altitudeAccuracy,
        status,
        stars,
    };
}

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */
function _rand(min, max) {
    return min + Math.random() * (max - min);
}

function _lerp(a, b, t) {
    return a + (b - a) * Math.min(t, 1);
}

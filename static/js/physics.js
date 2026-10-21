/**
 * physics.js — Kinematics & Physics Engine
 * ==========================================
 * Handles gravity, thrust, drag, wind gusts, canopy steering, 
 * deployment shock, and Euler integration.
 * All units are in feet and seconds.
 */

/* ====================================================================== */
/*  Constants                                                              */
/* ====================================================================== */
export const PHYSICS = {
    // Core forces
    GRAVITY: 32.174,            // ft/s² (Dünya yerçekimi — her an etkindir)
    THRUST_ACCEL: 450.0,        // ft/s² motor itkisi (62% yakıt -> 10.000 ft)

    // Fuel
    FUEL_MAX: 100,              // % (0–100)
    FUEL_FILL_RATE: 85.0,       // %/sn dolum hızı
    FUEL_BURN_RATE: 20.0,       // %/sn yanış hızı

    // Aerodynamic profile (Ascent)
    DRAG_CLEAN: 0.0001,         // Temiz gövde sürtünme profili

    // ======================================================================
    // 🪂 PARAŞÜT VE İNİŞ PARAMETRELERİ (YENİLENMİŞ GERÇEKÇİ FİZİK)
    // ======================================================================
    // 1. Serbest Düşüş (Paraşütsüz)
    SERBEST_DUSUS_HIZI: 180.0,  // ft/s (~122 mph balistik terminal hız)

    // 2. Drogue (Stabilizasyon) Paraşütü
    DROGUE_HEDEF_HIZ: 90.0,
    DROGUE_FRENLEME_GUCU: 1.45,
    DROGUE_SISME_SURESI: 0.9,

    // 2. Ana Paraşüt (Yönlendirme cezasında bile güvenli inebilmesi için ufak revize)
    PARASUT_HEDEF_HIZ: 16.5,        // 18.0 yerine 16.5 (Steer yapınca 16.5 * 1.25 = 20.6 ft/s olur, 22'nin altında kalır!)
    PARASUT_FRENLEME_GUCU: 1.25,    // 1.15 yerine 1.25 (İrtifa kaybını dengeler)
    PARASUT_SISME_SURESI: 1.4,      // 1.4 sn (Önerilen değer - ağır ve gerçekçi açılış hissi) (Kanopinin dolma süresi)

    // 4. İniş Eşikleri (Yere Temas Toleransları)
    SAFE_LANDING_VY: 18.0,      // ft/s (<= 18 ft/s: Başarılı & Hasarsız İniş)
    HARD_LANDING_VY: 40.0,      // ft/s (25 - 45 ft/s: Sert İniş / Hasarlı)
                                // (> 42 ft/s: Kırım / Çakılma!)
    SAFE_LANDING_ANGLE: 15.0,   // Derece cinsinden maksimum güvenli eğim

    // 5. Oynanış ve Zaman Ölçeği
    // 10.000 ft -> 1.500 ft drogue inişini 90 saniyeden ~25 saniyeye indiren dikey ölçek
    HIGH_ALT_DESCENT_SCALE: 2.8,

    // Rüzgar ve Sapma
    WIND_GUST_MIN: -24.0,       // ft/s² yanal ivme (Sol)
    WIND_GUST_MAX: 24.0,        // ft/s² yanal ivme (Sağ)
    WIND_GUST_INTERVAL: [1.0, 3.0],
    WIND_GUST_DURATION: [0.9, 3.0],

    // İrtifa Eşikleri
    TARGET_ALTITUDE: 10000,     // ft (Hedef irtifa)
    MAIN_CHUTE_ARM_ALT: 400,        // 800 yerine 900 ft
    SWEET_SPOT_MAX: 380,            // Cesaret bonusu üst sınırı
    SWEET_SPOT_MIN: 330,            // Cesaret bonusu alt sınırı
    MIN_SAFE_DEPLOY_ALT: 260,       // 240 yerine 260 ft (260-320 arası Hasarlı İniş, <260 Kesin Kırım!)

    FLUTTER_ANGLE: 50 * Math.PI / 180,
    FLUTTER_ALTITUDE_FACTOR: 0.58,
};

/* ====================================================================== */
/*  Rocket state factory                                                   */
/* ====================================================================== */
export function createRocket() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const randomPadX = Math.round(side * _rand(180, 480));
    return {
        x: 0,                   // ft (0 = rampa merkezi)
        y: 0,                   // ft (0 = zemin)
        randomPadX,
        targetPadX: randomPadX, // 🎯 SpaceX İniş Platformu X koordinatı
        vx: 0,                  // ft/s
        vy: 0,                  // ft/s (+ yukarı, - aşağı)
        angle: 0,               // radyan (0 = tam dik)
        angularVelocity: 0,
        steerInput: 0,          // -1 (sol), 0 (boşta), +1 (sağ) paraşüt yönlendirmesi
        lateralBias: (Math.random() < 0.5 ? -1 : 1) * _rand(0.7, 1.2),
        lateralPhase: _rand(0, Math.PI * 2),
        failureType: 'NONE',
        avionicsFailed: false,
        flutterActive: false,
        telemetryLost: false,
        fuel: 0,
        thrustFactor: 1.0,
        drogueTimer: 0,
        drogueInflation: 0,
        drogueOscillation: 0,
        chuteTimer: 0,
        chuteInflation: 0,
        chuteOscillation: 0,
        chuteDeployAlt: 0,      // Ana paraşütün açıldığı irtifa
        impactVy: 0,            // Yere temas anındaki düşey hız
    };
}

/* ====================================================================== */
/*  Wind System                                                            */
/* ====================================================================== */
export class WindSystem {
    constructor() {
        this.currentForce = 0;
        this.gustTarget = 0;
        this.gustTimer = 3.0;
        this.gustRemaining = 0;
        this.active = false;
        this.locked = false;
    }

    reset() {
        this.currentForce = 0;
        this.gustTarget = 0;
        this.gustTimer = _rand(2.0, 4.0);
        this.gustRemaining = 0;
        this.active = false;
        this.locked = false;
    }

    lock() {
        this.locked = true;
    }

    update(dt) {
        if (!this.active) { this.currentForce = 0; return 0; }
        if (this.locked) return this.currentForce;

        if (this.gustRemaining <= 0) {
            this.gustTimer -= dt;
            if (this.gustTimer <= 0) {
                this.gustTarget = _rand(PHYSICS.WIND_GUST_MIN, PHYSICS.WIND_GUST_MAX);
                this.gustRemaining = _rand(...PHYSICS.WIND_GUST_DURATION);
                this.gustTimer = _rand(...PHYSICS.WIND_GUST_INTERVAL);
            }
        }

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
     * @param {number}  dt           – seconds (capped ≤ 0.05)
     * @param {boolean} engineOn     – is the engine firing?
     * @param {string}  chuteState   – 'none' | 'drogue' | 'main'
     * @returns {{ windForce: number }}
     */
    update(rocket, dt, engineOn, chuteState) {
        const stepDt = Math.min(dt, 0.05);

        // Zemine inmiş roket kilitlenir
        if (rocket.y <= 0 && rocket.impactVy > 0) {
            rocket.y = 0;
            rocket.vy = 0;
            rocket.vx *= 0.5;
            return { windForce: 0 };
        }

        // ------------------------------------------------------------------
        // 1. Tırmanış Evresi (Motor yanışı veya Apogee'ye serbest süzülüş)
        // ------------------------------------------------------------------
        if (engineOn || rocket.vy > 0) {
            rocket.vy -= PHYSICS.GRAVITY * stepDt;

            // Motor itkisi (Aviyonik arıza olsa dahi katı/sıvı yakıt motoru fiziksel olarak ateşlenir!)
            if (engineOn && rocket.fuel > 0) {
                const thrust = PHYSICS.THRUST_ACCEL * (rocket.thrustFactor ?? 1.0);
                const thrustFactor = rocket.flutterActive ? PHYSICS.FLUTTER_ALTITUDE_FACTOR : 1.0;
                rocket.vy += thrust * Math.cos(rocket.angle) * thrustFactor * stepDt;
                rocket.vx += thrust * Math.sin(rocket.angle) * thrustFactor * stepDt;
                rocket.fuel -= PHYSICS.FUEL_BURN_RATE * stepDt;
                if (rocket.fuel < 0) rocket.fuel = 0;
            }

            // Aerodinamik gövde direnci
            const speedY = Math.abs(rocket.vy);
            const speedX = Math.abs(rocket.vx);
            rocket.vy -= PHYSICS.DRAG_CLEAN * speedY * rocket.vy * stepDt;
            rocket.vx -= PHYSICS.DRAG_CLEAN * speedX * rocket.vx * stepDt;

            // Tırmanışta hafif yay çizme (Atmospheric bias)
            rocket.vx += rocket.lateralBias * Math.sin((rocket.y / 900) + rocket.lateralPhase) * 2.2 * stepDt;

            // Tırmanış açısı (Hız vektörünü takip eden stabil gövde)
            const targetAngle = rocket.flutterActive
                ? PHYSICS.FLUTTER_ANGLE + Math.sin(rocket.y * 0.012) * 0.12
                : Math.atan2(rocket.vx, Math.max(25, rocket.vy));
            rocket.angularVelocity += (targetAngle - rocket.angle) * 2.4 * stepDt;
        }

        // ------------------------------------------------------------------
        // 2. İniş Evresi (Yerçekimi daima etkindir; paraşüt sürüklenme uygular)
        // ------------------------------------------------------------------
        else {
            // A) YERÇEKİMİ KESİNTİSİZ ÇALIŞIR
            rocket.vy -= PHYSICS.GRAVITY * stepDt;
            let mevcutHiz = Math.abs(rocket.vy);

            // B) Paraşüt iplerini çekme (Steering) dikey düşüş hızını %25 artırır
            const steerActive = Math.abs(rocket.steerInput || 0) > 0.05;
            const steerPenalty = steerActive ? 1.25 : 1.0;

            if (chuteState === 'main') {
                rocket.chuteTimer = (rocket.chuteTimer || 0) + stepDt;
                const sismeOrani = Math.min(1.0, rocket.chuteTimer / PHYSICS.PARASUT_SISME_SURESI);
                rocket.chuteInflation = sismeOrani;
                rocket.chuteOscillation = (rocket.chuteOscillation || 0) + stepDt;

                const hedefHiz = PHYSICS.PARASUT_HEDEF_HIZ * steerPenalty;

                // Paraşüt sadece mevcut hız hedef hızdan yüksekse yukarı yönlü fren kuvveti üretir
                if (mevcutHiz > hedefHiz) {
                    const aktifFren = PHYSICS.PARASUT_FRENLEME_GUCU * Math.pow(sismeOrani, 0.7);
                    const dragDecel = PHYSICS.GRAVITY + (mevcutHiz - hedefHiz) * aktifFren;
                    mevcutHiz = Math.max(hedefHiz, mevcutHiz - dragDecel * stepDt);
                    rocket.vy = -mevcutHiz;
                }
            }
            else if (chuteState === 'drogue') {
                rocket.drogueTimer = (rocket.drogueTimer || 0) + stepDt;
                const sismeOrani = Math.min(1.0, rocket.drogueTimer / PHYSICS.DROGUE_SISME_SURESI);
                rocket.drogueInflation = sismeOrani;
                rocket.drogueOscillation = (rocket.drogueOscillation || 0) + stepDt;

                const hedefHiz = PHYSICS.DROGUE_HEDEF_HIZ * steerPenalty;

                if (mevcutHiz > hedefHiz) {
                    const aktifFren = PHYSICS.DROGUE_FRENLEME_GUCU * sismeOrani;
                    const dragDecel = PHYSICS.GRAVITY + (mevcutHiz - hedefHiz) * aktifFren;
                    mevcutHiz = Math.max(hedefHiz, mevcutHiz - dragDecel * stepDt);
                    rocket.vy = -mevcutHiz;
                } else {
                    // Serbest düşüşten drogue hızına doğru hava direnci
                    const ratio = mevcutHiz / hedefHiz;
                    rocket.vy += PHYSICS.GRAVITY * (ratio * ratio) * stepDt;
                }
            }
            else {
                // Paraşütsüz serbest düşüş (180 ft/s terminal hız sınırı)
                const ratio = mevcutHiz / PHYSICS.SERBEST_DUSUS_HIZI;
                if (mevcutHiz > PHYSICS.SERBEST_DUSUS_HIZI) {
                    rocket.vy += PHYSICS.GRAVITY * 1.5 * stepDt;
                } else {
                    rocket.vy += PHYSICS.GRAVITY * (ratio * ratio) * stepDt;
                }
            }
        }

        // ------------------------------------------------------------------
        // 3. Rüzgar, Yönlendirme (Steering) ve Sarkaç / Burun Eğme Fiziği
        // ------------------------------------------------------------------
        const windForce = this.wind.update(stepDt);
        const playerSteerForce = chuteState === 'main'
            ? 0
            : (rocket.steerInput || 0) * 22.0; // Ana paraşüt sonrası yönlendirme kilitli

        if (chuteState !== 'none') {
            // Paraşüt açıkken rüzgar sürüklenmesi + oyuncunun yönlendirmesi
            rocket.vx = _lerp(rocket.vx, (windForce * 2.2) + playerSteerForce, stepDt * 3.2);

            // Sarkaç (Pendulum) salınımı: Açılışta şokla başlar, zamanla sönümlenir
            const oscTime = chuteState === 'main' ? rocket.chuteOscillation : rocket.drogueOscillation;
            const shockSwing = Math.sin(oscTime * 5.5) * 0.22 * Math.exp(-oscTime * 0.35);
            const steerTilt = chuteState === 'main' ? 0 : (rocket.steerInput || 0) * 0.20;
            const windTilt = windForce * 0.014;
            const targetAngle = windTilt + steerTilt + shockSwing;

            rocket.angularVelocity += (targetAngle - rocket.angle) * 5.5 * stepDt;
        } else {
            rocket.vx += (windForce * 1.25 + playerSteerForce * 0.4) * stepDt;
            rocket.vx = _lerp(rocket.vx, 0, stepDt * 0.4);

            // Paraşüt kapalıyken burun hız vektörüne bakar (Nose-Over)
            if (rocket.y > 0 && !engineOn) {
                const targetAngle = Math.atan2(rocket.vx, rocket.vy);
                let angleDiff = targetAngle - rocket.angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                rocket.angularVelocity += angleDiff * 3.5 * stepDt;
            }
        }

        rocket.angularVelocity *= Math.max(0, 1 - 3.5 * stepDt);
        rocket.angle += rocket.angularVelocity * stepDt;
        if (rocket.angle > Math.PI) rocket.angle -= Math.PI * 2;
        if (rocket.angle < -Math.PI) rocket.angle += Math.PI * 2;

        // ------------------------------------------------------------------
        // 4. Konum İntegrasyonu (Yüksek İrtifada Akıllı Süre Ölçekleme)
        // ------------------------------------------------------------------
        let verticalScale = 1.0;
        // 1.500 ft üzerindeyken düşüşü hızlandır (HUD hızı etkilenmez)
        if (rocket.vy < 0 && rocket.y > 1500) {
            const blend = Math.min(1.0, (rocket.y - 1500) / 2500);
            verticalScale = 1.0 + (PHYSICS.HIGH_ALT_DESCENT_SCALE - 1.0) * blend;
        }

        rocket.y += rocket.vy * verticalScale * stepDt;
        rocket.x += rocket.vx * stepDt;

        // ------------------------------------------------------------------
        // 5. Yere Temas Kontrolü
        // ------------------------------------------------------------------
        if (rocket.y <= 0) {
            rocket.impactVy = Math.abs(rocket.vy);
            rocket.y = 0;
            rocket.vy = 0;
            rocket.vx *= 0.5;
        }

        return { windForce };
    }
}

/* ====================================================================== */
/*  Scoring System                                                         */
/* ====================================================================== */
export function calculateScore(apogee, touchdownVy, rawDamageAmount = 0, chutePenalty = 0, isCrashed = false, finalX = 0, chuteDeployAlt = 0, isAvionicsFailed = false, targetX = 0) {
    // Puanlar doğrudan 10.000 ölçeğindedir: 5.000 + 3.000 + 2.000.
    const deviation = Math.abs(apogee - PHYSICS.TARGET_ALTITUDE);
    const rawAltScore = Math.max(0, 5000 - deviation * 2);
    const altitudeScore = rawAltScore;
    const altitudeAccuracy = Math.max(0, Math.min(100, +(100 - (deviation / PHYSICS.TARGET_ALTITUDE) * 100).toFixed(2)));

    // 2. Yere Temas ve Hasar Kontrolü (Maks: 3.000)
    let touchdownScore = 0;
    let damageAmount = 0;
    let damagePenalty = 0;
    let status = 'LANDED';

    const impactSpeed = Math.max(0, Number(touchdownVy) || 0);

    if (isCrashed || impactSpeed > PHYSICS.HARD_LANDING_VY) {
        // Kırım / Çakılma (> 42 ft/s)
        status = 'CRASHED';
        touchdownScore = 0;
        damageAmount = 100;
        damagePenalty = 0;
    } else if (impactSpeed > PHYSICS.SAFE_LANDING_VY) {
        // Sert İniş (Hasarlı) (22 - 42 ft/s)
        status = 'DAMAGED';
        const vyRatio = (impactSpeed - PHYSICS.SAFE_LANDING_VY) / (PHYSICS.HARD_LANDING_VY - PHYSICS.SAFE_LANDING_VY);
        const calculatedDamage = Math.min(95, Math.round(15 + vyRatio * 75));
        damageAmount = rawDamageAmount > 0
            ? Math.min(95, Math.round(rawDamageAmount))
            : calculatedDamage;
        damagePenalty = 0;
        touchdownScore = Math.max(0, Math.round(2000 - vyRatio * 1500));
    } else {
        // Başarılı Güvenli İniş (<= 22 ft/s) — Hasarsız Nominal İniş
        status = 'LANDED';
        damageAmount = 0;
        damagePenalty = 0;
        if (impactSpeed <= 16.5) {
            touchdownScore = 3000; // Tam yumuşak iniş puanı!
        } else {
            touchdownScore = Math.round(3000 - (impactSpeed - 16.5) * 120); // 2340 - 3000 arası
        }
    }

    // 3. Hedef noktaya yakın iniş puanı (Maks: 2.000 Puan)
    const targetOffset = Math.abs(finalX - targetX);
    let targetOffsetScore = 0;
    if (status !== 'CRASHED') {
        if (targetOffset === 0) {
            targetOffsetScore = 2000;
        } else if (targetOffset < 350) {
            targetOffsetScore = Math.max(0, Math.round(2000 * (350 - targetOffset) / 350));
        }
    }

    // 4. "Cesaret / Sweet Spot" Açılış Bonusu (Maks: 1.500 Puan!)
    // 330 ft - 480 ft arasında ana paraşütü açan cesur pilota ekstra puan
    let courageBonus = 0;
    if (status !== 'CRASHED' && chuteDeployAlt > 0) {
        if (chuteDeployAlt >= PHYSICS.SWEET_SPOT_MIN && chuteDeployAlt <= PHYSICS.SWEET_SPOT_MAX) {
            courageBonus = 1500; // Tam Tatlı Nokta Cesaret Bonusu!
        } else if (chuteDeployAlt > PHYSICS.SWEET_SPOT_MAX && chuteDeployAlt <= PHYSICS.MAIN_CHUTE_ARM_ALT) {
            // Erken açtı: 550 ft'e doğru yaklaştıkça bonus kademeli azalır
            const ratio = (PHYSICS.MAIN_CHUTE_ARM_ALT - chuteDeployAlt) / (PHYSICS.MAIN_CHUTE_ARM_ALT - PHYSICS.SWEET_SPOT_MAX);
            courageBonus = Math.round(1500 * Math.max(0, ratio));
        }
    }

    // 5. Aviyonik Arızadan Kurtulma (Usta Pilot Bonusu: +1.500)
    let manualHeroBonus = 0;
    if (isAvionicsFailed && status === 'LANDED') {
        manualHeroBonus = 1500;
    }

    // Negatif puan yoktur; her kategori yalnızca kendi puanını verir.
    const scoredAltitude = status === 'CRASHED' ? 0 : altitudeScore;
    const total = status === 'CRASHED' ? 0 : Math.min(10000, Math.round(
        scoredAltitude +
        touchdownScore +
        targetOffsetScore
    ));

    // Yıldız Derecelendirmesi (1 - 5 Yıldız)
    let stars = 1;
    if (status === 'CRASHED') {
        stars = 1;
    } else if (status === 'DAMAGED') {
        stars = total >= 5000 ? 3 : 2;
    } else {
        if (total >= 8500) stars = 5;
        else if (total >= 7000) stars = 4;
        else if (total >= 5000) stars = 3;
        else stars = 2;                     // İdare eder
    }

    return {
        total,
        altitudeScore: Math.round(scoredAltitude),
        touchdownScore: Math.round(touchdownScore),
        targetOffsetScore,
        targetOffset,
        courageBonus,
        manualHeroBonus,
        damageAmount,
        damagePenalty,
        chutePenalty: 0,
        altitudeAccuracy,
        distanceFromTarget: Math.round(targetOffset),
        status,
        stars,
    };
}

function _rand(min, max) {
    return min + Math.random() * (max - min);
}

function _lerp(a, b, t) {
    return a + (b - a) * Math.min(t, 1);
}
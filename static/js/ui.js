/**
 * ui.js — DOM-based UI Manager
 * ==============================
 * Controls title screen, HUD, fuel bar, action prompts,
 * debrief modal, callsign input, countdown, and leaderboard.
 */

export class UIManager {
    /**
     * @param {Object} callbacks – { onStart, onRetry, onMenu, onSubmitScore, onLeaderboard }
     */
    constructor(callbacks = {}) {
        this.callbacks = callbacks;

        // Cache DOM elements
        this.els = {
            hud:             document.getElementById('hud'),
            altValue:        document.getElementById('hud-alt-value'),
            spdValue:        document.getElementById('hud-spd-value'),
            stageValue:      document.getElementById('hud-stage-value'),
            windValue:       document.getElementById('hud-wind-value'),
            apogeeValue:     document.getElementById('hud-apogee-value'),

            fuelContainer:   document.getElementById('fuel-bar-container'),
            fuelFill:        document.getElementById('fuel-bar-fill'),
            fuelPercent:     document.getElementById('fuel-bar-percent'),

            actionPrompt:    document.getElementById('action-prompt'),
            actionText:      document.getElementById('action-prompt-text'),
            padSteerHint:    document.getElementById('pad-steer-hint'),

            countdownOverlay: document.getElementById('countdown-overlay'),
            countdownNumber:  document.getElementById('countdown-number'),

            titleScreen:     document.getElementById('title-screen'),
            btnStart:        document.getElementById('btn-start'),
            btnLBTitle:      document.getElementById('btn-leaderboard-title'),
            btnLBDebrief:    document.getElementById('btn-leaderboard-debrief'),

            debriefScreen:   document.getElementById('debrief-screen'),
            debriefTitle:    document.getElementById('debrief-title'),
            debriefIcon:     document.getElementById('debrief-status-icon'),
            statApogee:      document.getElementById('stat-apogee'),
            statDeviation:   document.getElementById('stat-deviation'),
            statAltScore:    document.getElementById('stat-alt-score'),
            statTouchdown:   document.getElementById('stat-touchdown'),
            statTdScore:     document.getElementById('stat-td-score'),
            statDamage:      document.getElementById('stat-damage'),
            statDamagePenalty: document.getElementById('stat-damage-penalty'),
            statTargetOffset: document.getElementById('stat-target-offset'),
            statTargetScore:  document.getElementById('stat-target-score'),
            statCourageBonus: document.getElementById('stat-courage-bonus'),
            statTotal:       document.getElementById('stat-total'),
            starRating:      document.getElementById('star-rating'),
            callsignSection: document.getElementById('callsign-section'),
            callsignInput:   document.getElementById('callsign-input'),
            btnSubmit:       document.getElementById('btn-submit-score'),
            btnRetry:        document.getElementById('btn-retry'),
            btnMenu:         document.getElementById('btn-menu'),

            leaderboardScreen: document.getElementById('leaderboard-screen'),
            leaderboardList:   document.getElementById('leaderboard-list'),
            btnLBClose:        document.getElementById('btn-lb-close'),

            // Cinematic Opening Elements
            cinematicOverlay:  document.getElementById('cinematic-overlay'),
            cinematicBlackout: document.getElementById('cinematic-blackout'),
            terminalLine1:     document.getElementById('terminal-line-1'),
            terminalLine2:     document.getElementById('terminal-line-2'),
            btnCinematicSkip:  document.getElementById('btn-cinematic-skip'),
            cinematicBinocular: document.querySelector('.cinematic-binocular'),
        };

        this._typewriterTimers = [];
        this.telemetryLost = false;
        this._bindButtons();
    }

    setTelemetryLost() {
        this.telemetryLost = true;
        this.els.stageValue.textContent = 'AVIONICS FAILURE';
        this.els.windValue.textContent = '—';
    }

    /* ------------------------------------------------------------------ */
    /*  Button bindings                                                    */
    /* ------------------------------------------------------------------ */
    _bindButtons() {
        const e = this.els;

        e.btnStart.addEventListener('click', () => {
            if (this.callbacks.onStart) this.callbacks.onStart();
        });

        e.btnRetry.addEventListener('click', () => {
            if (this.callbacks.onRetry) this.callbacks.onRetry();
        });

        e.btnMenu.addEventListener('click', () => {
            if (this.callbacks.onMenu) this.callbacks.onMenu();
        });

        e.btnSubmit.addEventListener('click', () => {
            const name = (e.callsignInput.value.trim()) || 'Anonymous';
            if (this.callbacks.onSubmitScore) {
                this.callbacks.onSubmitScore(name, this.lastDebriefData);
            }
        });

        const openLeaderboard = () => {
            if (this.callbacks.onLeaderboard) this.callbacks.onLeaderboard();
        };
        e.btnLBTitle.addEventListener('click', openLeaderboard);
        e.btnLBDebrief.addEventListener('click', openLeaderboard);

        e.btnLBClose.addEventListener('click', () => {
            this.hideLeaderboard();
        });

        if (e.btnCinematicSkip) {
            e.btnCinematicSkip.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (this.callbacks.onSkipCinematic) this.callbacks.onSkipCinematic();
            });
        }
    }

    /* ================================================================== */
    /*  Cinematic Opening Overlay & Typewriter Prologue                   */
    /* ================================================================== */
    showCinematic() {
        const e = this.els;
        if (!e.cinematicOverlay) return;
        if (e.cinematicBinocular) {
            e.cinematicBinocular.classList.remove('hidden', 'exiting');
        }
        e.cinematicOverlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            e.cinematicOverlay.classList.add('active');
        });
    }

    startPrologueTypewriter(onCharTyped, onComplete) {
        this.cancelPrologue();
        const e = this.els;
        if (!e.cinematicBlackout || !e.terminalLine1 || !e.terminalLine2) {
            if (onComplete) onComplete();
            return;
        }

        // Show pure black screen and clear lines
        e.cinematicBlackout.classList.remove('hidden', 'fading-out');
        e.terminalLine1.innerHTML = '';
        e.terminalLine2.innerHTML = '';

        const line1Text = "Somewhere at IREC Launch Facility";
        const line2Text = "31.0299, -103.5403 Chihuahuan Desert, Texas";

        const cursor = document.createElement('span');
        cursor.className = 'terminal-cursor';
        e.terminalLine1.appendChild(cursor);

        let i = 0;
        const typeLine1 = () => {
            if (i < line1Text.length) {
                const char = line1Text[i];
                const textNode = document.createTextNode(char);
                e.terminalLine1.insertBefore(textNode, cursor);
                if (char !== ' ' && onCharTyped) onCharTyped(char);
                i++;
                const timer = setTimeout(typeLine1, 44);
                this._typewriterTimers.push(timer);
            } else {
                // Line 1 finished: pause briefly, then move cursor to line 2
                const pauseTimer = setTimeout(() => {
                    cursor.remove();
                    e.terminalLine2.appendChild(cursor);
                    let j = 0;
                    const typeLine2 = () => {
                        if (j < line2Text.length) {
                            const char = line2Text[j];
                            const textNode = document.createTextNode(char);
                            e.terminalLine2.insertBefore(textNode, cursor);
                            if (char !== ' ' && onCharTyped) onCharTyped(char);
                            j++;
                            const timer2 = setTimeout(typeLine2, 38);
                            this._typewriterTimers.push(timer2);
                        } else {
                            // Line 2 finished: allow player to read with blinking cursor, then complete
                            const endTimer = setTimeout(() => {
                                if (onComplete) onComplete();
                            }, 850);
                            this._typewriterTimers.push(endTimer);
                        }
                    };
                    typeLine2();
                }, 550);
                this._typewriterTimers.push(pauseTimer);
            }
        };

        const startTimer = setTimeout(typeLine1, 280);
        this._typewriterTimers.push(startTimer);
    }

    fadeOutPrologue() {
        const e = this.els;
        if (!e.cinematicBlackout) return;
        e.cinematicBlackout.classList.add('fading-out');
        setTimeout(() => {
            e.cinematicBlackout.classList.add('hidden');
        }, 2550);
    }

    cancelPrologue() {
        for (const t of this._typewriterTimers) clearTimeout(t);
        this._typewriterTimers = [];
        const e = this.els;
        if (e.cinematicBlackout) {
            e.cinematicBlackout.classList.add('hidden');
            e.cinematicBlackout.classList.remove('fading-out');
        }
    }

    updateCinematicView(progress) {
        if (!this.els.cinematicBinocular) return;
        this.els.cinematicBinocular.classList.toggle('exiting', progress >= 0.62);
        this.els.cinematicBinocular.classList.toggle('hidden', progress >= 0.9);
    }

    hideCinematic() {
        this.cancelPrologue();
        const e = this.els;
        if (e.cinematicBinocular) e.cinematicBinocular.classList.add('hidden');
        if (!e.cinematicOverlay) return;
        e.cinematicOverlay.classList.remove('active');
        setTimeout(() => {
            e.cinematicOverlay.classList.add('hidden');
        }, 450);
    }

    /* ================================================================== */
    /*  Title Screen                                                       */
    /* ================================================================== */
    showTitle()  { this.els.titleScreen.classList.remove('hidden'); }
    hideTitle()  { this.els.titleScreen.classList.add('hidden'); }

    /* ================================================================== */
    /*  HUD                                                                */
    /* ================================================================== */
    showHUD()  { this.telemetryLost = false; this.els.hud.classList.remove('hidden'); }
    hideHUD()  { this.els.hud.classList.add('hidden'); }

    /**
     * Update live HUD telemetry.
     * @param {{ altitude: number, speed: number, stage: string, wind: number, apogee: number }} data
     */
    updateHUD(data) {
        if (this.telemetryLost) return;
        this.els.altValue.textContent   = Math.round(data.altitude).toLocaleString();
        this.els.spdValue.textContent   = Math.abs(data.speed).toFixed(1);
        this.els.stageValue.textContent = data.stage;

        if (data.wind !== undefined && data.wind !== 0) {
            const dir  = data.wind > 0 ? '→' : '←';
            this.els.windValue.textContent = `${dir} ${Math.abs(data.wind).toFixed(1)}`;
        } else {
            this.els.windValue.textContent = '—';
        }

        if (data.apogee > 0) {
            this.els.apogeeValue.textContent = Math.round(data.apogee).toLocaleString();
        }
    }

    /* ================================================================== */
    /*  Fuel Bar                                                           */
    /* ================================================================== */
    showFuelBar() { this.els.fuelContainer.classList.remove('hidden'); }
    hideFuelBar() { this.els.fuelContainer.classList.add('hidden'); }

    /**
     * @param {number} percent – 0 to 100
     */
    updateFuelBar(percent) {
        const clamped = Math.max(0, Math.min(100, percent));
        this.els.fuelFill.style.width     = clamped + '%';
        this.els.fuelPercent.textContent  = Math.round(clamped) + '%';
    }

    /* ================================================================== */
    /*  Action Prompt                                                      */
    /* ================================================================== */
    /**
     * @param {string}  text
     * @param {boolean} urgent – if true, uses red pulsing style
     */
    showActionPrompt(text, urgent = false) {
        this.els.actionText.textContent = text;
        this.els.actionPrompt.classList.remove('hidden');
        if (urgent) {
            this.els.actionPrompt.classList.add('urgent');
        } else {
            this.els.actionPrompt.classList.remove('urgent');
        }
    }

    hideActionPrompt() {
        this.els.actionPrompt.classList.add('hidden');
        this.els.actionPrompt.classList.remove('urgent');
    }

    showPadSteerHint() {
        this.els.padSteerHint.classList.remove('hidden');
    }

    hidePadSteerHint() {
        this.els.padSteerHint.classList.add('hidden');
    }

    /* ================================================================== */
    /*  Countdown                                                          */
    /* ================================================================== */
    showCountdown(number) {
        this.els.countdownNumber.textContent = number;
        this.els.countdownOverlay.classList.remove('hidden');
        this.els.countdownNumber.classList.remove('pop');
        requestAnimationFrame(() => {
            this.els.countdownNumber.classList.add('pop');
        });
    }

    hideCountdown() {
        this.els.countdownOverlay.classList.add('hidden');
        this.els.countdownNumber.classList.remove('pop');
    }

    /* ================================================================== */
    /*  Mission Debrief                                                    */
    /* ================================================================== */
    /**
     * @param {Object} data – { crashed, apogee, deviation, altitudeScore, touchdownSpeed, touchdownScore, damageAmount, damagePenalty, total, stars }
     */
    showDebrief(data) {
        const e = this.els;

        e.debriefTitle.classList.remove('crash', 'warning', 'success');
        if (e.debriefIcon) {
            e.debriefIcon.classList.remove('crash', 'warning', 'success');
        }

        if (data.failureType === 'AVIONICS' && (data.crashed || data.status === 'CRASHED')) {
            e.debriefTitle.textContent = 'AVIONICS FAILURE / KIRIM';
            e.debriefTitle.classList.add('crash');
            if (e.debriefIcon) {
                e.debriefIcon.textContent = '📡';
                e.debriefIcon.classList.add('crash');
            }
            e.callsignSection.classList.add('hidden');
        } else if (data.failureType === 'FIN_FLUTTER' && (data.crashed || data.status === 'CRASHED')) {
            e.debriefTitle.textContent = 'FIN FLUTTER / HASARLI';
            e.debriefTitle.classList.add('warning');
            if (e.debriefIcon) {
                e.debriefIcon.textContent = '⚠️';
                e.debriefIcon.classList.add('warning');
            }
            e.callsignSection.classList.remove('hidden');
        } else if (data.status === 'CRASHED' || data.crashed) {
            e.debriefTitle.textContent = 'KIRIM / ÇAKILMA';
            e.debriefTitle.classList.add('crash');
            if (e.debriefIcon) {
                e.debriefIcon.textContent  = '💥';
                e.debriefIcon.classList.add('crash');
            }
            e.callsignSection.classList.add('hidden');
        } else if (data.status === 'DAMAGED') {
            e.debriefTitle.textContent = 'SERT İNİŞ (HASARLI)';
            e.debriefTitle.classList.add('warning');
            if (e.debriefIcon) {
                e.debriefIcon.textContent  = '⚠️';
                e.debriefIcon.classList.add('warning');
            }
            e.callsignSection.classList.remove('hidden');
        } else {
            e.debriefTitle.textContent = 'BAŞARILI İNİŞ';
            e.debriefTitle.classList.add('success');
            if (e.debriefIcon) {
                e.debriefIcon.textContent  = '✓';
                e.debriefIcon.classList.add('success');
            }
            e.callsignSection.classList.remove('hidden');
        }

        e.statApogee.textContent    = Math.round(data.apogee).toLocaleString() + ' ft';
        const dev = data.apogee - 10000;
        e.statDeviation.textContent = (dev >= 0 ? '+' : '') + Math.round(dev).toLocaleString() + ' ft';
        e.statAltScore.textContent  = data.altitudeScore.toLocaleString() + ' / 5,000';
        e.statTouchdown.textContent = data.touchdownSpeed.toFixed(1) + ' ft/s';
        e.statTdScore.textContent   = data.touchdownScore.toLocaleString() + ' / 3,000';
        e.statDamage.textContent    = data.damageAmount.toFixed(0) + '%';
        if (e.statDamagePenalty) e.statDamagePenalty.textContent = '0';
        if (e.statTargetOffset) e.statTargetOffset.textContent = (data.targetOffset !== undefined ? data.targetOffset.toFixed(1) : '0.0') + ' ft';
        if (e.statTargetScore) e.statTargetScore.textContent = (data.targetOffsetScore || 0).toLocaleString() + ' / 2,000';
        if (e.statCourageBonus) e.statCourageBonus.textContent = (data.courageBonus > 0) ? `+${data.courageBonus.toLocaleString()}` : '0';
        e.statTotal.textContent     = data.total.toLocaleString();

        // Stars
        const filled = '★'.repeat(data.stars);
        const empty  = '☆'.repeat(5 - data.stars);
        e.starRating.textContent = filled + empty;

        this.lastDebriefData = data;
        e.callsignInput.value = '';
        e.btnSubmit.disabled = false;
        e.btnSubmit.textContent = 'SUBMIT SCORE';
        e.btnSubmit.style.opacity = '1';
        e.debriefScreen.classList.remove('hidden');
    }

    hideDebrief() {
        this.els.debriefScreen.classList.add('hidden');
    }

    /* ================================================================== */
    /*  Leaderboard                                                        */
    /* ================================================================== */
    async showLeaderboard() {
        try {
            const resp = await fetch('/api/leaderboard');
            const json = await resp.json();
            const list = json.leaderboard || [];

            const container = this.els.leaderboardList;
            container.innerHTML = '';

            if (list.length === 0) {
                container.innerHTML = '<div class="leaderboard-empty">No scores yet. Be the first!</div>';
            } else {
                for (const entry of list) {
                    const row = document.createElement('div');
                    row.className = 'lb-row';
                    if (entry.rank === 1) row.classList.add('gold');
                    if (entry.rank === 2) row.classList.add('silver');
                    if (entry.rank === 3) row.classList.add('bronze');

                    row.innerHTML = `
                        <span class="lb-rank">#${entry.rank}</span>
                        <span class="lb-name">${_esc(entry.player_name)}</span>
                        <span class="lb-score">${entry.score.toLocaleString()}</span>
                        <span class="lb-apogee">${Math.round(entry.apogee).toLocaleString()} ft</span>
                    `;
                    container.appendChild(row);
                }
            }

            this.els.leaderboardScreen.classList.remove('hidden');
        } catch (err) {
            console.warn('Failed to load leaderboard:', err);
        }
    }

    hideLeaderboard() {
        this.els.leaderboardScreen.classList.add('hidden');
    }

    /* ================================================================== */
    /*  Score submission                                                   */
    /* ================================================================== */
    /**
     * POST score to backend.
     * @param {string} playerName
     * @param {Object} scoreData – { total, apogee, altitudeAccuracy, touchdownSpeed, damageAmount, failureType, status }
     */
    async submitScore(playerName, scoreData) {
        if (!scoreData) scoreData = this.lastDebriefData || {};
        try {
            const resp = await fetch('/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    player_name:       playerName,
                    score:             scoreData.total || 0,
                    apogee:            scoreData.apogee || 0,
                    altitude_accuracy: scoreData.altitudeAccuracy ?? 100,
                    touchdown_speed:   scoreData.touchdownSpeed ?? 0,
                    damage_amount:     scoreData.damageAmount ?? 0,
                    failure_type:      scoreData.failureType || 'NONE',
                    status:            scoreData.status || 'LANDED',
                }),
            });
            const json = await resp.json();
            if (json.status === 'success') {
                // Disable submit button and show rank
                this.els.btnSubmit.textContent = `RANK #${json.rank} — SUBMITTED!`;
                this.els.btnSubmit.disabled = true;
                this.els.btnSubmit.style.opacity = '0.6';
            } else if (json.message) {
                console.warn('Score submission rejected:', json.message);
                this.els.btnSubmit.textContent = json.message;
            }
        } catch (err) {
            console.warn('Score submission failed:', err);
        }
    }
}

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */
function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

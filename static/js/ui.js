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

            countdownOverlay: document.getElementById('countdown-overlay'),
            countdownNumber:  document.getElementById('countdown-number'),

            titleScreen:     document.getElementById('title-screen'),
            btnStart:        document.getElementById('btn-start'),
            btnLBTitle:      document.getElementById('btn-leaderboard-title'),

            debriefScreen:   document.getElementById('debrief-screen'),
            debriefTitle:    document.getElementById('debrief-title'),
            debriefIcon:     document.getElementById('debrief-status-icon'),
            statApogee:      document.getElementById('stat-apogee'),
            statDeviation:   document.getElementById('stat-deviation'),
            statAltScore:    document.getElementById('stat-alt-score'),
            statTouchdown:   document.getElementById('stat-touchdown'),
            statTdScore:     document.getElementById('stat-td-score'),
            statOffset:      document.getElementById('stat-offset'),
            statPadScore:    document.getElementById('stat-pad-score'),
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
            cinematicStepTag:  document.getElementById('cinematic-step-tag'),
            cinematicTitle:    document.getElementById('cinematic-title'),
            cinematicSubtitle: document.getElementById('cinematic-subtitle'),
            cinematicMeta:     document.getElementById('cinematic-meta'),
            cinematicTime:     document.getElementById('cinematic-time'),
        };

        this._typewriterTimers = [];
        this._bindButtons();
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

        e.btnLBTitle.addEventListener('click', () => {
            if (this.callbacks.onLeaderboard) this.callbacks.onLeaderboard();
        });

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

    updateCinematicTelemetry(stepTag, title, subtitle, meta, timeString) {
        const e = this.els;
        if (e.cinematicStepTag && stepTag) e.cinematicStepTag.textContent = stepTag;
        if (e.cinematicTitle && title) e.cinematicTitle.textContent = title;
        if (e.cinematicSubtitle && subtitle) e.cinematicSubtitle.textContent = subtitle;
        if (e.cinematicMeta && meta) e.cinematicMeta.textContent = meta;
        if (e.cinematicTime && timeString) e.cinematicTime.textContent = timeString;
    }

    hideCinematic() {
        this.cancelPrologue();
        const e = this.els;
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
    showHUD()  { this.els.hud.classList.remove('hidden'); }
    hideHUD()  { this.els.hud.classList.add('hidden'); }

    /**
     * Update live HUD telemetry.
     * @param {{ altitude: number, speed: number, stage: string, wind: number, apogee: number }} data
     */
    updateHUD(data) {
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
     * @param {Object} data – { crashed, apogee, deviation, altitudeScore, touchdownSpeed, touchdownScore, padOffset, padScore, total, stars }
     */
    showDebrief(data) {
        const e = this.els;

        e.debriefTitle.classList.remove('crash', 'warning');
        e.debriefIcon.classList.remove('crash', 'warning', 'success');

        if (data.status === 'CRASHED' || data.crashed) {
            e.debriefTitle.textContent = 'KIRIM / ÇAKILMA';
            e.debriefTitle.classList.add('crash');
            e.debriefIcon.textContent  = '💥';
            e.debriefIcon.classList.add('crash');
            e.callsignSection.classList.add('hidden');
        } else if (data.status === 'DAMAGED') {
            e.debriefTitle.textContent = 'SERT İNİŞ (HASARLI)';
            e.debriefTitle.classList.add('warning');
            e.debriefIcon.textContent  = '⚠️';
            e.debriefIcon.classList.add('warning');
            e.callsignSection.classList.remove('hidden');
        } else {
            e.debriefTitle.textContent = 'BAŞARILI İNİŞ';
            e.debriefIcon.textContent  = '✓';
            e.debriefIcon.classList.add('success');
            e.callsignSection.classList.remove('hidden');
        }

        e.statApogee.textContent    = Math.round(data.apogee).toLocaleString() + ' ft';
        const dev = data.apogee - 10000;
        e.statDeviation.textContent = (dev >= 0 ? '+' : '') + Math.round(dev).toLocaleString() + ' ft';
        e.statAltScore.textContent  = data.altitudeScore.toLocaleString() + ' / 5,000';
        e.statTouchdown.textContent = data.touchdownSpeed.toFixed(1) + ' ft/s';
        e.statTdScore.textContent   = data.touchdownScore.toLocaleString() + ' / 3,000';
        e.statOffset.textContent    = data.padOffset.toFixed(1) + ' ft';
        e.statPadScore.textContent  = data.padScore.toLocaleString() + ' / 2,000';
        e.statTotal.textContent     = data.total.toLocaleString();

        // Stars
        const filled = '★'.repeat(data.stars);
        const empty  = '☆'.repeat(5 - data.stars);
        e.starRating.textContent = filled + empty;

        this.lastDebriefData = data;
        e.callsignInput.value = '';
        e.btnSubmit.disabled = false;
        e.btnSubmit.textContent = 'SUBMIT TO LEADERBOARD';
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
     * @param {Object} scoreData – { total, apogee, altitudeAccuracy, touchdownSpeed, padOffset, status }
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
                    pad_offset:        scoreData.padOffset ?? 0,
                    status:            scoreData.status || 'LANDED',
                }),
            });
            const json = await resp.json();
            if (json.status === 'success') {
                // Disable submit button and show rank
                this.els.btnSubmit.textContent = `RANK #${json.rank} — SUBMITTED!`;
                this.els.btnSubmit.disabled = true;
                this.els.btnSubmit.style.opacity = '0.6';
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

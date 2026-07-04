/* ===== Chrono de séance : activité / pause, code couleur, carnet, récap ===== */
/* Basé sur des horodatages (Date.now) : reste juste même si l'écran se verrouille. */

const Chrono = {
  KEY: "sportapp-chrono",
  st: null,          // { profil, state:'active'|'pause', events:[{t,type}], series:[{exo,charge,reps}] }
  timer: null,
  vibrated: false,   // vibration déjà déclenchée pour la pause en cours
  wantWake: false,
  wakeLock: null,
  audioCtx: null,
  soundOn: localStorage.getItem("sportapp-son") !== "0",

  init() {
    $("#btn-start").onclick = () => this.start();
    $("#btn-lap").onclick = () => this.lap();
    $("#btn-resume").onclick = () => this.resume();
    $("#btn-stop").onclick = () => this.stop();
    $("#btn-wakelock").onclick = () => this.toggleWake();
    $("#btn-sound").classList.toggle("on", this.soundOn);
    $("#btn-sound").onclick = () => {
      this.soundOn = !this.soundOn;
      localStorage.setItem("sportapp-son", this.soundOn ? "1" : "0");
      $("#btn-sound").classList.toggle("on", this.soundOn);
      if (this.soundOn) { this.unlockAudio(); this.beep("green"); } // aperçu du son
    };
    $("#btn-add-serie").onclick = () => this.addSerie();
    $("#exo-select").onchange = () => {
      $("#exo-custom").classList.toggle("hidden", $("#exo-select").value !== "__autre");
      this.updateHint(true);
    };
    // ré-acquiert le wake lock quand on revient sur l'app
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.wantWake && this.st) this.acquireWake();
    });

    // restaure une séance en cours (rechargement de page, écran verrouillé…)
    try { this.st = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { this.st = null; }
    if (this.st && this.st.events && this.st.events.length) {
      if (this.st.profil && this.st.profil !== Store.current) Store.setProfile(this.st.profil);
      this.showRunning();
    } else {
      this.st = null;
    }
  },

  persist() {
    if (this.st) localStorage.setItem(this.KEY, JSON.stringify(this.st));
    else localStorage.removeItem(this.KEY);
  },

  // repos conseillé pour la pause en cours : seuil complet en polyarticulaire,
  // moitié (min 1 min) pour un exercice d'isolation
  pauseSeuilMs() {
    const p = Store.data.profils[this.st ? this.st.profil : Store.current];
    const base = (p ? p.seuilPause : 180) * 1000;
    return this.st && this.st.pauseExo && exoIsIso(this.st.pauseExo)
      ? Math.max(60000, base / 2)
      : base;
  },

  updatePauseInfo() {
    const iso = this.st.pauseExo && exoIsIso(this.st.pauseExo);
    $("#ch-pause-info").innerHTML =
      `Repos conseillé : <strong>${fmtChrono(this.pauseSeuilMs())}</strong> (${iso ? "isolation" : "polyarticulaire"}) — hydrate-toi 💧`;
  },

  /* ---- calculs sur les horodatages ---- */
  times(now) {
    const ev = this.st.events;
    let act = 0, pau = 0;
    const pauses = [];
    for (let i = 0; i < ev.length; i++) {
      const end = i + 1 < ev.length ? ev[i + 1].t : now;
      const dur = end - ev[i].t;
      if (ev[i].type === "active") act += dur;
      else { pau += dur; pauses.push(dur); }
    }
    return {
      act, pau, pauses,
      total: now - ev[0].t,
      seg: now - ev[ev.length - 1].t,
      nbSeries: ev.filter(e => e.type === "pause").length
    };
  },

  /* ---- son : bips générés (Web Audio), débloqués par le premier tap ---- */
  unlockAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.audioCtx) this.audioCtx = new AC();
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();
  },

  beep(kind) {
    if (!this.soundOn || !this.audioCtx || this.audioCtx.state !== "running") return;
    const ctx = this.audioCtx, t0 = ctx.currentTime;
    // vert : double bip clair et montant · orange (trop long) : bip grave insistant
    const notes = kind === "green" ? [[880, 0, .15], [1175, .22, .25]] : [[330, 0, .25], [330, .35, .25], [330, .7, .4]];
    for (const [freq, delai, duree] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + delai);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + delai + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delai + duree);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + delai);
      o.stop(t0 + delai + duree + 0.05);
    }
  },

  /* ---- actions ---- */
  start() {
    this.unlockAudio(); // le tap « Démarrer » autorise le son pour toute la séance (règle iOS)
    this.st = { profil: Store.current, state: "active", events: [{ t: Date.now(), type: "active" }], series: [] };
    this.persist();
    this.showRunning();
  },

  lap() {
    this.unlockAudio();
    // mémorise l'exercice qui vient d'être travaillé : son type fixe le repos conseillé
    const exoVal = $("#exo-select").value;
    this.st.pauseExo = exoVal === "__autre" ? null : exoVal;
    this.st.events.push({ t: Date.now(), type: "pause" });
    this.st.state = "pause";
    this.vibrated = false;
    this.vibratedOver = false;
    this.persist();
    this.updateButtons();
    this.updatePauseInfo();
    if (navigator.vibrate) navigator.vibrate(80);
  },

  resume() {
    this.unlockAudio();
    this.st.events.push({ t: Date.now(), type: "active" });
    this.st.state = "active";
    this.persist();
    this.updateButtons();
  },

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.openRecap(Date.now());
  },

  /* ---- affichage ---- */
  showRunning() {
    $("#chrono-idle").classList.add("hidden");
    $("#chrono-run").classList.remove("hidden");
    this.fillExoSelect();
    this.updateHint(false);
    this.renderLog();
    this.updateButtons();
    if (this.st.state === "pause") this.updatePauseInfo();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 250);
    this.tick();
  },

  showIdle() {
    clearInterval(this.timer);
    this.timer = null;
    this.st = null;
    this.persist();
    this.releaseWake();
    $("#chrono-run").classList.add("hidden");
    $("#chrono-idle").classList.remove("hidden");
  },

  updateButtons() {
    const pause = this.st.state === "pause";
    $("#btn-lap").classList.toggle("hidden", pause);
    $("#btn-resume").classList.toggle("hidden", !pause);
    $("#ch-pause-info").classList.toggle("hidden", !pause);
    $("#ch-mode").textContent = pause ? "PAUSE" : "ACTIVITÉ";
  },

  tick() {
    if (!this.st) return;
    const t = this.times(Date.now());
    $("#ch-total").textContent = fmtChrono(t.total);
    $("#ch-seg").textContent = fmtChrono(t.seg);
    $("#ch-act").textContent = fmtChrono(t.act);
    $("#ch-pau").textContent = fmtChrono(t.pau);
    $("#ch-series").textContent = Math.max(t.nbSeries, this.st.series.length);

    const panel = $("#ch-panel");
    panel.classList.remove("mode-active", "mode-pause-red", "mode-pause-green", "mode-pause-over");
    if (this.st.state === "active") {
      panel.classList.add("mode-active");
      return;
    }
    const seuil = this.pauseSeuilMs();
    if (t.seg >= seuil * 2) {
      // pause deux fois trop longue : le muscle refroidit
      panel.classList.add("mode-pause-over");
      if (!this.vibratedOver) {
        this.vibratedOver = true;
        $("#ch-pause-info").innerHTML = "Ça fait long — reprends avant de refroidir ! 🥶";
        this.beep("over");
        if (navigator.vibrate) navigator.vibrate([80, 60, 80, 60, 80]);
      }
    } else if (t.seg >= seuil) {
      panel.classList.add("mode-pause-green");
      if (!this.vibrated) {
        this.vibrated = true;
        this.beep("green");
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    } else {
      panel.classList.add("mode-pause-red");
    }
  },

  /* ---- carnet d'exercices ---- */
  fillExoSelect() {
    const sel = $("#exo-select");
    // séance préparée dans le planning : ses exercices passent en tête et sont présélectionnés
    const dayISO = dateToISO(new Date(this.st.events[0].t));
    const prog = (Store.data.programme[this.st.profil] || {})[dayISO] || [];
    let html = "";
    if (prog.length) {
      html += `<optgroup label="📋 Prévu aujourd'hui">` +
        prog.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("") +
        `</optgroup>`;
    }
    sel.innerHTML = html + exoOptionsHtml(this.st.profil);
    if (prog.length) sel.value = prog[0];
  },

  addSerie() {
    let exo = $("#exo-select").value;
    if (exo === "__autre") {
      exo = $("#exo-custom").value.trim();
      if (!exo) { $("#exo-custom").focus(); return; }
      Store.addExoPerso(exo);
      this.fillExoSelect();
      $("#exo-select").value = exo;
      $("#exo-custom").value = "";
      $("#exo-custom").classList.add("hidden");
    }
    const charge = parseFloat($("#exo-charge").value) || 0;
    const reps = parseInt($("#exo-reps").value, 10) || 0;
    this.st.series.push({ exo, charge, reps });
    this.persist();
    this.renderLog();
    $("#exo-reps").value = "";
    if (navigator.vibrate) navigator.vibrate(40);
  },

  renderLog() {
    const list = this.st.series.slice().reverse();
    $("#exo-log").innerHTML = list.map((s, i) => {
      const realIdx = this.st.series.length - 1 - i;
      const detail = [s.charge ? s.charge + " kg" : null, s.reps ? "× " + s.reps : null].filter(Boolean).join(" ");
      return `<li><span>${esc(s.exo)} <small>${esc(detail)}</small></span>
        <button class="chip" data-del="${realIdx}">✕</button></li>`;
    }).join("");
    $$("#exo-log [data-del]").forEach(b => b.onclick = () => {
      this.st.series.splice(Number(b.dataset.del), 1);
      this.persist();
      this.renderLog();
    });
  },

  /* ---- assistant de progression ---- */
  lastPerf(exo) {
    const anciennes = Store.data.seances
      .filter(s => s.profil === this.st.profil && (s.exercices || []).some(e => e.nom === exo))
      .sort((a, b) => b.debut - a.debut);
    if (!anciennes.length) return null;
    return { date: anciennes[0].date, series: anciennes[0].exercices.find(e => e.nom === exo).series };
  },

  updateHint(prefill) {
    const hint = $("#exo-hint");
    const exo = $("#exo-select").value;
    if (exo === "__autre") { hint.classList.add("hidden"); return; }
    const last = this.lastPerf(exo);
    if (!last || !last.series.length) { hint.classList.add("hidden"); return; }
    // meilleure série de la dernière fois : charge max, puis reps max
    const best = last.series.reduce((a, b) =>
      ((b.charge || 0) > (a.charge || 0) ||
       ((b.charge || 0) === (a.charge || 0) && (b.reps || 0) > (a.reps || 0))) ? b : a);
    const fmtS = x => [x.charge ? x.charge + " kg" : null, x.reps ? "× " + x.reps : null].filter(Boolean).join(" ") || "—";
    // double progression, plage 8-12 : on monte les reps jusqu'à 12, puis la charge
    // (petit incrément en isolation, +2,5 kg en polyarticulaire) et retour à 8 reps
    let sugg = null;
    if (!best.charge) { if (best.reps) sugg = "essaie × " + (best.reps + 1); }
    else if ((best.reps || 0) >= 12) sugg = "essaie " + (best.charge + (exoIsIso(exo) ? 1 : 2.5)) + " kg × 8";
    else sugg = "essaie " + best.charge + " kg × " + ((best.reps || 0) + 1) + " (objectif 12)";
    hint.innerHTML = `Dernière fois (${esc(fmtDateFR(last.date))}) : ${last.series.map(fmtS).map(esc).join(" · ")}` +
      (sugg ? `<br>💡 <strong>${esc(sugg)}</strong>` : "");
    hint.classList.remove("hidden");
    if (best.charge && (prefill || !$("#exo-charge").value)) $("#exo-charge").value = best.charge;
  },

  groupSeries() {
    const map = {}, order = [];
    for (const s of this.st.series) {
      if (!map[s.exo]) { map[s.exo] = { nom: s.exo, series: [] }; order.push(s.exo); }
      map[s.exo].series.push({ charge: s.charge, reps: s.reps });
    }
    return order.map(k => map[k]);
  },

  /* ---- récap de fin de séance ---- */
  openRecap(stopT) {
    const t = this.times(stopT);
    // le carnet fait foi s'il compte plus de séries que les pauses
    t.nbSeries = Math.max(t.nbSeries, this.st.series.length);
    const p = Store.data.profils[this.st.profil];
    const cal = Math.round(p.met * p.poids * (t.act / 3600000));
    const moy = t.pauses.length ? t.pauses.reduce((a, b) => a + b, 0) / t.pauses.length : 0;
    const dateISO = dateToISO(new Date(this.st.events[0].t));
    const planned = (Store.data.planning[this.st.profil] || {})[dateISO];

    const allTags = MUSCLES.concat(TAGS_COMBOS, Store.data.tagsPerso[this.st.profil] || []);
    if (planned && planned !== "Repos" && !allTags.includes(planned)) allTags.unshift(planned);
    const chips = allTags.map(m =>
      `<button class="chip${planned === m ? " on" : ""}" data-muscle="${esc(m)}"
        style="${planned === m ? "background:" + tagColor(m) : ""}">${esc(m)}</button>`).join("");

    const { el, close } = openModal(`
      <h3>Séance terminée 💪</h3>
      <div class="recap-grid">
        <div class="stat-card"><div class="val">${fmtChrono(t.total)}</div><div class="lbl">Durée totale</div></div>
        <div class="stat-card"><div class="val">${fmtChrono(t.act)}</div><div class="lbl">Temps actif</div></div>
        <div class="stat-card"><div class="val">${fmtChrono(t.pau)}</div><div class="lbl">Temps de pause</div></div>
        <div class="stat-card"><div class="val">${t.nbSeries}</div><div class="lbl">Séries</div></div>
        <div class="stat-card"><div class="val">${cal} kcal</div><div class="lbl">Calories (temps actif)</div></div>
        <div class="stat-card"><div class="val">${moy ? fmtChrono(moy) : "—"}</div><div class="lbl">Pause moyenne</div></div>
      </div>
      <h3>Muscle travaillé&nbsp;?</h3>
      <div class="chip-list" id="recap-muscles">${chips}</div>
      <button id="recap-save" class="btn btn-accent">💾 Enregistrer la séance</button>
      <button id="recap-cancel" class="btn btn-outline">⏱ Non, reprendre le chrono</button>
      <button id="recap-discard" class="btn btn-outline">🗑 Abandonner sans enregistrer</button>
    `);

    let muscle = planned && planned !== "Repos" ? planned : null;
    el.querySelectorAll("[data-muscle]").forEach(b => b.onclick = () => {
      muscle = b.dataset.muscle;
      el.querySelectorAll("[data-muscle]").forEach(x => { x.classList.remove("on"); x.style.background = ""; });
      b.classList.add("on");
      b.style.background = tagColor(muscle);
    });

    el.querySelector("#recap-save").onclick = () => {
      if (!muscle) { alert("Choisis le muscle travaillé avant d'enregistrer 😉"); return; }
      const exercices = this.groupSeries();
      const records = this.detectRecords(exercices); // avant l'ajout, sinon la séance se compare à elle-même
      Store.addSeance({
        id: "s" + Date.now(),
        profil: this.st.profil,
        date: dateISO,
        debut: this.st.events[0].t,
        dureeTotale: Math.round(t.total / 1000),
        tempsActif: Math.round(t.act / 1000),
        tempsPause: Math.round(t.pau / 1000),
        pauses: t.pauses.map(x => Math.round(x / 1000)),
        nbSeries: t.nbSeries,
        muscle,
        calories: cal,
        exercices
      });
      close();
      this.showIdle();
      if (records.length) this.celebrate(records);
      else UI.show("stats");
    };

    el.querySelector("#recap-cancel").onclick = () => {
      // le chrono n'a jamais cessé de compter (horodatages) : on reprend simplement l'affichage
      close();
      this.timer = setInterval(() => this.tick(), 250);
      this.tick();
    };

    el.querySelector("#recap-discard").onclick = () => {
      if (confirm("Abandonner la séance sans l'enregistrer ?")) {
        close();
        this.showIdle();
      }
    };
  },

  /* ---- records battus ---- */
  detectRecords(exercices) {
    const records = [];
    for (const ex of exercices) {
      const curCharge = Math.max(...ex.series.map(x => x.charge || 0), 0);
      const curReps = Math.max(...ex.series.map(x => x.reps || 0), 0);
      let prevCharge = 0, prevReps = 0;
      Store.data.seances
        .filter(s => s.profil === this.st.profil)
        .forEach(s => (s.exercices || []).forEach(e => {
          if (e.nom === ex.nom) e.series.forEach(x => {
            prevCharge = Math.max(prevCharge, x.charge || 0);
            if (!(x.charge > 0)) prevReps = Math.max(prevReps, x.reps || 0);
          });
        }));
      // on ne fête que les records battus, pas la première saisie d'un exercice
      if (curCharge > 0) {
        if (prevCharge > 0 && curCharge > prevCharge) records.push({ nom: ex.nom, charge: curCharge, ancien: prevCharge });
      } else if (curReps > 0 && prevReps > 0 && curReps > prevReps) {
        // exercice au poids du corps (pompes, gainage…) : le record se mesure en répétitions
        records.push({ nom: ex.nom, reps: curReps, ancienReps: prevReps });
      }
    }
    return records;
  },

  celebrate(records) {
    const { el, close } = openModal(`
      <div class="celebrate-emoji">🏆</div>
      <h3 style="text-align:center">Record${records.length > 1 ? "s" : ""} battu${records.length > 1 ? "s" : ""} !</h3>
      <div>${records.map(r => `
        <div class="record-row"><span>${esc(r.nom)}</span>
        <strong>${r.charge ? r.charge + " kg" : "× " + r.reps}</strong>
        <small>avant : ${r.charge ? r.ancien + " kg" : "× " + r.ancienReps}</small></div>`).join("")}</div>
      <button class="btn btn-accent" id="celebrate-ok">Trop fort·e 💪</button>
    `);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 300]);
    el.querySelector("#celebrate-ok").onclick = () => { close(); UI.show("stats"); };
  },

  /* ---- wake lock : garder l'écran allumé ---- */
  async acquireWake() {
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      $("#btn-wakelock").classList.add("on");
    } catch (e) { /* refusé (batterie faible…) : tant pis */ }
  },

  releaseWake() {
    if (this.wakeLock) { this.wakeLock.release(); this.wakeLock = null; }
    this.wantWake = false;
    $("#btn-wakelock").classList.remove("on");
  },

  toggleWake() {
    if (!("wakeLock" in navigator)) { alert("Ton navigateur ne permet pas de bloquer la mise en veille."); return; }
    if (this.wantWake) this.releaseWake();
    else { this.wantWake = true; this.acquireWake(); }
  }
};

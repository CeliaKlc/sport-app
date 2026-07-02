/* ===== Chrono de séance : activité / pause, code couleur, carnet, récap ===== */
/* Basé sur des horodatages (Date.now) : reste juste même si l'écran se verrouille. */

const Chrono = {
  KEY: "sportapp-chrono",
  st: null,          // { profil, state:'active'|'pause', events:[{t,type}], series:[{exo,charge,reps}] }
  timer: null,
  vibrated: false,   // vibration déjà déclenchée pour la pause en cours
  wantWake: false,
  wakeLock: null,

  init() {
    $("#btn-start").onclick = () => this.start();
    $("#btn-lap").onclick = () => this.lap();
    $("#btn-resume").onclick = () => this.resume();
    $("#btn-stop").onclick = () => this.stop();
    $("#btn-wakelock").onclick = () => this.toggleWake();
    $("#btn-add-serie").onclick = () => this.addSerie();
    $("#exo-select").onchange = () => {
      $("#exo-custom").classList.toggle("hidden", $("#exo-select").value !== "__autre");
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

  seuilMs() {
    const p = Store.data.profils[this.st ? this.st.profil : Store.current];
    return (p ? p.seuilPause : 180) * 1000;
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

  /* ---- actions ---- */
  start() {
    this.st = { profil: Store.current, state: "active", events: [{ t: Date.now(), type: "active" }], series: [] };
    this.persist();
    this.showRunning();
  },

  lap() {
    this.st.events.push({ t: Date.now(), type: "pause" });
    this.st.state = "pause";
    this.vibrated = false;
    this.persist();
    this.updateButtons();
    if (navigator.vibrate) navigator.vibrate(80);
  },

  resume() {
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
    this.renderLog();
    this.updateButtons();
    $("#ch-seuil").textContent = fmtChrono(this.seuilMs());
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
    $("#ch-series").textContent = t.nbSeries;

    const panel = $("#ch-panel");
    panel.classList.remove("mode-active", "mode-pause-red", "mode-pause-green");
    if (this.st.state === "active") {
      panel.classList.add("mode-active");
    } else if (t.seg >= this.seuilMs()) {
      panel.classList.add("mode-pause-green");
      if (!this.vibrated) {
        this.vibrated = true;
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    } else {
      panel.classList.add("mode-pause-red");
    }
  },

  /* ---- carnet d'exercices ---- */
  fillExoSelect() {
    const sel = $("#exo-select");
    let html = "";
    for (const muscle of Object.keys(EXOS)) {
      html += `<optgroup label="${esc(muscle)}">` +
        EXOS[muscle].map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("") +
        `</optgroup>`;
    }
    const perso = Store.data.exosPerso[this.st.profil] || [];
    if (perso.length) {
      html += `<optgroup label="Mes exercices">` +
        perso.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("") +
        `</optgroup>`;
    }
    html += `<option value="__autre">➕ Autre exercice…</option>`;
    sel.innerHTML = html;
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
    const p = Store.data.profils[this.st.profil];
    const cal = Math.round(p.met * p.poids * (t.act / 3600000));
    const moy = t.pauses.length ? t.pauses.reduce((a, b) => a + b, 0) / t.pauses.length : 0;
    const dateISO = dateToISO(new Date(this.st.events[0].t));
    const planned = (Store.data.planning[this.st.profil] || {})[dateISO];

    const chips = MUSCLES.map(m =>
      `<button class="chip${planned === m ? " on" : ""}" data-muscle="${esc(m)}"
        style="${planned === m ? "background:" + MUSCLE_COLORS[m] : ""}">${esc(m)}</button>`).join("");

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

    let muscle = planned && MUSCLES.includes(planned) ? planned : null;
    el.querySelectorAll("[data-muscle]").forEach(b => b.onclick = () => {
      muscle = b.dataset.muscle;
      el.querySelectorAll("[data-muscle]").forEach(x => { x.classList.remove("on"); x.style.background = ""; });
      b.classList.add("on");
      b.style.background = MUSCLE_COLORS[muscle];
    });

    el.querySelector("#recap-save").onclick = () => {
      if (!muscle) { alert("Choisis le muscle travaillé avant d'enregistrer 😉"); return; }
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
        exercices: this.groupSeries()
      });
      close();
      this.showIdle();
      UI.show("stats");
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

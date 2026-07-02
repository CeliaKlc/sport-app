/* ===== Planning : vue semaine / mois, prévu vs réalisé, semaine type ===== */

const Planning = {
  cursor: new Date(),   // date de référence de la vue affichée
  mode: "week",         // "week" | "month"

  init() {
    $("#plan-prev").onclick = () => this.shift(-1);
    $("#plan-next").onclick = () => this.shift(1);
    $("#plan-mode").onclick = () => {
      this.mode = this.mode === "week" ? "month" : "week";
      $("#plan-mode").textContent = this.mode === "week" ? "🗓 Vue mois" : "📆 Vue semaine";
      this.render();
    };
    $("#plan-save-type").onclick = () => this.saveType();
    $("#plan-apply-type").onclick = () => this.applyType();
  },

  shift(dir) {
    if (this.mode === "week") this.cursor = addDays(this.cursor, dir * 7);
    else this.cursor = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + dir, 1);
    this.render();
  },

  plan() { return Store.data.planning[Store.current] || (Store.data.planning[Store.current] = {}); },

  realizedByDate() {
    const map = {};
    Store.seances().forEach(s => (map[s.date] = map[s.date] || []).push(s.muscle));
    return map;
  },

  render() {
    $("#plan-week").classList.toggle("hidden", this.mode !== "week");
    $("#plan-month").classList.toggle("hidden", this.mode !== "month");
    if (this.mode !== "week") $("#plan-rest").classList.add("hidden");
    if (this.mode === "week") this.renderWeek();
    else this.renderMonth();
  },

  /* ---- 2 jours de repos obligatoires par semaine ---- */
  nbRepos(monday) {
    const plan = this.plan();
    let n = 0;
    for (let i = 0; i < 7; i++) if (plan[dateToISO(addDays(monday, i))] === "Repos") n++;
    return n;
  },

  // jours de repos conseillés : ceux où vous vous entraînez le moins d'habitude
  suggestRestOrder() {
    const seances = Store.seances();
    if (seances.length < 5) return [2, 6, 5, 3, 0, 1, 4]; // défaut : mercredi, dimanche…
    const counts = [0, 0, 0, 0, 0, 0, 0];
    seances.forEach(s => { counts[(isoToDate(s.date).getDay() + 6) % 7]++; });
    return counts.map((c, i) => ({ c, i }))
      .sort((a, b) => a.c - b.c || b.i - a.i)
      .map(x => x.i);
  },

  renderRestBanner(monday) {
    const el = $("#plan-rest");
    const nb = this.nbRepos(monday);
    if (nb >= 2) { el.innerHTML = ""; el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.innerHTML = `<div class="banner">
      <span>💤 Jours de repos posés : <strong>${nb}/2</strong> — le muscle se construit au repos&nbsp;!</span>
      <button class="btn btn-small btn-accent">Placer</button></div>`;
    el.querySelector("button").onclick = () => this.autoRest(monday);
  },

  autoRest(monday) {
    const plan = this.plan();
    let nb = this.nbRepos(monday);
    for (const i of this.suggestRestOrder()) {
      if (nb >= 2) break;
      const iso = dateToISO(addDays(monday, i));
      if (!plan[iso]) { plan[iso] = "Repos"; nb++; } // ne remplace jamais un jour déjà planifié
    }
    Store.save();
    if (nb < 2) alert("Ta semaine est pleine : libère un jour si tu veux poser ton 2e repos 💤");
    this.render();
  },

  /* ---- vue semaine ---- */
  renderWeek() {
    const monday = mondayOf(this.cursor);
    const sunday = addDays(monday, 6);
    $("#plan-label").textContent =
      `Semaine du ${monday.getDate()} ${MOIS[monday.getMonth()]} au ${sunday.getDate()} ${MOIS[sunday.getMonth()]}`;

    const plan = this.plan();
    const done = this.realizedByDate();
    const today = todayISO();
    this.renderRestBanner(monday);

    const progAll = Store.data.programme[Store.current] || {};
    $("#plan-week").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const iso = dateToISO(d);
      const prevu = plan[iso];
      const realises = done[iso] || [];
      const nbExos = (progAll[iso] || []).length;
      // conflit de repos sur les tags du jour (prévu ou réalisé)
      let conflit = null;
      for (const t of this.dayTags(iso)) {
        conflit = this.conflictFor(iso, t);
        if (conflit) break;
      }
      return `
      <div class="day-row${iso === today ? " today" : ""}">
        <div class="day-info">
          <div class="day-name">${JOURS[i]}</div>
          <div class="day-date">${d.getDate()} ${MOIS[d.getMonth()].slice(0, 4)}.</div>
        </div>
        <div class="day-slot">
          <span class="slot-lbl">Prévu</span>
          <button class="tag-btn${prevu ? " set" : ""}" data-date="${iso}"
            style="${prevu ? "background:" + tagColor(prevu) + ";border-color:transparent" : ""}">
            ${prevu ? esc(prevu) : "＋ Prévoir"}
          </button>
          ${nbExos ? `<span class="prog-count">📋 ${nbExos} exo${nbExos > 1 ? "s" : ""}</span>` : ""}
        </div>
        <div class="day-slot">
          <span class="slot-lbl">Réalisé</span>
          <span class="done-tags">${
            realises.length
              ? realises.map(m => `<span class="tag" style="background:${tagColor(m)}">${esc(m)}</span>`).join("")
              : "—"
          }</span>
        </div>
        ${conflit ? `<span class="rest-warn">⚠️ Moins de 72 h de repos pour&nbsp;: ${esc(conflit.groupes.join(", "))} (avec ${esc(conflit.tag2)} du ${esc(fmtDateFR(conflit.other))})</span>` : ""}
      </div>`;
    }).join("");

    $$("#plan-week [data-date]").forEach(b => b.onclick = () => this.openTagPicker(b.dataset.date));
  },

  /* ---- alerte repos < 72 h : même groupe musculaire à moins de 3 jours d'écart ---- */
  dayTags(iso) {
    const tags = [];
    const t = this.plan()[iso];
    if (t && t !== "Repos") tags.push(t);
    Store.seances().filter(s => s.date === iso && s.muscle).forEach(s => tags.push(s.muscle));
    return tags;
  },

  conflictFor(iso, tag) {
    const gs = muscleGroups(tag);
    if (!gs.length) return null;
    for (const off of [-2, -1, 1, 2]) {
      const other = dateToISO(addDays(isoToDate(iso), off));
      for (const t2 of this.dayTags(other)) {
        const communs = muscleGroups(t2).filter(g => gs.includes(g));
        if (communs.length) return { other, tag2: t2, groupes: communs.map(g => GROUP_LABELS[g]) };
      }
    }
    return null;
  },

  warnConflict(iso, tag) {
    const c = this.conflictFor(iso, tag);
    if (c) alert(`⚠️ Repos insuffisant !\n\n« ${c.tag2} » le ${fmtDateFull(c.other)} sollicite aussi : ${c.groupes.join(", ")}.\n\nLaisse au moins 72 h au même groupe musculaire pour qu'il se reconstruise.`);
  },

  /* ---- panneau du jour : programme + exercices prévus ---- */
  openTagPicker(iso) {
    const plan = this.plan();
    const progAll = Store.data.programme[Store.current] || (Store.data.programme[Store.current] = {});
    const persoTags = Store.data.tagsPerso[Store.current] || (Store.data.tagsPerso[Store.current] = []);

    const { el, close } = openModal(`
      <h3>${esc(fmtDateFull(iso))}</h3>
      <p class="slot-lbl">Programme du jour</p>
      <div class="chip-list" id="picker-tags"></div>
      <div id="picker-custom" class="exo-row hidden">
        <input id="picker-custom-input" class="input" placeholder="Ex : Fessiers + mollets">
        <button id="picker-custom-ok" class="btn btn-accent picker-add">OK</button>
      </div>
      <p class="slot-lbl picker-section">Exercices prévus (facultatif)</p>
      <div class="chip-list" id="picker-exos"></div>
      <div class="exo-row">
        <select id="picker-exo-select" class="input"></select>
        <button id="picker-exo-add" class="btn btn-accent picker-add">＋</button>
      </div>
      <input id="picker-exo-custom" class="input hidden picker-section" placeholder="Nom de l'exercice">
      <button class="btn btn-outline" data-clear>Effacer ce jour</button>
      <button class="btn btn-accent" data-done>Terminé</button>
    `);

    const renderTags = () => {
      const all = PLAN_TAGS.concat(TAGS_COMBOS, persoTags.filter(t => !PLAN_TAGS.includes(t) && !TAGS_COMBOS.includes(t)));
      el.querySelector("#picker-tags").innerHTML = all.map(t =>
        `<button class="chip${plan[iso] === t ? " on" : ""}" data-tag="${esc(t)}"
          style="${plan[iso] === t ? "background:" + tagColor(t) : ""}">${esc(t)}</button>`).join("") +
        `<button class="chip" data-newtag>➕ Autre…</button>`;
      el.querySelectorAll("[data-tag]").forEach(b => b.onclick = () => {
        plan[iso] = b.dataset.tag;
        Store.save();
        renderTags();
        this.render();
        this.warnConflict(iso, b.dataset.tag);
      });
      el.querySelector("[data-newtag]").onclick = () => {
        el.querySelector("#picker-custom").classList.remove("hidden");
        el.querySelector("#picker-custom-input").focus();
      };
    };

    el.querySelector("#picker-custom-ok").onclick = () => {
      const t = el.querySelector("#picker-custom-input").value.trim();
      if (!t) return;
      if (!persoTags.includes(t) && !PLAN_TAGS.includes(t) && !TAGS_COMBOS.includes(t)) persoTags.push(t);
      plan[iso] = t;
      Store.save();
      el.querySelector("#picker-custom-input").value = "";
      el.querySelector("#picker-custom").classList.add("hidden");
      renderTags();
      this.render();
      this.warnConflict(iso, t);
    };

    const renderExos = () => {
      const list = progAll[iso] || [];
      el.querySelector("#picker-exos").innerHTML = list.length
        ? list.map((e, i) => `<span class="chip chip-exo">${esc(e)}<button data-rm="${i}">✕</button></span>`).join("")
        : `<span class="hint">Aucun — le chrono proposera toute la bibliothèque.</span>`;
      el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
        progAll[iso].splice(Number(b.dataset.rm), 1);
        if (!progAll[iso].length) delete progAll[iso];
        Store.save();
        renderExos();
        this.render();
      });
    };

    const sel = el.querySelector("#picker-exo-select");
    sel.innerHTML = exoOptionsHtml(Store.current);
    sel.onchange = () => el.querySelector("#picker-exo-custom").classList.toggle("hidden", sel.value !== "__autre");
    el.querySelector("#picker-exo-add").onclick = () => {
      let exo = sel.value;
      if (exo === "__autre") {
        exo = el.querySelector("#picker-exo-custom").value.trim();
        if (!exo) return;
        Store.addExoPerso(exo);
        sel.innerHTML = exoOptionsHtml(Store.current);
        el.querySelector("#picker-exo-custom").value = "";
        el.querySelector("#picker-exo-custom").classList.add("hidden");
      }
      const list = (progAll[iso] = progAll[iso] || []);
      if (!list.includes(exo)) list.push(exo);
      Store.save();
      renderExos();
      this.render();
    };

    el.querySelector("[data-clear]").onclick = () => {
      delete plan[iso];
      delete progAll[iso];
      Store.save();
      close();
      this.render();
    };
    el.querySelector("[data-done]").onclick = () => close();

    renderTags();
    renderExos();
  },

  /* ---- semaine type ---- */
  saveType() {
    const monday = mondayOf(this.cursor);
    const plan = this.plan();
    const type = {};
    for (let i = 0; i < 7; i++) {
      const tag = plan[dateToISO(addDays(monday, i))];
      if (tag) type[i] = tag;
    }
    if (!Object.keys(type).length) { alert("Remplis d'abord la semaine affichée, puis enregistre-la comme semaine type."); return; }
    Store.data.semaineType[Store.current] = type;
    Store.save();
    alert("Semaine type enregistrée ✅ Utilise « Appliquer » sur n'importe quelle semaine pour la recopier.");
  },

  applyType() {
    const type = Store.data.semaineType[Store.current];
    if (!type || !Object.keys(type).length) { alert("Aucune semaine type enregistrée pour l'instant."); return; }
    const monday = mondayOf(this.cursor);
    const plan = this.plan();
    for (const [i, tag] of Object.entries(type)) {
      plan[dateToISO(addDays(monday, Number(i)))] = tag;
    }
    Store.save();
    this.mode = "week";
    this.render();
  },

  /* ---- vue mois ---- */
  renderMonth() {
    const y = this.cursor.getFullYear(), m = this.cursor.getMonth();
    $("#plan-label").textContent = `${MOIS[m].charAt(0).toUpperCase() + MOIS[m].slice(1)} ${y}`;

    const first = new Date(y, m, 1);
    const start = mondayOf(first);
    const plan = this.plan();
    const done = this.realizedByDate();
    const today = todayISO();

    let html = ["L", "M", "M", "J", "V", "S", "D"].map(d => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const iso = dateToISO(d);
      const out = d.getMonth() !== m;
      if (i >= 35 && out) break; // 6e ligne inutile
      const prevu = plan[iso];
      const realises = done[iso] || [];
      const dots =
        realises.map(x => `<span class="dot done" style="background:${tagColor(x)}"></span>`).join("") +
        (prevu && !realises.length ? `<span class="dot" style="background:${tagColor(prevu)}"></span>` : "");
      html += `<button class="mcell${out ? " out" : ""}${iso === today ? " today" : ""}" data-date="${iso}">
        <span>${d.getDate()}</span><span class="dots">${dots}</span>
      </button>`;
    }
    $("#plan-month").innerHTML = `<div class="month-grid">${html}</div>
      <p class="hint">Petit point = prévu · Gros point = séance réalisée. Touche un jour pour le planifier.</p>`;
    $$("#plan-month [data-date]").forEach(b => b.onclick = () => this.openTagPicker(b.dataset.date));
  }
};

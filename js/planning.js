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
    if (this.mode === "week") this.renderWeek();
    else this.renderMonth();
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

    $("#plan-week").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const iso = dateToISO(d);
      const prevu = plan[iso];
      const realises = done[iso] || [];
      return `
      <div class="day-row${iso === today ? " today" : ""}">
        <div class="day-info">
          <div class="day-name">${JOURS[i]}</div>
          <div class="day-date">${d.getDate()} ${MOIS[d.getMonth()].slice(0, 4)}.</div>
        </div>
        <div class="day-slot">
          <span class="slot-lbl">Prévu</span>
          <button class="tag-btn${prevu ? " set" : ""}" data-date="${iso}"
            style="${prevu ? "background:" + (MUSCLE_COLORS[prevu] || "#64748b") + ";border-color:transparent" : ""}">
            ${prevu ? esc(prevu) : "＋ Prévoir"}
          </button>
        </div>
        <div class="day-slot">
          <span class="slot-lbl">Réalisé</span>
          <span class="done-tags">${
            realises.length
              ? realises.map(m => `<span class="tag" style="background:${MUSCLE_COLORS[m] || "#64748b"}">${esc(m)}</span>`).join("")
              : "—"
          }</span>
        </div>
      </div>`;
    }).join("");

    $$("#plan-week [data-date]").forEach(b => b.onclick = () => this.openTagPicker(b.dataset.date));
  },

  openTagPicker(iso) {
    const plan = this.plan();
    const { el, close } = openModal(`
      <h3>${fmtDateFull(iso)} — quoi au programme&nbsp;?</h3>
      <div class="chip-list">
        ${PLAN_TAGS.map(t => `<button class="chip${plan[iso] === t ? " on" : ""}" data-tag="${esc(t)}"
          style="${plan[iso] === t ? "background:" + MUSCLE_COLORS[t] : ""}">${esc(t)}</button>`).join("")}
      </div>
      <button class="btn btn-outline" data-clear>Effacer ce jour</button>
    `);
    el.querySelectorAll("[data-tag]").forEach(b => b.onclick = () => {
      plan[iso] = b.dataset.tag;
      Store.save();
      close();
      this.render();
    });
    el.querySelector("[data-clear]").onclick = () => {
      delete plan[iso];
      Store.save();
      close();
      this.render();
    };
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
        realises.map(x => `<span class="dot done" style="background:${MUSCLE_COLORS[x] || "#64748b"}"></span>`).join("") +
        (prevu && !realises.length ? `<span class="dot" style="background:${MUSCLE_COLORS[prevu] || "#64748b"}"></span>` : "");
      html += `<button class="mcell${out ? " out" : ""}${iso === today ? " today" : ""}" data-date="${iso}">
        <span>${d.getDate()}</span><span class="dots">${dots}</span>
      </button>`;
    }
    $("#plan-month").innerHTML = `<div class="month-grid">${html}</div>
      <p class="hint">Petit point = prévu · Gros point = séance réalisée. Touche un jour pour le planifier.</p>`;
    $$("#plan-month [data-date]").forEach(b => b.onclick = () => this.openTagPicker(b.dataset.date));
  }
};

/* ===== Planning : vue semaine / mois, prévu vs réalisé, semaine type ===== */

const Planning = {
  cursor: new Date(),   // date de référence de la vue affichée
  mode: "week",         // "week" | "month"

  init() {
    $("#plan-prev").onclick = () => this.shift(-1);
    $("#plan-next").onclick = () => this.shift(1);
    $("#plan-mode").onclick = () => {
      this.mode = this.mode === "week" ? "month" : "week";
      $("#plan-mode").innerHTML = this.mode === "week" ? icon("calendar") + " Vue mois" : icon("rows") + " Vue semaine";
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
      <span class="banner-txt">${icon("moon")}<span>Jours de repos posés : <strong>${nb}/2</strong> — le muscle se construit au repos&nbsp;!</span></span>
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
            ${prevu ? esc(prevu) : icon("plus") + " Prévoir"}
          </button>
          ${nbExos ? `<span class="prog-count">${icon("list")} ${nbExos} exo${nbExos > 1 ? "s" : ""}</span>` : ""}
        </div>
        <div class="day-slot">
          <span class="slot-lbl">Réalisé</span>
          <span class="done-tags">${
            realises.length
              ? realises.map(m => `<span class="tag" style="background:${tagColor(m)}">${esc(m)}</span>`).join("")
              : "—"
          }</span>
        </div>
        ${conflit ? `<span class="rest-warn">${icon("alert")} Moins de 48 h de repos pour&nbsp;: ${esc(conflit.groupes.join(", "))} (avec ${esc(conflit.tag2)} du ${esc(fmtDateFR(conflit.other))})</span>` : ""}
      </div>`;
    }).join("");

    $$("#plan-week [data-date]").forEach(b => b.onclick = () => this.openTagPicker(b.dataset.date));
  },

  /* ---- alerte repos insuffisant : même groupe musculaire deux jours consécutifs.
     Le consensus muscu : 48 h minimum entre deux sollicitations d'un même muscle —
     un écart de 2 jours (fréquence 2×/semaine) est donc volontairement accepté. ---- */
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
    for (const off of [-1, 1]) {
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
    if (c) alert(`⚠️ Repos insuffisant !\n\n« ${c.tag2} » le ${fmtDateFull(c.other)} sollicite aussi : ${c.groupes.join(", ")}.\n\nLaisse au moins 48 h (un jour complet) au même groupe musculaire pour qu'il se reconstruise.`);
  },

  /* ---- programmes enregistrés : listes d'exercices nommées, rattachées à un type de séance ---- */
  modeles() {
    const all = Store.data.modeles;
    return all[Store.current] || (all[Store.current] = []);
  },

  /* exercices habituels pour un type de séance, d'après l'historique (les plus fréquents d'abord).
     Si ce type a peu d'historique, on complète avec les séances qui travaillent les mêmes muscles. */
  habituels(tag, max = 10) {
    if (!tag || tag === "Repos") return [];
    const seances = Store.seances();
    const compte = (filtre) => {
      const n = {};
      seances.filter(filtre).forEach(s => (s.exercices || []).forEach(e => n[e.nom] = (n[e.nom] || 0) + 1));
      return n;
    };
    const exact = compte(s => s.muscle === tag);
    let res = Object.entries(exact).sort((a, b) => b[1] - a[1]).map(([nom]) => nom);
    if (res.length < 4) {
      const groupes = muscleGroups(tag);
      if (groupes.length) {
        const proches = compte(s => s.muscle !== tag && muscleGroups(s.muscle).some(g => groupes.includes(g)));
        res = res.concat(Object.entries(proches).sort((a, b) => b[1] - a[1]).map(([nom]) => nom).filter(n => !res.includes(n)));
      }
    }
    // le cardio d'échauffement (tapis, vélo…) n'est proposé que pour une séance de cardio
    if (!/cardio/i.test(tag)) res = res.filter(n => !EXOS["Cardio"].includes(n));
    return res.slice(0, max);
  },

  /* ---- panneau du jour : type de séance, programmes, exercices prévus ---- */
  openTagPicker(iso) {
    const plan = this.plan();
    const progAll = Store.data.programme[Store.current] || (Store.data.programme[Store.current] = {});
    let source = null; // programme appliqué sur ce jour (pour proposer sa mise à jour)

    const { el, close } = openModal(`
      <h3>${esc(fmtDateFull(iso))}</h3>
      <p class="slot-lbl">Type de séance</p>
      <div class="chip-list" id="picker-tags"></div>

      <div id="picker-modeles"></div>

      <p class="slot-lbl picker-section">Exercices prévus (facultatif)</p>
      <div class="chip-list" id="picker-exos"></div>
      <div class="exo-row">
        <select id="picker-exo-select" class="input"></select>
        <button id="picker-exo-add" class="btn btn-accent picker-add" aria-label="Ajouter">${icon("plus")}</button>
      </div>
      <input id="picker-exo-custom" class="input hidden picker-section" placeholder="Nom de l'exercice">
      <div id="picker-habituels"></div>
      <button class="btn btn-outline hidden" id="picker-save-modele">${icon("save")} Enregistrer comme programme</button>

      <button class="btn btn-outline" data-clear>Effacer ce jour</button>
      <button class="btn btn-accent" data-done>Terminé</button>
    `);

    const renderTags = () => {
      el.querySelector("#picker-tags").innerHTML = PLAN_TAGS.map(t =>
        `<button class="chip${plan[iso] === t ? " on" : ""}" data-tag="${esc(t)}"
          style="${plan[iso] === t ? "background:" + tagColor(t) : ""}">${esc(t)}</button>`).join("");
      el.querySelectorAll("[data-tag]").forEach(b => b.onclick = () => {
        plan[iso] = b.dataset.tag;
        Store.save();
        renderTags();
        renderModeles();
        renderHabituels();
        this.render();
        this.warnConflict(iso, b.dataset.tag);
      });
    };

    /* programmes enregistrés : ceux du type choisi d'abord, puis les autres */
    const renderModeles = () => {
      const box = el.querySelector("#picker-modeles");
      const mods = this.modeles();
      if (plan[iso] === "Repos" || !mods.length) { box.innerHTML = ""; return; }
      const tag = plan[iso];
      const duType = mods.filter(m => m.tag === tag);
      const autres = mods.filter(m => m.tag !== tag);
      const chip = m => {
        const i = mods.indexOf(m);
        return `<button class="modele-chip${source === m.nom ? " on" : ""}" data-mod="${i}">
          <strong>${esc(m.nom)}</strong><small>${m.exos.length} exo${m.exos.length > 1 ? "s" : ""}${m.tag && m.tag !== tag ? " · " + esc(m.tag) : ""}</small>
        </button>`;
      };
      box.innerHTML = `
        <div class="picker-head picker-section">
          <span class="slot-lbl">Mes programmes</span>
          <button class="link-btn" data-gerer>Gérer</button>
        </div>
        <div class="modele-list">${duType.map(chip).join("")}${autres.length && duType.length ? `<span class="modele-sep">Autres</span>` : ""}${autres.map(chip).join("")}</div>`;
      box.querySelectorAll("[data-mod]").forEach(b => b.onclick = () => {
        const m = mods[Number(b.dataset.mod)];
        const actuels = progAll[iso] || [];
        if (actuels.length && actuels.join("|") !== m.exos.join("|") &&
            !confirm(`Remplacer les ${actuels.length} exercice(s) prévus par le programme « ${m.nom} » ?`)) return;
        progAll[iso] = m.exos.slice();
        if (!plan[iso] && m.tag) { plan[iso] = m.tag; renderTags(); }
        source = m.nom;
        Store.save();
        renderModeles();
        renderExos();
        this.render();
        toast(`Programme « ${m.nom} » appliqué`, "list");
      });
      box.querySelector("[data-gerer]").onclick = () => this.manageModeles(() => { renderModeles(); });
    };

    const renderExos = () => {
      const list = progAll[iso] || [];
      el.querySelector("#picker-exos").innerHTML = list.length
        ? list.map((e, i) => `<span class="chip chip-exo">${esc(e)}<button data-rm="${i}" aria-label="Retirer">${icon("x")}</button></span>`).join("")
        : `<span class="hint">Aucun — le chrono proposera toute la bibliothèque.</span>`;
      el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
        progAll[iso].splice(Number(b.dataset.rm), 1);
        if (!progAll[iso].length) delete progAll[iso];
        Store.save();
        renderExos();
        this.render();
      });
      // bouton d'enregistrement : « mettre à jour » si la liste vient d'un programme et a changé
      const btn = el.querySelector("#picker-save-modele");
      const mod = source && this.modeles().find(m => m.nom === source);
      const modifie = mod && mod.exos.join("|") !== list.join("|");
      btn.classList.toggle("hidden", !list.length || (mod && !modifie));
      btn.innerHTML = icon("save") + (modifie ? ` Mettre à jour « ${esc(source)} »` : " Enregistrer comme programme");
      renderHabituels();
    };

    /* habituels : exercices fréquents pour ce type de séance, à ajouter d'un toucher */
    const renderHabituels = () => {
      const box = el.querySelector("#picker-habituels");
      const list = progAll[iso] || [];
      const sugg = this.habituels(plan[iso]).filter(e => !list.includes(e));
      if (!sugg.length) { box.innerHTML = ""; return; }
      box.innerHTML = `
        <div class="picker-head picker-section">
          <span class="slot-lbl">Tes habituels en ${esc(plan[iso])}</span>
          ${sugg.length > 1 ? `<button class="link-btn" data-tous>Tout ajouter</button>` : ""}
        </div>
        <div class="chip-list">${sugg.map(e => `<button class="chip chip-sugg" data-sugg="${esc(e)}">${icon("plus")} ${esc(e)}</button>`).join("")}</div>`;
      const ajouter = noms => {
        const l = (progAll[iso] = progAll[iso] || []);
        noms.forEach(n => { if (!l.includes(n)) l.push(n); });
        Store.save();
        renderExos();
        this.render();
      };
      box.querySelectorAll("[data-sugg]").forEach(b => b.onclick = () => ajouter([b.dataset.sugg]));
      const tous = box.querySelector("[data-tous]");
      if (tous) tous.onclick = () => ajouter(sugg);
    };

    el.querySelector("#picker-save-modele").onclick = () => {
      const list = progAll[iso] || [];
      if (!list.length) return;
      const mods = this.modeles();
      const nom = (prompt("Nom du programme :", source || plan[iso] || "") || "").trim();
      if (!nom) return;
      const exist = mods.find(m => m.nom.toLowerCase() === nom.toLowerCase());
      if (exist && exist.nom !== source && !confirm(`Le programme « ${exist.nom} » existe déjà. Le remplacer ?`)) return;
      if (exist) { exist.exos = list.slice(); exist.tag = plan[iso] && plan[iso] !== "Repos" ? plan[iso] : exist.tag; }
      else mods.push({ nom, tag: plan[iso] && plan[iso] !== "Repos" ? plan[iso] : null, exos: list.slice() });
      source = exist ? exist.nom : nom;
      Store.save();
      renderModeles();
      renderExos();
      toast(exist ? "Programme mis à jour" : "Programme enregistré", "save");
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

    // si la liste du jour correspond exactement à un programme, on le retient comme source
    const dejaPrevu = (progAll[iso] || []).join("|");
    const m0 = dejaPrevu && this.modeles().find(m => m.exos.join("|") === dejaPrevu);
    if (m0) source = m0.nom;

    renderTags();
    renderModeles();
    renderExos();
  },

  /* ---- gérer les programmes : renommer, changer le type, supprimer ---- */
  manageModeles(onChange) {
    const { el, close } = openModal(`<h3>Mes programmes</h3><div id="mod-list"></div>
      <p class="hint">Pour modifier les exercices d'un programme : applique-le sur un jour, ajuste la liste,
      puis touche « Mettre à jour ».</p>
      <button class="btn btn-accent" data-ok>Terminé</button>`);
    const render = () => {
      const mods = this.modeles();
      el.querySelector("#mod-list").innerHTML = mods.length ? mods.map((m, i) => `
        <div class="mod-row">
          <div class="mod-info">
            <strong>${esc(m.nom)}</strong>
            <small>${m.tag ? esc(m.tag) + " · " : ""}${m.exos.map(esc).join(", ")}</small>
          </div>
          <button class="chip chip-icon" data-ren="${i}" aria-label="Renommer">${icon("pencil")}</button>
          <button class="chip chip-icon" data-del="${i}" aria-label="Supprimer">${icon("trash")}</button>
        </div>`).join("") : `<p class="hint">Aucun programme enregistré.</p>`;
      el.querySelectorAll("[data-ren]").forEach(b => b.onclick = () => {
        const m = mods[Number(b.dataset.ren)];
        const nom = (prompt("Nouveau nom du programme :", m.nom) || "").trim();
        if (!nom || nom === m.nom) return;
        if (mods.some(x => x !== m && x.nom.toLowerCase() === nom.toLowerCase())) { alert("Un programme porte déjà ce nom."); return; }
        m.nom = nom;
        Store.save(); render(); onChange && onChange();
      });
      el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
        const m = mods[Number(b.dataset.del)];
        if (!confirm(`Supprimer le programme « ${m.nom} » ? Les jours déjà planifiés gardent leurs exercices.`)) return;
        mods.splice(Number(b.dataset.del), 1);
        Store.save(); render(); onChange && onChange();
      });
    };
    el.querySelector("[data-ok]").onclick = () => close();
    render();
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

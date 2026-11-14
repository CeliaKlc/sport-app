/* ===== Page Stats : trois onglets — Aperçu (la semaine), Progrès (un exercice à la fois), Journal (historique) ===== */

/* groupe d'un exercice d'après la bibliothèque (Push, Pull, Legs, Abdos, Cardio) */
const STATS_GROUPES = { "Push": "Push", "Pull": "Pull", "Legs / Lower": "Legs", "Abdos": "Abdos", "Cardio": "Cardio" };
function exoGroupe(nom) {
  for (const [cat, liste] of Object.entries(EXOS)) {
    if (liste.includes(nom)) return STATS_GROUPES[cat.split(" (")[0]] || cat;
  }
  return "Autres";
}
const GROUPE_ORDRE = ["Push", "Pull", "Legs", "Abdos", "Cardio", "Autres"];

/* meilleure valeur d'un exercice dans une séance : charge (kg) > durée (s) > répétitions */
function exoPerf(e) {
  const kg = Math.max(0, ...e.series.map(x => x.charge || 0));
  if (kg > 0) return { unit: "kg", value: kg };
  const sec = Math.max(0, ...e.series.map(x => x.sec || 0));
  if (sec > 0) return { unit: "s", value: sec };
  const reps = Math.max(0, ...e.series.map(x => x.reps || 0));
  if (reps > 0) return { unit: "reps", value: reps };
  return null;
}
function fmtPerf(v, unit) { return unit === "reps" ? `× ${v}` : `${v} ${unit}`; }
function fmtSerie(x) {
  if (x.sec) return x.sec + " s";
  return [x.charge ? x.charge + " kg" : "", x.reps ? "× " + x.reps : ""].join(" ").trim() || "—";
}

const Stats = {
  tab: "apercu",
  selectedExo: null,
  showAllRecords: false,
  journalLimit: 40,

  init() {
    $$("#stats-tabs [data-tab]").forEach(b => b.onclick = () => {
      this.tab = b.dataset.tab;
      this.applyTab();
      window.scrollTo(0, 0);
    });
    this.applyTab();
  },

  applyTab() {
    $$("#stats-tabs [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === this.tab));
    $$("#view-stats [data-pane]").forEach(p => p.classList.toggle("hidden", p.dataset.pane !== this.tab));
  },

  render() {
    const seances = Store.seances().slice().sort((a, b) => b.debut - a.debut);
    this.renderBackupBanner();
    // Aperçu
    this.renderStreak();
    this.renderWeekCards(seances);
    this.renderWeeksChart(seances);
    this.renderBalance(seances);
    // Progrès
    const perfs = this.collectPerfs(seances);
    this.renderExoProgress(perfs);
    this.renderRecords(perfs);
    // Journal
    this.renderJournal(seances);
  },

  /* ---- série d'assiduité (streak) ----
     Une semaine est validée si tu as fait autant de jours de séance que de jours
     d'entraînement prévus au planning (les jours « Repos » ne comptent donc pas
     contre toi). Sans planning cette semaine-là : 3 séances minimum. */
  computeStreak() {
    const plan = Store.data.planning[Store.current] || {};
    const doneDates = new Set(Store.seances().map(s => s.date));
    const weekOk = monday => {
      let planned = 0, done = 0;
      for (let i = 0; i < 7; i++) {
        const iso = dateToISO(addDays(monday, i));
        const tag = plan[iso];
        if (tag && tag !== "Repos") planned++;
        if (doneDates.has(iso)) done++;
      }
      return done >= (planned > 0 ? planned : 3);
    };
    const thisMonday = mondayOf(new Date());
    let streak = weekOk(thisMonday) ? 1 : 0; // la semaine en cours compte dès qu'elle est complète
    let m = addDays(thisMonday, -7);
    while (weekOk(m) && streak < 520) { streak++; m = addDays(m, -7); }
    return streak;
  },

  renderStreak() {
    const streak = this.computeStreak();
    const el = $("#streak-card");
    el.classList.toggle("hidden", !streak);
    if (!streak) return;
    el.innerHTML = `<span class="flame">🔥</span><div>
      <strong>${streak} semaine${streak > 1 ? "s" : ""} d'assiduité</strong><br>
      <small>Les jours de repos préservent la flamme 😌</small></div>`;
  },

  renderBackupBanner() {
    const banner = $("#backup-banner");
    const total = Store.data.seances.length;
    const last = Cloud.lastBackup();
    const unMois = 30 * 24 * 3600 * 1000;
    // rappel : au moins 3 séances jamais sauvegardées, ou dernière sauvegarde > 1 mois
    const due = (total >= 3 && !last) || (total > 0 && last && Date.now() - last > unMois);
    banner.classList.toggle("hidden", !due);
    if (!due) return;
    banner.innerHTML = `<span>💾 Pense à sauvegarder tes données&nbsp;!</span>
      <button class="btn btn-small btn-accent">Sauvegarder</button>`;
    banner.querySelector("button").onclick = () => UI.show("profil");
  },

  /* ================= APERÇU ================= */

  /* cette semaine, comparée à la semaine dernière au même jour (comparaison équitable en milieu de semaine) */
  renderWeekCards(seances) {
    const lundi = mondayOf(new Date());
    const sum = (debut, fin) => {
      const a = dateToISO(debut), b = dateToISO(fin);
      const l = seances.filter(s => s.date >= a && s.date <= b);
      return {
        n: l.length,
        actif: l.reduce((t, s) => t + (s.tempsActif || 0), 0),
        series: l.reduce((t, s) => t + (s.nbSeries || 0), 0),
        cal: l.reduce((t, s) => t + (s.calories || 0), 0)
      };
    };
    const now = sum(lundi, addDays(lundi, 6));
    const avant = sum(addDays(lundi, -7), addDays(new Date(), -7));
    const delta = (d, fmt) => {
      if (!d) return `<div class="delta">= sem. dernière</div>`;
      return `<div class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "↑ +" : "↓ −"}${fmt(Math.abs(d))} vs sem. dern.</div>`;
    };
    const tile = (val, lbl, d, fmt) =>
      `<div class="stat-card"><div class="lbl">${lbl}</div><div class="val">${val}</div>${delta(d, fmt)}</div>`;
    $("#stats-week-cards").innerHTML =
      tile(now.n, "Séance" + (now.n > 1 ? "s" : ""), now.n - avant.n, v => v) +
      tile(now.actif ? fmtDuree(now.actif) : "0 min", "Temps actif", Math.round((now.actif - avant.actif) / 60) * 60, v => fmtDuree(v)) +
      tile(now.series, "Séries", now.series - avant.series, v => v) +
      tile(now.cal + " kcal", "Calories (est.)", now.cal - avant.cal, v => v + " kcal");
  },

  renderWeeksChart(seances) {
    const items = [];
    const thisMonday = mondayOf(new Date());
    for (let i = 7; i >= 0; i--) {
      const start = addDays(thisMonday, -7 * i);
      const a = dateToISO(start), b = dateToISO(addDays(start, 6));
      const actif = seances.filter(s => s.date >= a && s.date <= b)
        .reduce((sum, s) => sum + s.tempsActif, 0);
      items.push({ label: start.getDate() + "/" + (start.getMonth() + 1), value: Math.round(actif / 60) });
    }
    const vals = items.slice(0, -1).map(i => i.value).filter(v => v > 0);
    const moy = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    $("#stats-weeks-chart").innerHTML = svgBars(items, { fmt: v => v + "'" }) +
      (moy ? `<p class="chart-note">Moyenne par semaine d'entraînement : <strong>${fmtDuree(moy * 60)}</strong></p>` : "");
  },

  /* équilibre musculaire : séries par groupe sur 30 jours (d'après les exercices notés) */
  renderBalance(seances) {
    const limite = dateToISO(addDays(new Date(), -30));
    const counts = {};
    seances.filter(s => s.date >= limite).forEach(s => (s.exercices || []).forEach(e => {
      const g = exoGroupe(e.nom);
      counts[g] = (counts[g] || 0) + e.series.length;
    }));
    const groupes = GROUPE_ORDRE.filter(g => counts[g]);
    if (!groupes.length) {
      $("#stats-muscles").innerHTML = `<div class="chart-empty">Note tes séries dans le carnet du chrono
        pour voir quels muscles tu travailles le plus.</div>`;
      return;
    }
    const max = Math.max(...Object.values(counts));
    // petit conseil : un grand groupe (Push / Pull / Legs) nettement en retrait
    const faible = ["Push", "Pull", "Legs"].filter(g => (counts[g] || 0) < max * 0.4);
    $("#stats-muscles").innerHTML = groupes.map(g => `
        <div class="muscle-row">
          <span class="name">${esc(g)}</span>
          <span class="bar"><i style="width:${counts[g] / max * 100}%;background:${tagColor(g)}"></i></span>
          <span class="n">${counts[g]}</span>
        </div>`).join("") +
      `<p class="chart-note">Nombre de séries sur les 30 derniers jours.` +
      (faible.length ? ` Un peu en retrait : <strong>${faible.join(", ")}</strong>.` : "") + `</p>`;
  },

  /* ================= PROGRÈS ================= */

  /* meilleure perf par exercice et par séance, en ordre chronologique */
  collectPerfs(seances) {
    const byExo = {};
    seances.slice().reverse().forEach(s => (s.exercices || []).forEach(e => {
      const p = exoPerf(e);
      if (!p) return;
      const b = byExo[e.nom] = byExo[e.nom] || { unit: p.unit, points: [] };
      if (b.unit === p.unit) b.points.push({ date: s.date, value: p.value });
    }));
    return byExo;
  },

  renderExoProgress(byExo) {
    const exos = Object.keys(byExo);
    const sel = $("#stats-exo-select");
    if (!exos.length) {
      sel.innerHTML = `<option>Aucun exercice noté pour l'instant</option>`;
      sel.disabled = true;
      $("#stats-exo-chart").innerHTML = `<div class="chart-empty">Note tes charges dans le carnet pendant tes pauses,
        et tu verras ici ta progression exercice par exercice 📈</div>`;
      $("#stats-exo-summary").innerHTML = "";
      return;
    }
    sel.disabled = false;
    // par défaut : le dernier exercice travaillé
    if (!this.selectedExo || !byExo[this.selectedExo]) {
      this.selectedExo = exos.reduce((a, b) =>
        byExo[b].points[byExo[b].points.length - 1].date > byExo[a].points[byExo[a].points.length - 1].date ? b : a);
    }
    // sélecteur rangé par groupe musculaire
    const parGroupe = {};
    exos.forEach(e => (parGroupe[exoGroupe(e)] = parGroupe[exoGroupe(e)] || []).push(e));
    sel.innerHTML = GROUPE_ORDRE.filter(g => parGroupe[g]).map(g =>
      `<optgroup label="${esc(g)}">` +
      parGroupe[g].sort((a, b) => a.localeCompare(b, "fr")).map(e =>
        `<option value="${esc(e)}"${e === this.selectedExo ? " selected" : ""}>${esc(e)}</option>`).join("") +
      `</optgroup>`).join("");
    sel.onchange = () => { this.selectedExo = sel.value; this.renderExoProgress(byExo); };

    const d = byExo[this.selectedExo];
    const pts = d.points;
    const record = Math.max(...pts.map(p => p.value));
    const dernier = pts[pts.length - 1];
    const premier = pts[0];
    const evol = +(dernier.value - premier.value).toFixed(1);
    const u = d.unit === "reps" ? " reps" : " " + d.unit;
    $("#stats-exo-summary").innerHTML = `
      <div><span class="lbl">Record</span><strong>${record}${u}</strong></div>
      <div><span class="lbl">Dernière fois</span><strong>${dernier.value}${u}</strong><small>${esc(fmtDateFR(dernier.date))}</small></div>
      <div><span class="lbl">Depuis le début</span><strong class="${evol > 0 ? "up" : ""}">${evol > 0 ? "+" : ""}${evol}${u}</strong>
        <small>${pts.length} séance${pts.length > 1 ? "s" : ""}</small></div>`;
    $("#stats-exo-chart").innerHTML =
      svgLine(pts.slice(-10).map(p => ({ label: p.date.slice(8).replace(/^0/, "") + "/" + p.date.slice(5, 7).replace(/^0/, ""), value: p.value })), { unit: "" });
  },

  /* derniers records battus (on ne compte pas la toute première fois) + liste complète repliable */
  renderRecords(byExo) {
    const events = [];
    for (const [nom, d] of Object.entries(byExo)) {
      let best = 0;
      d.points.forEach(p => {
        if (best > 0 && p.value > best) events.push({ nom, unit: d.unit, value: p.value, gain: +(p.value - best).toFixed(1), date: p.date });
        best = Math.max(best, p.value);
      });
    }
    events.sort((a, b) => b.date.localeCompare(a.date));
    const recents = events.slice(0, 5);

    let html = recents.length
      ? recents.map(r => `
        <button class="record-row" data-exo="${esc(r.nom)}">
          <span>${esc(r.nom)}</span>
          <strong>${fmtPerf(r.value, r.unit)}</strong>
          <em>+${r.gain}</em>
          <small>${esc(fmtDateFR(r.date))}</small>
        </button>`).join("")
      : `<div class="chart-empty">Tes prochains records battus apparaîtront ici 🏆</div>`;

    const exos = Object.keys(byExo);
    if (exos.length) {
      html += `<button class="btn btn-outline btn-small records-toggle" id="records-toggle">
        ${this.showAllRecords ? "Masquer" : "Voir"} tous mes records (${exos.length})</button>`;
      if (this.showAllRecords) {
        const parGroupe = {};
        exos.forEach(e => (parGroupe[exoGroupe(e)] = parGroupe[exoGroupe(e)] || []).push(e));
        html += GROUPE_ORDRE.filter(g => parGroupe[g]).map(g =>
          `<div class="records-group">${esc(g)}</div>` +
          parGroupe[g].sort((a, b) => a.localeCompare(b, "fr")).map(nom => {
            const d = byExo[nom];
            const top = d.points.reduce((a, b) => (b.value > a.value ? b : a));
            return `<button class="record-row" data-exo="${esc(nom)}"><span>${esc(nom)}</span>
              <strong>${fmtPerf(top.value, d.unit)}</strong><small>${esc(fmtDateFR(top.date))}</small></button>`;
          }).join("")).join("");
      }
    }
    $("#stats-records").innerHTML = html;

    const t = $("#records-toggle");
    if (t) t.onclick = () => { this.showAllRecords = !this.showAllRecords; this.renderRecords(byExo); };
    // toucher un record affiche sa courbe
    $$("#stats-records [data-exo]").forEach(b => b.onclick = () => {
      this.selectedExo = b.dataset.exo;
      this.renderExoProgress(byExo);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  },

  /* ================= JOURNAL ================= */

  renderJournal(seances) {
    const el = $("#stats-history");
    if (!seances.length) {
      el.innerHTML = `<div class="card chart-empty">Ta première séance apparaîtra ici.
        Direction l'onglet Chrono ! ⏱</div>`;
      return;
    }
    const visibles = seances.slice(0, this.journalLimit);
    const mois = [];
    visibles.forEach(s => {
      const cle = s.date.slice(0, 7);
      let m = mois[mois.length - 1];
      if (!m || m.cle !== cle) mois.push(m = { cle, items: [] });
      m.items.push(s);
    });
    const JC = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    el.innerHTML = mois.map(m => {
      const [y, mo] = m.cle.split("-").map(Number);
      // totaux du mois complet (pas seulement des séances affichées)
      const tout = seances.filter(s => s.date.startsWith(m.cle));
      const actif = tout.reduce((t, s) => t + (s.tempsActif || 0), 0);
      return `
      <div class="month-head">
        <span>${MOIS[mo - 1]} ${y !== new Date().getFullYear() ? y : ""}</span>
        <small>${tout.length} séance${tout.length > 1 ? "s" : ""} · ${fmtDuree(actif)}</small>
      </div>
      <div class="journal-list">${m.items.map(s => {
        const d = isoToDate(s.date);
        return `
        <button class="journal-row" data-id="${s.id}">
          <span class="j-date"><small>${JC[(d.getDay() + 6) % 7]}</small>${d.getDate()}</span>
          <span class="j-main">
            <span class="tag" style="background:${s.muscle ? tagColor(s.muscle) : "#8a7b6b"}">${esc(s.muscle || "Séance")}</span>
            <small>${fmtDuree(s.tempsActif)} actif · ${s.nbSeries} série${s.nbSeries > 1 ? "s" : ""}</small>
          </span>
          <span class="j-chev">›</span>
        </button>`;
      }).join("")}</div>`;
    }).join("") +
      (seances.length > this.journalLimit
        ? `<button class="btn btn-outline btn-big" id="journal-more">Voir les séances plus anciennes</button>` : "");

    $$("#stats-history [data-id]").forEach(b => b.onclick = () => this.openSeance(b.dataset.id));
    const more = $("#journal-more");
    if (more) more.onclick = () => { this.journalLimit += 40; this.renderJournal(seances); };
  },

  /* fiche d'une séance : détail des séries + modifier / supprimer */
  openSeance(id) {
    const s = Store.data.seances.find(x => x.id === id);
    if (!s) return;
    const exos = (s.exercices || []).map(e => `
      <div class="detail-exo">
        <div class="detail-nom">${esc(e.nom)}</div>
        <div class="serie-chips">${e.series.map(x => `<span>${esc(fmtSerie(x))}</span>`).join("")}</div>
      </div>`).join("");
    const { el, close } = openModal(`
      <h3>${esc(fmtDateFull(s.date))}</h3>
      <div class="sheet-meta">
        <span class="tag" style="background:${s.muscle ? tagColor(s.muscle) : "#8a7b6b"}">${esc(s.muscle || "Séance")}</span>
        <span>⏱ ${fmtDuree(s.tempsActif)} actif / ${fmtDuree(s.dureeTotale)}</span>
        ${s.tempsEchauffement ? `<span>🔥 ${fmtDuree(s.tempsEchauffement)} échauff.</span>` : ""}
        <span>🔁 ${s.nbSeries} série${s.nbSeries > 1 ? "s" : ""}</span>
        <span>⚡ ${s.calories || 0} kcal</span>
      </div>
      ${exos || `<p class="hint">Aucune série notée dans le carnet pour cette séance.</p>`}
      ${exos ? `<button class="btn btn-outline" data-edit>✏️ Modifier les séries</button>` : ""}
      <button class="btn btn-outline btn-danger" data-delete>🗑 Supprimer la séance</button>
    `);
    const edit = el.querySelector("[data-edit]");
    if (edit) edit.onclick = () => { close(); this.editSeance(id); };
    el.querySelector("[data-delete]").onclick = () => {
      if (confirm("Supprimer cette séance ?")) {
        Store.deleteSeance(id);
        close();
        this.render();
      }
    };
  },

  /* ---- édition d'une séance enregistrée : modifier ou supprimer les séries ---- */
  editSeance(id) {
    const s = Store.data.seances.find(x => x.id === id);
    if (!s) return;
    const rows = [];
    (s.exercices || []).forEach(e => e.series.forEach(x => rows.push({ nom: e.nom, x })));

    const { el, close } = openModal(`
      <h3>Modifier — ${esc(fmtDateFull(s.date))}</h3>
      <div id="edit-rows">${rows.map((r, i) => `
        <div class="edit-row" data-i="${i}">
          <span class="edit-nom">${esc(r.nom)}</span>
          ${r.x.sec != null
            ? `<input class="input" type="number" min="0" data-f="sec" value="${r.x.sec}" placeholder="s"><span class="edit-unit">s</span>`
            : `<input class="input" type="number" step="0.5" min="0" data-f="charge" value="${r.x.charge || ""}" placeholder="kg">
               <input class="input" type="number" min="0" data-f="reps" value="${r.x.reps || ""}" placeholder="reps">`}
          <button class="chip" data-del="${i}">✕</button>
        </div>`).join("")}</div>
      <p class="hint">✕ supprime une série. Un exercice sans série restante disparaît de la séance.</p>
      <button id="edit-save" class="btn btn-accent">💾 Enregistrer les modifications</button>
    `);

    const supprimees = new Set();
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      supprimees.add(Number(b.dataset.del));
      b.closest(".edit-row").style.display = "none";
    });

    el.querySelector("#edit-save").onclick = () => {
      const map = {}, ordre = [];
      el.querySelectorAll(".edit-row").forEach(row => {
        const i = Number(row.dataset.i);
        if (supprimees.has(i)) return;
        const serie = {};
        row.querySelectorAll("input").forEach(inp => {
          const v = parseFloat(inp.value);
          serie[inp.dataset.f] = isNaN(v) || v < 0 ? 0 : v;
        });
        if (serie.sec != null ? serie.sec <= 0 : (!serie.charge && !serie.reps)) return; // série vidée = supprimée
        const nom = rows[i].nom;
        if (!map[nom]) { map[nom] = { nom, series: [] }; ordre.push(nom); }
        map[nom].series.push(serie);
      });
      s.exercices = ordre.map(n => map[n]);
      Store.save();
      close();
      this.render();
    };
  }
};

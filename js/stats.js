/* ===== Page Stats : résumé hebdo, graphiques, progression des charges, historique ===== */

const Stats = {
  selectedExo: null,

  render() {
    const seances = Store.seances().slice().sort((a, b) => b.debut - a.debut);
    this.renderBackupBanner();
    this.renderStreak();
    this.renderWeekCards(seances);
    this.renderWeeksChart(seances);
    this.renderMuscles(seances);
    this.renderExoProgress(seances);
    this.renderRecords(seances);
    this.renderHistory(seances);
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
      <small>Toutes tes séances prévues sont faites — les jours de repos préservent la flamme 😌</small></div>`;
  },

  renderRecords(seances) {
    const best = {};
    seances.forEach(s => (s.exercices || []).forEach(e => e.series.forEach(x => {
      const b = best[e.nom] = best[e.nom] || { charge: 0, reps: 0, sec: 0, dc: s.date, ds: s.date, dr: s.date };
      if ((x.charge || 0) > b.charge) { b.charge = x.charge; b.dc = s.date; }
      if ((x.sec || 0) > b.sec) { b.sec = x.sec; b.ds = s.date; }
      if (!(x.charge > 0) && (x.reps || 0) > b.reps) { b.reps = x.reps; b.dr = s.date; }
    })));
    // priorité d'affichage : charge (kg) > durée (s) > répétitions
    const rows = Object.entries(best)
      .filter(([, r]) => r.charge > 0 || r.sec > 0 || r.reps > 0)
      .sort((a, b) => (b[1].charge - a[1].charge) || (b[1].sec - a[1].sec) || (b[1].reps - a[1].reps));
    $("#stats-records").innerHTML = rows.length
      ? rows.map(([nom, r]) => {
          const val = r.charge ? [r.charge + " kg", r.dc] : r.sec ? [r.sec + " s", r.ds] : ["× " + r.reps + " reps", r.dr];
          return `<div class="record-row"><span>${esc(nom)}</span>
            <strong>${val[0]}</strong><small>${esc(fmtDateFR(val[1]))}</small></div>`;
        }).join("")
      : `<div class="chart-empty">Tes records apparaîtront ici dès que tu noteras tes charges 🏆</div>`;
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

  renderWeekCards(seances) {
    const lundi = dateToISO(mondayOf(new Date()));
    const dimanche = dateToISO(addDays(mondayOf(new Date()), 6));
    const week = seances.filter(s => s.date >= lundi && s.date <= dimanche);
    const actif = week.reduce((a, s) => a + s.tempsActif, 0);
    const pause = week.reduce((a, s) => a + s.tempsPause, 0);
    const cal = week.reduce((a, s) => a + (s.calories || 0), 0);
    $("#stats-week-cards").innerHTML = `
      <div class="stat-card"><div class="val">${week.length}</div><div class="lbl">Séance${week.length > 1 ? "s" : ""}</div></div>
      <div class="stat-card"><div class="val">${actif ? fmtDuree(actif) : "0 min"}</div><div class="lbl">Temps actif</div></div>
      <div class="stat-card"><div class="val">${pause ? fmtDuree(pause) : "0 min"}</div><div class="lbl">Temps de pause</div></div>
      <div class="stat-card"><div class="val">${cal} kcal</div><div class="lbl">Calories (est.)</div></div>`;
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
    $("#stats-weeks-chart").innerHTML = svgBars(items, { fmt: v => v + "'" });
  },

  renderMuscles(seances) {
    const limite = dateToISO(addDays(new Date(), -30));
    const recentes = seances.filter(s => s.date >= limite && s.muscle);
    if (!recentes.length) {
      $("#stats-muscles").innerHTML = `<div class="chart-empty">Aucune séance sur les 30 derniers jours.</div>`;
      return;
    }
    const counts = {};
    recentes.forEach(s => counts[s.muscle] = (counts[s.muscle] || 0) + 1);
    const max = Math.max(...Object.values(counts));
    $("#stats-muscles").innerHTML = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([m, n]) => `
        <div class="muscle-row">
          <span class="name">${esc(m)}</span>
          <span class="bar"><i style="width:${n / max * 100}%;background:${tagColor(m)}"></i></span>
          <span class="n">${n}×</span>
        </div>`).join("");
  },

  renderExoProgress(seances) {
    // charge (ou durée) max par exercice et par séance, en ordre chronologique
    const byExo = {};
    seances.slice().reverse().forEach(s => {
      (s.exercices || []).forEach(e => {
        const maxCharge = Math.max(...e.series.map(x => x.charge || 0), 0);
        const maxSec = Math.max(...e.series.map(x => x.sec || 0), 0);
        if (maxCharge > 0) {
          const b = byExo[e.nom] = byExo[e.nom] || { unit: "kg", points: [] };
          if (b.unit === "kg") b.points.push({ label: fmtDateFR(s.date), value: maxCharge });
        } else if (maxSec > 0) {
          const b = byExo[e.nom] = byExo[e.nom] || { unit: "s", points: [] };
          if (b.unit === "s") b.points.push({ label: fmtDateFR(s.date), value: maxSec });
        }
      });
    });
    const exos = Object.keys(byExo).sort((a, b) => a.localeCompare(b, "fr"));
    const sel = $("#stats-exo-select");
    if (!exos.length) {
      sel.innerHTML = `<option>Aucun exercice noté pour l'instant</option>`;
      sel.disabled = true;
      $("#stats-exo-chart").innerHTML = `<div class="chart-empty">Note tes charges dans le carnet pendant tes pauses,
        et tu verras ici ta progression exercice par exercice 📈</div>`;
      return;
    }
    sel.disabled = false;
    if (!this.selectedExo || !byExo[this.selectedExo]) this.selectedExo = exos[0];
    sel.innerHTML = exos.map(e => `<option value="${esc(e)}"${e === this.selectedExo ? " selected" : ""}>${esc(e)}</option>`).join("");
    sel.onchange = () => { this.selectedExo = sel.value; this.renderExoProgress(seances); };

    const exoData = byExo[this.selectedExo];
    const points = exoData.points.slice(-10); // les 10 dernières séances
    const pr = Math.max(...exoData.points.map(p => p.value));
    $("#stats-exo-chart").innerHTML =
      svgLine(points, { unit: "" }) +
      `<div class="pr-line">🏆 Record personnel : <strong>${pr} ${exoData.unit}</strong></div>`;
  },

  renderHistory(seances) {
    if (!seances.length) {
      $("#stats-history").innerHTML = `<div class="card chart-empty">Ta première séance apparaîtra ici.
        Direction l'onglet Chrono ! ⏱</div>`;
      return;
    }
    $("#stats-history").innerHTML = seances.slice(0, 30).map(s => {
      const detail = (s.exercices || []).map(e =>
        `<div>• ${esc(e.nom)} : ${e.series.map(x =>
          x.sec ? x.sec + " s" : [x.charge ? x.charge + " kg" : "—", x.reps ? "× " + x.reps : ""].join(" ").trim()
        ).join(" · ")}</div>`).join("");
      return `
      <div class="hist-item" data-id="${s.id}">
        <div class="hist-top">
          <span class="hist-date">${fmtDateFull(s.date)}</span>
          <span class="tag" style="background:${s.muscle ? tagColor(s.muscle) : "#64748b"}">${esc(s.muscle || "?")}</span>
        </div>
        <div class="hist-meta">
          <span>⏱ ${fmtDuree(s.tempsActif)} actif / ${fmtDuree(s.dureeTotale)}</span>
          <span>🔁 ${s.nbSeries} série${s.nbSeries > 1 ? "s" : ""}</span>
          <span>🔥 ${s.calories || 0} kcal</span>
        </div>
        ${detail ? `<div class="hist-detail hidden">${detail}</div>` : ""}
        <div class="hist-actions">
          ${detail ? `<button class="btn btn-outline btn-small" data-toggle>Détails</button>` : ""}
          ${detail ? `<button class="btn btn-outline btn-small" data-edit>✏️ Modifier</button>` : ""}
          <button class="btn btn-outline btn-small" data-delete>🗑</button>
        </div>
      </div>`;
    }).join("");

    $$("#stats-history [data-toggle]").forEach(b => b.onclick = () => {
      b.closest(".hist-item").querySelector(".hist-detail").classList.toggle("hidden");
    });
    $$("#stats-history [data-delete]").forEach(b => b.onclick = () => {
      if (confirm("Supprimer cette séance ?")) {
        Store.deleteSeance(b.closest(".hist-item").dataset.id);
        this.render();
      }
    });
    $$("#stats-history [data-edit]").forEach(b => b.onclick = () => {
      this.editSeance(b.closest(".hist-item").dataset.id);
    });
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

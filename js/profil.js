/* ===== Page Profil : changement de profil, réglages, export / import ===== */

const Profil = {
  init() {
    $("#set-poids").onchange = () => this.saveSettings();
    $("#set-seuil").onchange = () => this.saveSettings();
    $("#set-met").onchange = () => this.saveSettings();
    $("#btn-export").onclick = () => this.exportData();
    $("#input-import").onchange = e => this.importData(e);
    $("#set-ghtoken").onchange = () => {
      Cloud.setToken($("#set-ghtoken").value);
      this.renderCloudStatus();
    };
    $("#btn-cloud-save").onclick = () => this.cloudSave();
    $("#btn-cloud-restore").onclick = () => this.cloudRestore();
  },

  async cloudSave() {
    if (!Cloud.token()) { alert("Colle d'abord ta clé d'accès GitHub dans le champ juste au-dessus."); return; }
    const b = $("#btn-cloud-save");
    b.disabled = true; b.innerHTML = icon("cloud") + " Sauvegarde en cours…";
    try {
      await Cloud.save();
      this.renderCloudStatus();
      alert("Sauvegarde en ligne réussie ✅");
    } catch (err) {
      alert("Échec de la sauvegarde : " + err.message);
    }
    b.disabled = false; b.innerHTML = icon("cloud") + " Sauvegarder maintenant";
  },

  async cloudRestore() {
    if (!Cloud.token()) { alert("Colle d'abord ta clé d'accès GitHub dans le champ juste au-dessus."); return; }
    if (!confirm("Remplacer les données de cet appareil par la sauvegarde en ligne ?")) return;
    const b = $("#btn-cloud-restore");
    b.disabled = true; b.innerHTML = icon("download") + " Restauration…";
    try {
      await Cloud.restore();
      refreshAll();
      alert("Données restaurées ✅");
    } catch (err) {
      alert("Échec de la restauration : " + err.message);
    }
    b.disabled = false; b.innerHTML = icon("download") + " Restaurer la sauvegarde";
  },

  renderCloudStatus() {
    const last = Cloud.lastBackup();
    const d = new Date(last);
    let txt = last
      ? "Dernière sauvegarde en ligne : " + fmtDateFull(dateToISO(d)) + " à " + pad(d.getHours()) + "h" + pad(d.getMinutes())
      : (Cloud.token() ? "Clé enregistrée sur cet appareil — aucune sauvegarde envoyée pour l'instant." : "");
    if (Cloud.token()) txt += (txt ? " · " : "") + "Sauvegarde automatique activée";
    if (Cloud.lastAutoError) txt += "\nAttention, sauvegarde auto en échec : " + Cloud.lastAutoError;
    $("#cloud-status").textContent = txt;
  },

  render() {
    $("#profil-switch").innerHTML = Object.entries(Store.data.profils).map(([id, p]) =>
      `<button class="pswitch${id === Store.current ? " active" : ""}" data-id="${id}"
        style="${id === Store.current ? "border-color:" + accentOf(p) + ";color:" + accentOf(p) : ""}">${esc(p.nom)}</button>`
    ).join("");
    $$("#profil-switch .pswitch").forEach(b => b.onclick = () => {
      Store.setProfile(b.dataset.id);
      refreshAll();
    });
    const p = Store.profil();
    $("#set-poids").value = p.poids;
    $("#set-seuil").value = p.seuilPause / 60;
    $("#set-met").value = p.met;
    $("#set-ghtoken").value = Cloud.token();
    this.renderCloudStatus();
    this.renderPersoExos();
    this.renderMesures();
  },

  /* ---- poids & mensurations ---- */
  MESURES: [
    ["poids", "Poids", "kg"], ["taille", "Tour de taille", "cm"], ["hanches", "Hanches", "cm"],
    ["poitrine", "Poitrine", "cm"], ["bras", "Bras", "cm"], ["cuisse", "Cuisse", "cm"]
  ],
  mesureSel: "poids",
  showMesuresHist: false,

  mesures() {
    const all = Store.data.mesures;
    return all[Store.current] || (all[Store.current] = []);
  },

  renderMesures() {
    const el = $("#mesures");
    const list = this.mesures().slice().sort((a, b) => a.date.localeCompare(b.date));
    const addBtn = `<button class="btn btn-accent" id="mesure-add">${icon("plus")} Nouvelle mesure</button>`;
    if (!list.length) {
      el.innerHTML = `<p class="hint" style="margin:0 0 12px">Note ton poids et tes mensurations de temps en temps
        (une fois par semaine suffit) pour suivre ton évolution. Ton poids sert aussi au calcul des calories.</p>${addBtn}`;
      $("#mesure-add").onclick = () => this.openMesure();
      return;
    }
    const dispo = this.MESURES.filter(([k]) => list.some(m => m[k] > 0));
    if (!dispo.some(([k]) => k === this.mesureSel)) this.mesureSel = dispo[0][0];

    const tiles = dispo.map(([k, lbl, u]) => {
      const pts = list.filter(m => m[k] > 0);
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      const d = prev ? +(last[k] - prev[k]).toFixed(1) : 0;
      return `<button class="mesure-tile${k === this.mesureSel ? " on" : ""}" data-k="${k}">
        <span class="lbl">${lbl}</span>
        <strong>${String(last[k]).replace(".", ",")} <small>${u}</small></strong>
        <span class="delta">${prev ? (d ? (d > 0 ? "+" : "−") + String(Math.abs(d)).replace(".", ",") + " " + u : "stable") + " depuis le " + fmtDateFR(prev.date) : "1re mesure"}</span>
      </button>`;
    }).join("");

    const [k, lbl, u] = this.MESURES.find(m => m[0] === this.mesureSel);
    const pts = list.filter(m => m[k] > 0);
    const graph = pts.length > 1
      ? svgLine(pts.slice(-12).map(m => ({ label: +m.date.slice(8) + "/" + +m.date.slice(5, 7), value: m[k] })), { unit: "" })
      : `<div class="chart-empty">La courbe apparaîtra dès la 2e mesure de « ${lbl.toLowerCase()} ».</div>`;

    const hist = list.slice().reverse();
    el.innerHTML = `
      <div class="mesure-grid">${tiles}</div>
      <div class="mesure-chart"><div class="mesure-chart-title">${lbl} (${u})</div>${graph}</div>
      ${addBtn}
      <button class="btn btn-outline btn-small mesure-hist-toggle" id="mesure-hist-toggle">
        ${this.showMesuresHist ? "Masquer" : "Voir"} l'historique (${hist.length})</button>
      ${this.showMesuresHist ? `<div class="mesure-hist">${hist.map(m => `
        <div class="mesure-row">
          <span>${fmtDateFR(m.date)}</span>
          <small>${this.MESURES.filter(([k]) => m[k] > 0).map(([k, l, u]) => l + " " + String(m[k]).replace(".", ",") + " " + u).join(" · ")}</small>
          <button class="chip chip-sm chip-icon" data-del="${m.date}" aria-label="Supprimer">${icon("x")}</button>
        </div>`).join("")}</div>` : ""}`;

    $("#mesure-add").onclick = () => this.openMesure();
    $$("#mesures [data-k]").forEach(b => b.onclick = () => { this.mesureSel = b.dataset.k; this.renderMesures(); });
    $("#mesure-hist-toggle").onclick = () => { this.showMesuresHist = !this.showMesuresHist; this.renderMesures(); };
    $$("#mesures [data-del]").forEach(b => b.onclick = () => {
      if (!confirm("Supprimer les mesures du " + fmtDateFR(b.dataset.del) + " ?")) return;
      Store.data.mesures[Store.current] = this.mesures().filter(m => m.date !== b.dataset.del);
      Store.save();
      this.renderMesures();
    });
  },

  openMesure() {
    const list = this.mesures().slice().sort((a, b) => a.date.localeCompare(b.date));
    const derniere = k => { const m = list.filter(x => x[k] > 0).pop(); return m ? m[k] : ""; };
    const { el, close } = openModal(`
      <h3>Nouvelle mesure</h3>
      <div class="settings">
        <label>Date <input class="input" type="date" id="mes-date" value="${todayISO()}" max="${todayISO()}"></label>
        <div class="mesure-form">${this.MESURES.map(([k, l, u]) => `
          <label>${l} (${u})
            <input class="input" type="number" inputmode="decimal" step="0.1" min="0" data-k="${k}" placeholder="${derniere(k)}">
          </label>`).join("")}</div>
      </div>
      <p class="hint">Remplis seulement ce que tu as mesuré. Le chiffre grisé est ta dernière valeur.</p>
      <button class="btn btn-accent" id="mes-save">Enregistrer</button>`);
    el.querySelector("#mes-save").onclick = () => {
      const date = el.querySelector("#mes-date").value || todayISO();
      const vals = {};
      el.querySelectorAll("[data-k]").forEach(i => { const v = parseFloat(String(i.value).replace(",", ".")); if (v > 0) vals[i.dataset.k] = v; });
      if (!Object.keys(vals).length) { alert("Remplis au moins une mesure 😉"); return; }
      const all = this.mesures();
      const exist = all.find(m => m.date === date);
      if (exist) Object.assign(exist, vals); else all.push(Object.assign({ date }, vals));
      // le poids le plus récent devient le poids du profil (calcul des calories)
      if (vals.poids) {
        const plusRecent = all.filter(m => m.poids > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
        Store.profil().poids = plusRecent.poids;
        $("#set-poids").value = plusRecent.poids;
      }
      Store.save();
      if (vals[this.mesureSel] == null) this.mesureSel = Object.keys(vals)[0];
      close();
      this.renderMesures();
      toast("Mesure enregistrée", "ruler");
    };
  },

  renderPersoExos() {
    const perso = Store.data.exosPerso[Store.current] || [];
    $("#perso-exos").innerHTML = perso.length
      ? `<div class="chip-list">${perso.map((e, i) =>
          `<span class="chip chip-exo">${esc(e)}<button data-renexo="${i}" title="Renommer" aria-label="Renommer">${icon("pencil")}</button><button data-rmexo="${i}" title="Supprimer" aria-label="Supprimer">${icon("x")}</button></span>`).join("")}</div>
        <p class="hint">${icon("pencil")} renomme partout (historique, records, programmes compris) — pratique pour corriger une faute de frappe.
        ${icon("x")} retire l'exercice de la bibliothèque, tes séances passées le gardent.</p>`
      : `<p class="hint">Les exercices que tu crées via «&nbsp;+ Autre exercice…&nbsp;» dans le carnet apparaîtront ici.</p>`;
    $$("#perso-exos [data-rmexo]").forEach(b => b.onclick = () => {
      const i = Number(b.dataset.rmexo);
      if (confirm(`Supprimer « ${perso[i]} » de ta bibliothèque ?`)) {
        perso.splice(i, 1);
        Store.save();
        this.renderPersoExos();
      }
    });
    $$("#perso-exos [data-renexo]").forEach(b => b.onclick = () => this.renameExo(Number(b.dataset.renexo)));
  },

  renameExo(i) {
    const perso = Store.data.exosPerso[Store.current] || [];
    const ancien = perso[i];
    if (!ancien) return;
    const { el, close } = openModal(`
      <h3>Renommer l'exercice</h3>
      <input id="ren-input" class="input" value="${esc(ancien)}">
      <button id="ren-ok" class="btn btn-accent">${icon("save")} Renommer partout</button>
      <p class="hint">Le nouveau nom sera appliqué partout : bibliothèque, historique de séances,
      records, progression et exercices prévus au planning.</p>
    `);
    const input = el.querySelector("#ren-input");
    input.focus();
    input.select();
    el.querySelector("#ren-ok").onclick = () => {
      const nouveau = input.value.trim();
      if (!nouveau || nouveau === ancien) { close(); return; }
      Store.renameExo(ancien, nouveau);
      // séance en cours : renomme aussi les séries déjà notées
      if (typeof Chrono !== "undefined" && Chrono.st) {
        Chrono.st.series.forEach(s => { if (s.exo === ancien) s.exo = nouveau; });
        Chrono.persist();
      }
      close();
      refreshAll();
    };
  },

  saveSettings() {
    const p = Store.profil();
    const poids = parseFloat($("#set-poids").value);
    const seuilMin = parseFloat($("#set-seuil").value);
    const met = parseFloat($("#set-met").value);
    if (poids > 0) p.poids = poids;
    if (seuilMin > 0) p.seuilPause = Math.round(seuilMin * 60);
    if (met > 0) p.met = met;
    Store.save();
  },

  exportData() {
    const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sport-app-donnees-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    Cloud.markBackup();
    this.renderCloudStatus();
  },

  importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d.profils || !Array.isArray(d.seances)) throw new Error("format");
        if (!confirm("Remplacer toutes les données actuelles par celles du fichier ?")) return;
        Store.data = d;
        Store.save();
        Store.load(); // ré-applique la fusion avec les valeurs par défaut
        refreshAll();
        alert("Données importées ✅");
      } catch (err) {
        alert("Fichier invalide : ce n'est pas un export de Sport App.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  }
};

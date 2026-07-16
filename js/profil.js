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
    b.disabled = true; b.textContent = "☁️ Sauvegarde en cours…";
    try {
      await Cloud.save();
      this.renderCloudStatus();
      alert("Sauvegarde en ligne réussie ✅");
    } catch (err) {
      alert("Échec de la sauvegarde : " + err.message);
    }
    b.disabled = false; b.textContent = "☁️  Sauvegarder en ligne";
  },

  async cloudRestore() {
    if (!Cloud.token()) { alert("Colle d'abord ta clé d'accès GitHub dans le champ juste au-dessus."); return; }
    if (!confirm("Remplacer les données de cet appareil par la sauvegarde en ligne ?")) return;
    const b = $("#btn-cloud-restore");
    b.disabled = true; b.textContent = "⬇ Restauration…";
    try {
      await Cloud.restore();
      refreshAll();
      alert("Données restaurées ✅");
    } catch (err) {
      alert("Échec de la restauration : " + err.message);
    }
    b.disabled = false; b.textContent = "⬇  Restaurer la sauvegarde";
  },

  renderCloudStatus() {
    const last = Cloud.lastBackup();
    $("#cloud-status").textContent = last
      ? "Dernière sauvegarde en ligne : " + fmtDateFull(dateToISO(new Date(last)))
      : (Cloud.token() ? "Clé enregistrée sur cet appareil — aucune sauvegarde envoyée pour l'instant." : "");
  },

  render() {
    $("#profil-switch").innerHTML = Object.entries(Store.data.profils).map(([id, p]) =>
      `<button class="pswitch${id === Store.current ? " active" : ""}" data-id="${id}"
        style="${id === Store.current ? "border-color:" + p.couleur + ";color:" + p.couleur : ""}">${esc(p.nom)}</button>`
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
  },

  renderPersoExos() {
    const perso = Store.data.exosPerso[Store.current] || [];
    $("#perso-exos").innerHTML = perso.length
      ? `<div class="chip-list">${perso.map((e, i) =>
          `<span class="chip chip-exo">${esc(e)}<button data-rmexo="${i}">✕</button></span>`).join("")}</div>
        <p class="hint">Supprimer un exercice le retire de la bibliothèque — tes séances passées le gardent.</p>`
      : `<p class="hint">Les exercices que tu crées via «&nbsp;➕ Autre exercice…&nbsp;» dans le carnet apparaîtront ici.</p>`;
    $$("#perso-exos [data-rmexo]").forEach(b => b.onclick = () => {
      const i = Number(b.dataset.rmexo);
      if (confirm(`Supprimer « ${perso[i]} » de ta bibliothèque ?`)) {
        perso.splice(i, 1);
        Store.save();
        this.renderPersoExos();
      }
    });
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

/* ===== Page Profil : changement de profil, réglages, export / import ===== */

const Profil = {
  init() {
    $("#set-poids").onchange = () => this.saveSettings();
    $("#set-seuil").onchange = () => this.saveSettings();
    $("#set-met").onchange = () => this.saveSettings();
    $("#btn-export").onclick = () => this.exportData();
    $("#input-import").onchange = e => this.importData(e);
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

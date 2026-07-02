/* ===== Initialisation de l'application ===== */

function refreshAll() {
  UI.applyAccent();
  Stats.render();
  Planning.render();
  Profil.render();
}

window.addEventListener("DOMContentLoaded", () => {
  Store.load();

  // navigation basse
  $$(".nav-btn").forEach(b => b.onclick = () => UI.show(b.dataset.view));

  // écran de choix du profil
  $$(".profile-card").forEach(c => c.onclick = () => {
    Store.setProfile(c.dataset.profil);
    $("#profile-select").classList.add("hidden");
    refreshAll();
  });
  $("#profile-chip").onclick = () => $("#profile-select").classList.remove("hidden");

  // premier lancement : on demande qui s'entraîne
  if (!Store.current) {
    Store.current = "celia"; // valeur provisoire derrière l'écran de choix
    $("#profile-select").classList.remove("hidden");
  }

  Planning.init();
  Profil.init();
  Chrono.init(); // restaure une éventuelle séance en cours

  refreshAll();
  UI.show(Chrono.st ? "chrono" : "stats");

  // PWA : service worker pour le mode hors-ligne (uniquement en http/https)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});

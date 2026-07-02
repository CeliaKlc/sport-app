/* ===== Écran de verrouillage : code d'accès demandé une fois par appareil ===== */
/* Le code n'apparaît jamais en clair ici : on ne stocke que son empreinte SHA-256. */

const Lock = {
  HASH: "c4f8cd33c216cfb5d7a16057ea5ebf5b752596c798152d86c3b27978c6d169eb",
  KEY: "sportapp-unlock",

  async sha(txt) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  init() {
    // appareil déjà déverrouillé avec le code actuel ?
    if (localStorage.getItem(this.KEY) === this.HASH) {
      $("#lock-screen").classList.add("hidden");
      return;
    }
    $("#lock-btn").onclick = () => this.tryUnlock();
    $("#lock-input").addEventListener("keydown", e => { if (e.key === "Enter") this.tryUnlock(); });
    $("#lock-input").focus();
  },

  async tryUnlock() {
    const code = $("#lock-input").value.trim();
    if (!code) return;
    const h = await this.sha("sportapp:" + code);
    if (h === this.HASH) {
      localStorage.setItem(this.KEY, h);
      $("#lock-screen").classList.add("hidden");
    } else {
      const err = $("#lock-error");
      err.classList.remove("hidden");
      const box = $("#lock-box");
      box.classList.remove("shake");
      void box.offsetWidth; // relance l'animation
      box.classList.add("shake");
      $("#lock-input").value = "";
      $("#lock-input").focus();
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    }
  }
};

window.addEventListener("DOMContentLoaded", () => Lock.init());

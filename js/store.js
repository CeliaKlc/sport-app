/* ===== Données : constantes + stockage localStorage ===== */

const MUSCLES = ["Jambes", "Dos", "Pecs", "Épaules", "Bras", "Abdos", "Full body", "Cardio"];
const PLAN_TAGS = MUSCLES.concat(["Repos"]);

const MUSCLE_COLORS = {
  "Jambes": "#f97316",
  "Dos": "#22c55e",
  "Pecs": "#ef4444",
  "Épaules": "#eab308",
  "Bras": "#a855f7",
  "Abdos": "#14b8a6",
  "Full body": "#38bdf8",
  "Cardio": "#ec4899",
  "Repos": "#64748b"
};

const EXOS = {
  "Jambes": ["Squat", "Presse à cuisses", "Fentes", "Leg extension", "Leg curl", "Hip thrust", "Mollets debout"],
  "Dos": ["Tirage vertical", "Tirage horizontal", "Rowing barre", "Rowing haltère", "Soulevé de terre", "Pull-over"],
  "Pecs": ["Développé couché", "Développé incliné", "Écartés (pec fly)", "Dips", "Pompes"],
  "Épaules": ["Développé militaire", "Élévations latérales", "Élévations frontales", "Oiseau (arrière d'épaule)"],
  "Bras": ["Curl biceps", "Curl marteau", "Extension triceps poulie", "Barre au front"],
  "Abdos": ["Crunch", "Gainage", "Relevés de jambes"],
  "Cardio": ["Tapis de course", "Vélo", "Rameur", "Elliptique", "Escalier"]
};

const Store = {
  KEY: "sportapp-data",
  PROFILE_KEY: "sportapp-profil",
  data: null,
  current: null,

  defaults() {
    return {
      version: 1,
      profils: {
        celia:  { nom: "Célia",  poids: 60, couleur: "#f0417a", seuilPause: 180, met: 5 },
        jeremy: { nom: "Jérémy", poids: 80, couleur: "#3aa0ff", seuilPause: 180, met: 5 }
      },
      seances: [],
      planning: { celia: {}, jeremy: {} },
      semaineType: { celia: {}, jeremy: {} },
      exosPerso: { celia: [], jeremy: [] }
    };
  },

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { /* données corrompues : on repart des défauts */ }
    const def = this.defaults();
    this.data = Object.assign(def, saved || {});
    // fusionne les sous-objets pour ne jamais perdre un profil manquant
    const def2 = this.defaults();
    for (const k of ["profils", "planning", "semaineType", "exosPerso"]) {
      this.data[k] = Object.assign({}, def2[k], this.data[k] || {});
    }
    this.current = localStorage.getItem(this.PROFILE_KEY) || null;
  },

  save() {
    localStorage.setItem(this.KEY, JSON.stringify(this.data));
  },

  setProfile(id) {
    this.current = id;
    localStorage.setItem(this.PROFILE_KEY, id);
  },

  profil() {
    return this.data.profils[this.current];
  },

  seances() {
    return this.data.seances.filter(s => s.profil === this.current);
  },

  addSeance(s) {
    this.data.seances.push(s);
    this.save();
  },

  deleteSeance(id) {
    this.data.seances = this.data.seances.filter(s => s.id !== id);
    this.save();
  },

  addExoPerso(nom) {
    const list = this.data.exosPerso[this.current];
    if (!list.includes(nom)) { list.push(nom); this.save(); }
  }
};

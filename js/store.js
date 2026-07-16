/* ===== Données : constantes + stockage localStorage ===== */

/* Split PPL + Upper/Lower :
   Push = pecs, épaules, triceps · Pull = dos, biceps · Legs/Lower = jambes · Upper = haut du corps */
const MUSCLES = ["Push", "Pull", "Legs", "Upper", "Lower", "Cardio"];
const PLAN_TAGS = MUSCLES.concat(["Repos"]);

const MUSCLE_COLORS = {
  "Push": "#ef4444",
  "Pull": "#22c55e",
  "Legs": "#f97316",
  "Upper": "#38bdf8",
  "Lower": "#a855f7",
  "Cardio": "#ec4899",
  "Repos": "#64748b"
};

// programmes combinés proposés en plus des tags de base
const TAGS_COMBOS = [
  "Fessiers + quadriceps", "Fessiers + ischios", "Jambes + fessiers",
  "Dos + biceps", "Pecs + triceps", "Abdos + pecs", "Épaules + bras"
];

// couleur stable pour n'importe quel tag (les personnalisés inclus)
const TAG_PALETTE = ["#f97316", "#22c55e", "#ef4444", "#eab308", "#a855f7", "#14b8a6", "#38bdf8", "#ec4899", "#84cc16", "#f43f5e", "#06b6d4", "#d946ef"];
function tagColor(tag) {
  if (MUSCLE_COLORS[tag]) return MUSCLE_COLORS[tag];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

/* groupes musculaires sollicités par un tag (pour l'alerte de repos < 72 h) */
const GROUP_KEYWORDS = {
  fessiers:   ["fessier", "glute", "jambe", "legs", "lower"],
  quadriceps: ["quadri", "cuisse", "squat", "jambe", "legs", "lower"],
  ischios:    ["ischio", "jambe", "legs", "lower"],
  mollets:    ["mollet", "jambe", "legs", "lower"],
  dos:        ["dos", "pull", "upper", "tirage", "rowing"],
  pecs:       ["pec", "push", "upper"],
  epaules:    ["épaule", "epaule", "push", "upper"],
  biceps:     ["biceps", "pull", "upper"],
  triceps:    ["triceps", "push", "upper"],
  abdos:      ["abdo", "gainage"]
};
const GROUP_LABELS = {
  fessiers: "fessiers", quadriceps: "quadriceps", ischios: "ischios", mollets: "mollets",
  dos: "dos", pecs: "pecs", epaules: "épaules", biceps: "biceps", triceps: "triceps", abdos: "abdos"
};
function muscleGroups(tag) {
  const t = (tag || "").toLowerCase();
  if (!t || t === "repos" || t === "cardio") return [];
  const out = [];
  for (const [g, kws] of Object.entries(GROUP_KEYWORDS)) {
    if (kws.some(k => t.includes(k))) out.push(g);
  }
  return out;
}

const EXOS = {
  "Push (pecs · épaules · triceps)": [
    "Développé couché", "Développé incliné", "Écartés (pec fly)", "Dips", "Pompes",
    "Développé pecs (machine)", "Développé épaules (machine)",
    "Développé militaire", "Élévations latérales", "Élévations frontales",
    "Extension triceps poulie", "Barre au front"
  ],
  "Pull (dos · biceps)": [
    "Tirage vertical", "Tirage horizontal", "Rowing barre", "Rowing haltère",
    "Soulevé de terre", "Pull-over", "Oiseau (arrière d'épaule)",
    "Extension lombaires (banc)", "Curl biceps", "Curl marteau"
  ],
  "Legs / Lower (jambes · fessiers)": [
    "Squat", "Presse à cuisses", "Fentes", "Fentes bulgares", "Leg extension", "Leg curl",
    "Hip thrust", "Soulevé de terre roumain", "Soulevé de terre jambes tendues",
    "Abducteurs (machine)", "Adducteurs (machine)", "Kickback fessiers (poulie)", "Mollets debout"
  ],
  "Abdos": ["Crunch", "Gainage", "Relevés de jambes"],
  "Cardio": ["Tapis de course", "Vélo", "Rameur", "Elliptique", "Escalier"]
};

/* Exercices d'isolation : un seul groupe musculaire → repos plus court (moitié du seuil, min 1 min).
   Tout le reste (squat, presses, tirages…) est polyarticulaire → seuil complet. */
const EXOS_ISO = [
  "Leg extension", "Leg curl", "Abducteurs (machine)", "Adducteurs (machine)",
  "Kickback fessiers (poulie)", "Mollets debout",
  "Écartés (pec fly)", "Élévations latérales", "Élévations frontales", "Oiseau (arrière d'épaule)",
  "Pull-over", "Extension lombaires (banc)",
  "Curl biceps", "Curl marteau", "Extension triceps poulie", "Barre au front",
  "Crunch", "Gainage", "Relevés de jambes"
];
function exoIsIso(nom) { return EXOS_ISO.includes(nom); }

/* ---- mode de charge par exercice : libre / machine / corps (reps) / temps (secondes) ---- */
const EXO_MODES = [["libre", "Libre"], ["machine", "Machine"], ["corps", "Poids du corps"], ["temps", "Temps"]];

function exoDefaultMode(nom) {
  if (nom === "Gainage") return "temps";
  if (["Pompes", "Crunch", "Relevés de jambes", "Dips", "Extension lombaires (banc)"].includes(nom)) return "corps";
  const machine = ["(machine)", "poulie", "Presse à cuisses", "Leg extension", "Leg curl", "Tirage vertical", "Tirage horizontal"];
  if (machine.some(h => nom.includes(h))) return "machine";
  return "libre";
}

function exoMode(nom, profil) {
  const meta = Store.data.exoMeta[profil || Store.current] || {};
  return (meta[nom] && meta[nom].mode) || exoDefaultMode(nom);
}

function setExoMode(nom, mode, profil) {
  const all = Store.data.exoMeta[profil || Store.current];
  (all[nom] = all[nom] || {}).mode = mode;
  Store.save();
}

/* cran d'une machine appris depuis l'historique : l'écart le plus fréquent
   entre les charges déjà utilisées (ex : 45 → 52 → 59 = crans de 7 kg) */
function machineStep(nom, profil) {
  const charges = new Set();
  Store.data.seances
    .filter(s => s.profil === (profil || Store.current))
    .forEach(s => (s.exercices || []).forEach(e => {
      if (e.nom === nom) e.series.forEach(x => { if (x.charge > 0) charges.add(x.charge); });
    }));
  const arr = Array.from(charges).sort((a, b) => a - b);
  const gaps = {};
  for (let i = 1; i < arr.length; i++) {
    const g = +(arr[i] - arr[i - 1]).toFixed(1);
    if (g > 0) gaps[g] = (gaps[g] || 0) + 1;
  }
  const best = Object.entries(gaps).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? parseFloat(best[0]) : null;
}

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
      exosPerso: { celia: [], jeremy: [] },
      tagsPerso: { celia: [], jeremy: [] },
      programme: { celia: {}, jeremy: {} },  // exercices prévus par jour
      coach: { celia: null, jeremy: null },  // réponses au questionnaire Coach
      exoMeta: { celia: {}, jeremy: {} }     // mode de charge choisi par exercice
    };
  },

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { /* données corrompues : on repart des défauts */ }
    const def = this.defaults();
    this.data = Object.assign(def, saved || {});
    // fusionne les sous-objets pour ne jamais perdre un profil manquant
    const def2 = this.defaults();
    for (const k of ["profils", "planning", "semaineType", "exosPerso", "tagsPerso", "programme", "coach", "exoMeta"]) {
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

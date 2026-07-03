/* ===== Coach : questionnaire + générateur de programme personnalisé ===== */
/* Moteur de règles 100 % local, basé sur les conventions éprouvées de la musculation :
   split selon les jours disponibles, séries×reps selon l'objectif, volume et fréquence
   doublés sur les zones prioritaires, polyarticulaires avant isolations. */

const Coach = {
  state: null,

  OPTIONS: {
    sexe:     [["femme", "Femme"], ["homme", "Homme"]],
    niveau:   [["debutant", "Débutant·e"], ["inter", "Intermédiaire"], ["avance", "Avancé·e"]],
    jours:    [["2", "2 jours"], ["3", "3 jours"], ["4", "4 jours"], ["5", "5 jours"]],
    objectif: [["muscle", "Prise de muscle"], ["tonif", "Tonification"], ["force", "Force"], ["forme", "Remise en forme"]],
    priorites: [["Fessiers"], ["Jambes"], ["Dos"], ["Épaules"], ["Bras"], ["Pecs"], ["Abdos"]]
  },

  answers() { return Store.data.coach[Store.current]; },

  defaults() {
    const sexe = Store.current === "jeremy" ? "homme" : "femme";
    return {
      sexe, niveau: "debutant", jours: "5", objectif: "muscle",
      priorites: sexe === "femme" ? ["Fessiers"] : ["Pecs"]
    };
  },

  render() {
    if (!this.state || this.state._p !== Store.current) {
      this.state = Object.assign({}, this.defaults(), this.answers() || {});
      this.state.priorites = (this.state.priorites || []).slice();
      this.state._p = Store.current;
    }
    this.renderForm();
    if (this.answers()) this.renderResult(this.generate(this.answers()));
    else $("#coach-result").innerHTML = "";
  },

  /* ---- questionnaire ---- */
  renderForm() {
    const s = this.state;
    const q = (key, label, small) =>
      `<p class="coach-q">${label}${small ? ` <small>${small}</small>` : ""}</p>
      <div class="chip-list" data-q="${key}">${this.OPTIONS[key].map(([v, l]) =>
        `<button class="chip${(key === "priorites" ? s.priorites.includes(v) : s[key] === v) ? " on" : ""}"
          data-v="${esc(v)}">${esc(l || v)}</button>`).join("")}</div>`;

    $("#coach-form").innerHTML = `<div class="card">
      ${q("sexe", "Ton sexe", "(sert aux priorités par défaut — les muscles s'entraînent pareil)")}
      ${q("niveau", "Ton niveau")}
      ${q("jours", "Jours d'entraînement par semaine", "(2 jours de repos minimum, on y tient 😌)")}
      ${q("objectif", "Ton objectif principal")}
      ${q("priorites", "Zones à développer en priorité", "(2 max — elles reçoivent plus de volume et de fréquence)")}
      <button id="coach-generate" class="btn btn-accent btn-big">🎯 Générer mon programme</button>
    </div>`;

    $$("#coach-form [data-q]").forEach(group => {
      const key = group.dataset.q;
      group.querySelectorAll(".chip").forEach(b => b.onclick = () => {
        if (key === "priorites") {
          const v = b.dataset.v, i = this.state.priorites.indexOf(v);
          if (i >= 0) this.state.priorites.splice(i, 1);
          else {
            if (this.state.priorites.length >= 2) this.state.priorites.shift();
            this.state.priorites.push(v);
          }
        } else {
          this.state[key] = b.dataset.v;
        }
        this.renderForm();
      });
    });

    $("#coach-generate").onclick = () => {
      const saved = Object.assign({}, this.state);
      delete saved._p;
      Store.data.coach[Store.current] = saved;
      Store.save();
      this.renderResult(this.generate(saved));
      $("#coach-result").scrollIntoView({ behavior: "smooth" });
    };
  },

  /* ---- générateur ---- */
  generate(o) {
    const deb = o.niveau === "debutant", av = o.niveau === "avance";
    const main = o.objectif === "force" ? "5 × 5" : o.objectif === "muscle" ? "4 × 8-12" : "3 × 12-15";
    const acc = o.objectif === "force" ? "3 × 8-10" : o.objectif === "muscle" ? "3 × 10-12" : "3 × 15";
    const cap = (deb ? 5 : av ? 7 : 6);
    const P = o.priorites || [];
    const has = p => P.includes(p);

    const day = type => {
      let tag = type;
      const list = [];
      const add = (nom, sr) => { if (!list.some(x => x.nom === nom)) list.push({ nom, sr }); };

      switch (type) {
        case "PUSH":
          tag = has("Pecs") ? "Pecs + triceps" : "Push";
          add(deb ? "Développé pecs (machine)" : "Développé couché", main);
          add("Développé épaules (machine)", main);
          if (!deb || has("Pecs")) add("Développé incliné", acc);
          if (has("Pecs")) add("Écartés (pec fly)", acc);
          add("Élévations latérales", acc);
          if (has("Épaules")) add("Élévations frontales", acc);
          add("Extension triceps poulie", acc);
          if (has("Bras")) add("Barre au front", acc);
          break;
        case "PULL":
          tag = has("Dos") ? "Dos + biceps" : "Pull";
          add("Tirage vertical", main);
          add("Tirage horizontal", main);
          if (!deb || has("Dos")) add(deb ? "Rowing haltère" : "Rowing barre", acc);
          add("Oiseau (arrière d'épaule)", acc);
          add("Curl biceps", acc);
          if (has("Bras")) add("Curl marteau", acc);
          break;
        case "LEGS":
          tag = has("Fessiers") ? "Jambes + fessiers" : "Legs";
          if (has("Fessiers")) add("Hip thrust", main);
          add(deb ? "Presse à cuisses" : "Squat", main);
          if (!has("Fessiers")) add("Hip thrust", acc);
          if (has("Jambes")) { add("Leg extension", acc); add("Leg curl", acc); }
          else add("Leg curl", acc);
          if (has("Fessiers")) add("Abducteurs (machine)", acc);
          if (has("Fessiers") && !deb) add("Kickback fessiers (poulie)", acc);
          add("Mollets debout", acc);
          break;
        case "UPPER":
          tag = "Upper";
          add(deb ? "Développé pecs (machine)" : "Développé couché", main);
          add("Tirage horizontal", main);
          add("Développé épaules (machine)", acc);
          add("Tirage vertical", acc);
          if (has("Pecs")) add("Écartés (pec fly)", acc);
          if (has("Dos")) add("Rowing haltère", acc);
          if (has("Épaules")) add("Élévations latérales", acc);
          add("Curl biceps", acc);
          if (has("Bras") || av) add("Extension triceps poulie", acc);
          break;
        case "LOWER":
          tag = has("Fessiers") ? "Fessiers + ischios" : "Lower";
          if (has("Fessiers")) add("Hip thrust", main);
          add("Presse à cuisses", main);
          add("Soulevé de terre roumain", acc);
          if (has("Fessiers")) { add("Kickback fessiers (poulie)", acc); add("Abducteurs (machine)", acc); }
          if (has("Jambes")) add("Fentes bulgares", acc);
          add("Leg curl", acc);
          if (!has("Fessiers")) add("Mollets debout", acc);
          break;
        case "FULL":
          tag = "Full body";
          add(deb ? "Presse à cuisses" : "Squat", main);
          if (has("Fessiers")) add("Hip thrust", main);
          add(deb ? "Développé pecs (machine)" : "Développé couché", main);
          add("Tirage horizontal", main);
          if (has("Dos")) add("Tirage vertical", acc);
          if (has("Épaules")) add("Élévations latérales", acc);
          if (has("Bras")) add("Curl biceps", acc);
          add("Gainage", "3 × 30-60 s");
          break;
      }

      let exos = list.slice(0, cap + (P.length ? 1 : 0));
      if (has("Abdos") && !exos.some(x => ["Crunch", "Gainage", "Relevés de jambes"].includes(x.nom))) {
        exos.push({ nom: "Crunch", sr: "3 × 15-20" });
      }
      return { tag, exos };
    };

    const seq = o.jours === "2" ? ["FULL", "FULL"]
      : o.jours === "3" ? (deb ? ["FULL", "FULL", "FULL"] : ["PUSH", "PULL", "LEGS"])
      : o.jours === "4" ? ["UPPER", "LOWER", "UPPER", "LOWER"]
      : ["PUSH", "PULL", "LEGS", "UPPER", "LOWER"];
    const weekdays = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 3, 4, 5] }[+o.jours];
    const jours = seq.map((t, i) => Object.assign({ weekday: weekdays[i], jour: JOURS[weekdays[i]] }, day(t)));

    // finisher cardio pour tonification / remise en forme
    if (o.objectif === "tonif" || o.objectif === "forme") {
      jours.slice(0, 2).forEach(j => j.exos.push({ nom: "Tapis de course", sr: "10-15 min (finisher)" }));
    }

    const notes = [
      "Ordre de séance : les gros exercices d'abord (tu es fraîche = performante), les isolations ensuite.",
      o.objectif === "force"
        ? "Force : monte ton seuil de pause à 4-5 min (onglet Profil) — la récupération fait la performance."
        : "Repos : ~3 min sur les polyarticulaires, ~1 min 30 sur les isolations — ton chrono le gère déjà.",
      o.objectif === "muscle" ? "Vise 8-12 reps : arrivée à 12, monte la charge — l'assistant du chrono te le proposera." : "",
      o.objectif === "tonif" ? "La perte de gras se joue surtout dans l'assiette (ton suivi Yazio 😉) — ce programme préserve tes muscles pendant le déficit." : "",
      P.length ? `Priorité ${P.join(" et ")} : travaillée${P.length > 1 ? "s" : ""} 2× par semaine — c'est la fréquence qui paie.` : "",
      seq.length !== new Set(seq).size ? "Jours identiques : garde les mêmes exercices plusieurs semaines — la progression vient de la charge, pas de la variété." : "",
      deb ? "Technique avant charge : n'hésite pas à demander un check au staff de ta salle sur les nouveaux mouvements." : ""
    ];

    return { jours, notes };
  },

  /* ---- affichage du programme ---- */
  renderResult(p) {
    const reposJours = [0, 1, 2, 3, 4, 5, 6]
      .filter(i => !p.jours.some(j => j.weekday === i))
      .map(i => JOURS[i]);
    $("#coach-result").innerHTML =
      `<h2 class="section-title">Ton programme sur mesure</h2>` +
      p.jours.map(j => `<div class="card coach-day">
        <div class="coach-day-head"><strong>${esc(j.jour)}</strong>
          <span class="tag" style="background:${tagColor(j.tag)}">${esc(j.tag)}</span></div>
        <ul>${j.exos.map(e => `<li><span>${esc(e.nom)}</span><small>${esc(e.sr)}</small></li>`).join("")}</ul>
      </div>`).join("") +
      `<div class="card">💤 <strong>Repos : ${esc(reposJours.join(" et "))}</strong> — c'est là que le muscle se construit.</div>` +
      `<div class="card">${p.notes.filter(Boolean).map(n => `<p class="hint">• ${esc(n)}</p>`).join("")}</div>` +
      `<button id="coach-apply" class="btn btn-accent btn-big">📅 Appliquer à mon planning</button>
      <p class="hint">Remplit la semaine en cours, la semaine type et les exercices prévus de chaque jour
      (ton chrono te les proposera automatiquement). Tout reste modifiable jour par jour dans le Planning.</p>`;
    $("#coach-apply").onclick = () => this.apply(p);
  },

  /* ---- application au planning ---- */
  apply(p) {
    if (!confirm("Appliquer ce programme ? Le planning de la semaine en cours et la semaine type seront remplacés.")) return;
    const monday = mondayOf(new Date());
    const plan = Store.data.planning[Store.current];
    const progAll = Store.data.programme[Store.current];
    const persoTags = Store.data.tagsPerso[Store.current];
    const type = {};
    for (let i = 0; i < 7; i++) {
      const iso = dateToISO(addDays(monday, i));
      const j = p.jours.find(x => x.weekday === i);
      if (j) {
        plan[iso] = j.tag;
        type[i] = j.tag;
        progAll[iso] = j.exos.map(e => e.nom);
        if (!PLAN_TAGS.includes(j.tag) && !TAGS_COMBOS.includes(j.tag) && !persoTags.includes(j.tag)) persoTags.push(j.tag);
      } else {
        plan[iso] = "Repos";
        type[i] = "Repos";
        delete progAll[iso];
      }
    }
    Store.data.semaineType[Store.current] = type;
    Store.save();
    UI.show("planning");
  }
};

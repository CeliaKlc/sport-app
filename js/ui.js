/* ===== Helpers UI : sélecteurs, formats, navigation, modales, graphiques SVG ===== */

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
function pad(n) { return String(n).padStart(2, "0"); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* --- temps --- */
function fmtChrono(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function fmtDuree(sec) {
  sec = Math.round(sec);
  if (sec < 60) return sec + " s";
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h) return `${h} h ${pad(m)}`;
  return `${m} min`;
}

/* --- dates --- */
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dateToISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function todayISO() { return dateToISO(new Date()); }
function isoToDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDateFR(iso) { const d = isoToDate(iso); return `${d.getDate()} ${MOIS[d.getMonth()]}`; }
function fmtDateFull(iso) { const d = isoToDate(iso); return `${JOURS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MOIS[d.getMonth()]}`; }

/* --- navigation entre vues --- */
const UI = {
  TITLES: { stats: "Stats", chrono: "Chrono", planning: "Planning", coach: "Coach", profil: "Profil" },
  current: "stats",

  show(name) {
    this.current = name;
    $$(".view").forEach(v => v.classList.remove("active"));
    $("#view-" + name).classList.add("active");
    $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    $("#view-title").textContent = this.TITLES[name];
    if (name === "stats") Stats.render();
    if (name === "planning") Planning.render();
    if (name === "coach") Coach.render();
    if (name === "profil") Profil.render();
    window.scrollTo(0, 0);
  },

  applyAccent() {
    const p = Store.profil();
    if (!p) return;
    document.documentElement.style.setProperty("--accent", p.couleur);
    $("#profile-chip").textContent = p.nom;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#0d0f14");
  }
};

/* --- modale (feuille qui monte du bas) --- */
function openModal(html) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  $("#modal-root").appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
  return { el: wrap.firstElementChild, close };
}

/* --- options du sélecteur d'exercices (bibliothèque + persos) --- */
function exoOptionsHtml(profil) {
  let html = "";
  for (const muscle of Object.keys(EXOS)) {
    html += `<optgroup label="${esc(muscle)}">` +
      EXOS[muscle].map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("") +
      `</optgroup>`;
  }
  const perso = Store.data.exosPerso[profil] || [];
  if (perso.length) {
    html += `<optgroup label="Mes exercices">` +
      perso.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("") +
      `</optgroup>`;
  }
  html += `<option value="__autre">➕ Autre exercice…</option>`;
  return html;
}

/* --- graphique en barres (SVG) --- */
function svgBars(items, opts = {}) {
  // items : [{label, value, color?}] — opts.fmt : v => texte au-dessus de la barre
  if (!items.length || items.every(i => !i.value)) {
    return `<div class="chart-empty">Pas encore de données — enregistre une séance au chrono 💪</div>`;
  }
  const fmt = opts.fmt || (v => String(v));
  const bw = 30, gap = 14, padL = 8;
  const W = padL * 2 + items.length * (bw + gap) - gap;
  const H = 175, base = 142, maxH = 108;
  const max = Math.max(...items.map(i => i.value), 1);
  let bars = "";
  items.forEach((it, i) => {
    const x = padL + i * (bw + gap);
    const h = Math.max(it.value / max * maxH, it.value > 0 ? 3 : 0);
    const y = base - h;
    const color = it.color || "var(--accent)";
    bars += `<rect x="${x}" y="${y}" width="${bw}" height="${h || 1}" rx="5" fill="${color}" opacity="${it.value ? 1 : .18}"/>`;
    if (it.value) bars += `<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="10.5" fill="#eef1f6" font-weight="700">${esc(fmt(it.value))}</text>`;
    bars += `<text x="${x + bw / 2}" y="${base + 16}" text-anchor="middle" font-size="9.5" fill="#8b93a5">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">${bars}</svg>`;
}

/* --- graphique en ligne (SVG) --- */
function svgLine(points, opts = {}) {
  // points : [{label, value}] — opts.unit : suffixe des valeurs
  if (points.length < 1) {
    return `<div class="chart-empty">Pas encore de données pour cet exercice.</div>`;
  }
  const unit = opts.unit || "";
  const W = Math.max(300, points.length * 56), H = 175;
  const padX = 26, top = 26, bottom = 140;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const x = i => points.length === 1 ? W / 2 : padX + i * ((W - padX * 2) / (points.length - 1));
  const y = v => bottom - ((v - min) / range) * (bottom - top);
  let path = "", dots = "", labels = "";
  points.forEach((p, i) => {
    const px = x(i), py = y(p.value);
    path += (i ? " L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
    dots += `<circle cx="${px}" cy="${py}" r="4.5" fill="var(--accent)"/>`;
    labels += `<text x="${px}" y="${py - 10}" text-anchor="middle" font-size="10.5" fill="#eef1f6" font-weight="700">${esc(p.value + unit)}</text>`;
    labels += `<text x="${px}" y="${bottom + 20}" text-anchor="middle" font-size="9.5" fill="#8b93a5">${esc(p.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
    ${dots}${labels}</svg>`;
}

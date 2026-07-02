/* ===== Sauvegarde en ligne : gist GitHub privé ===== */
/* La clé d'accès (token « gist » uniquement) est stockée sur l'appareil, jamais dans le code. */

const Cloud = {
  TOKEN_KEY: "sportapp-ghtoken",
  LASTBK_KEY: "sportapp-lastbackup",

  token() { return localStorage.getItem(this.TOKEN_KEY) || ""; },
  setToken(t) {
    if (t) localStorage.setItem(this.TOKEN_KEY, t.trim());
    else localStorage.removeItem(this.TOKEN_KEY);
  },
  lastBackup() { return Number(localStorage.getItem(this.LASTBK_KEY)) || 0; },
  markBackup() { localStorage.setItem(this.LASTBK_KEY, String(Date.now())); },

  fileName() { return `sport-app-${Store.current}.json`; },

  async api(path, opts = {}) {
    const res = await fetch("https://api.github.com" + path, Object.assign({}, opts, {
      cache: "no-store", // GitHub met en cache 60 s : on veut toujours l'état réel
      headers: Object.assign({
        "Authorization": "Bearer " + this.token(),
        "Accept": "application/vnd.github+json"
      }, opts.headers || {})
    }));
    if (res.status === 401) throw new Error("clé d'accès invalide ou expirée");
    return res;
  },

  // retrouve le gist de sauvegarde (fichiers sport-app-*.json)
  async findGist() {
    const res = await this.api("/gists?per_page=100");
    if (!res.ok) throw new Error("GitHub a répondu " + res.status);
    const gists = await res.json();
    return gists.find(g =>
      Object.keys(g.files).some(f => f.startsWith("sport-app-") && f.endsWith(".json"))
    ) || null;
  },

  async save() {
    const body = {
      description: "Sauvegarde Sport App",
      files: { [this.fileName()]: { content: JSON.stringify(Store.data, null, 2) } }
    };
    const g = await this.findGist();
    const res = g
      ? await this.api("/gists/" + g.id, { method: "PATCH", body: JSON.stringify(body) })
      : await this.api("/gists", { method: "POST", body: JSON.stringify(Object.assign({ public: false }, body)) });
    if (!res.ok) throw new Error("GitHub a répondu " + res.status);
    this.markBackup();
  },

  async restore() {
    const g = await this.findGist();
    if (!g || !g.files[this.fileName()]) {
      throw new Error("aucune sauvegarde en ligne trouvée pour " + (Store.profil() ? Store.profil().nom : Store.current));
    }
    const res = await this.api("/gists/" + g.id);
    if (!res.ok) throw new Error("GitHub a répondu " + res.status);
    const file = (await res.json()).files[this.fileName()];
    let content = file.content;
    if (file.truncated) content = await (await fetch(file.raw_url)).text();
    const d = JSON.parse(content);
    if (!d.profils || !Array.isArray(d.seances)) throw new Error("le fichier de sauvegarde est invalide");
    Store.data = d;
    Store.save();
    Store.load(); // ré-applique la fusion avec les valeurs par défaut
  }
};

const fetch = require('node-fetch');

const TOKEN    = process.env.GITHUB_TOKEN;
const REPO     = process.env.GITHUB_REPO;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

const HEADERS = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': 'planning-app',
  'Content-Type': 'application/json'
});

async function lireFichier(path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: HEADERS() });
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new Error(`GitHub API ${res.status} sur ${path}`);
  const json = await res.json();
  const contenu = Buffer.from(json.content, 'base64').toString('utf-8');
  return { data: JSON.parse(contenu), sha: json.sha };
}

async function ecrireFichier(path, data, message) {
  const { sha } = await lireFichier(path);
  const body = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub écriture : ${err}`);
  }
  return res.json();
}

// ── PLANNING ──
function nomFichierPlanning(semaine) {
  return `planning-s${semaine.replace('/', '-')}.json`;
}

async function lirePlanning(semaine) {
  return lireFichier(nomFichierPlanning(semaine));
}

async function ecrirePlanning(data) {
  return ecrireFichier(
    nomFichierPlanning(data.semaine),
    data,
    `update planning semaine ${data.semaine}`
  );
}

async function listerSemaines() {
  const res = await fetch(API_BASE, { headers: HEADERS() });
  if (!res.ok) return [];
  const files = await res.json();
  if (!Array.isArray(files)) return [];
  return files
    .map(f => f.name.match(/^planning-s(\d+)-(\d+)\.json$/))
    .filter(Boolean)
    .map(m => `${m[1]}/${m[2]}`)
    .sort((a, b) => {
      const [sa, ya] = a.split('/').map(Number);
      const [sb, yb] = b.split('/').map(Number);
      return ya !== yb ? yb - ya : sb - sa;
    });
}

// ── COLLABORATEURS ──
async function lireCollaborateurs() {
  const { data } = await lireFichier('collaborateurs.json');
  return data || [];
}

async function ecrireCollaborateurs(liste) {
  return ecrireFichier('collaborateurs.json', liste, 'update collaborateurs');
}

async function supprimerPlanning(semaine) {
  const { sha } = await lirePlanning(semaine);
  if (!sha) throw new Error('Semaine introuvable');
  const res = await fetch(`${API_BASE}/${nomFichierPlanning(semaine)}`, {
    method: 'DELETE',
    headers: HEADERS(),
    body: JSON.stringify({
      message: `delete planning semaine ${semaine}`,
      sha
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub suppression : ${err}`);
  }
  return res.json();
}

module.exports = {
  lirePlanning, ecrirePlanning, listerSemaines, supprimerPlanning,
  lireCollaborateurs, ecrireCollaborateurs
};
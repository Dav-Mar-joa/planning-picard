const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

// ── Calcule les minutes totales depuis un planning (pour heuresInfo côté GET) ──
function calcMinutes(planningEmp) {
  if (!planningEmp) return 0;
  let total = 0;
  for (const jour of Object.values(planningEmp)) {
    for (const creneau of (jour || [])) {
      if (creneau.debut && creneau.fin) {
        const [dh, dm] = creneau.debut.split(':').map(Number);
        const [fh, fm] = creneau.fin.split(':').map(Number);
        const mins = (fh * 60 + fm) - (dh * 60 + dm);
        if (mins > 0) total += mins;
      }
    }
  }
  return total; // minutes entières
}

// ── Gardé pour compatibilité affichage ──
function calcHeures(planningEmp) {
  return calcMinutes(planningEmp); // retourne minutes aussi maintenant
}

// ── Formate minutes → "7h05" ──
function formatMinutes(mins) {
  if (!mins && mins !== 0) return '–';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

// ── Formate heures décimales → "7h05" (pour quotas stockés en décimal) ──
function formatHeures(h) {
  if (!h && h !== 0) return '–';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, '0')}`;
}

// ── Calcule heuresParJour + totalSemaine en MINUTES ENTIÈRES depuis les créneaux ──
function calcHeuresParJour(planning) {
  const heuresParJour = {};
  let totalSemaine = 0;

  for (const jour of JOURS) {
    let mins = 0;
    const creneaux = planning[jour] || [];

    for (const c of creneaux) {
      if (c.debut && c.fin) {
        const [dh, dm] = c.debut.split(':').map(Number);
        const [fh, fm] = c.fin.split(':').map(Number);
        const diff = (fh * 60 + fm) - (dh * 60 + dm);
        if (diff > 0) mins += diff; // ← jamais divisé par 60
      }
    }

    heuresParJour[jour] = mins; // ex: lun → 55
    totalSemaine += mins;
  }

  return { heuresParJour, totalSemaine }; // tout en minutes entières
}

// ── Total minutes sur un mois (tableau de docs planning) ──
function totalMois(plannings, employeId) {
  let total = 0;
  for (const planning of plannings) {
    const emp = (planning.employes || []).find(e => e.id === employeId);
    if (emp && emp.planning) {
      const { totalSemaine } = calcHeuresParJour(emp.planning);
      total += totalSemaine;
    }
  }
  return total; // minutes
}

// ── Numéro de semaine ISO actuelle → "17/2026" ──
function semaineActuelle() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${weekNo}/${d.getUTCFullYear()}`;
}

// ── Lundi et dimanche d'une semaine ISO "14/2026" ──
function datesDeSemaine(semaine) {
  const [week, year] = semaine.split('/').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const lundi = new Date(jan4);
  lundi.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() + 6);
  const fmt = d => `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(2)}`;
  return { du: fmt(lundi), au: fmt(dimanche) };
}

// ── 10 prochaines semaines + 5 passées ──
function listeSemainesDispo() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNow = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const yearNow = d.getUTCFullYear();
  const semaines = [];
  for (let i = -5; i <= 10; i++) {
    let w = weekNow + i;
    let y = yearNow;
    if (w < 1) { y--; w += 52; }
    if (w > 52) { y++; w -= 52; }
    semaines.push(`${w}/${y}`);
  }
  return semaines;
}

module.exports = {
  calcMinutes,
  calcHeures,
  formatMinutes,
  formatHeures,
  calcHeuresParJour,  // ← NOUVEAU, indispensable
  totalMois,          // ← NOUVEAU
  semaineActuelle,
  datesDeSemaine,
  listeSemainesDispo
};
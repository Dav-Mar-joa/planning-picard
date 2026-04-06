const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// ── Calcule les minutes totales depuis un planning ──
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
  return total;
}

function calcHeures(planningEmp) { return calcMinutes(planningEmp); }

// ── Formate minutes → "7h05" (gère les négatifs) ──
function formatMinutes(mins) {
  if (mins === null || mins === undefined) return '–';
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
}

function formatHeures(h) {
  if (!h && h !== 0) return '–';
  const hrs = Math.floor(Math.abs(h));
  const mins = Math.round((Math.abs(h) - hrs) * 60);
  const sign = h < 0 ? '-' : '';
  if (mins === 0) return `${sign}${hrs}h`;
  return `${sign}${hrs}h${String(mins).padStart(2, '0')}`;
}

// ── Calcule heuresParJour + totalSemaine en minutes depuis les créneaux ──
function calcHeuresParJour(planning) {
  const heuresParJour = {};
  let totalSemaine = 0;
  for (const jour of JOURS) {
    let mins = 0;
    for (const c of (planning[jour] || [])) {
      if (c.debut && c.fin) {
        const [dh, dm] = c.debut.split(':').map(Number);
        const [fh, fm] = c.fin.split(':').map(Number);
        const diff = (fh * 60 + fm) - (dh * 60 + dm);
        if (diff > 0) mins += diff;
      }
    }
    heuresParJour[jour] = mins;
    totalSemaine += mins;
  }
  return { heuresParJour, totalSemaine };
}

// ── Quota mois en minutes : heuresHebdo × (nbJoursMois / 7) ──
function quotaMoisMinutes(heuresHebdo, mois, annee) {
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate(); // dernier jour du mois
  return Math.round(heuresHebdo * 60 * nbJours / 7);
}

// ── Nb jours dans un mois ──
function nbJoursMois(mois, annee) {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

// ── Parse semaine ISO "15/2026" → { numeroSemaine, annee, numeroMois, lundi, dimanche } ──
function parseSemaine(semaine) {
  const [w, y] = semaine.split('/').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const lundi = new Date(jan4);
  lundi.setUTCDate(jan4.getUTCDate() - (dow - 1) + (w - 1) * 7);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() + 6);
  const jeudi = new Date(lundi);
  jeudi.setUTCDate(lundi.getUTCDate() + 3);
  return {
    numeroSemaine: w,
    annee: y,
    numeroMois: jeudi.getUTCMonth() + 1,
    lundi,
    dimanche
  };
}

// ── Construit les compteurs semaine + mois + solde annuel ──
// Solde annuel = stocké dans collaborateur, mis à jour ici
function construireCompteurs(semaine, totalSemaineActuelle, quotaHebdoMins, planningsAnnee, planningsMois, empId, soldePrecedent) {
  const { numeroSemaine, annee, numeroMois } = parseSemaine(semaine);

  // ── Compteur semaine ──
  const soldeSemaine = totalSemaineActuelle - quotaHebdoMins;
  const compteurSemaine = {
    numeroSemaine,
    annee,
    quotaSemaine: quotaHebdoMins,
    realise: totalSemaineActuelle,
    solde: soldeSemaine,
    soldeFmt: formatMinutes(soldeSemaine)
  };

  // ── Quota mois basé sur nb jours réels du mois ──
  const nbJours = nbJoursMois(numeroMois, annee);
  const quotaMois = Math.round(quotaHebdoMins * nbJours / 7);

  // ── Réalisé mois = somme des semaines du mois en base + semaine courante ──
  let realiseMois = 0;
  const dejaDansMois = planningsMois.some(d => d.semaine === semaine);
  for (const doc of planningsMois) {
    const emp = (doc.employes || []).find(e => e.id === empId);
    if (!emp) continue;
    realiseMois += doc.semaine === semaine ? totalSemaineActuelle : (emp.totalSemaine || 0);
  }
  if (!dejaDansMois) realiseMois += totalSemaineActuelle;

  const soldeMois = realiseMois - quotaMois;
  const compteurMois = {
    numeroMois,
    labelMois: MOIS_LABELS[numeroMois - 1],
    annee,
    nbJours,
    quotaMois,
    quotaMoisFmt: formatMinutes(quotaMois),
    realise: realiseMois,
    realiseFmt: formatMinutes(realiseMois),
    solde: soldeMois,
    soldeFmt: formatMinutes(soldeMois)
  };

  // ── Solde annuel cumulé ──
  // = solde de toutes les semaines de l'année jusqu'à la courante
  let soldeAnnuel = 0;
  const dejaDansAnnee = planningsAnnee.some(d => d.semaine === semaine);
  for (const doc of planningsAnnee) {
    const [w] = doc.semaine.split('/').map(Number);
    if (w > numeroSemaine) continue;
    const emp = (doc.employes || []).find(e => e.id === empId);
    if (!emp) continue;
    const realise = doc.semaine === semaine ? totalSemaineActuelle : (emp.totalSemaine || 0);
    soldeAnnuel += realise - quotaHebdoMins;
  }
  if (!dejaDansAnnee) soldeAnnuel += soldeSemaine;

  return {
    compteurSemaine,
    compteurMois,
    soldeAnnuel,
    soldeAnnuelFmt: formatMinutes(soldeAnnuel)
  };
}

// ── Numéro de semaine ISO actuelle ──
function semaineActuelle() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${weekNo}/${d.getUTCFullYear()}`;
}

// ── Lundi et dimanche d'une semaine ISO ──
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

function totalMois(plannings, employeId) {
  let total = 0;
  for (const planning of plannings) {
    const emp = (planning.employes || []).find(e => e.id === employeId);
    if (emp && emp.planning) {
      const { totalSemaine } = calcHeuresParJour(emp.planning);
      total += totalSemaine;
    }
  }
  return total;
}

module.exports = {
  calcMinutes, calcHeures,
  formatMinutes, formatHeures,
  calcHeuresParJour,
  construireCompteurs,
  quotaMoisMinutes,
  nbJoursMois,
  parseSemaine,
  totalMois,
  semaineActuelle,
  datesDeSemaine,
  listeSemainesDispo,
  MOIS_LABELS
};

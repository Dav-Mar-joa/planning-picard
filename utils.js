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

function calcHeures(planningEmp) {
  return calcMinutes(planningEmp);
}

// ── Formate minutes → "7h05" ──
function formatMinutes(mins) {
  if (mins === null || mins === undefined) return '–';
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
}

// ── Formate heures décimales → "7h05" ──
function formatHeures(h) {
  if (!h && h !== 0) return '–';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, '0')}`;
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

// ── Numéro de semaine ISO + mois/année depuis "15/2026" ──
function parseSemaine(semaine) {
  const [w, y] = semaine.split('/').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const lundi = new Date(jan4);
  lundi.setUTCDate(jan4.getUTCDate() - (dow - 1) + (w - 1) * 7);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() + 6);
  // Mois = mois du jeudi de la semaine (convention ISO)
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

// ── Calcule le nombre de semaines ISO dans un mois donné ──
// (semaines dont le jeudi tombe dans le mois)
function nbSemainesDansMois(mois, annee) {
  let count = 0;
  // Parcourt toutes les semaines de l'année
  for (let w = 1; w <= 53; w++) {
    const jan4 = new Date(Date.UTC(annee, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const lundi = new Date(jan4);
    lundi.setUTCDate(jan4.getUTCDate() - (dow - 1) + (w - 1) * 7);
    if (lundi.getUTCFullYear() > annee) break;
    const jeudi = new Date(lundi);
    jeudi.setUTCDate(lundi.getUTCDate() + 3);
    if (jeudi.getUTCFullYear() === annee && jeudi.getUTCMonth() + 1 === mois) count++;
  }
  return count;
}

// ── Construit les compteurs semaine + mois + solde annuel au moment du save ──
// planningsAnnee = tous les docs planning de l'année (depuis DB)
// planningsMois  = docs planning du mois concerné (depuis DB)
// empId          = matricule
// quotaHebdoMins = quota hebdo en minutes
// totalSemaineActuelle = minutes de la semaine en cours de save
// semaine        = "15/2026"
function construireCompteurs(semaine, totalSemaineActuelle, quotaHebdoMins, planningsAnnee, planningsMois, empId) {
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

  // ── Compteur mois ──
  const nbSemaines = nbSemainesDansMois(numeroMois, annee);
  const quotaMois = quotaHebdoMins * nbSemaines;

  // Total réalisé ce mois = somme de toutes les semaines du mois en base
  // + on remplace la semaine en cours par totalSemaineActuelle
  let realiseMois = 0;
  for (const doc of planningsMois) {
    const emp = (doc.employes || []).find(e => e.id === empId);
    if (!emp) continue;
    if (doc.semaine === semaine) {
      realiseMois += totalSemaineActuelle; // valeur fraîche
    } else {
      realiseMois += emp.totalSemaine || 0;
    }
  }
  // Si le doc courant n'était pas dans planningsMois (nouveau), on l'ajoute
  const dejaDansMois = planningsMois.some(d => d.semaine === semaine);
  if (!dejaDansMois) realiseMois += totalSemaineActuelle;

  const soldeMois = realiseMois - quotaMois;
  const compteurMois = {
    numeroMois,
    labelMois: MOIS_LABELS[numeroMois - 1],
    annee,
    nbSemaines,
    quotaMois,
    quotaMoisFmt: formatMinutes(quotaMois),
    realise: realiseMois,
    realiseFmt: formatMinutes(realiseMois),
    solde: soldeMois,
    soldeFmt: formatMinutes(soldeMois)
  };

  // ── Solde annuel cumulé depuis S1 jusqu'à la semaine courante ──
  let soldeAnnuel = 0;
  for (const doc of planningsAnnee) {
    const [w] = doc.semaine.split('/').map(Number);
    if (w > numeroSemaine) continue; // ne compte que jusqu'à la semaine courante
    const emp = (doc.employes || []).find(e => e.id === empId);
    if (!emp) continue;
    const realise = doc.semaine === semaine ? totalSemaineActuelle : (emp.totalSemaine || 0);
    soldeAnnuel += realise - quotaHebdoMins;
  }
  // Si semaine pas encore en base
  const dejaDansAnnee = planningsAnnee.some(d => d.semaine === semaine);
  if (!dejaDansAnnee) soldeAnnuel += soldeSemaine;

  return {
    compteurSemaine,
    compteurMois,
    soldeAnnuel,
    soldeAnnuelFmt: formatMinutes(soldeAnnuel)
  };
}

// ── Total minutes sur un mois (pour compatibilité) ──
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

module.exports = {
  calcMinutes, calcHeures,
  formatMinutes, formatHeures,
  calcHeuresParJour,
  construireCompteurs,
  totalMois,
  parseSemaine,
  nbSemainesDansMois,
  semaineActuelle,
  datesDeSemaine,
  listeSemainesDispo,
  MOIS_LABELS
};

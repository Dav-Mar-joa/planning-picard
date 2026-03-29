// Calcule les heures travaillées pour un planning d'équipier
function calcHeures(planningEmp) {
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
  return Math.round(total / 60 * 100) / 100; // heures décimales
}

function formatHeures(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, '0')}`;
}

// Numéro de semaine ISO de la date actuelle
function semaineActuelle() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${weekNo}/${d.getUTCFullYear()}`;
}

module.exports = { calcHeures, formatHeures, semaineActuelle };

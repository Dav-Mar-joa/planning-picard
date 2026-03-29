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

// Calcule lundi et dimanche d'une semaine ISO "14/2026"
function datesDeSemaine(semaine) {
  const [week, year] = semaine.split('/').map(Number);
  // Lundi de la semaine ISO
  const jan4 = new Date(Date.UTC(year, 0, 4)); // 4 jan est toujours en S1
  const dayOfWeek = jan4.getUTCDay() || 7;
  const lundi = new Date(jan4);
  lundi.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() + 6);

  const fmt = d => `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(2)}`;
  return { du: fmt(lundi), au: fmt(dimanche) };
}

// Liste les 10 prochaines semaines + 5 passées à partir de maintenant
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

module.exports = { calcHeures, formatHeures, semaineActuelle, datesDeSemaine, listeSemainesDispo };
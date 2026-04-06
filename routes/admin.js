const express = require('express');
const router = express.Router();
const {
  lirePlanning, ecrirePlanning, listerSemaines,
  supprimerPlanning, lireCollaborateurs, ecrireCollaborateurs,
  listerPlanningsAnnee, listerPlanningsMois, mettreAJourCollabDansPlannings
} = require('../db');
const {
  calcMinutes, formatMinutes, calcHeures, formatHeures,
  semaineActuelle, datesDeSemaine, listeSemainesDispo,
  calcHeuresParJour, construireCompteurs, parseSemaine, MOIS_LABELS
} = require('../utils');

const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const JOURS_LABELS = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi',
  jeu: 'Jeudi', ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche'
};

function authAdmin(req, res, next) {
  const pwd = req.query.pwd || req.body.pwd;
  if (pwd !== process.env.ADMIN_PASSWORD) {
    return res.render('login', { error: pwd ? 'Mot de passe incorrect' : null });
  }
  next();
}

router.get('/login', (req, res) => res.render('login', { error: null }));
router.post('/login', (req, res) => {
  if (req.body.pwd === process.env.ADMIN_PASSWORD) {
    res.redirect(`/admin?pwd=${req.body.pwd}`);
  } else {
    res.render('login', { error: 'Mot de passe incorrect' });
  }
});

// ── PAGE PLANNING ──
router.get('/', authAdmin, async (req, res) => {
  const semaineCourante = semaineActuelle();
  const [semaines, collaborateurs] = await Promise.all([listerSemaines(), lireCollaborateurs()]);
  const semaineChoisie = req.query.s || semaines[0] || null;
  const { data } = semaineChoisie ? await lirePlanning(semaineChoisie) : { data: null };

  const heuresInfo = {};
  if (data && data.employes) {
    for (const emp of data.employes) {
      const placed = calcMinutes(emp.planning);
      const collab = collaborateurs.find(c => c.matricule === emp.id);
      const quotaMins = collab ? Math.round(collab.heuresHebdo * 60) : null;
      heuresInfo[emp.id || emp.nom] = {
        placed, fmt: formatMinutes(placed),
        quota: quotaMins, quotaFmt: quotaMins ? formatMinutes(quotaMins) : null,
        over: quotaMins && placed > quotaMins,
        perfect: quotaMins && Math.abs(placed - quotaMins) < 1
      };
    }
  }

  res.render('admin', {
    tab: 'planning', pwd: req.query.pwd,
    planning: data, semaines, semaineChoisie, semaineCourante,
    collaborateurs, jours: JOURS, labels: JOURS_LABELS,
    heuresInfo, success: req.query.success,
    semainesDispo: listeSemainesDispo(), datesDeSemaine,
    calcMinutes, formatMinutes, calcHeures, formatHeures,
    moisChoisi: null, anneeChoisie: null, labelMois: null,
    semainesDuMois: [], statsParCollab: {}
  });
});

// ── PAGE COLLABORATEURS ──
router.get('/collaborateurs', authAdmin, async (req, res) => {
  const collaborateurs = await lireCollaborateurs();
  res.render('admin', {
    tab: 'collaborateurs', pwd: req.query.pwd,
    collaborateurs, success: req.query.success,
    planning: null, semaines: [], semaineChoisie: null,
    semaineCourante: semaineActuelle(),
    jours: JOURS, labels: JOURS_LABELS, heuresInfo: {},
    semainesDispo: listeSemainesDispo(), datesDeSemaine,
    moisChoisi: null, anneeChoisie: null, labelMois: null,
    semainesDuMois: [], statsParCollab: {}
  });
});

// ── PAGE MOIS ──
router.get('/mois', authAdmin, async (req, res) => {
  const collaborateurs = await lireCollaborateurs();
  const now = new Date();
  const moisChoisi = parseInt(req.query.mois) || (now.getUTCMonth() + 1);
  const anneeChoisie = parseInt(req.query.annee) || now.getUTCFullYear();

  const [planningsMois, planningsAnnee] = await Promise.all([
    listerPlanningsMois(moisChoisi, anneeChoisie),
    listerPlanningsAnnee(anneeChoisie)
  ]);

  // Nb semaines ISO du mois (jeudi dans le mois)
  let nbSemainesISO = 0;
  for (let w = 1; w <= 53; w++) {
    const jan4 = new Date(Date.UTC(anneeChoisie, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const lundi = new Date(jan4);
    lundi.setUTCDate(jan4.getUTCDate() - (dow - 1) + (w - 1) * 7);
    if (lundi.getUTCFullYear() > anneeChoisie) break;
    const jeudi = new Date(lundi);
    jeudi.setUTCDate(lundi.getUTCDate() + 3);
    if (jeudi.getUTCFullYear() === anneeChoisie && jeudi.getUTCMonth() + 1 === moisChoisi) nbSemainesISO++;
  }

  const semainesDuMois = planningsMois.map(d => d.semaine).sort((a, b) => parseInt(a) - parseInt(b));

  const statsParCollab = {};
  for (const collab of collaborateurs) {
    const quotaHebdoMins = Math.round(collab.heuresHebdo * 60);
    const quotaMois = quotaHebdoMins * nbSemainesISO;
    let realiseMois = 0;
    const semaines = [];

    for (const doc of [...planningsMois].sort((a, b) => parseInt(a.semaine) - parseInt(b.semaine))) {
      const emp = (doc.employes || []).find(e => e.id === collab.matricule);
      const realise = emp ? (emp.totalSemaine || 0) : 0;
      const solde = realise - quotaHebdoMins;
      realiseMois += realise;
      semaines.push({
        semaine: doc.semaine,
        realise, realiseFmt: formatMinutes(realise),
        solde, soldeFmt: formatMinutes(solde)
      });
    }

    let soldeAnnuel = 0;
    if (planningsMois.length > 0) {
      const semaineMax = Math.max(...planningsMois.map(d => parseInt(d.semaine)));
      for (const doc of planningsAnnee) {
        const [w] = doc.semaine.split('/').map(Number);
        if (w > semaineMax) continue;
        const emp = (doc.employes || []).find(e => e.id === collab.matricule);
        soldeAnnuel += (emp ? (emp.totalSemaine || 0) : 0) - quotaHebdoMins;
      }
    }

    statsParCollab[collab.matricule] = {
      realiseMois, realiseMoisFmt: formatMinutes(realiseMois),
      quotaMois, quotaMoisFmt: formatMinutes(quotaMois),
      soldeMois: realiseMois - quotaMois, soldeMoisFmt: formatMinutes(realiseMois - quotaMois),
      soldeAnnuel, soldeAnnuelFmt: formatMinutes(soldeAnnuel),
      quotaHebdoFmt: formatMinutes(quotaHebdoMins),
      nbSemaines: nbSemainesISO, semaines
    };
  }

  res.render('admin', {
    tab: 'mois', pwd: req.query.pwd,
    collaborateurs, moisChoisi, anneeChoisie,
    labelMois: MOIS_LABELS[moisChoisi - 1],
    semainesDuMois, statsParCollab, formatMinutes,
    semaines: [], semaineChoisie: null,
    semaineCourante: semaineActuelle(),
    jours: JOURS, labels: JOURS_LABELS, heuresInfo: {},
    planning: null, semainesDispo: listeSemainesDispo(),
    datesDeSemaine, success: null
  });
});

// ── DELETE PLANNING ──
router.post('/delete-semaine', async (req, res) => {
  try {
    const { pwd, semaine } = req.body;
    if (pwd !== process.env.ADMIN_PASSWORD) return res.status(403).json({ error: 'Non autorisé' });
    if (!semaine) return res.status(400).json({ error: 'Semaine manquante' });
    await supprimerPlanning(semaine);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SAVE PLANNING ──
router.post('/save', authAdmin, async (req, res) => {
  try {
    const { pwd, semaine } = req.body;
    let { du, au } = req.body;
    if (!du || !au) {
      const dates = datesDeSemaine(semaine);
      du = du || dates.du; au = au || dates.au;
    }

    const { numeroMois, annee } = parseSemaine(semaine);
    const [planningsAnnee, planningsMois, collaborateurs] = await Promise.all([
      listerPlanningsAnnee(annee),
      listerPlanningsMois(numeroMois, annee),
      lireCollaborateurs()
    ]);

    const employes = [];
    for (const emp of (req.body.employes || [])) {
      const planning = {};
      for (const jour of JOURS) {
        planning[jour] = (emp[jour] || []).filter(c => c.debut && c.fin).map(c => ({ debut: c.debut, fin: c.fin }));
      }
      if (emp.nom && emp.nom.trim()) {
        const { heuresParJour, totalSemaine } = calcHeuresParJour(planning);
        const collab = collaborateurs.find(c => c.matricule === (emp.id || ''));
        const quotaHebdoMins = collab ? Math.round(collab.heuresHebdo * 60) : 0;
        const { compteurSemaine, compteurMois, soldeAnnuel, soldeAnnuelFmt } =
          construireCompteurs(semaine, totalSemaine, quotaHebdoMins, planningsAnnee, planningsMois, emp.id || '');
        employes.push({
          nom: emp.nom.trim(), id: emp.id || '',
          planning, heuresParJour, totalSemaine,
          compteurSemaine, compteurMois, soldeAnnuel, soldeAnnuelFmt
        });
      }
    }

    await ecrirePlanning({ semaine, du, au, employes });
    res.redirect(`/admin?pwd=${pwd}&s=${encodeURIComponent(semaine)}&success=planning`);
  } catch (err) {
    console.error('SAVE ERROR:', err);
    res.status(500).send(`Erreur : ${err.message}`);
  }
});

// ── SAVE COLLABORATEUR ──
router.post('/collaborateurs/save', authAdmin, async (req, res) => {
  try {
    const { pwd, matricule, nom, prenom, numeroSite, dateNaissance, heuresHebdo, contrat, editIndex } = req.body;
    const liste = await lireCollaborateurs();
    const existing = (editIndex !== undefined && editIndex !== '') ? liste[parseInt(editIndex)] : null;

    const collab = {
      matricule: matricule.trim(),
      numeroSite: numeroSite ? numeroSite.trim() : '',
      nom: nom.trim().toUpperCase(),
      prenom: prenom.trim(),
      dateNaissance: dateNaissance || '',
      heuresHebdo: parseFloat(heuresHebdo) || 0,
      contrat: contrat || 'CDI',
      soldesAnnuels: existing ? (existing.soldesAnnuels || {}) : {}
    };

    if (existing) {
      liste[parseInt(editIndex)] = collab;
    } else {
      liste.push(collab);
    }

    await ecrireCollaborateurs(liste);

    // ── Propage le nom dans tous les plannings ──
    await mettreAJourCollabDansPlannings(collab.matricule, collab);

    res.redirect(`/admin/collaborateurs?pwd=${pwd}&success=collab`);
  } catch (err) {
    res.status(500).send(`Erreur : ${err.message}`);
  }
});

// ── DELETE COLLABORATEUR ──
router.post('/collaborateurs/delete', authAdmin, async (req, res) => {
  try {
    const { pwd, index } = req.body;
    const liste = await lireCollaborateurs();
    liste.splice(parseInt(index), 1);
    await ecrireCollaborateurs(liste);
    res.redirect(`/admin/collaborateurs?pwd=${pwd}&success=delete`);
  } catch (err) {
    res.status(500).send(`Erreur : ${err.message}`);
  }
});

module.exports = router;
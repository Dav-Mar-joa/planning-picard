const express = require('express');
const router = express.Router();
const { lirePlanning, ecrirePlanning, listerSemaines, supprimerPlanning, lireCollaborateurs, ecrireCollaborateurs } = require('../github');
const { calcHeures, formatHeures, semaineActuelle, datesDeSemaine, listeSemainesDispo } = require('../utils');
const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const JOURS_LABELS = { lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi', ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche' };

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

  // Heures placées vs quota
  const heuresInfo = {};
  if (data && data.employes) {
    for (const emp of data.employes) {
      const placed = calcHeures(emp.planning);
      const collab = collaborateurs.find(c => c.matricule === emp.id);
      const quota = collab ? collab.heuresHebdo : null;
      heuresInfo[emp.id || emp.nom] = {
        placed, fmt: formatHeures(placed),
        quota, quotaFmt: quota ? formatHeures(quota) : null,
        over: quota && placed > quota,
        perfect: quota && Math.abs(placed - quota) < 0.1
      };
    }
  }

  const semainesDispo = listeSemainesDispo();
  res.render('admin', {
    tab: 'planning',
    pwd: req.query.pwd,
    planning: data, semaines, semaineChoisie, semaineCourante,
    collaborateurs, jours: JOURS, labels: JOURS_LABELS,
    heuresInfo, success: req.query.success,
    semainesDispo, datesDeSemaine,
    calcHeures, formatHeures
  });
});

// ── PAGE COLLABORATEURS ──
router.get('/collaborateurs', authAdmin, async (req, res) => {
  const collaborateurs = await lireCollaborateurs();
  res.render('admin', {
    tab: 'collaborateurs',
    pwd: req.query.pwd,
    collaborateurs, success: req.query.success,
    planning: null, semaines: [], semaineChoisie: null,
    semaineCourante: semaineActuelle(),
    jours: JOURS, labels: JOURS_LABELS, heuresInfo: {},
    semainesDispo: listeSemainesDispo(), datesDeSemaine
  });
});

// ── DELETE PLANNING ──
router.post('/delete-semaine', async (req, res) => {
  try {
    const pwd = req.body.pwd;
    const semaine = req.body.semaine;
    console.log('DELETE SEMAINE', { pwd: pwd ? '***' : 'MANQUANT', semaine });
    if (pwd !== process.env.ADMIN_PASSWORD) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    if (!semaine) {
      return res.status(400).json({ error: 'Semaine manquante' });
    }
    await supprimerPlanning(semaine);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur suppression:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SAVE PLANNING ──
router.post('/save', authAdmin, async (req, res) => {
  try {
    const { pwd, semaine, du, au } = req.body;
    const employes = [];
    const rawEmployes = req.body.employes || [];
    for (let i = 0; i < rawEmployes.length; i++) {
      const emp = rawEmployes[i];
      const planning = {};
      for (const jour of JOURS) {
        const creneaux = emp[jour] || [];
        planning[jour] = creneaux.filter(c => c.debut && c.fin).map(c => ({ debut: c.debut, fin: c.fin }));
      }
      if (emp.nom && emp.nom.trim()) {
        employes.push({ nom: emp.nom.trim(), id: emp.id || '', planning });
      }
    }
    await ecrirePlanning({ semaine, du, au, employes });
    res.redirect(`/admin?pwd=${pwd}&s=${encodeURIComponent(semaine)}&success=planning`);
  } catch (err) {
    res.status(500).send(`Erreur : ${err.message}`);
  }
});

// ── SAVE COLLABORATEUR (ajout/modif) ──
router.post('/collaborateurs/save', authAdmin, async (req, res) => {
  try {
    const { pwd, matricule, nom, prenom, numeroSite, dateNaissance, heuresHebdo, contrat, editIndex } = req.body;
    const liste = await lireCollaborateurs();
    const collab = {
      matricule: matricule.trim(),
      numeroSite: numeroSite ? numeroSite.trim() : '',
      nom: nom.trim().toUpperCase(),
      prenom: prenom.trim(),
      dateNaissance: dateNaissance || '',
      heuresHebdo: parseFloat(heuresHebdo) || 0,
      contrat: contrat || 'CDI',
    };
    if (editIndex !== undefined && editIndex !== '' && liste[parseInt(editIndex)]) {
      liste[parseInt(editIndex)] = collab;
    } else {
      liste.push(collab);
    }
    await ecrireCollaborateurs(liste);
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
const express = require('express');
const router = express.Router();
const {
  lirePlanning, ecrirePlanning, listerSemaines,
  supprimerPlanning, lireCollaborateurs, ecrireCollaborateurs,
  listerPlanningsAnnee, listerPlanningsMois,mettreAJourCollabDansPlannings
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
        placed,
        fmt: formatMinutes(placed),
        quota: quotaMins,
        quotaFmt: quotaMins ? formatMinutes(quotaMins) : null,
        over: quotaMins && placed > quotaMins,
        perfect: quotaMins && Math.abs(placed - quotaMins) < 1
      };
    }
  }

  res.render('admin', {
    tab: 'planning',
    pwd: req.query.pwd,
    planning: data,
    semaines,
    semaineChoisie,
    semaineCourante,
    collaborateurs,
    jours: JOURS,
    labels: JOURS_LABELS,
    heuresInfo,
    success: req.query.success,
    semainesDispo: listeSemainesDispo(),
    datesDeSemaine,
    calcMinutes,
    formatMinutes,
    calcHeures,
    formatHeures
  });
});

// ── PAGE COLLABORATEURS ──
router.get('/collaborateurs', authAdmin, async (req, res) => {
  const collaborateurs = await lireCollaborateurs();
  res.render('admin', {
    tab: 'collaborateurs',
    pwd: req.query.pwd,
    collaborateurs,
    success: req.query.success,
    planning: null,
    semaines: [],
    semaineChoisie: null,
    semaineCourante: semaineActuelle(),
    jours: JOURS,
    labels: JOURS_LABELS,
    heuresInfo: {},
    semainesDispo: listeSemainesDispo(),
    datesDeSemaine
  });
});

// // ── PAGE MOIS ──
// router.get('/mois', authAdmin, async (req, res) => {
//   const collaborateurs = await lireCollaborateurs();
//   const now = new Date();
//   const moisChoisi = parseInt(req.query.mois) || (now.getUTCMonth() + 1);
//   const anneeChoisie = parseInt(req.query.annee) || now.getUTCFullYear();
//   const empChoisi = req.query.emp || (collaborateurs[0] ? collaborateurs[0].matricule : null);

//   const collab = collaborateurs.find(c => c.matricule === empChoisi);
//   const quotaHebdoMins = collab ? Math.round(collab.heuresHebdo * 60) : 0;

//   // Récupère tous les plannings du mois
//   const planningsMois = await listerPlanningsMois(moisChoisi, anneeChoisie);

//   // Construit le calendrier jour par jour du 1er au dernier jour du mois
//   const premierJour = new Date(Date.UTC(anneeChoisie, moisChoisi - 1, 1));
//   const dernierJour = new Date(Date.UTC(anneeChoisie, moisChoisi, 0));
//   const joursLabels = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

//   const calendrier = [];
//   let totalMoisRealise = 0;

//   for (let d = new Date(premierJour); d <= dernierJour; d.setUTCDate(d.getUTCDate() + 1)) {
//     const dateStr = d.toISOString().slice(0, 10); // "2026-04-06"
//     const jourSemaine = joursLabels[d.getUTCDay()]; // "lun", "mar"...

//     // Trouve le planning de la semaine qui couvre ce jour
//     let creneaux = [];
//     let minutesJour = 0;
//     let soldePrevuJour = -quotaHebdoMins / 5; // approximation journalière (quota / 5 jours)

//     for (const doc of planningsMois) {
//       const emp = (doc.employes || []).find(e => e.id === empChoisi);
//       if (!emp || !emp.planning) continue;
//       const { lundi } = parseSemaine(doc.semaine);
//       const joursDoc = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
//       for (let i = 0; i < 7; i++) {
//         const jourDate = new Date(lundi);
//         jourDate.setUTCDate(lundi.getUTCDate() + i);
//         if (jourDate.toISOString().slice(0, 10) === dateStr) {
//           creneaux = emp.planning[joursDoc[i]] || [];
//           // Calcule minutes du jour
//           for (const c of creneaux) {
//             if (c.debut && c.fin) {
//               const [dh, dm] = c.debut.split(':').map(Number);
//               const [fh, fm] = c.fin.split(':').map(Number);
//               const diff = (fh * 60 + fm) - (dh * 60 + dm);
//               if (diff > 0) minutesJour += diff;
//             }
//           }
//           break;
//         }
//       }
//     }

//     totalMoisRealise += minutesJour;

//     calendrier.push({
//       date: new Date(d),
//       dateStr,
//       jour: d.getUTCDate(),
//       jourSemaine,
//       creneaux,
//       minutesJour,
//       minutesJourFmt: formatMinutes(minutesJour),
//       travaille: minutesJour > 0
//     });
//   }

//   // Compteur mois global
//   const nbSemaines = planningsMois.length;
//   const quotaMois = quotaHebdoMins * Math.round(
//     // nb semaines ISO dont le jeudi est dans ce mois
//     (() => {
//       let count = 0;
//       for (let w = 1; w <= 53; w++) {
//         const jan4 = new Date(Date.UTC(anneeChoisie, 0, 4));
//         const dow = jan4.getUTCDay() || 7;
//         const lundi = new Date(jan4);
//         lundi.setUTCDate(jan4.getUTCDate() - (dow - 1) + (w - 1) * 7);
//         if (lundi.getUTCFullYear() > anneeChoisie) break;
//         const jeudi = new Date(lundi);
//         jeudi.setUTCDate(lundi.getUTCDate() + 3);
//         if (jeudi.getUTCFullYear() === anneeChoisie && jeudi.getUTCMonth() + 1 === moisChoisi) count++;
//       }
//       return count;
//     })()
//   );
//   const soldeMois = totalMoisRealise - quotaMois;

//   // Semaines du mois avec leurs totaux
//   const semainesDuMois = planningsMois
//     .sort((a, b) => {
//       const [wa] = a.semaine.split('/').map(Number);
//       const [wb] = b.semaine.split('/').map(Number);
//       return wa - wb;
//     })
//     .map(doc => {
//       const emp = (doc.employes || []).find(e => e.id === empChoisi);
//       const realise = emp ? (emp.totalSemaine || 0) : 0;
//       const solde = realise - quotaHebdoMins;
//       return {
//         semaine: doc.semaine,
//         realise,
//         realiseFmt: formatMinutes(realise),
//         quota: quotaHebdoMins,
//         quotaFmt: formatMinutes(quotaHebdoMins),
//         solde,
//         soldeFmt: formatMinutes(solde),
//         over: solde > 0,
//         under: solde < 0
//       };
//     });

//   res.render('admin', {
//     tab: 'mois',
//     pwd: req.query.pwd,
//     collaborateurs,
//     empChoisi,
//     collab,
//     moisChoisi,
//     anneeChoisie,
//     labelMois: MOIS_LABELS[moisChoisi - 1],
//     calendrier,
//     semainesDuMois,
//     totalMoisRealise,
//     totalMoisRealiseFmt: formatMinutes(totalMoisRealise),
//     quotaMois,
//     quotaMoisFmt: formatMinutes(quotaMois),
//     soldeMois,
//     soldeMoisFmt: formatMinutes(soldeMois),
//     formatMinutes,
//     semaines: [],
//     semaineChoisie: null,
//     semaineCourante: semaineActuelle(),
//     jours: JOURS,
//     labels: JOURS_LABELS,
//     heuresInfo: {},
//     planning: null,
//     semainesDispo: listeSemainesDispo(),
//     datesDeSemaine,
//     success: null
//   });
// });

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

  // Calcul nb semaines ISO du mois
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

  // Semaines du mois triées
  const semainesDuMois = planningsMois
    .map(d => d.semaine)
    .sort((a, b) => parseInt(a) - parseInt(b));

  // Stats par collaborateur
  const statsParCollab = {};
  for (const collab of collaborateurs) {
    const quotaHebdoMins = Math.round(collab.heuresHebdo * 60);
    const quotaMois = quotaHebdoMins * nbSemainesISO;

    // Réalisé mois
    let realiseMois = 0;
    const semaines = [];
    for (const doc of planningsMois.sort((a,b) => parseInt(a.semaine)-parseInt(b.semaine))) {
      const emp = (doc.employes || []).find(e => e.id === collab.matricule);
      const realise = emp ? (emp.totalSemaine || 0) : 0;
      const solde = realise - quotaHebdoMins;
      realiseMois += realise;
      semaines.push({
        semaine: doc.semaine,
        realise,
        realiseFmt: formatMinutes(realise),
        solde,
        soldeFmt: formatMinutes(solde)
      });
    }

    // Solde annuel
    let soldeAnnuel = 0;
    const { numeroSemaine: semaineMax } = parseSemaine(`${Math.max(...planningsMois.map(d => parseInt(d.semaine)))}/${anneeChoisie}`);
    for (const doc of planningsAnnee) {
      const [w] = doc.semaine.split('/').map(Number);
      if (w > semaineMax) continue;
      const emp = (doc.employes || []).find(e => e.id === collab.matricule);
      const realise = emp ? (emp.totalSemaine || 0) : 0;
      soldeAnnuel += realise - quotaHebdoMins;
    }

    const soldeMois = realiseMois - quotaMois;
    statsParCollab[collab.matricule] = {
      realiseMois,
      realiseMoisFmt: formatMinutes(realiseMois),
      quotaMois,
      quotaMoisFmt: formatMinutes(quotaMois),
      soldeMois,
      soldeMoisFmt: formatMinutes(soldeMois),
      soldeAnnuel,
      soldeAnnuelFmt: formatMinutes(soldeAnnuel),
      quotaHebdoFmt: formatMinutes(quotaHebdoMins),
      nbSemaines: nbSemainesISO,
      semaines
    };
  }

  res.render('admin', {
    tab: 'mois',
    pwd: req.query.pwd,
    collaborateurs,
    moisChoisi,
    anneeChoisie,
    labelMois: MOIS_LABELS[moisChoisi - 1],
    semainesDuMois,
    statsParCollab,
    formatMinutes,
    // champs requis par le layout
    semaines: [],
    semaineChoisie: null,
    semaineCourante: semaineActuelle(),
    jours: JOURS,
    labels: JOURS_LABELS,
    heuresInfo: {},
    planning: null,
    semainesDispo: listeSemainesDispo(),
    datesDeSemaine,
    success: null,
    // non utilisés dans cet onglet
    empChoisi: null, collab: null,
    totalMoisRealise: 0, totalMoisRealiseFmt: '0h00',
    quotaMois: 0, quotaMoisFmt: '0h00',
    soldeMois: 0, soldeMoisFmt: '0h00',
    calendrier: []
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
      du = du || dates.du;
      au = au || dates.au;
    }

    const { numeroMois, annee } = parseSemaine(semaine);

    // Charge les données nécessaires pour les compteurs
    const [planningsAnnee, planningsMois, collaborateurs] = await Promise.all([
      listerPlanningsAnnee(annee),
      listerPlanningsMois(numeroMois, annee),
      lireCollaborateurs()
    ]);

    const employes = [];
    const rawEmployes = req.body.employes || [];

    for (let i = 0; i < rawEmployes.length; i++) {
      const emp = rawEmployes[i];
      const planning = {};

      for (const jour of JOURS) {
        const creneaux = emp[jour] || [];
        planning[jour] = creneaux
          .filter(c => c.debut && c.fin)
          .map(c => ({ debut: c.debut, fin: c.fin }));
      }

      if (emp.nom && emp.nom.trim()) {
        const { heuresParJour, totalSemaine } = calcHeuresParJour(planning);

        // Quota hebdo de cet employé en minutes
        const collab = collaborateurs.find(c => c.matricule === (emp.id || ''));
        const quotaHebdoMins = collab ? Math.round(collab.heuresHebdo * 60) : 0;

        // Compteurs semaine + mois + solde annuel
        const { compteurSemaine, compteurMois, soldeAnnuel, soldeAnnuelFmt } =
          construireCompteurs(semaine, totalSemaine, quotaHebdoMins, planningsAnnee, planningsMois, emp.id || '');

        employes.push({
          nom: emp.nom.trim(),
          id: emp.id || '',
          planning,
          heuresParJour,   // { lun: 115, mar: 0, ... } minutes
          totalSemaine,    // minutes
          compteurSemaine,
          compteurMois,
          soldeAnnuel,
          soldeAnnuelFmt
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

// // ── SAVE COLLABORATEUR ──
// router.post('/collaborateurs/save', authAdmin, async (req, res) => {
//   try {
//     const { pwd, matricule, nom, prenom, numeroSite, dateNaissance, heuresHebdo, contrat, editIndex } = req.body;
//     const liste = await lireCollaborateurs();
//     const collab = {
//       matricule: matricule.trim(),
//       numeroSite: numeroSite ? numeroSite.trim() : '',
//       nom: nom.trim().toUpperCase(),
//       prenom: prenom.trim(),
//       dateNaissance: dateNaissance || '',
//       heuresHebdo: parseFloat(heuresHebdo) || 0,
//       contrat: contrat || 'CDI',
//     };
//     if (editIndex !== undefined && editIndex !== '' && liste[parseInt(editIndex)]) {
//       liste[parseInt(editIndex)] = collab;
//     } else {
//       liste.push(collab);
//     }
//     await ecrireCollaborateurs(liste);
//     res.redirect(`/admin/collaborateurs?pwd=${pwd}&success=collab`);
//   } catch (err) {
//     res.status(500).send(`Erreur : ${err.message}`);
//   }
// });

// ── SAVE COLLABORATEUR ──
router.post('/collaborateurs/save', authAdmin, async (req, res) => {
  try {
    const { pwd, matricule, nom, prenom, numeroSite, dateNaissance, heuresHebdo, contrat, editIndex } = req.body;
    const liste = await lireCollaborateurs();
    
    // Récupère l'existant pour garder soldesAnnuels
    const existing = (editIndex !== undefined && editIndex !== '')
      ? liste[parseInt(editIndex)]
      : null;

    const collab = {
      matricule: matricule.trim(),
      numeroSite: numeroSite ? numeroSite.trim() : '',
      nom: nom.trim().toUpperCase(),
      prenom: prenom.trim(),
      dateNaissance: dateNaissance || '',
      heuresHebdo: parseFloat(heuresHebdo) || 0,
      contrat: contrat || 'CDI',
      // ← GARDE les soldesAnnuels existants, ne les écrase pas
      soldesAnnuels: existing ? (existing.soldesAnnuels || {}) : {}
    };

    if (existing) {
      liste[parseInt(editIndex)] = collab;
    } else {
      liste.push(collab);
    }

    await ecrireCollaborateurs(liste);
    res.redirect(`/admin/collaborateurs?pwd=${pwd}&success=collab`);
  } catch (err) {
    res.status(500).send(`Erreur : ${err.message}`);
  }
});// ── SAVE COLLABORATEUR ──
// router.post('/collaborateurs/save', authAdmin, async (req, res) => {
//   try {
//     const { pwd, matricule, nom, prenom, numeroSite, dateNaissance, heuresHebdo, contrat, editIndex } = req.body;
//     const liste = await lireCollaborateurs();
    
//     // Récupère l'existant pour garder soldesAnnuels
//     const existing = (editIndex !== undefined && editIndex !== '')
//       ? liste[parseInt(editIndex)]
//       : null;

//     const collab = {
//       matricule: matricule.trim(),
//       numeroSite: numeroSite ? numeroSite.trim() : '',
//       nom: nom.trim().toUpperCase(),
//       prenom: prenom.trim(),
//       dateNaissance: dateNaissance || '',
//       heuresHebdo: parseFloat(heuresHebdo) || 0,
//       contrat: contrat || 'CDI',
//       // ← GARDE les soldesAnnuels existants, ne les écrase pas
//       soldesAnnuels: existing ? (existing.soldesAnnuels || {}) : {}
//     };

//     if (existing) {
//       liste[parseInt(editIndex)] = collab;
//     } else {
//       liste.push(collab);
//     }

//     await ecrireCollaborateurs(liste);
//     res.redirect(`/admin/collaborateurs?pwd=${pwd}&success=collab`);
//   } catch (err) {
//     res.status(500).send(`Erreur : ${err.message}`);
//   }
// });

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

    // ── Propage dans tous les plannings existants ──
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
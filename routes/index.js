const express = require('express');
const router = express.Router();
const { lirePlanning, listerSemaines } = require('../github');
const { calcHeures, formatHeures, semaineActuelle } = require('../utils');

const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const JOURS_LABELS = { lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi', ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche' };
const JOURS_JS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

router.get('/', async (req, res) => {
  const jourAujourdHui = JOURS_JS[new Date().getDay()];
  const semaineCourante = semaineActuelle();
  try {
    const semaines = await listerSemaines();
    const semaineChoisie = req.query.s || semaines[0] || null;
    const { data } = semaineChoisie ? await lirePlanning(semaineChoisie) : { data: null };

    // Calcul heures par équipier
    const heuresParEmp = {};
    if (data && data.employes) {
      for (const emp of data.employes) {
        heuresParEmp[emp.id || emp.nom] = {
          val: calcHeures(emp.planning),
          fmt: formatHeures(calcHeures(emp.planning))
        };
      }
    }

    res.render('planning', {
      planning: data,
      jours: JOURS,
      labels: JOURS_LABELS,
      jourAujourdHui,
      semaines,
      semaineChoisie,
      semaineCourante,
      heuresParEmp
    });
  } catch (err) {
    res.render('planning', {
      planning: null, jours: JOURS, labels: JOURS_LABELS,
      jourAujourdHui, semaines: [], semaineChoisie: null,
      semaineCourante, heuresParEmp: {}, error: err.message
    });
  }
});

module.exports = router;

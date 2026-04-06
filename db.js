const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connecter() {
  if (!db) {
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'picard-planning');
  }
  return db;
}

// ── PLANNING ──
async function lirePlanning(semaine) {
  const db = await connecter();
  const data = await db.collection('plannings').findOne({ semaine }, { projection: { _id: 0 } });
  return { data: data || null };
}

async function ecrirePlanning(data) {
  const db = await connecter();
  await db.collection('plannings').replaceOne(
    { semaine: data.semaine },
    data,
    { upsert: true }
  );
}

async function listerSemaines() {
  const db = await connecter();
  const docs = await db.collection('plannings')
    .find({}, { projection: { semaine: 1, _id: 0 } })
    .toArray();
  return docs
    .map(d => d.semaine)
    .filter(Boolean)
    .sort((a, b) => {
      const [sa, ya] = a.split('/').map(Number);
      const [sb, yb] = b.split('/').map(Number);
      return ya !== yb ? yb - ya : sb - sa;
    });
}

async function supprimerPlanning(semaine) {
  const db = await connecter();
  await db.collection('plannings').deleteOne({ semaine });
}

// ── NOUVEAU : tous les plannings d'une année (pour calcul solde annuel) ──
async function listerPlanningsAnnee(annee) {
  const db = await connecter();
  const docs = await db.collection('plannings')
    .find({}, { projection: { _id: 0 } })
    .toArray();
  // Filtre sur l'année dans "SS/AAAA"
  return docs.filter(d => {
    if (!d.semaine) return false;
    const [, y] = d.semaine.split('/').map(Number);
    return y === annee;
  });
}

// ── NOUVEAU : tous les plannings d'un mois (pour calcul total mois) ──
// Retourne les plannings dont au moins un jour tombe dans le mois/année donnés
async function listerPlanningsMois(mois, annee) {
  const db = await connecter();
  const docs = await db.collection('plannings')
    .find({}, { projection: { _id: 0 } })
    .toArray();
  return docs.filter(d => {
    if (!d.semaine) return false;
    const [w, y] = d.semaine.split('/').map(Number);
    if (y !== annee && !(y === annee - 1 && mois === 1) && !(y === annee + 1 && mois === 12)) return false;
    // Calcule le lundi de cette semaine ISO
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const lundi = new Date(jan4);
    lundi.setUTCDate(jan4.getUTCDate() - (dow - 1) + (w - 1) * 7);
    const dimanche = new Date(lundi);
    dimanche.setUTCDate(lundi.getUTCDate() + 6);
    // La semaine chevauche le mois si lundi <= dernier jour du mois ET dimanche >= 1er jour du mois
    const debut = new Date(Date.UTC(annee, mois - 1, 1));
    const fin = new Date(Date.UTC(annee, mois, 0)); // dernier jour du mois
    return lundi <= fin && dimanche >= debut;
  });
}

// ── COLLABORATEURS ──
async function lireCollaborateurs() {
  const db = await connecter();
  const doc = await db.collection('people').findOne({ _id: 'collaborateurs' });
  return doc ? doc.liste : [];
}

async function ecrireCollaborateurs(liste) {
  const db = await connecter();
  await db.collection('people').replaceOne(
    { _id: 'collaborateurs' },
    { _id: 'collaborateurs', liste },
    { upsert: true }
  );
}

// ── Propage toutes les infos collab dans les plannings existants ──
async function mettreAJourCollabDansPlannings(matricule, collab) {
  const db = await connecter();
  const docs = await db.collection('plannings').find({}).toArray();
  for (const doc of docs) {
    let modifie = false;
    for (const emp of (doc.employes || [])) {
      if (emp.id === matricule) {
        emp.nom = `${collab.nom} ${collab.prenom}`;
        modifie = true;
      }
    }
    if (modifie) {
      await db.collection('plannings').replaceOne({ _id: doc._id }, doc);
    }
  }
}
module.exports = {
  lirePlanning, ecrirePlanning, listerSemaines, supprimerPlanning,
  listerPlanningsAnnee, listerPlanningsMois,
  lireCollaborateurs, ecrireCollaborateurs,mettreAJourCollabDansPlannings
};
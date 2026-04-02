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

module.exports = {
  lirePlanning, ecrirePlanning, listerSemaines, supprimerPlanning,
  lireCollaborateurs, ecrireCollaborateurs
};
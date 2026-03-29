require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', require('./routes/index'));
app.use('/admin', require('./routes/admin'));

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('ERREUR EXPRESS:', err.stack);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Planning Picard sur http://localhost:${PORT}`));
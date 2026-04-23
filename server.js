const express = require('express');
const path    = require('path');

const app     = express();
const PORT    = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'nettoyage.db');

// Node 22+ : node:sqlite natif ; sinon better-sqlite3 (prebuilts Node 18/20)
const nodeMajor = parseInt(process.versions.node.split('.')[0]);
let db;
if (nodeMajor >= 22) {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
} else {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS bl_counter (
    id    INTEGER PRIMARY KEY,
    counter INTEGER DEFAULT 0
  );
  INSERT OR IGNORE INTO bl_counter (id, counter) VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS interventions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    bl_number           TEXT    UNIQUE NOT NULL,
    date_intervention   TEXT    NOT NULL,
    ancienne_production TEXT,
    nouvelle_production TEXT,
    heure_prevue        TEXT,
    heure_reelle        TEXT,
    heure_debut         TEXT,
    nombre_operateurs   INTEGER,
    noms_operateurs     TEXT,
    observations        TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS nettoyage_hacheuse (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    intervention_id   INTEGER NOT NULL,
    bl_number         TEXT    UNIQUE NOT NULL,
    heure_debut       TEXT,
    heure_fin         TEXT,
    nombre_operateurs INTEGER,
    FOREIGN KEY (intervention_id) REFERENCES interventions(id)
  );

  CREATE TABLE IF NOT EXISTS nettoyage_rouleaux (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    intervention_id   INTEGER NOT NULL,
    bl_number         TEXT    UNIQUE NOT NULL,
    heure_debut       TEXT,
    heure_fin         TEXT,
    nombre_operateurs INTEGER,
    FOREIGN KEY (intervention_id) REFERENCES interventions(id)
  );

  CREATE TABLE IF NOT EXISTS nettoyage_complementaire (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    intervention_id   INTEGER NOT NULL,
    bl_number         TEXT    UNIQUE NOT NULL,
    type_nettoyage    TEXT,
    heure_debut       TEXT,
    heure_fin         TEXT,
    nombre_operateurs INTEGER,
    FOREIGN KEY (intervention_id) REFERENCES interventions(id)
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const stmtCounterGet    = db.prepare('SELECT counter FROM bl_counter WHERE id = 1');
const stmtCounterUpdate = db.prepare('UPDATE bl_counter SET counter = counter + 1 WHERE id = 1');

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function nextBL() {
  stmtCounterUpdate.run();
  const row = stmtCounterGet.get();
  return `BL-${String(row.counter).padStart(4, '0')}`;
}

function formatBL(n) {
  return `BL-${String(n).padStart(4, '0')}`;
}

// Preview upcoming BL numbers without consuming them
app.get('/api/preview-bl', (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 1, 10);
  const row = stmtCounterGet.get();
  const bls = [];
  for (let i = 1; i <= count; i++) bls.push(formatBL(row.counter + i));
  res.json({ bls, next: row.counter + 1 });
});

// Submit a new intervention
app.post('/api/interventions', (req, res) => {
  const {
    date_intervention, ancienne_production, nouvelle_production,
    heure_prevue, heure_reelle, heure_debut,
    nombre_operateurs, noms_operateurs, observations,
    nettoyage_hacheuse, nettoyage_rouleaux, nettoyage_complementaire
  } = req.body;

  try {
    const result = transaction(() => {
      const bl_main = nextBL();
      const { lastInsertRowid: intervention_id } = db.prepare(`
        INSERT INTO interventions
          (bl_number, date_intervention, ancienne_production, nouvelle_production,
           heure_prevue, heure_reelle, heure_debut, nombre_operateurs, noms_operateurs, observations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bl_main, date_intervention, ancienne_production, nouvelle_production,
        heure_prevue, heure_reelle, heure_debut, nombre_operateurs,
        JSON.stringify(noms_operateurs || []), observations
      );

      const assigned = { bl_main };

      if (nettoyage_hacheuse?.active) {
        const bl = nextBL();
        assigned.bl_hacheuse = bl;
        db.prepare(`
          INSERT INTO nettoyage_hacheuse (intervention_id, bl_number, heure_debut, heure_fin, nombre_operateurs)
          VALUES (?, ?, ?, ?, ?)
        `).run(intervention_id, bl,
          nettoyage_hacheuse.heure_debut, nettoyage_hacheuse.heure_fin, nettoyage_hacheuse.nombre_operateurs);
      }

      if (nettoyage_rouleaux?.active) {
        const bl = nextBL();
        assigned.bl_rouleaux = bl;
        db.prepare(`
          INSERT INTO nettoyage_rouleaux (intervention_id, bl_number, heure_debut, heure_fin, nombre_operateurs)
          VALUES (?, ?, ?, ?, ?)
        `).run(intervention_id, bl,
          nettoyage_rouleaux.heure_debut, nettoyage_rouleaux.heure_fin, nettoyage_rouleaux.nombre_operateurs);
      }

      if (nettoyage_complementaire?.active) {
        const bl = nextBL();
        assigned.bl_complementaire = bl;
        db.prepare(`
          INSERT INTO nettoyage_complementaire
            (intervention_id, bl_number, type_nettoyage, heure_debut, heure_fin, nombre_operateurs)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(intervention_id, bl,
          nettoyage_complementaire.type_nettoyage,
          nettoyage_complementaire.heure_debut, nettoyage_complementaire.heure_fin,
          nettoyage_complementaire.nombre_operateurs);
      }

      return { intervention_id, ...assigned };
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all interventions
app.get('/api/interventions', (req, res) => {
  const rows = db.prepare(`
    SELECT i.*,
      h.bl_number as h_bl, h.heure_debut as h_debut, h.heure_fin as h_fin, h.nombre_operateurs as h_ops,
      r.bl_number as r_bl, r.heure_debut as r_debut, r.heure_fin as r_fin, r.nombre_operateurs as r_ops,
      c.bl_number as c_bl, c.type_nettoyage,
      c.heure_debut as c_debut, c.heure_fin as c_fin, c.nombre_operateurs as c_ops
    FROM interventions i
    LEFT JOIN nettoyage_hacheuse      h ON h.intervention_id = i.id
    LEFT JOIN nettoyage_rouleaux      r ON r.intervention_id = i.id
    LEFT JOIN nettoyage_complementaire c ON c.intervention_id = i.id
    ORDER BY i.created_at DESC
  `).all();
  res.json(rows);
});

// Get one intervention
app.get('/api/interventions/:id', (req, res) => {
  const row = db.prepare(`
    SELECT i.*,
      h.bl_number as h_bl, h.heure_debut as h_debut, h.heure_fin as h_fin, h.nombre_operateurs as h_ops,
      r.bl_number as r_bl, r.heure_debut as r_debut, r.heure_fin as r_fin, r.nombre_operateurs as r_ops,
      c.bl_number as c_bl, c.type_nettoyage,
      c.heure_debut as c_debut, c.heure_fin as c_fin, c.nombre_operateurs as c_ops
    FROM interventions i
    LEFT JOIN nettoyage_hacheuse       h ON h.intervention_id = i.id
    LEFT JOIN nettoyage_rouleaux       r ON r.intervention_id = i.id
    LEFT JOIN nettoyage_complementaire c ON c.intervention_id = i.id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Non trouvé' });
  res.json(row);
});

// Delete one intervention (and its children via cascade-like logic)
app.delete('/api/interventions/:id', (req, res) => {
  const id = req.params.id;
  transaction(() => {
    db.prepare('DELETE FROM nettoyage_hacheuse       WHERE intervention_id = ?').run(id);
    db.prepare('DELETE FROM nettoyage_rouleaux       WHERE intervention_id = ?').run(id);
    db.prepare('DELETE FROM nettoyage_complementaire WHERE intervention_id = ?').run(id);
    db.prepare('DELETE FROM interventions            WHERE id = ?').run(id);
  });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`\n  Serveur démarré → http://localhost:${PORT}\n`);
});

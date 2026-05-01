require('dotenv').config();
const pool = require('./db');

async function apply() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_document_amounts (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        document_type VARCHAR(100) NOT NULL,
        amount DECIMAL(15, 2),
        PRIMARY KEY(project_id, document_type)
      );
    `);
    console.log("Schema applied successfully.");
  } catch (err) {
    console.error("Error applying schema:", err);
  } finally {
    pool.end();
  }
}

apply();

const pool = require('../server/db');

async function checkConstraints() {
  try {
    const { rows } = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_namespace n ON n.oid = c.connamespace 
      WHERE n.nspname = 'public' AND contype = 'u' AND conrelid = 'attendance'::regclass
    `);
    console.log('Unique Constraints:', rows);
    
    const { rows: check } = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_namespace n ON n.oid = c.connamespace 
      WHERE n.nspname = 'public' AND contype = 'c' AND conrelid = 'attendance'::regclass
    `);
    console.log('Check Constraints:', check);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkConstraints();

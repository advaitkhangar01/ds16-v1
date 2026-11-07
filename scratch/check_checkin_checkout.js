const { Pool } = require('../server/node_modules/pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:data47265@localhost:5432/ds16' });

async function check() {
  const attempts = await pool.query('SELECT * FROM attendance_attempts ORDER BY created_at DESC LIMIT 20');
  console.log('Recent attempts count:', attempts.rows.length);
  if (attempts.rows.length > 0) {
    console.log(attempts.rows);
  }

  const attCols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'attendance'
    ORDER BY ordinal_position
  `);
  console.log('Attendance columns:', attCols.rows.map(r => `${r.column_name} (${r.data_type}, nullable: ${r.is_nullable})`));

  const constraints = await pool.query(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c 
    JOIN pg_class cl ON c.conrelid = cl.oid 
    WHERE cl.relname = 'attendance'
  `);
  console.log('Attendance constraints:', constraints.rows);

  const settings = await pool.query(`SELECT key, value FROM app_settings WHERE key LIKE '%office%' OR key LIKE '%geo%' OR key LIKE '%batch%' OR key LIKE '%hour%'`);
  console.log('Settings:', settings.rows);

  await pool.end();
}
check().catch(console.error);

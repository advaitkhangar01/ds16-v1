const { Pool } = require('../server/node_modules/pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:data47265@localhost:5432/ds16' });

async function check() {
  const userCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
  `);
  console.log('User columns:', userCols.rows.map(c => c.column_name));

  const users = await pool.query('SELECT * FROM users');
  console.log('Users in ds16:', users.rows);

  const dbs = await pool.query(`SELECT datname FROM pg_database WHERE datistemplate = false;`);
  console.log('Databases:', dbs.rows);

  await pool.end();
}
check().catch(console.error);

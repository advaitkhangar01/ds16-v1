require('dotenv').config();
const pool = require('./db');
pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'project_document_amounts'").then(res => { console.log(res.rows); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });

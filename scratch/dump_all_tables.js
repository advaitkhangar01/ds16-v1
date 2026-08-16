const pool = require('../server/db');

async function dump() {
  try {
    const tables = [
      'users', 'clients', 'client_contacts', 'client_addresses', 'client_banking',
      'projects', 'attendance', 'attendance_attempts', 'leave_requests', 'holidays',
      'employee_leave_summary', 'project_stages', 'project_payment_stages',
      'project_document_amounts', 'project_assignments', 'vendors', 'documents',
      'comments', 'invoices', 'transactions', 'office_expenses', 'expense_audits',
      'payroll', 'app_settings', 'tasks', 'task_participants', 'task_messages',
      'attendance_batches', 'monthly_closing_log', 'employee_leave_balance', 'period_unlock_log'
    ];

    console.log('--- Table Row Counts ---');
    for (const table of tables) {
      try {
        const res = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`${table}: ${res.rows[0].count}`);
      } catch (err) {
        console.log(`${table}: Error: ${err.message}`);
      }
    }

    console.log('\n--- Transactions Dump ---');
    try {
      const res = await pool.query('SELECT * FROM transactions');
      console.log(res.rows);
    } catch (err) {
      console.log('Error fetching transactions:', err.message);
    }

    console.log('\n--- Vendors Dump ---');
    try {
      const res = await pool.query('SELECT * FROM vendors');
      console.log(res.rows);
    } catch (err) {
      console.log('Error fetching vendors:', err.message);
    }

    console.log('\n--- Monthly Closing Logs Dump ---');
    try {
      const res = await pool.query('SELECT * FROM monthly_closing_log');
      console.log(res.rows);
    } catch (err) {
      console.log('Error fetching monthly_closing_log:', err.message);
    }

  } catch (err) {
    console.error(err);
  } finally {
    // Wait a bit before ending to avoid the migration pool-ended issue
    setTimeout(() => {
      pool.end();
    }, 2000);
  }
}

dump();

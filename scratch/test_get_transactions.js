const pool = require('../server/db');

async function run() {
  try {
    let query = `
      SELECT t.*, p.name as project_name, v.name as vendor_name, u.name as employee_name, creator.name as creator_name, pul.reason as unlock_reason, pul.unlocked_at as unlock_date, pul_user.name as unlock_user,
             COALESCE(ea.is_verified, FALSE) as is_verified
      FROM transactions t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.employee_id
      LEFT JOIN users creator ON creator.id = t.created_by
      LEFT JOIN period_unlock_log pul ON pul.id = t.period_unlock_id
      LEFT JOIN users pul_user ON pul_user.id = pul.unlocked_by
      LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category) 
        AND ea.month = EXTRACT(MONTH FROM t.date) 
        AND ea.year = EXTRACT(YEAR FROM t.date)
      WHERE 1=1 
      ORDER BY t.date DESC, t.created_at DESC
    `;
    const { rows } = await pool.query(query);
    console.log('Main transactions query works fine, returned', rows.length, 'rows');
  } catch (err) {
    console.error('Main transactions query error:', err);
  }

  try {
    let payrollQuery = `
        SELECT * FROM (
          SELECT 
            p.id, 
            'expense' as type, 
            'Salaries' as category, 
            (p.net_paid - p.incentives) as amount, 
            p.payment_date as date, 
            'Monthly salary payment' as description, 
            NULL as project_id, 
            NULL as vendor_id, 
            p.user_id as employee_id, 
            NULL as reference_id, 
            NULL as receipt_url, 
            NULL as created_by, 
            p.created_at, 
            'payroll' as source,
            COALESCE(ea.is_verified, FALSE) as is_verified
          FROM payroll p 
          LEFT JOIN expense_audits ea ON LOWER(ea.category) = 'salaries' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid'
          
          UNION ALL
          
          SELECT 
            p.id, 
            'expense' as type, 
            'Incentives' as category, 
            p.incentives as amount, 
            p.payment_date as date, 
            'Performance incentive' as description, 
            NULL as project_id, 
            NULL as vendor_id, 
            p.user_id as employee_id, 
            NULL as reference_id, 
            NULL as receipt_url, 
            NULL as created_by, 
            p.created_at, 
            'payroll' as source,
            COALESCE(ea.is_verified, FALSE) as is_verified
          FROM payroll p 
          LEFT JOIN expense_audits ea ON LOWER(ea.category) = 'incentives' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid' AND p.incentives > 0
        ) p_virtual
        WHERE 1=1
    `;
    const { rows } = await pool.query(payrollQuery);
    console.log('Payroll virtual query works fine, returned', rows.length, 'rows');
  } catch (err) {
    console.error('Payroll virtual query error:', err);
  }

  pool.end();
}

run();

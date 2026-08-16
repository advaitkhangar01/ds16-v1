const query = `
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
      WHERE 1=1 AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment') AND t.vendor_id IS NULL AND t.type = $1 AND t.date >= $2 ORDER BY t.date DESC, t.created_at DESC
`;

console.log('Query length:', query.length);
console.log('Character around 1628:');
const start = Math.max(0, 1628 - 50);
const end = Math.min(query.length, 1628 + 50);
console.log(query.substring(start, end));
console.log('Position 1628 pointer:');
console.log(' '.repeat(1628 - start) + '^');

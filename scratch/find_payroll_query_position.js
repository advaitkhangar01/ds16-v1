const payrollQuery = `
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
        WHERE 1=1 AND payment_date >= $1
`;

console.log('Payroll Query length:', payrollQuery.length);
console.log('Character around 1628:');
const start = Math.max(0, 1628 - 50);
const end = Math.min(payrollQuery.length, 1628 + 50);
console.log(payrollQuery.substring(start, end));
console.log('Position 1628 pointer:');
console.log(' '.repeat(1628 - start) + '^');

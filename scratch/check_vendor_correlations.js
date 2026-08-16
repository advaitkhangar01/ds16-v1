const pool = require('../server/db');

async function analyze() {
  try {
    console.log('Fetching monthly closing logs...');
    const closingLogs = await pool.query('SELECT * FROM monthly_closing_log ORDER BY year, month');
    console.log(`Found ${closingLogs.rows.length} closing logs.`);
    
    console.log('\n--- Monthly Closing Logs ---');
    closingLogs.rows.forEach(row => {
      console.log(`Year: ${row.year}, Month: ${row.month}, Closed At: ${row.closed_at}, Reason: ${row.close_reason}`);
      console.log(`Snapshot keys: ${Object.keys(row.snapshot).join(', ')}`);
      if (row.snapshot.expenses) {
        console.log(`  Expenses total: ${row.snapshot.expenses.total}, Office overhead: ${row.snapshot.expenses.office_overhead}, Payroll: ${row.snapshot.expenses.payroll}, Vendor Payments in Snapshot: ${row.snapshot.expenses.vendor_payments}`);
      }
      if (row.snapshot.profit_loss) {
        console.log(`  Profit/Loss Realized: ${row.snapshot.profit_loss.realized}, Projected: ${row.snapshot.profit_loss.projected}`);
      }
    });

    console.log('\nFetching vendor payments from transactions...');
    // Let's find vendor payments. Let's see what categories exist in transactions
    const categories = await pool.query('SELECT DISTINCT category, COUNT(*) FROM transactions GROUP BY category');
    console.log('Transaction Categories:');
    categories.rows.forEach(c => console.log(` - ${c.category}: ${c.count}`));

    const vendorPayments = await pool.query(`
      SELECT t.*, v.name as vendor_name 
      FROM transactions t 
      LEFT JOIN vendors v ON t.vendor_id = v.id 
      WHERE t.type = 'expense' AND (t.category = 'vendor_payment' OR t.vendor_id IS NOT NULL)
      ORDER BY t.date
    `);
    console.log(`\nFound ${vendorPayments.rows.length} vendor payments.`);
    
    console.log('\n--- Vendor Payments Detail ---');
    vendorPayments.rows.forEach(p => {
      console.log(`ID: ${p.id}, Date: ${p.date}, Amount: ${p.amount}, Category: ${p.category}, Vendor: ${p.vendor_name || 'N/A'} (${p.vendor_id}), Project ID: ${p.project_id}, Desc: ${p.description}`);
    });

    // Let's run a correlation analysis
    // Group vendor payments by month/year
    const monthlyVendorPayments = {};
    vendorPayments.rows.forEach(p => {
      const d = new Date(p.date);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!monthlyVendorPayments[key]) {
        monthlyVendorPayments[key] = { amount: 0, count: 0, payments: [] };
      }
      monthlyVendorPayments[key].amount += parseFloat(p.amount);
      monthlyVendorPayments[key].count += 1;
      monthlyVendorPayments[key].payments.push(p);
    });

    console.log('\n--- Monthly Vendor Payments Aggregation ---');
    Object.keys(monthlyVendorPayments).sort().forEach(key => {
      console.log(`Month ${key}: Total Amount: ${monthlyVendorPayments[key].amount}, Count: ${monthlyVendorPayments[key].count}`);
    });

    // Find the dates of monthly closes and correlate with the dates of vendor payments in those months
    console.log('\n--- Correlation Analysis: Payment Timing vs. Close Timing ---');
    for (const log of closingLogs.rows) {
      const key = `${log.year}-${String(log.month).padStart(2, '0')}`;
      const closeDate = new Date(log.closed_at);
      console.log(`\nClosing Log for ${key} (Closed on ${closeDate.toISOString().split('T')[0]}):`);
      
      const payments = monthlyVendorPayments[key];
      if (payments) {
        console.log(`  Vendor Payments in this calendar month: Total ${payments.amount} over ${payments.count} transaction(s).`);
        payments.payments.forEach(p => {
          const payDate = new Date(p.date);
          const diffDays = Math.round((closeDate - payDate) / (1000 * 60 * 60 * 24));
          console.log(`    - Pay Date: ${p.date} (Amount: ${p.amount}, Vendor: ${p.vendor_name}) -> Paid ${diffDays} days BEFORE monthly close.`);
        });
      } else {
        console.log(`  No vendor payments found in this calendar month.`);
      }
    }

  } catch (err) {
    console.error('Error running analysis:', err);
  } finally {
    pool.end();
  }
}

analyze();

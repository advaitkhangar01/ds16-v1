// server/scripts/export_historical_baseline.js
// Read-only baseline snapshot exporter for historical figures before any cleanup or refactor

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const pool = require('../db');

async function exportBaseline() {
  console.log('📊 Starting historical baseline snapshot extraction...');
  const client = await pool.connect();
  try {
    const baseline = {
      extracted_at: new Date().toISOString(),
      database_url_host: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1] : 'unknown',
      months: {}
    };

    // 1. Fetch range of months from attendance, invoices, payroll, expenses
    const { rows: periods } = await client.query(`
      SELECT DISTINCT year, month FROM (
        SELECT EXTRACT(YEAR FROM date)::int AS year, EXTRACT(MONTH FROM date)::int AS month FROM attendance
        UNION
        SELECT EXTRACT(YEAR FROM date)::int AS year, EXTRACT(MONTH FROM date)::int AS month FROM invoices
        UNION
        SELECT year, month FROM payroll
        UNION
        SELECT EXTRACT(YEAR FROM date)::int AS year, EXTRACT(MONTH FROM date)::int AS month FROM office_expenses
        UNION
        SELECT year, month FROM monthly_closing_log
      ) all_periods
      WHERE year >= 2023 AND month BETWEEN 1 AND 12
      ORDER BY year ASC, month ASC
    `);

    console.log(`Found ${periods.length} distinct monthly periods across all operational tables.`);

    for (const { year, month } of periods) {
      const periodKey = `${year}-${String(month).padStart(2, '0')}`;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

      // Attendance baseline
      const { rows: attRows } = await client.query(`
        SELECT 
          COUNT(*)::int AS total_records,
          COUNT(CASE WHEN LOWER(status) IN ('present', 'working', 'completed') THEN 1 END)::int AS present_count,
          COUNT(CASE WHEN LOWER(status) = 'half_day' THEN 1 END)::int AS half_day_count,
          COUNT(CASE WHEN is_late = TRUE THEN 1 END)::int AS late_count
        FROM attendance
        WHERE date >= $1 AND date <= $2
      `, [startDate, endDate]);

      // Invoices baseline
      const { rows: invRows } = await client.query(`
        SELECT 
          COUNT(*)::int AS total_invoices,
          COALESCE(SUM(amount), 0)::float AS total_billed,
          COALESCE(SUM(received_amount), 0)::float AS total_received,
          COALESCE(SUM(CASE WHEN LOWER(status) != 'cancelled' THEN GREATEST(amount - received_amount, 0) ELSE 0 END), 0)::float AS total_pending
        FROM invoices
        WHERE date >= $1 AND date <= $2
      `, [startDate, endDate]);

      // Expenses baseline
      const { rows: expRows } = await client.query(`
        SELECT 
          COUNT(*)::int AS total_expenses,
          COALESCE(SUM(amount), 0)::float AS total_expense_amount
        FROM office_expenses
        WHERE date >= $1 AND date <= $2
      `, [startDate, endDate]);

      // Payroll baseline
      const { rows: payRows } = await client.query(`
        SELECT 
          COUNT(*)::int AS total_payroll_records,
          COALESCE(SUM(base_salary), 0)::float AS total_base_salary,
          COALESCE(SUM(incentives), 0)::float AS total_incentives,
          COALESCE(SUM(deductions), 0)::float AS total_deductions,
          COALESCE(SUM(net_paid), 0)::float AS total_net_paid
        FROM payroll
        WHERE year = $1 AND month = $2
      `, [year, month]);

      // Monthly close log baseline
      const { rows: closeRows } = await client.query(`
        SELECT id, closed_at, snapshot 
        FROM monthly_closing_log
        WHERE year = $1 AND month = $2
      `, [year, month]);

      baseline.months[periodKey] = {
        period: periodKey,
        attendance: attRows[0] || {},
        invoices: invRows[0] || {},
        expenses: expRows[0] || {},
        payroll: payRows[0] || {},
        monthly_closing: closeRows[0] ? { is_closed: true, closed_at: closeRows[0].closed_at, snapshot: closeRows[0].snapshot } : { is_closed: false }
      };
    }

    const outputPath = path.join(__dirname, '..', '..', 'baseline_figures_pre_cleanup.json');
    fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2), 'utf8');
    console.log(`✅ Baseline successfully exported to: ${outputPath}`);
  } catch (err) {
    console.error('❌ Error exporting baseline:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

exportBaseline();

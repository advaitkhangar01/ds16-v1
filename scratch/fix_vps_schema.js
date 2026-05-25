// scratch/fix_vps_schema.js
// Automated DB Repair Script for DS16 VPS Database

const pool = require('../server/db');

const REQUIRED_COLUMNS = {
  leave_requests: [
    { name: 'start_date', type: 'DATE NOT NULL DEFAULT CURRENT_DATE' },
    { name: 'end_date', type: 'DATE NOT NULL DEFAULT CURRENT_DATE' },
    { name: 'type', type: "VARCHAR(50) NOT NULL DEFAULT 'casual'" },
    { name: 'amount', type: 'DECIMAL(15, 2) DEFAULT 0' },
    { name: 'reason', type: 'TEXT' },
    { name: 'status', type: "VARCHAR(20) DEFAULT 'pending'" },
    { name: 'remarks', type: 'TEXT' },
    { name: 'reviewed_by', type: 'INTEGER REFERENCES users(id) ON DELETE SET NULL' }
  ],
  attendance: [
    { name: 'check_in', type: 'TIMESTAMPTZ' },
    { name: 'check_out', type: 'TIMESTAMPTZ' },
    { name: 'lat', type: 'DECIMAL(10, 8)' },
    { name: 'lng', type: 'DECIMAL(11, 8)' },
    { name: 'date', type: 'DATE NOT NULL DEFAULT CURRENT_DATE' },
    { name: 'status', type: "VARCHAR(20) DEFAULT 'working'" },
    { name: 'is_late', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'late_minutes', type: 'INTEGER DEFAULT 0' },
    { name: 'checkin_accuracy', type: 'DECIMAL(10, 2)' },
    { name: 'checkin_distance', type: 'DECIMAL(10, 2)' },
    { name: 'checkin_zone', type: 'VARCHAR(20)' },
    { name: 'is_boundary_checkin', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'checkin_verified', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'checkout_lat', type: 'DECIMAL(10, 8)' },
    { name: 'checkout_lng', type: 'DECIMAL(11, 8)' },
    { name: 'checkout_accuracy', type: 'DECIMAL(10, 2)' },
    { name: 'checkout_distance', type: 'DECIMAL(10, 2)' },
    { name: 'checkout_zone', type: 'VARCHAR(20)' },
    { name: 'checkout_outside_zone', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'hours_worked', type: 'DECIMAL(10, 2) DEFAULT 0' }
  ],
  attendance_attempts: [
    { name: 'user_id', type: 'INTEGER REFERENCES users(id) ON DELETE CASCADE' },
    { name: 'lat', type: 'DECIMAL(10, 8)' },
    { name: 'lng', type: 'DECIMAL(11, 8)' },
    { name: 'accuracy', type: 'DECIMAL(10, 2)' },
    { name: 'distance', type: 'DECIMAL(10, 2)' },
    { name: 'zone', type: 'VARCHAR(20)' },
    { name: 'reason', type: 'TEXT' },
    { name: 'attempted_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
  ]
};

async function repairSchema() {
  console.log('=== Starting VPS Schema Verification & Repair ===');
  
  try {
    for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
      console.log(`\nChecking table: "${tableName}"...`);
      
      // 1. Get existing columns for this table
      const { rows: existingCols } = await pool.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_name = $1`,
        [tableName]
      );
      
      const existingNames = existingCols.map(c => c.column_name.toLowerCase());
      console.log(`Existing columns: [${existingNames.join(', ')}]`);

      // 2. Scan and add missing columns
      for (const col of columns) {
        if (!existingNames.includes(col.name.toLowerCase())) {
          console.log(`⚠️ Missing column: "${col.name}" on table "${tableName}". Attempting to add...`);
          await pool.query(
            `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`
          );
          console.log(`✅ Successfully added column: "${col.name}"`);
        }
      }
    }
    
    console.log('\n🎉 SCHEMA REPAIR COMPLETED SUCCESSFULLY! VPS database is fully stabilized.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Schema repair failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

repairSchema();

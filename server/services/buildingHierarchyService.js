// server/services/buildingHierarchyService.js
// Authoritative single-source floor hierarchy generation and reconciliation
// Governed by timeline_configurations as the sole source of truth across DS16

const { calculateAreaMetrics } = require('./feasibilityEngine');

/**
 * Generate standard building floor hierarchy from Building Configuration
 * @param {Object} config timeline_configurations record
 * @returns {Array<Object>} Canonical list of floor definitions
 */
function generateStandardFloorHierarchy(config = {}) {
  const floorsAboveGround = Math.max(1, parseInt(config.floors_above_ground, 10) || 4);
  const basementCount = Math.max(0, parseInt(config.basement_count, 10) || 0);
  const upperParkingCount = Math.max(0, parseInt(config.upper_parking_count, 10) || 0);

  const groundConfig = config.ground_floor_config || 'parking_and_rooms';
  const isGroundHabitable = groundConfig === 'parking_and_rooms' || groundConfig === 'habitable';

  const floors = [];
  let order = 1;

  // 1. Basements (from deepest to highest basement, e.g. Basement 2, Basement 1)
  for (let b = basementCount; b >= 1; b--) {
    floors.push({
      floor_key: `basement_${b}`,
      floor_name: `Basement ${b}`,
      floor_order: order++,
      floor_type: 'parking',
      usage_type: 'Parking',
      height_meters: 3.00,
      no_of_units: 0,
      is_habitable: false
    });
  }

  // 2. Ground / Stilt floor
  floors.push({
    floor_key: 'ground_floor',
    floor_name: isGroundHabitable ? 'Ground Floor' : 'Stilt Parking',
    floor_order: order++,
    floor_type: isGroundHabitable ? 'habitable' : 'parking',
    usage_type: isGroundHabitable ? 'Residential' : 'Parking',
    height_meters: 3.00,
    no_of_units: isGroundHabitable ? 1 : 0,
    is_habitable: isGroundHabitable
  });

  // 3. Upper Parking / Podiums
  for (let p = 1; p <= upperParkingCount; p++) {
    floors.push({
      floor_key: `upper_parking_${p}`,
      floor_name: `Upper Parking ${p}`,
      floor_order: order++,
      floor_type: 'parking',
      usage_type: 'Parking',
      height_meters: 3.00,
      no_of_units: 0,
      is_habitable: false
    });
  }

  // 4. Habitable Floors Above Ground (Floor 1 to N)
  for (let f = 1; f <= floorsAboveGround; f++) {
    let name = `${f}th Floor`;
    if (f === 1) name = '1st Floor';
    else if (f === 2) name = '2nd Floor';
    else if (f === 3) name = '3rd Floor';

    floors.push({
      floor_key: `floor_${f}`,
      floor_name: name,
      floor_order: order++,
      floor_type: 'habitable',
      usage_type: 'Residential',
      height_meters: 3.00,
      no_of_units: 1,
      is_habitable: true
    });
  }

  // 5. Terrace Floor
  if (config.has_terrace_tank_slab !== false) {
    floors.push({
      floor_key: 'terrace',
      floor_name: 'Terrace Floor',
      floor_order: order++,
      floor_type: 'terrace',
      usage_type: 'Services',
      height_meters: 3.00,
      no_of_units: 0,
      is_habitable: false
    });
  }

  return floors;
}

/**
 * Reconcile project_area_floors against the central Building Configuration
 * Non-destructive: preserves existing floor measurements, overrides, and unit rates
 * @param {Object} client PostgreSQL client (under active transaction or pool)
 * @param {number} projectId Project ID
 * @param {number} userId Current user ID
 * @param {Object} config Timeline/building configuration
 * @returns {Promise<Array>} List of reconciled active floors
 */
async function reconcileBuildingFloors(client, projectId, userId, config) {
  // 1. Ensure project_area_statements exists
  let { rows: [statement] } = await client.query(
    'SELECT * FROM project_area_statements WHERE project_id = $1',
    [projectId]
  );

  if (!statement) {
    const { rows: [proj] } = await client.query('SELECT area_sq_ft FROM projects WHERE id = $1', [projectId]);
    const defaultPlot = parseFloat(proj?.area_sq_ft) ? (parseFloat(proj.area_sq_ft) / 10.764) : 0;
    const { rows: [newStmt] } = await client.query(
      `INSERT INTO project_area_statements 
        (project_id, plot_area_sqm, city_survey_area_sqm, site_area_sqm, dp_deductions_sqm, existing_builtup_area_sqm, dividing_factor, basic_fsi_factor, paid_fsi_factor, tdr_factor, proposed_tdr_factor, building_use, regular_tdr_factor, slum_tdr_factor, is_gunthewari, road_width_m, created_by)
       VALUES ($1, $2, $2, $2, 0, 0, 1.6, 1.1, 0.5, 0.65, 0, 'Residential', 0, 0, false, null, $3)
       RETURNING *`,
      [projectId, Math.round(defaultPlot * 100) / 100, userId]
    );
    statement = newStmt;
  }

  // 2. Fetch existing floors
  const { rows: existingFloors } = await client.query(
    'SELECT * FROM project_area_floors WHERE area_statement_id = $1',
    [statement.id]
  );

  const existingMap = new Map();
  for (const ef of existingFloors) {
    if (ef.floor_key) {
      existingMap.set(ef.floor_key, ef);
    } else {
      // Legacy fallback mapping
      const key = ef.floor_order === 1 ? 'ground_floor' : `floor_${ef.floor_order}`;
      existingMap.set(key, ef);
    }
  }

  // 3. Generate canonical hierarchy
  const canonicalFloors = generateStandardFloorHierarchy(config);
  const activeKeys = new Set();

  for (const cf of canonicalFloors) {
    activeKeys.add(cf.floor_key);
    const existing = existingMap.get(cf.floor_key);

    if (existing) {
      // Update metadata & ordering, preserve measurements
      await client.query(
        `UPDATE project_area_floors
         SET floor_name = $1,
             floor_order = $2,
             floor_type = $3,
             usage_type = COALESCE(usage_type, $4),
             is_active = TRUE,
             floor_key = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [cf.floor_name, cf.floor_order, cf.floor_type, cf.usage_type, cf.floor_key, existing.id]
      );
    } else {
      // Insert new floor row
      await client.query(
        `INSERT INTO project_area_floors
          (area_statement_id, floor_key, floor_name, floor_order, height_meters, pline_area_sqm, lobby_area_sqm, builtup_for_owners_sqm, builtup_for_sale_sqm, usage_type, floor_type, is_active, is_lobby_overridden, is_pline_overridden, no_of_units, rate_per_sqm, cost_for_1_unit)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 0, $6, $7, TRUE, FALSE, FALSE, $8, 0.00, 0.00)`,
        [statement.id, cf.floor_key, cf.floor_name, cf.floor_order, cf.height_meters, cf.usage_type, cf.floor_type, cf.no_of_units]
      );
    }
  }

  // 4. Inactivate floors no longer in building configuration
  for (const ef of existingFloors) {
    if (!activeKeys.has(ef.floor_key)) {
      await client.query(
        'UPDATE project_area_floors SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
        [ef.id]
      );
    }
  }

  // 5. Fetch updated active floors
  const { rows: activeFloors } = await client.query(
    'SELECT * FROM project_area_floors WHERE area_statement_id = $1 AND is_active = TRUE ORDER BY floor_order ASC, id ASC',
    [statement.id]
  );

  return activeFloors;
}

module.exports = {
  generateStandardFloorHierarchy,
  reconcileBuildingFloors
};

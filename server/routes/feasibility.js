// server/routes/feasibility.js
// DS16 Area Statement & Financial Feasibility API

const router = require('express').Router({ mergeParams: true });
const pool = require('../db');
const { authenticate, canViewFinancials } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const { calculateAreaMetrics, calculateFinancialMetrics, ROAD_WIDTH_TDR_MAP } = require('../services/feasibilityEngine');

// Check financial privileges
const requireFeasibilityAccess = (req, res, next) => {
  const user = req.user;
  const isPrivileged = canViewFinancials(user) || user?.role === 'design_head' || user?.role === 'project_head';
  if (!isPrivileged) {
    return res.status(403).json({ error: 'Financial and feasibility information is restricted to authorized roles.' });
  }
  next();
};

const requireFeasibilityEdit = (req, res, next) => {
  const user = req.user;
  const canEdit = user?.role === 'admin' || user?.role === 'back_office' || user?.role === 'accounts' || user?.role === 'design_head' || user?.role === 'project_head';
  if (!canEdit) {
    return res.status(403).json({ error: 'Only authorized management and accounts personnel can modify feasibility data.' });
  }
  next();
};

// 1. GET /api/projects/:projectId/feasibility
// Retrieve complete area statement, floor entries, financial viability, statutory items, salable units and calculations
router.get('/', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Project details
    const { rows: projRows } = await client.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!projRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    // 2. Area statement
    let { rows: [statement] } = await client.query(
      'SELECT * FROM project_area_statements WHERE project_id = $1',
      [projectId]
    );

    if (!statement) {
      // Initialize fresh area statement from project's own registered plot area, or 0 if unconfigured
      const defaultPlotArea = parseFloat(projRows[0].area_sq_ft) ? (parseFloat(projRows[0].area_sq_ft) / 10.764) : 0;
      const { rows: [newStmt] } = await client.query(
        `INSERT INTO project_area_statements 
          (project_id, plot_area_sqm, city_survey_area_sqm, site_area_sqm, dp_deductions_sqm, existing_builtup_area_sqm, dividing_factor, basic_fsi_factor, paid_fsi_factor, tdr_factor, proposed_tdr_factor, building_use, regular_tdr_factor, slum_tdr_factor, is_gunthewari, road_width_m, created_by)
         VALUES ($1, $2, $2, $2, 0, 0, 1.6, 1.1, 0.5, 0.65, 0, 'Residential', 0, 0, false, null, $3)
         RETURNING *`,
        [projectId, Math.round(defaultPlotArea * 100) / 100, req.user.id]
      );
      statement = newStmt;
      // Note: Floor levels are not pre-seeded with sample measurements. Each project starts empty for the architect to enter actual design levels.
    }

    // 3. Fetch floors
    const { rows: floors } = await client.query(
      'SELECT * FROM project_area_floors WHERE area_statement_id = $1 ORDER BY floor_order ASC, id ASC',
      [statement.id]
    );

    // 4. Financial viability
    let { rows: [financial] } = await client.query(
      'SELECT * FROM project_financial_viabilities WHERE project_id = $1',
      [projectId]
    );

    if (!financial) {
      const { rows: [newFin] } = await client.query(
        `INSERT INTO project_financial_viabilities
          (project_id, rr_rate_per_sqm, estimated_cost_a_rate, estimated_cost_b_rate, cost_of_plot_rate_per_sqm, cost_of_construction_rate, basement_rate_per_sqm, rent_tenements, rent_per_tenement_per_month, rent_months, stacked_parking_slots, stacked_parking_cost_per_slot, minor_expenses, bpms_staff_charges, airport_noc, fire_noc, entertainment_charges, period_months, created_by)
         VALUES ($1, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0, 0.00, 0, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, '', $2)
         RETURNING *`,
        [projectId, req.user.id]
      );
      financial = newFin;

      // Seed statutory charge catalog structure (regulatory formula basis without sample amounts)
      const defaultStatutory = [
        { code: 'PLAN_REGISTRATION', name: 'PLAN REGISTRATION FEES', basis: 'fixed_rate_per_sqm', mult: 5.90, rr_pct: null },
        { code: 'SECURITY_DEPOSIT', name: 'SECURITY DEPOSIT (MAX RS 75,000.00)', basis: 'pct_of_cost_a', mult: 0.01, cap: 75000.00, rr_pct: null },
        { code: 'STACKING_CHARGES', name: 'STACKING CHARGES (MAX RS 50,000.00)', basis: 'pct_of_cost_a', mult: 0.005, cap: 50000.00, rr_pct: null },
        { code: 'ANCILLARY_CHARGES', name: 'ANCILLARY AREA CHARGES', basis: 'pct_of_rr', mult: 0.10, rr_pct: 10.00 },
        { code: 'SEWER_CONNECTION', name: 'SEWER CONNECTION CHARGES', basis: 'fixed_rate_per_sqm', mult: 2.50, rr_pct: null },
        { code: 'DEVELOPMENT_CHARGES', name: 'DEVELOPMENT CHARGES', basis: 'pct_of_rr', mult: 0.02, rr_pct: 2.00 },
        { code: 'PREMIUM_FSI', name: 'PREMIUM FSI CHARGES', basis: 'pct_of_rr', mult: 0.40, rr_pct: 40.00 },
        { code: 'TREE_PLANTATION', name: 'TREE PLANTATION (RS 500 / 74.32 SQM)', basis: 'custom', mult: 500.00, cap: 25000.00, rr_pct: null },
        { code: 'HERITAGE_FUND', name: 'HERITAGE FUND (2% OF DEV CHARGES)', basis: 'pct_of_dev', mult: 0.02, rr_pct: null },
        { code: 'LABOUR_WELFARE_CESS', name: 'LABOUR WELFARE CESS (1% OF RR CONST)', basis: 'pct_of_rr_cost_b', mult: 0.01, rr_pct: null },
        { code: 'TDR_LOADING_CHARGES', name: 'TDR LOADING CHARGES', basis: 'pct_of_rr', mult: 0.03, rr_pct: 3.00 },
        { code: 'LABOUR_WELFARE_PARKING', name: 'LABOUR WELFARE ON PARKING AREA', basis: 'pct_of_parking_cost', mult: 0.01, rr_pct: null }
      ];

      for (let idx = 0; idx < defaultStatutory.length; idx++) {
        const item = defaultStatutory[idx];
        await client.query(
          `INSERT INTO project_statutory_charges
            (financial_viability_id, charge_code, charge_name, calculation_basis, rate_multiplier, max_cap, rr_percentage, order_index, is_enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [financial.id, item.code, item.name, item.basis, item.mult, item.cap || null, item.rr_pct, idx + 1]
        );
      }
      // Note: Salable unit inventory is not pre-seeded with sample units. Starts empty for the user to configure.
    }

    // 5. Fetch statutory charges & salable units (excluding soft-deleted charges)
    const { rows: statutoryCharges } = await client.query(
      'SELECT * FROM project_statutory_charges WHERE financial_viability_id = $1 AND is_deleted = FALSE ORDER BY order_index ASC, id ASC',
      [financial.id]
    );

    const { rows: salableUnits } = await client.query(
      'SELECT * FROM project_salable_units WHERE financial_viability_id = $1 ORDER BY order_index ASC, id ASC',
      [financial.id]
    );

    await client.query('COMMIT');

    // 6. Execute authoritative calculation engine
    const areaMetrics = calculateAreaMetrics(statement, floors);
    const financialMetrics = calculateFinancialMetrics(financial, statutoryCharges, salableUnits, areaMetrics);

    res.json({
      project: projRows[0],
      statement,
      floors: areaMetrics.evaluatedFloors,
      financial,
      statutoryCharges: financialMetrics.evaluatedStatutoryCharges,
      salableUnits: financialMetrics.evaluatedSalableUnits,
      areaMetrics,
      financialMetrics
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error fetching feasibility data:', err);
    res.status(500).json({ error: 'Failed to fetch project feasibility statement' });
  } finally {
    client.release();
  }
});

// 2. PUT /api/projects/:projectId/feasibility/area
// Update area statement parameters
router.put('/area', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const {
    plot_area_sqm,
    city_survey_area_sqm,
    site_area_sqm,
    dp_deductions_sqm,
    existing_builtup_area_sqm,
    margin_meters,
    dividing_factor,
    basic_fsi_factor,
    paid_fsi_factor,
    tdr_factor,
    proposed_tdr_factor,
    regular_tdr_factor,
    slum_tdr_factor,
    is_gunthewari,
    road_width_m,
    building_use,
    ancillary_commercial_pct,
    ancillary_residential_pct,
    unit_display
  } = req.body;

  // Strict Road-Width Validation Rule (REQ-K)
  const validRoadWidths = [9, 12, 15, 18, 24];
  if (road_width_m !== undefined && road_width_m !== null && road_width_m !== '') {
    const parsedWidth = parseFloat(road_width_m);
    if (!validRoadWidths.includes(parsedWidth)) {
      return res.status(400).json({ error: 'Invalid road width. Supported road widths are strictly 9m, 12m, 15m, 18m, or 24m.' });
    }
  }

  try {
    const { rows: [existing] } = await pool.query('SELECT * FROM project_area_statements WHERE project_id = $1', [projectId]);

    const parsedWidth = road_width_m !== undefined ? (road_width_m === null || road_width_m === '' ? null : parseFloat(road_width_m)) : (existing?.road_width_m ?? null);
    const gunthFlag = is_gunthewari !== undefined ? Boolean(is_gunthewari) : Boolean(existing?.is_gunthewari);

    let resolvedRegularTdr = regular_tdr_factor !== undefined ? (regular_tdr_factor === null || regular_tdr_factor === '' ? null : parseFloat(regular_tdr_factor)) : null;
    let resolvedSlumTdr = slum_tdr_factor !== undefined ? (slum_tdr_factor === null || slum_tdr_factor === '' ? null : parseFloat(slum_tdr_factor)) : null;

    if (parsedWidth && ROAD_WIDTH_TDR_MAP[parsedWidth]) {
      resolvedRegularTdr = ROAD_WIDTH_TDR_MAP[parsedWidth].regular;
      resolvedSlumTdr = ROAD_WIDTH_TDR_MAP[parsedWidth].slum;
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE project_area_statements SET
        plot_area_sqm = COALESCE($1, plot_area_sqm),
        city_survey_area_sqm = COALESCE($2, city_survey_area_sqm),
        site_area_sqm = COALESCE($3, site_area_sqm),
        dp_deductions_sqm = COALESCE($4, dp_deductions_sqm),
        existing_builtup_area_sqm = COALESCE($5, existing_builtup_area_sqm),
        margin_meters = COALESCE($6, margin_meters),
        dividing_factor = COALESCE($7, dividing_factor),
        basic_fsi_factor = COALESCE($8, basic_fsi_factor),
        paid_fsi_factor = COALESCE($9, paid_fsi_factor),
        tdr_factor = COALESCE($10, tdr_factor),
        proposed_tdr_factor = COALESCE($11, proposed_tdr_factor),
        regular_tdr_factor = COALESCE($12, regular_tdr_factor),
        slum_tdr_factor = COALESCE($13, slum_tdr_factor),
        is_gunthewari = COALESCE($14, is_gunthewari),
        road_width_m = $15,
        building_use = COALESCE($16, building_use),
        ancillary_commercial_pct = COALESCE($17, ancillary_commercial_pct),
        ancillary_residential_pct = COALESCE($18, ancillary_residential_pct),
        unit_display = COALESCE($19, unit_display),
        updated_at = NOW()
       WHERE project_id = $20
       RETURNING *`,
      [
        plot_area_sqm !== undefined ? parseFloat(plot_area_sqm) : null,
        city_survey_area_sqm !== undefined ? parseFloat(city_survey_area_sqm) : null,
        site_area_sqm !== undefined ? parseFloat(site_area_sqm) : null,
        dp_deductions_sqm !== undefined ? parseFloat(dp_deductions_sqm) : null,
        existing_builtup_area_sqm !== undefined ? parseFloat(existing_builtup_area_sqm) : null,
        margin_meters !== undefined ? parseFloat(margin_meters) : null,
        dividing_factor !== undefined ? parseFloat(dividing_factor) : null,
        basic_fsi_factor !== undefined ? parseFloat(basic_fsi_factor) : null,
        paid_fsi_factor !== undefined ? parseFloat(paid_fsi_factor) : null,
        tdr_factor !== undefined ? parseFloat(tdr_factor) : null,
        proposed_tdr_factor !== undefined ? parseFloat(proposed_tdr_factor) : null,
        resolvedRegularTdr,
        resolvedSlumTdr,
        is_gunthewari !== undefined ? Boolean(is_gunthewari) : null,
        parsedWidth,
        building_use ? building_use.trim() : null,
        ancillary_commercial_pct !== undefined ? parseFloat(ancillary_commercial_pct) : null,
        ancillary_residential_pct !== undefined ? parseFloat(ancillary_residential_pct) : null,
        unit_display || null,
        projectId
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_AREA_STATEMENT', 'area', 'project_area_statements', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing || {}), JSON.stringify(updated)]
    );

    res.json({ statement: updated, message: 'Area statement updated successfully' });
  } catch (err) {
    console.error('Error updating area statement:', err);
    res.status(500).json({ error: 'Failed to update area statement' });
  }
});

// 3. POST /api/projects/:projectId/feasibility/area/floors
// Add dynamic floor row
router.post('/area/floors', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const {
    floor_name,
    floor_order,
    height_meters,
    pline_area_sqm,
    lobby_area_sqm,
    is_lobby_overridden,
    builtup_for_owners_sqm,
    builtup_for_sale_sqm,
    usage_type,
    floor_type,
    no_of_units,
    rate_per_sqm,
    cost_for_1_unit,
    remarks
  } = req.body;

  try {
    let { rows: [stmt] } = await pool.query('SELECT id FROM project_area_statements WHERE project_id = $1', [projectId]);
    
    // Auto-initialize statement if missing (Self-healing)
    if (!stmt) {
      const { rows: projRows } = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      if (!projRows[0]) return res.status(404).json({ error: 'Project not found' });
      const defaultPlotArea = parseFloat(projRows[0].area_sq_ft) ? (parseFloat(projRows[0].area_sq_ft) / 10.764) : 0;
      const { rows: [newStmt] } = await pool.query(
        `INSERT INTO project_area_statements 
          (project_id, plot_area_sqm, city_survey_area_sqm, site_area_sqm, dp_deductions_sqm, existing_builtup_area_sqm, dividing_factor, basic_fsi_factor, paid_fsi_factor, tdr_factor, proposed_tdr_factor, building_use, regular_tdr_factor, slum_tdr_factor, is_gunthewari, road_width_m, created_by)
         VALUES ($1, $2, $2, $2, 0, 0, 1.6, 1.1, 0.5, 0.65, 0, 'Residential', 0, 0, false, null, $3)
         RETURNING *`,
        [projectId, Math.round(defaultPlotArea * 100) / 100, req.user.id]
      );
      stmt = newStmt;
    }

    const { rows: [maxOrder] } = await pool.query(
      'SELECT COALESCE(MAX(floor_order), 0) + 1 as next_order FROM project_area_floors WHERE area_statement_id = $1',
      [stmt.id]
    );

    const nextOrder = maxOrder ? parseInt(maxOrder.next_order, 10) : 1;
    let defaultFloorName = `Floor ${nextOrder}`;
    if (nextOrder === 1) defaultFloorName = 'Ground Floor';
    else if (nextOrder === 2) defaultFloorName = '1st Floor';
    else if (nextOrder === 3) defaultFloorName = '2nd Floor';
    else if (nextOrder === 4) defaultFloorName = '3rd Floor';
    else defaultFloorName = `${nextOrder - 1}th Floor`;

    const pline = parseFloat(pline_area_sqm) || 0;
    const isOverride = Boolean(is_lobby_overridden);
    const lobby = isOverride
      ? (parseFloat(lobby_area_sqm) || 0)
      : Math.round(pline * 0.15 * 100) / 100;

    const units = no_of_units !== undefined ? Math.max(0, parseInt(no_of_units, 10) || 0) : 1;
    const sale = parseFloat(builtup_for_sale_sqm) || 0;
    const areaFor1Unit = units > 0 ? Math.round((sale / units) * 10000) / 10000 : 0;
    const rate = parseFloat(rate_per_sqm) || 0;
    const computedCost1Unit = units > 0 && rate > 0
      ? Math.round(areaFor1Unit * rate * 100) / 100
      : (parseFloat(cost_for_1_unit) || 0);

    const { rows: [newFloor] } = await pool.query(
      `INSERT INTO project_area_floors
        (area_statement_id, floor_name, floor_order, height_meters, pline_area_sqm, lobby_area_sqm, is_lobby_overridden, builtup_for_owners_sqm, builtup_for_sale_sqm, usage_type, floor_type, no_of_units, area_for_1_unit, rate_per_sqm, cost_for_1_unit, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        stmt.id,
        (floor_name ? floor_name.trim() : defaultFloorName),
        floor_order || nextOrder,
        parseFloat(height_meters) || 2.85,
        pline,
        lobby,
        isOverride,
        builtup_for_owners_sqm !== undefined ? parseFloat(builtup_for_owners_sqm) : null,
        sale,
        usage_type || 'Residential',
        floor_type || 'habitable',
        units,
        areaFor1Unit,
        rate,
        computedCost1Unit,
        remarks || null
      ]
    );

    res.status(201).json({ floor: newFloor, message: 'Floor added successfully' });
  } catch (err) {
    console.error('Error adding floor row:', err);
    res.status(500).json({ error: 'Failed to add floor row' });
  }
});

// 4. PUT /api/projects/:projectId/feasibility/area/floors/:floorId
// Update floor row
router.put('/area/floors/:floorId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const floorId = parseInt(req.params.floorId, 10);
  const {
    floor_name,
    floor_order,
    height_meters,
    pline_area_sqm,
    lobby_area_sqm,
    is_lobby_overridden,
    builtup_for_owners_sqm,
    builtup_for_sale_sqm,
    usage_type,
    floor_type,
    no_of_units,
    rate_per_sqm,
    cost_for_1_unit,
    remarks
  } = req.body;

  try {
    const { rows: [existing] } = await pool.query(
      `SELECT * FROM project_area_floors WHERE id = $1 AND area_statement_id = (SELECT id FROM project_area_statements WHERE project_id = $2)`,
      [floorId, projectId]
    );
    if (!existing) return res.status(404).json({ error: 'Floor record not found' });

    const pline = pline_area_sqm !== undefined ? parseFloat(pline_area_sqm) : parseFloat(existing.pline_area_sqm) || 0;
    const isOverride = is_lobby_overridden !== undefined ? Boolean(is_lobby_overridden) : Boolean(existing.is_lobby_overridden);
    
    // Auto-compute lobby if not overridden
    let lobby = existing.lobby_area_sqm;
    if (isOverride) {
      if (lobby_area_sqm !== undefined) lobby = parseFloat(lobby_area_sqm) || 0;
    } else {
      lobby = Math.round(pline * 0.15 * 100) / 100;
    }

    const sale = builtup_for_sale_sqm !== undefined ? (parseFloat(builtup_for_sale_sqm) || 0) : (parseFloat(existing.builtup_for_sale_sqm) || 0);
    const units = no_of_units !== undefined ? Math.max(0, parseInt(no_of_units, 10) || 0) : (parseInt(existing.no_of_units, 10) || 1);
    const areaFor1Unit = units > 0 ? Math.round((sale / units) * 10000) / 10000 : 0;
    const rate = rate_per_sqm !== undefined ? (parseFloat(rate_per_sqm) || 0) : (parseFloat(existing.rate_per_sqm) || 0);
    const computedCost1Unit = units > 0 && rate > 0
      ? Math.round(areaFor1Unit * rate * 100) / 100
      : (cost_for_1_unit !== undefined ? (parseFloat(cost_for_1_unit) || 0) : (parseFloat(existing.cost_for_1_unit) || 0));

    const { rows: [updatedFloor] } = await pool.query(
      `UPDATE project_area_floors SET
        floor_name = COALESCE($1, floor_name),
        floor_order = COALESCE($2, floor_order),
        height_meters = COALESCE($3, height_meters),
        pline_area_sqm = $4,
        lobby_area_sqm = $5,
        is_lobby_overridden = $6,
        builtup_for_owners_sqm = $7,
        builtup_for_sale_sqm = $8,
        usage_type = COALESCE($9, usage_type),
        floor_type = COALESCE($10, floor_type),
        no_of_units = $11,
        area_for_1_unit = $12,
        rate_per_sqm = $13,
        cost_for_1_unit = $14,
        remarks = COALESCE($15, remarks),
        updated_at = NOW()
       WHERE id = $16 AND area_statement_id = (SELECT id FROM project_area_statements WHERE project_id = $17)
       RETURNING *`,
      [
        floor_name ? floor_name.trim() : null,
        floor_order !== undefined ? parseInt(floor_order, 10) : null,
        height_meters !== undefined ? parseFloat(height_meters) : null,
        pline,
        lobby,
        isOverride,
        builtup_for_owners_sqm !== undefined ? parseFloat(builtup_for_owners_sqm) : null,
        sale,
        usage_type || null,
        floor_type || null,
        units,
        areaFor1Unit,
        rate,
        computedCost1Unit,
        remarks !== undefined ? remarks : null,
        floorId,
        projectId
      ]
    );

    res.json({ floor: updatedFloor, message: 'Floor updated successfully' });
  } catch (err) {
    console.error('Error updating floor:', err);
    res.status(500).json({ error: 'Failed to update floor' });
  }
});

// 5. DELETE /api/projects/:projectId/feasibility/area/floors/:floorId
// Remove floor row
router.delete('/area/floors/:floorId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const floorId = parseInt(req.params.floorId, 10);

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM project_area_floors 
       WHERE id = $1 AND area_statement_id = (SELECT id FROM project_area_statements WHERE project_id = $2)`,
      [floorId, projectId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Floor not found' });
    res.json({ message: 'Floor deleted successfully' });
  } catch (err) {
    console.error('Error deleting floor:', err);
    res.status(500).json({ error: 'Failed to delete floor row' });
  }
});

// 6. PUT /api/projects/:projectId/feasibility/financial
// Update financial inputs (RR rates, development costs, parking, rent, etc.)
router.put('/financial', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const {
    rr_rate_per_sqm,
    estimated_cost_a_rate,
    estimated_cost_b_rate,
    cost_of_plot,
    cost_of_plot_rate_per_sqm,
    cost_of_construction_rate,
    cost_of_infrastructure,
    cost_of_basement,
    basement_area_sqm,
    basement_rate_per_sqm,
    interest_amount,
    rent_amount,
    rent_tenements,
    rent_per_tenement_per_month,
    rent_months,
    stacked_parking_cost,
    stacked_parking_slots,
    stacked_parking_cost_per_slot,
    minor_expenses,
    bpms_staff_charges,
    airport_noc,
    fire_noc,
    entertainment_charges,
    extra_stamp_duty,
    advocate_fees,
    period_months,
    notes
  } = req.body;

  try {
    const { rows: [existing] } = await pool.query('SELECT * FROM project_financial_viabilities WHERE project_id = $1', [projectId]);

    const { rows: [updated] } = await pool.query(
      `UPDATE project_financial_viabilities SET
        rr_rate_per_sqm = COALESCE($1, rr_rate_per_sqm),
        estimated_cost_a_rate = COALESCE($2, estimated_cost_a_rate),
        estimated_cost_b_rate = COALESCE($3, estimated_cost_b_rate),
        cost_of_plot = COALESCE($4, cost_of_plot),
        cost_of_plot_rate_per_sqm = COALESCE($5, cost_of_plot_rate_per_sqm),
        cost_of_construction_rate = COALESCE($6, cost_of_construction_rate),
        cost_of_infrastructure = COALESCE($7, cost_of_infrastructure),
        cost_of_basement = COALESCE($8, cost_of_basement),
        basement_area_sqm = COALESCE($9, basement_area_sqm),
        basement_rate_per_sqm = COALESCE($10, basement_rate_per_sqm),
        interest_amount = COALESCE($11, interest_amount),
        rent_amount = COALESCE($12, rent_amount),
        rent_tenements = COALESCE($13, rent_tenements),
        rent_per_tenement_per_month = COALESCE($14, rent_per_tenement_per_month),
        rent_months = COALESCE($15, rent_months),
        stacked_parking_cost = COALESCE($16, stacked_parking_cost),
        stacked_parking_slots = COALESCE($17, stacked_parking_slots),
        stacked_parking_cost_per_slot = COALESCE($18, stacked_parking_cost_per_slot),
        minor_expenses = COALESCE($19, minor_expenses),
        bpms_staff_charges = COALESCE($20, bpms_staff_charges),
        airport_noc = COALESCE($21, airport_noc),
        fire_noc = COALESCE($22, fire_noc),
        entertainment_charges = COALESCE($23, entertainment_charges),
        extra_stamp_duty = COALESCE($24, extra_stamp_duty),
        advocate_fees = COALESCE($25, advocate_fees),
        period_months = COALESCE($26, period_months),
        notes = COALESCE($27, notes),
        updated_at = NOW()
       WHERE project_id = $28
       RETURNING *`,
      [
        rr_rate_per_sqm !== undefined ? parseFloat(rr_rate_per_sqm) : null,
        estimated_cost_a_rate !== undefined ? parseFloat(estimated_cost_a_rate) : null,
        estimated_cost_b_rate !== undefined ? parseFloat(estimated_cost_b_rate) : null,
        cost_of_plot !== undefined ? parseFloat(cost_of_plot) : null,
        cost_of_plot_rate_per_sqm !== undefined ? parseFloat(cost_of_plot_rate_per_sqm) : null,
        cost_of_construction_rate !== undefined ? parseFloat(cost_of_construction_rate) : null,
        cost_of_infrastructure !== undefined ? parseFloat(cost_of_infrastructure) : null,
        cost_of_basement !== undefined ? parseFloat(cost_of_basement) : null,
        basement_area_sqm !== undefined ? parseFloat(basement_area_sqm) : null,
        basement_rate_per_sqm !== undefined ? parseFloat(basement_rate_per_sqm) : null,
        interest_amount !== undefined ? parseFloat(interest_amount) : null,
        rent_amount !== undefined ? parseFloat(rent_amount) : null,
        rent_tenements !== undefined ? parseInt(rent_tenements, 10) : null,
        rent_per_tenement_per_month !== undefined ? parseFloat(rent_per_tenement_per_month) : null,
        rent_months !== undefined ? parseInt(rent_months, 10) : null,
        stacked_parking_cost !== undefined ? parseFloat(stacked_parking_cost) : null,
        stacked_parking_slots !== undefined ? parseInt(stacked_parking_slots, 10) : null,
        stacked_parking_cost_per_slot !== undefined ? parseFloat(stacked_parking_cost_per_slot) : null,
        minor_expenses !== undefined ? parseFloat(minor_expenses) : null,
        bpms_staff_charges !== undefined ? parseFloat(bpms_staff_charges) : null,
        airport_noc !== undefined ? parseFloat(airport_noc) : null,
        fire_noc !== undefined ? parseFloat(fire_noc) : null,
        entertainment_charges !== undefined ? parseFloat(entertainment_charges) : null,
        extra_stamp_duty !== undefined ? parseFloat(extra_stamp_duty) : null,
        advocate_fees !== undefined ? parseFloat(advocate_fees) : null,
        period_months || null,
        notes !== undefined ? notes : null,
        projectId
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_FINANCIAL_VIABILITY', 'financial', 'project_financial_viabilities', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing || {}), JSON.stringify(updated)]
    );

    res.json({ financial: updated, message: 'Financial viability parameters updated successfully' });
  } catch (err) {
    console.error('Error updating financial viability:', err);
    res.status(500).json({ error: 'Failed to update financial viability parameters' });
  }
});

// 7. POST /api/projects/:projectId/feasibility/financial/salable-units
// Add salable unit row
router.post('/financial/salable-units', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { unit_name, carpet_area_sqm, super_buildup_loading_sqft, unit_count, rate_per_sqft } = req.body;

  try {
    const { rows: [fin] } = await pool.query('SELECT id FROM project_financial_viabilities WHERE project_id = $1', [projectId]);
    if (!fin) return res.status(404).json({ error: 'Financial viability record not found' });

    const carpetSqm = parseFloat(carpet_area_sqm) || 0;
    const carpetSqft = carpetSqm * 10.764;
    const loadingSqft = parseFloat(super_buildup_loading_sqft) || 300.00;
    const superSqft = carpetSqft + loadingSqft;
    const units = parseInt(unit_count, 10) || 1;
    const rateSqft = parseFloat(rate_per_sqft) || 6000.00;
    const unitPrice = superSqft * rateSqft;
    const totalAmount = unitPrice * units;

    const { rows: [maxOrder] } = await pool.query(
      'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM project_salable_units WHERE financial_viability_id = $1',
      [fin.id]
    );

    const { rows: [newUnit] } = await pool.query(
      `INSERT INTO project_salable_units
        (financial_viability_id, unit_name, carpet_area_sqm, carpet_area_sqft, super_buildup_area_sqft, super_buildup_loading_sqft, unit_count, rate_per_sqft, unit_price, total_amount, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        fin.id,
        (unit_name || 'Salable Unit').trim(),
        carpetSqm,
        carpetSqft,
        superSqft,
        loadingSqft,
        units,
        rateSqft,
        unitPrice,
        totalAmount,
        maxOrder.next_order
      ]
    );

    res.status(201).json({ unit: newUnit, message: 'Salable unit added successfully' });
  } catch (err) {
    console.error('Error adding salable unit:', err);
    res.status(500).json({ error: 'Failed to add salable unit' });
  }
});

// 8. PUT /api/projects/:projectId/feasibility/financial/salable-units/:unitId
// Update salable unit row
router.put('/financial/salable-units/:unitId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const unitId = parseInt(req.params.unitId, 10);
  const { unit_name, carpet_area_sqm, super_buildup_loading_sqft, unit_count, rate_per_sqft } = req.body;

  try {
    const carpetSqm = parseFloat(carpet_area_sqm) || 0;
    const carpetSqft = carpetSqm * 10.764;
    const loadingSqft = parseFloat(super_buildup_loading_sqft) || 300.00;
    const superSqft = carpetSqft + loadingSqft;
    const units = parseInt(unit_count, 10) || 1;
    const rateSqft = parseFloat(rate_per_sqft) || 6000.00;
    const unitPrice = superSqft * rateSqft;
    const totalAmount = unitPrice * units;

    const { rows: [updatedUnit] } = await pool.query(
      `UPDATE project_salable_units SET
        unit_name = COALESCE($1, unit_name),
        carpet_area_sqm = $2,
        carpet_area_sqft = $3,
        super_buildup_area_sqft = $4,
        super_buildup_loading_sqft = $5,
        unit_count = $6,
        rate_per_sqft = $7,
        unit_price = $8,
        total_amount = $9
       WHERE id = $10 AND financial_viability_id = (SELECT id FROM project_financial_viabilities WHERE project_id = $11)
       RETURNING *`,
      [
        unit_name ? unit_name.trim() : null,
        carpetSqm,
        carpetSqft,
        superSqft,
        loadingSqft,
        units,
        rateSqft,
        unitPrice,
        totalAmount,
        unitId,
        projectId
      ]
    );

    if (!updatedUnit) return res.status(404).json({ error: 'Salable unit not found' });
    res.json({ unit: updatedUnit, message: 'Salable unit updated successfully' });
  } catch (err) {
    console.error('Error updating salable unit:', err);
    res.status(500).json({ error: 'Failed to update salable unit' });
  }
});

// 9. DELETE /api/projects/:projectId/feasibility/financial/salable-units/:unitId
// Remove salable unit row
router.delete('/financial/salable-units/:unitId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const unitId = parseInt(req.params.unitId, 10);

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM project_salable_units 
       WHERE id = $1 AND financial_viability_id = (SELECT id FROM project_financial_viabilities WHERE project_id = $2)`,
      [unitId, projectId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Salable unit not found' });
    res.json({ message: 'Salable unit deleted successfully' });
  } catch (err) {
    console.error('Error deleting salable unit:', err);
    res.status(500).json({ error: 'Failed to delete salable unit' });
  }
});

// 10. PATCH /api/projects/:projectId/feasibility/statutory/:chargeId
// Update statutory charge enable/disable toggle, configurable RR percentage, or custom amount
router.patch('/statutory/:chargeId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const chargeId = parseInt(req.params.chargeId, 10);
  const { is_enabled, rr_percentage, amount, is_custom, charge_name } = req.body;

  try {
    const { rows: [existing] } = await pool.query(
      `SELECT c.* FROM project_statutory_charges c
       JOIN project_financial_viabilities f ON f.id = c.financial_viability_id
       WHERE c.id = $1 AND f.project_id = $2`,
      [chargeId, projectId]
    );

    if (!existing) return res.status(404).json({ error: 'Statutory charge not found' });

    const { rows: [updated] } = await pool.query(
      `UPDATE project_statutory_charges SET
        is_enabled = COALESCE($1, is_enabled),
        rr_percentage = CASE WHEN $2::numeric IS NOT NULL THEN $2::numeric ELSE rr_percentage END,
        amount = COALESCE($3, amount),
        is_custom = COALESCE($4, is_custom),
        charge_name = COALESCE($5, charge_name)
       WHERE id = $6
       RETURNING *`,
      [
        is_enabled !== undefined ? Boolean(is_enabled) : null,
        rr_percentage !== undefined ? (rr_percentage === null || rr_percentage === '' ? null : parseFloat(rr_percentage)) : null,
        amount !== undefined ? parseFloat(amount) : null,
        is_custom !== undefined ? Boolean(is_custom) : null,
        charge_name ? charge_name.trim() : null,
        chargeId
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_STATUTORY_CHARGE', 'financial', 'project_statutory_charges', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing), JSON.stringify(updated)]
    );

    res.json({ charge: updated, message: 'Statutory charge updated successfully' });
  } catch (err) {
    console.error('Error updating statutory charge:', err);
    res.status(500).json({ error: 'Failed to update statutory charge' });
  }
});

// 11. DELETE /api/projects/:projectId/feasibility/statutory/:chargeId
// Soft-delete / Archive statutory charge preserving historical snapshots and audit trail (REQ-C confirmed)
router.delete('/statutory/:chargeId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const chargeId = parseInt(req.params.chargeId, 10);

  try {
    const { rows: [existing] } = await pool.query(
      `SELECT c.* FROM project_statutory_charges c
       JOIN project_financial_viabilities f ON f.id = c.financial_viability_id
       WHERE c.id = $1 AND f.project_id = $2`,
      [chargeId, projectId]
    );

    if (!existing) return res.status(404).json({ error: 'Statutory charge not found' });

    // Perform soft-deletion
    const { rows: [archived] } = await pool.query(
      `UPDATE project_statutory_charges SET
        is_deleted = TRUE,
        is_enabled = FALSE,
        deleted_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [chargeId]
    );

    // Audit log
    await pool.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'ARCHIVE_STATUTORY_CHARGE', 'financial', 'project_statutory_charges', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing), JSON.stringify(archived)]
    );

    res.json({ charge: archived, message: 'Statutory charge archived successfully' });
  } catch (err) {
    console.error('Error archiving statutory charge:', err);
    res.status(500).json({ error: 'Failed to archive statutory charge' });
  }
});

// 12. POST /api/projects/:projectId/feasibility/financial/snapshots
// Save an immutable calculation snapshot
router.post('/snapshots', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { snapshot_name, area_data_snapshot, financial_data_snapshot } = req.body;

  try {
    const { rows: [maxVer] } = await pool.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_ver FROM project_feasibility_snapshots WHERE project_id = $1',
      [projectId]
    );

    const { rows: [snapshot] } = await pool.query(
      `INSERT INTO project_feasibility_snapshots
        (project_id, version_number, snapshot_name, area_data_snapshot, financial_data_snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        projectId,
        maxVer.next_ver,
        (snapshot_name || `Feasibility Snapshot v${maxVer.next_ver}`).trim(),
        JSON.stringify(area_data_snapshot || {}),
        JSON.stringify(financial_data_snapshot || {}),
        req.user.id
      ]
    );

    res.status(201).json({ snapshot, message: 'Feasibility snapshot created successfully' });
  } catch (err) {
    console.error('Error creating snapshot:', err);
    res.status(500).json({ error: 'Failed to create feasibility snapshot' });
  }
});

// 11. GET /api/projects/:projectId/feasibility/snapshots
// Retrieve list of snapshots
router.get('/snapshots', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.version_number, s.snapshot_name, s.created_at, u.name as created_by_name
       FROM project_feasibility_snapshots s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.project_id = $1
       ORDER BY s.version_number DESC`,
      [projectId]
    );
    res.json({ snapshots: rows });
  } catch (err) {
    console.error('Error listing snapshots:', err);
    res.status(500).json({ error: 'Failed to list feasibility snapshots' });
  }
});

// 12. GET /api/projects/:projectId/feasibility/export
// Export complete area & financial feasibility document in standardized print/export format
router.get('/export', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const { rows: [project] } = await pool.query('SELECT id, name, area_sq_ft, type, status FROM projects WHERE id = $1', [projectId]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { rows: [statement] } = await pool.query('SELECT * FROM project_area_statements WHERE project_id = $1', [projectId]);
    const { rows: floors } = statement 
      ? await pool.query('SELECT * FROM project_area_floors WHERE area_statement_id = $1 ORDER BY floor_order ASC', [statement.id])
      : { rows: [] };

    const { rows: [financial] } = await pool.query('SELECT * FROM project_financial_viabilities WHERE project_id = $1', [projectId]);
    const { rows: statutory } = financial
      ? await pool.query('SELECT * FROM project_statutory_charges WHERE financial_viability_id = $1 AND is_deleted = FALSE ORDER BY order_index ASC', [financial.id])
      : { rows: [] };
    const { rows: salable } = financial
      ? await pool.query('SELECT * FROM project_salable_units WHERE financial_viability_id = $1 ORDER BY order_index ASC', [financial.id])
      : { rows: [] };

    const areaMetrics = statement ? calculateAreaMetrics(statement, floors) : {};
    const financialMetrics = financial ? calculateFinancialMetrics(financial, statutory, salable, areaMetrics) : {};

    const exportDocument = {
      project_id: projectId,
      project_name: project.name,
      exported_at: new Date().toISOString(),
      exported_by: req.user.name,
      document_title: 'AREA STATEMENT & FINANCIAL VIABILITY REPORT',
      area_statement: {
        inputs: statement,
        floors: areaMetrics.evaluatedFloors || floors,
        summary: {
          plotable_area_sqm: areaMetrics.plotableAreaSqm,
          permissible_fsi_sqm: areaMetrics.permissibleFsiSqm,
          paid_fsi_sqm: areaMetrics.permissiblePaidFsiSqm,
          tdr_sqm: areaMetrics.permissibleTdrSqm,
          total_proposed_pline_sqm: areaMetrics.totalProposedPlineSqm,
          total_owners_area_sqm: areaMetrics.totalBuiltupForOwnersSqm,
          total_salable_area_sqm: areaMetrics.totalBuiltupForSaleSqm,
          net_balance_sqm: areaMetrics.areaBalanceSqm
        }
      },
      financial_viability: {
        inputs: financial,
        statutory_demand_section_a: {
          items: financialMetrics.evaluatedStatutoryCharges,
          total_amount: financialMetrics.totalStatutoryDemandA
        },
        development_costs: {
          cost_of_tdr: financialMetrics.costOfTdrB,
          minor_and_noc_expenses: financialMetrics.totalExpensesC,
          civil_construction: financialMetrics.costOfConstructionD,
          basement_construction: financialMetrics.costOfBasementE,
          tenant_rent: financialMetrics.rentAmountF,
          stacked_parking: financialMetrics.stackedParkingCostG,
          plot_cost: financialMetrics.costOfPlotH,
          total_development_cost: financialMetrics.totalProjectCost
        },
        salable_inventory_receipts: {
          units: financialMetrics.evaluatedSalableUnits,
          gross_receipts: financialMetrics.totalReceipts
        },
        viability_summary: {
          total_cost: financialMetrics.totalProjectCost,
          total_receipts: financialMetrics.totalReceipts,
          projected_net_profit: financialMetrics.netProfit,
          profit_margin_pct: financialMetrics.profitMarginPct
        }
      }
    };

    res.json(exportDocument);
  } catch (err) {
    console.error('Error generating feasibility export:', err);
    res.status(500).json({ error: 'Failed to generate feasibility export document' });
  }
});

module.exports = router;

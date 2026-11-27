// server/routes/feasibility.js
// DS16 Area Statement & Financial Feasibility API

const router = require('express').Router({ mergeParams: true });
const pool = require('../db');
const { authenticate, canViewFinancials } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const { calculateAreaMetrics, calculateFinancialMetrics, ROAD_WIDTH_TDR_MAP, ROAD_WIDTH_TOTAL_TDR_MAP, deriveTdrSplit } = require('../services/feasibilityEngine');
const { reconcileBuildingFloors } = require('../services/buildingHierarchyService');

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

// Authoritative engine recalculation helper for mutations
async function getRecalculatedFeasibility(clientOrPool, projectId) {
  const { rows: [statement] } = await clientOrPool.query(
    'SELECT * FROM project_area_statements WHERE project_id = $1',
    [projectId]
  );
  if (!statement) return null;
  const { rows: floors } = await clientOrPool.query(
    'SELECT * FROM project_area_floors WHERE area_statement_id = $1 AND is_active = TRUE ORDER BY floor_order ASC, id ASC',
    [statement.id]
  );
  const { rows: [financial] } = await clientOrPool.query(
    'SELECT * FROM project_financial_viabilities WHERE project_id = $1',
    [projectId]
  );
  const { rows: statutoryCharges } = await clientOrPool.query(
    'SELECT * FROM project_statutory_charges WHERE financial_viability_id = $1 AND is_deleted = FALSE ORDER BY order_index ASC, id ASC',
    [financial?.id]
  );
  const { rows: salableUnits } = await clientOrPool.query(
    'SELECT * FROM project_salable_units WHERE financial_viability_id = $1 ORDER BY order_index ASC, id ASC',
    [financial?.id]
  );
  const areaMetrics = calculateAreaMetrics(statement, floors);
  const financialMetrics = calculateFinancialMetrics(financial || {}, statutoryCharges, salableUnits, areaMetrics);
  return {
    statement,
    floors: areaMetrics.evaluatedFloors,
    financial,
    statutoryCharges: financialMetrics.evaluatedStatutoryCharges,
    salableUnits: financialMetrics.evaluatedSalableUnits,
    areaMetrics,
    financialMetrics
  };
}

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
    let { rows: floors } = await client.query(
      'SELECT * FROM project_area_floors WHERE area_statement_id = $1 AND is_active = TRUE ORDER BY floor_order ASC, id ASC',
      [statement.id]
    );

    // Auto-reconcile with central building configuration if no floors exist and configuration is present
    if (floors.length === 0) {
      const { rows: confRows } = await client.query('SELECT * FROM timeline_configurations WHERE project_id = $1', [projectId]);
      if (confRows[0]) {
        floors = await reconcileBuildingFloors(client, projectId, req.user.id, confRows[0]);
      }
    }

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
    unit_display,
    total_proposed_pline_override_sqm,
    is_proposed_pline_overridden,
    proposed_pline_override_reason
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

    let resolvedRegularTdr = null;
    let resolvedSlumTdr = null;

    if (parsedWidth && ROAD_WIDTH_TOTAL_TDR_MAP[parsedWidth] !== undefined) {
      const roadTotalTdr = ROAD_WIDTH_TOTAL_TDR_MAP[parsedWidth];
      const isRoadWidthChanged = existing && existing.road_width_m !== null && parsedWidth !== existing.road_width_m;

      // 1. Explicit reset requested
      if (req.body.reset_regular_tdr === true || req.body.regular_tdr_factor === null) {
        const split = deriveTdrSplit(roadTotalTdr, null);
        resolvedRegularTdr = split.regularTdrFactor;
        resolvedSlumTdr = split.slumTdrFactor;
      }
      // 2. Explicit regular_tdr_factor provided
      else if (req.body.regular_tdr_factor !== undefined) {
        if (req.body.regular_tdr_factor === '') {
          return res.status(400).json({ error: 'Regular TDR factor must be a valid number or null to reset' });
        }
        const split = deriveTdrSplit(roadTotalTdr, req.body.regular_tdr_factor);
        if (!split.isSplitValid) {
          return res.status(400).json({ error: split.validationError });
        }
        resolvedRegularTdr = split.regularTdrFactor;
        resolvedSlumTdr = split.slumTdrFactor;
      }
      // 3. regular_tdr_factor omitted: preserve existing override
      else {
        const existingRegular = existing?.regular_tdr_factor !== null && existing?.regular_tdr_factor !== undefined
          ? parseFloat(existing.regular_tdr_factor)
          : null;

        if (existingRegular !== null) {
          if (isRoadWidthChanged && existingRegular > roadTotalTdr) {
            return res.status(400).json({
              error: `Existing Regular TDR override (${existingRegular}) exceeds new Total Road TDR (${roadTotalTdr}) for ${parsedWidth}m road width. Please specify a valid regular_tdr_factor or explicitly reset it.`
            });
          }
          const split = deriveTdrSplit(roadTotalTdr, existingRegular);
          resolvedRegularTdr = split.regularTdrFactor;
          resolvedSlumTdr = split.slumTdrFactor;
        } else {
          const split = deriveTdrSplit(roadTotalTdr, null);
          resolvedRegularTdr = split.regularTdrFactor;
          resolvedSlumTdr = split.slumTdrFactor;
        }
      }
    } else if (parsedWidth && ROAD_WIDTH_TDR_MAP[parsedWidth]) {
      resolvedRegularTdr = ROAD_WIDTH_TDR_MAP[parsedWidth].regular;
      resolvedSlumTdr = ROAD_WIDTH_TDR_MAP[parsedWidth].slum;
    }

    const parseNumParam = (val, name) => {
      if (val === undefined || val === null || val === '') return null;
      const parsed = parseFloat(val);
      if (isNaN(parsed)) throw new Error(`Invalid numeric input for ${name}`);
      return parsed;
    };

    let pPlotArea, pCitySurvey, pSiteArea, pDp, pExistingBuiltup, pMargin, pDivFactor, pBasicFsi, pPaidFsi, pTdrFactor, pProposedTdrFactor, pAncComm, pAncRes;
    try {
      pPlotArea = parseNumParam(plot_area_sqm, 'plot_area_sqm');
      pCitySurvey = parseNumParam(city_survey_area_sqm, 'city_survey_area_sqm');
      pSiteArea = parseNumParam(site_area_sqm, 'site_area_sqm');
      pDp = parseNumParam(dp_deductions_sqm, 'dp_deductions_sqm');
      pExistingBuiltup = parseNumParam(existing_builtup_area_sqm, 'existing_builtup_area_sqm');
      pMargin = parseNumParam(margin_meters, 'margin_meters');
      pDivFactor = parseNumParam(dividing_factor, 'dividing_factor');
      pBasicFsi = parseNumParam(basic_fsi_factor, 'basic_fsi_factor');
      pPaidFsi = parseNumParam(paid_fsi_factor, 'paid_fsi_factor');
      pTdrFactor = parseNumParam(tdr_factor, 'tdr_factor');
      pProposedTdrFactor = parseNumParam(proposed_tdr_factor, 'proposed_tdr_factor');
      pAncComm = parseNumParam(ancillary_commercial_pct, 'ancillary_commercial_pct');
      pAncRes = parseNumParam(ancillary_residential_pct, 'ancillary_residential_pct');
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
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
        total_proposed_pline_override_sqm = CASE WHEN $21 = TRUE THEN $20 ELSE (CASE WHEN $21 = FALSE THEN NULL ELSE total_proposed_pline_override_sqm END) END,
        is_proposed_pline_overridden = COALESCE($21, is_proposed_pline_overridden),
        proposed_pline_override_reason = CASE WHEN $21 = TRUE THEN $22 ELSE (CASE WHEN $21 = FALSE THEN NULL ELSE proposed_pline_override_reason END) END,
        proposed_pline_overridden_by = CASE WHEN $21 = TRUE THEN $23 ELSE (CASE WHEN $21 = FALSE THEN NULL ELSE proposed_pline_overridden_by END) END,
        proposed_pline_overridden_at = CASE WHEN $21 = TRUE THEN NOW() ELSE (CASE WHEN $21 = FALSE THEN NULL ELSE proposed_pline_overridden_at END) END,
        parking_config = COALESCE($25, parking_config),
        regulatory_profile = COALESCE($26, regulatory_profile),
        updated_at = NOW()
       WHERE project_id = $24
       RETURNING *`,
      [
        pPlotArea,
        pCitySurvey,
        pSiteArea,
        pDp,
        pExistingBuiltup,
        pMargin,
        pDivFactor,
        pBasicFsi,
        pPaidFsi,
        pTdrFactor,
        pProposedTdrFactor,
        resolvedRegularTdr,
        resolvedSlumTdr,
        is_gunthewari !== undefined ? Boolean(is_gunthewari) : null,
        parsedWidth,
        building_use ? building_use.trim() : null,
        pAncComm,
        pAncRes,
        unit_display || null,
        total_proposed_pline_override_sqm !== undefined ? (total_proposed_pline_override_sqm !== null && total_proposed_pline_override_sqm !== '' ? parseFloat(total_proposed_pline_override_sqm) : null) : null,
        is_proposed_pline_overridden !== undefined ? Boolean(is_proposed_pline_overridden) : null,
        proposed_pline_override_reason !== undefined ? proposed_pline_override_reason : null,
        req.user.id,
        projectId,
        req.body.parking_config !== undefined ? (typeof req.body.parking_config === 'string' ? req.body.parking_config : JSON.stringify(req.body.parking_config)) : null,
        req.body.regulatory_profile !== undefined ? req.body.regulatory_profile.trim() : null
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_AREA_STATEMENT', 'area', 'project_area_statements', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing || {}), JSON.stringify(updated)]
    );

    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      statement: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Area statement updated successfully'
    });
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
    is_pline_overridden,
    pline_override_reason,
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

    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.status(201).json({
      floor: newFloor,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Floor added successfully'
    });
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
    is_pline_overridden,
    pline_override_reason,
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

    const isPlineOverridden = is_pline_overridden !== undefined ? Boolean(is_pline_overridden) : Boolean(existing.is_pline_overridden);

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
        is_pline_overridden = $15,
        pline_override_reason = CASE WHEN $15 = TRUE THEN $16 ELSE NULL END,
        remarks = COALESCE($17, remarks),
        updated_at = NOW()
       WHERE id = $18 AND area_statement_id = (SELECT id FROM project_area_statements WHERE project_id = $19)
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
        isPlineOverridden,
        pline_override_reason || null,
        remarks !== undefined ? remarks : null,
        floorId,
        projectId
      ]
    );

    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      floor: updatedFloor,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Floor updated successfully'
    });
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
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Floor deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting floor:', err);
    res.status(500).json({ error: 'Failed to delete floor row' });
  }
});

// 5b. POST /api/projects/:projectId/feasibility/area/reconcile-floors
// Re-sync floor list from central Building Configuration
router.post('/area/reconcile-floors', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: confRows } = await client.query('SELECT * FROM timeline_configurations WHERE project_id = $1', [projectId]);
    const conf = confRows[0] || { floors_above_ground: 4, ground_floor_config: 'stilt', has_stilt_parking: true, has_terrace_tank_slab: true };
    const floors = await reconcileBuildingFloors(client, projectId, req.user.id, conf);
    await client.query('COMMIT');
    res.json({ floors, message: 'Floors reconciled successfully with Building Configuration' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reconciling floors:', err);
    res.status(500).json({ error: 'Failed to reconcile floors' });
  } finally {
    client.release();
  }
});

// 5c. PUT /api/projects/:projectId/feasibility/financial/overrides
// Set/update controlled override on a statutory or development cost item
router.put('/financial/overrides', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { key, override_val, calculated_basis_val, reason } = req.body;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Override key is required' });
  }

  const parsedVal = parseFloat(override_val);
  if (override_val === undefined || override_val === null || isNaN(parsedVal) || parsedVal < 0) {
    return res.status(400).json({ error: 'Override amount must be a valid non-negative number' });
  }

  try {
    const { rows: [fin] } = await pool.query('SELECT * FROM project_financial_viabilities WHERE project_id = $1', [projectId]);
    if (!fin) return res.status(404).json({ error: 'Financial viability not found' });

    let overrides = fin.overrides || {};
    if (typeof overrides === 'string') {
      try { overrides = JSON.parse(overrides); } catch (e) { overrides = {}; }
    }
    let history = fin.override_history || [];
    if (typeof history === 'string') {
      try { history = JSON.parse(history); } catch (e) { history = []; }
    }

    const oldOverride = overrides[key] || null;
    overrides[key] = {
      override_val: Math.round(parsedVal * 100) / 100,
      calculated_basis_val: (calculated_basis_val !== undefined && calculated_basis_val !== null && !isNaN(parseFloat(calculated_basis_val)))
        ? Math.round(parseFloat(calculated_basis_val) * 100) / 100
        : null,
      overridden_by: req.user.id,
      overridden_at: new Date().toISOString(),
      reason: reason ? String(reason).trim() : ''
    };

    history.push({
      action: 'SET_OVERRIDE',
      key,
      old_value: oldOverride,
      new_value: overrides[key],
      user_id: req.user.id,
      timestamp: new Date().toISOString()
    });

    const { rows: [updated] } = await pool.query(
      'UPDATE project_financial_viabilities SET overrides = $1, override_history = $2, updated_at = NOW() WHERE project_id = $3 RETURNING *',
      [JSON.stringify(overrides), JSON.stringify(history), projectId]
    );

    const recalc = await getRecalculatedFeasibility(pool, projectId);

    res.json({
      financial: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      statutoryCharges: recalc?.statutoryCharges,
      message: `Override for ${key} updated successfully`
    });
  } catch (err) {
    console.error('Error updating financial override:', err);
    res.status(500).json({ error: 'Failed to update financial override' });
  }
});

// 5d. POST /api/projects/:projectId/feasibility/financial/overrides/reset
// Reset an override back to engine calculated value
router.post('/financial/overrides/reset', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { key } = req.body;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Override key is required' });
  }

  try {
    const { rows: [fin] } = await pool.query('SELECT * FROM project_financial_viabilities WHERE project_id = $1', [projectId]);
    if (!fin) return res.status(404).json({ error: 'Financial viability not found' });

    let overrides = fin.overrides || {};
    if (typeof overrides === 'string') {
      try { overrides = JSON.parse(overrides); } catch (e) { overrides = {}; }
    }
    let history = fin.override_history || [];
    if (typeof history === 'string') {
      try { history = JSON.parse(history); } catch (e) { history = []; }
    }

    const oldOverride = overrides[key] || null;
    delete overrides[key];

    history.push({
      action: 'RESET_OVERRIDE',
      key,
      old_value: oldOverride,
      new_value: null,
      user_id: req.user.id,
      timestamp: new Date().toISOString()
    });

    const { rows: [updated] } = await pool.query(
      'UPDATE project_financial_viabilities SET overrides = $1, override_history = $2, updated_at = NOW() WHERE project_id = $3 RETURNING *',
      [JSON.stringify(overrides), JSON.stringify(history), projectId]
    );

    const recalc = await getRecalculatedFeasibility(pool, projectId);

    res.json({
      financial: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      statutoryCharges: recalc?.statutoryCharges,
      message: `Override for ${key} reset to calculated successfully`
    });
  } catch (err) {
    console.error('Error resetting financial override:', err);
    res.status(500).json({ error: 'Failed to reset financial override' });
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
    is_cost_of_plot_included,
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

  const parseFinParam = (val, name, isInteger = false, allowNegative = false) => {
    if (val === undefined) return null;
    if (val === null || (typeof val === 'string' && val.trim() === '')) return null;
    const str = typeof val === 'string' ? val.trim() : String(val);
    const parsed = isInteger ? parseInt(str, 10) : parseFloat(str);
    if (isNaN(parsed) || !isFinite(parsed)) {
      throw new Error(`Invalid numeric input for ${name}: "${val}"`);
    }
    if (!allowNegative && parsed < 0) {
      throw new Error(`${name} cannot be negative`);
    }
    return parsed;
  };

  let pRrRate, pCostARate, pCostBRate, pCostPlot, pCostPlotRate, pCostConstRate, pCostInfra;
  let pCostBasement, pBasementArea, pBasementRate, pInterest, pRentAmt, pRentTenements, pRentPerMonth, pRentMonths;
  let pStackedCost, pStackedSlots, pStackedCostPerSlot, pMinorExp, pBpms, pAirport, pFire, pEntertainment, pExtraStamp, pAdvocate, pPeriodMonths;

  try {
    pRrRate = parseFinParam(rr_rate_per_sqm, 'rr_rate_per_sqm');
    pCostARate = parseFinParam(estimated_cost_a_rate, 'estimated_cost_a_rate');
    pCostBRate = parseFinParam(estimated_cost_b_rate, 'estimated_cost_b_rate');
    pCostPlot = parseFinParam(cost_of_plot, 'cost_of_plot');
    pCostPlotRate = parseFinParam(cost_of_plot_rate_per_sqm, 'cost_of_plot_rate_per_sqm');
    pCostConstRate = parseFinParam(cost_of_construction_rate, 'cost_of_construction_rate');
    pCostInfra = parseFinParam(cost_of_infrastructure, 'cost_of_infrastructure');
    pCostBasement = parseFinParam(cost_of_basement, 'cost_of_basement');
    pBasementArea = parseFinParam(basement_area_sqm, 'basement_area_sqm');
    pBasementRate = parseFinParam(basement_rate_per_sqm, 'basement_rate_per_sqm');
    pInterest = parseFinParam(interest_amount, 'interest_amount');
    pRentAmt = parseFinParam(rent_amount, 'rent_amount');
    pRentTenements = parseFinParam(rent_tenements, 'rent_tenements', true);
    pRentPerMonth = parseFinParam(rent_per_tenement_per_month, 'rent_per_tenement_per_month');
    pRentMonths = parseFinParam(rent_months, 'rent_months', true);
    pStackedCost = parseFinParam(stacked_parking_cost, 'stacked_parking_cost');
    pStackedSlots = parseFinParam(stacked_parking_slots, 'stacked_parking_slots', true);
    pStackedCostPerSlot = parseFinParam(stacked_parking_cost_per_slot, 'stacked_parking_cost_per_slot');
    pMinorExp = parseFinParam(minor_expenses, 'minor_expenses');
    pBpms = parseFinParam(bpms_staff_charges, 'bpms_staff_charges');
    pAirport = parseFinParam(airport_noc, 'airport_noc');
    pFire = parseFinParam(fire_noc, 'fire_noc');
    pEntertainment = parseFinParam(entertainment_charges, 'entertainment_charges');
    pExtraStamp = parseFinParam(extra_stamp_duty, 'extra_stamp_duty');
    pAdvocate = parseFinParam(advocate_fees, 'advocate_fees');
    pPeriodMonths = parseFinParam(period_months, 'period_months', true);
  } catch (validationErr) {
    return res.status(400).json({ error: validationErr.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query('SELECT * FROM project_financial_viabilities WHERE project_id = $1 FOR UPDATE', [projectId]);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial viability not found' });
    }

    const { rows: [updated] } = await client.query(
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
        is_cost_of_plot_included = COALESCE($28, is_cost_of_plot_included),
        updated_at = NOW()
       WHERE project_id = $29
       RETURNING *`,
      [
        pRrRate,
        pCostARate,
        pCostBRate,
        pCostPlot,
        pCostPlotRate,
        pCostConstRate,
        pCostInfra,
        pCostBasement,
        pBasementArea,
        pBasementRate,
        pInterest,
        pRentAmt,
        pRentTenements,
        pRentPerMonth,
        pRentMonths,
        pStackedCost,
        pStackedSlots,
        pStackedCostPerSlot,
        pMinorExp,
        pBpms,
        pAirport,
        pFire,
        pEntertainment,
        pExtraStamp,
        pAdvocate,
        pPeriodMonths,
        notes !== undefined ? notes : null,
        is_cost_of_plot_included !== undefined ? Boolean(is_cost_of_plot_included) : null,
        projectId
      ]
    );

    // Audit log
    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_FINANCIAL_VIABILITY', 'financial', 'project_financial_viabilities', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing || {}), JSON.stringify(updated)]
    );

    await client.query('COMMIT');

    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      financial: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Financial viability parameters updated successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating financial viability:', err);
    res.status(500).json({ error: 'Failed to update financial viability parameters' });
  } finally {
    client.release();
  }
});

// 7. POST /api/projects/:projectId/feasibility/financial/salable-units
// Add salable unit row
router.post('/financial/salable-units', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { unit_name, carpet_area_sqm, super_buildup_loading_sqft, unit_count, landowner_unit_count, building_use, rate_per_sqft } = req.body;

  try {
    const { rows: [fin] } = await pool.query('SELECT id FROM project_financial_viabilities WHERE project_id = $1', [projectId]);
    if (!fin) return res.status(404).json({ error: 'Financial viability record not found' });

    const carpetSqft = parseFloat(req.body.carpet_area_sqft) || (parseFloat(carpet_area_sqm) ? parseFloat(carpet_area_sqm) * 10.764 : 0);
    const carpetSqm = parseFloat(carpet_area_sqm) || (carpetSqft / 10.764);
    const loadingSqft = req.body.super_buildup_loading_sqft !== undefined 
      ? (parseFloat(req.body.super_buildup_loading_sqft) || 0) 
      : (req.body.loading_sqft !== undefined ? (parseFloat(req.body.loading_sqft) || 0) : 300.00);
    const superSqft = carpetSqft + loadingSqft;
    const units = parseInt(unit_count, 10) || 1;
    const rawLandowner = landowner_unit_count !== undefined ? landowner_unit_count : req.body.landowner_units;
    const landownerUnits = Math.min(units, Math.max(0, parseInt(rawLandowner, 10) || 0));
    const finalBuildingUse = (building_use || req.body.use_type || 'Residential').trim();
    const rateSqft = parseFloat(rate_per_sqft) || 6000.00;
    const unitPrice = superSqft * rateSqft;
    const totalAmount = unitPrice * units;

    const { rows: [maxOrder] } = await pool.query(
      'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM project_salable_units WHERE financial_viability_id = $1',
      [fin.id]
    );

    const { rows: [newUnit] } = await pool.query(
      `INSERT INTO project_salable_units
        (financial_viability_id, unit_name, carpet_area_sqm, carpet_area_sqft, super_buildup_area_sqft, super_buildup_loading_sqft, unit_count, landowner_unit_count, building_use, rate_per_sqft, unit_price, total_amount, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        fin.id,
        (unit_name || 'Salable Unit').trim(),
        carpetSqm,
        carpetSqft,
        superSqft,
        loadingSqft,
        units,
        landownerUnits,
        finalBuildingUse,
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
  const { unit_name, carpet_area_sqm, super_buildup_loading_sqft, unit_count, landowner_unit_count, building_use, rate_per_sqft } = req.body;

  try {
    const carpetSqft = parseFloat(req.body.carpet_area_sqft) || (parseFloat(carpet_area_sqm) ? parseFloat(carpet_area_sqm) * 10.764 : 0);
    const carpetSqm = parseFloat(carpet_area_sqm) || (carpetSqft / 10.764);
    const loadingSqft = req.body.super_buildup_loading_sqft !== undefined 
      ? (parseFloat(req.body.super_buildup_loading_sqft) || 0) 
      : (req.body.loading_sqft !== undefined ? (parseFloat(req.body.loading_sqft) || 0) : 300.00);
    const superSqft = carpetSqft + loadingSqft;
    const units = parseInt(unit_count, 10) || 1;
    const rawLandowner = landowner_unit_count !== undefined ? landowner_unit_count : req.body.landowner_units;
    const landownerUnits = rawLandowner !== undefined ? Math.min(units, Math.max(0, parseInt(rawLandowner, 10) || 0)) : null;
    const finalBuildingUse = (building_use || req.body.use_type || 'Residential').trim();
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
        landowner_unit_count = COALESCE($7, landowner_unit_count),
        building_use = COALESCE($8, building_use),
        rate_per_sqft = $9,
        unit_price = $10,
        total_amount = $11
       WHERE id = $12 AND financial_viability_id = (SELECT id FROM project_financial_viabilities WHERE project_id = $13)
       RETURNING *`,
      [
        unit_name ? unit_name.trim() : null,
        carpetSqm,
        carpetSqft,
        superSqft,
        loadingSqft,
        units,
        landownerUnits,
        finalBuildingUse,
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

    let parsedAmount = null;
    if (amount !== undefined) {
      if (amount === null || (typeof amount === 'string' && amount.trim() === '')) {
        parsedAmount = 0;
      } else {
        const p = parseFloat(amount);
        if (isNaN(p) || !isFinite(p)) {
          return res.status(400).json({ error: 'Statutory charge amount must be a valid number' });
        }
        if (p < 0) {
          return res.status(400).json({ error: 'Statutory charge amount cannot be negative' });
        }
        parsedAmount = p;
      }
    }

    let parsedRrPct = null;
    if (rr_percentage !== undefined) {
      if (rr_percentage === null || (typeof rr_percentage === 'string' && rr_percentage.trim() === '')) {
        parsedRrPct = null;
      } else {
        const p = parseFloat(rr_percentage);
        if (isNaN(p) || !isFinite(p)) {
          return res.status(400).json({ error: 'RR percentage must be a valid number' });
        }
        if (p < 0) {
          return res.status(400).json({ error: 'RR percentage cannot be negative' });
        }
        parsedRrPct = p;
      }
    }

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
        parsedRrPct,
        parsedAmount,
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

    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      charge: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Statutory charge updated successfully'
    });
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

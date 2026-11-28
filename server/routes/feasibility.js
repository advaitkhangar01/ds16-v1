// server/routes/feasibility.js
// DS16 Area Statement & Financial Feasibility Authoritative API

const router = require('express').Router({ mergeParams: true });
const pool = require('../db');
const { authenticate, canViewFinancials } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const {
  SQM_TO_SQFT,
  parseNum,
  parseOptNum,
  validateAreaStatementInputs,
  calculateAreaMetrics,
  calculateFinancialMetrics,
  ROAD_WIDTH_TDR_MAP,
  ROAD_WIDTH_TOTAL_TDR_MAP,
  deriveTdrSplit
} = require('../services/feasibilityEngine');
const { reconcileBuildingFloors } = require('../services/buildingHierarchyService');
const {
  generateFeasibilityExcelBuffer,
  generateFeasibilityPdfBuffer
} = require('../services/feasibilityExportService');

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

const DEFAULT_STATUTORY_CATALOG = [
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

async function getRecalculatedFeasibility(clientOrPool, projectId) {
  const { rows: [project] } = await clientOrPool.query(
    'SELECT id, name, location, client_name, type, area_sq_ft, status FROM projects WHERE id = $1',
    [projectId]
  );
  if (!project) return null;

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
  const { rows: statutoryCharges } = financial
    ? await clientOrPool.query(
        'SELECT * FROM project_statutory_charges WHERE financial_viability_id = $1 AND is_deleted = FALSE ORDER BY order_index ASC, id ASC',
        [financial.id]
      )
    : { rows: [] };
  const { rows: salableUnits } = financial
    ? await clientOrPool.query(
        'SELECT * FROM project_salable_units WHERE financial_viability_id = $1 ORDER BY order_index ASC, id ASC',
        [financial.id]
      )
    : { rows: [] };

  const areaMetrics = calculateAreaMetrics(statement, floors);
  const financialMetrics = calculateFinancialMetrics(financial || {}, statutoryCharges, salableUnits, areaMetrics);

  return {
    project,
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
router.get('/', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: projRows } = await client.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!projRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    let { rows: [statement] } = await client.query(
      'SELECT * FROM project_area_statements WHERE project_id = $1',
      [projectId]
    );

    if (!statement) {
      const defaultPlotArea = parseFloat(projRows[0].area_sq_ft) ? (parseFloat(projRows[0].area_sq_ft) / SQM_TO_SQFT) : 0;
      const roundedPlot = Math.round(defaultPlotArea * 100) / 100;
      const { rows: [newStmt] } = await client.query(
        `INSERT INTO project_area_statements
          (project_id, plot_area_sqm, city_survey_area_sqm, site_area_sqm, dp_deductions_sqm, existing_builtup_area_sqm, dividing_factor, basic_fsi_factor, paid_fsi_factor, tdr_factor, total_tdr_factor, proposed_tdr_factor, building_use, regular_tdr_factor, slum_tdr_factor, is_gunthewari, road_width_m, created_by)
         VALUES ($1, $2, $2, $2, 0, 0, 1.6, 1.1, 0.5, 0.65, NULL, NULL, 'Residential', NULL, NULL, false, null, $3)
         RETURNING *`,
        [projectId, roundedPlot, req.user.id]
      );
      statement = newStmt;
    }

    let { rows: floors } = await client.query(
      'SELECT * FROM project_area_floors WHERE area_statement_id = $1 AND is_active = TRUE ORDER BY floor_order ASC, id ASC',
      [statement.id]
    );

    if (floors.length === 0) {
      const { rows: confRows } = await client.query('SELECT * FROM timeline_configurations WHERE project_id = $1', [projectId]);
      if (confRows[0]) {
        floors = await reconcileBuildingFloors(client, projectId, req.user.id, confRows[0]);
      }
    }

    let { rows: [financial] } = await client.query(
      'SELECT * FROM project_financial_viabilities WHERE project_id = $1',
      [projectId]
    );

    if (!financial) {
      const { rows: [newFin] } = await client.query(
        `INSERT INTO project_financial_viabilities
          (project_id, rr_rate_per_sqm, estimated_cost_a_rate, estimated_cost_b_rate, cost_of_plot_rate_per_sqm, cost_of_construction_rate, basement_rate_per_sqm, rent_tenements, rent_per_tenement_per_month, rent_months, stacked_parking_slots, stacked_parking_cost_per_slot, minor_expenses, bpms_staff_charges, airport_noc, fire_noc, entertainment_charges, advocate_fees, extra_stamp_duty, interest_amount, tdr_purchase_factor, period_months, created_by)
         VALUES ($1, 0.00, 15000.00, 26620.00, 0.00, 0.00, 0.00, 0, 0.00, 0, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.55, '', $2)
         RETURNING *`,
        [projectId, req.user.id]
      );
      financial = newFin;

      for (let idx = 0; idx < DEFAULT_STATUTORY_CATALOG.length; idx++) {
        const item = DEFAULT_STATUTORY_CATALOG[idx];
        await client.query(
          `INSERT INTO project_statutory_charges
            (financial_viability_id, charge_code, charge_name, calculation_basis, rate_multiplier, max_cap, rr_percentage, order_index, is_enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [financial.id, item.code, item.name, item.basis, item.mult, item.cap || null, item.rr_pct, idx + 1]
        );
      }
    }

    const { rows: statutoryCharges } = await client.query(
      'SELECT * FROM project_statutory_charges WHERE financial_viability_id = $1 AND is_deleted = FALSE ORDER BY order_index ASC, id ASC',
      [financial.id]
    );

    const { rows: salableUnits } = await client.query(
      'SELECT * FROM project_salable_units WHERE financial_viability_id = $1 ORDER BY order_index ASC, id ASC',
      [financial.id]
    );

    await client.query('COMMIT');

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

// 1b. POST /api/projects/:projectId/feasibility/preview
// Stateless authoritative calculation endpoint for live draft editing (zero DB writes)
router.post('/preview', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const saved = await getRecalculatedFeasibility(pool, projectId);
    const draftStatement = req.body.statement !== undefined ? req.body.statement : (saved?.statement || {});
    const draftFloors = Array.isArray(req.body.floors) ? req.body.floors : (saved?.floors || []);
    const draftFinancial = req.body.financial !== undefined ? req.body.financial : (saved?.financial || {});
    const draftStatutory = Array.isArray(req.body.statutoryCharges) ? req.body.statutoryCharges : (saved?.statutoryCharges || []);
    const draftUnits = Array.isArray(req.body.salableUnits) ? req.body.salableUnits : (saved?.salableUnits || []);

    const validation = validateAreaStatementInputs(draftStatement, draftFloors);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const areaMetrics = calculateAreaMetrics(draftStatement, draftFloors);
    const financialMetrics = calculateFinancialMetrics(draftFinancial, draftStatutory, draftUnits, areaMetrics);

    res.json({
      floors: areaMetrics.evaluatedFloors,
      areaMetrics,
      financialMetrics,
      statutoryCharges: financialMetrics.evaluatedStatutoryCharges,
      salableUnits: financialMetrics.evaluatedSalableUnits
    });
  } catch (err) {
    console.error('Error computing live feasibility preview:', err);
    res.status(500).json({ error: 'Failed to calculate feasibility preview' });
  }
});

// 2. PUT /api/projects/:projectId/feasibility/area
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
    proposed_paid_fsi_factor,
    tdr_factor,
    total_tdr_factor,
    proposed_tdr_factor,
    proposed_regular_tdr_factor,
    proposed_slum_tdr_factor,
    regular_tdr_factor,
    slum_tdr_factor,
    is_regular_tdr_overridden,
    is_gunthewari,
    road_width_m,
    building_use,
    primary_fsi_residential_pct,
    primary_fsi_commercial_pct,
    ancillary_commercial_pct,
    ancillary_residential_pct,
    unit_display,
    total_proposed_pline_override_sqm,
    is_proposed_pline_overridden,
    proposed_pline_override_reason,
    expected_version
  } = req.body;

  const validRoadWidths = [9, 12, 15, 18, 24];
  if (road_width_m !== undefined && road_width_m !== null && road_width_m !== '') {
    const pw = parseFloat(road_width_m);
    if (!validRoadWidths.includes(pw)) {
      return res.status(400).json({ error: 'Invalid road width. Supported road widths are strictly 9m, 12m, 15m, 18m, or 24m.' });
    }
  }

  const parseNumParam = (val, name, allowNegative = false) => {
    if (val === undefined || val === null || val === '') return null;
    const parsed = parseFloat(val);
    if (isNaN(parsed) || !isFinite(parsed)) throw new Error(`Invalid numeric input for ${name}`);
    if (!allowNegative && parsed < 0) throw new Error(`${name} cannot be negative`);
    return parsed;
  };

  let pPlotArea, pCitySurvey, pSiteArea, pDp, pExistingBuiltup, pMargin, pDivFactor;
  let pBasicFsi, pPaidFsi, pProposedPaidFsi, pTdrFactor, pReqTotalTdr, pLegacyPropTdr;
  let pPropRegTdr, pPropSlumTdr, pPrimaryResPct, pPrimaryCommPct, pAncComm, pAncRes;

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
    pProposedPaidFsi = parseNumParam(proposed_paid_fsi_factor, 'proposed_paid_fsi_factor');
    pTdrFactor = parseNumParam(tdr_factor, 'tdr_factor');
    pReqTotalTdr = parseNumParam(total_tdr_factor, 'total_tdr_factor');
    pLegacyPropTdr = parseNumParam(proposed_tdr_factor, 'proposed_tdr_factor');
    pPropRegTdr = parseNumParam(proposed_regular_tdr_factor, 'proposed_regular_tdr_factor');
    pPropSlumTdr = parseNumParam(proposed_slum_tdr_factor, 'proposed_slum_tdr_factor');
    pPrimaryResPct = parseNumParam(primary_fsi_residential_pct, 'primary_fsi_residential_pct');
    pPrimaryCommPct = parseNumParam(primary_fsi_commercial_pct, 'primary_fsi_commercial_pct');
    pAncComm = parseNumParam(ancillary_commercial_pct, 'ancillary_commercial_pct');
    pAncRes = parseNumParam(ancillary_residential_pct, 'ancillary_residential_pct');
  } catch (validationErr) {
    return res.status(400).json({ error: validationErr.message });
  }

  if (pPrimaryResPct !== null && (pPrimaryResPct < 0 || pPrimaryResPct > 100)) {
    return res.status(400).json({ error: 'primary_fsi_residential_pct must be between 0 and 100' });
  }
  if (pPrimaryCommPct !== null && (pPrimaryCommPct < 0 || pPrimaryCommPct > 100)) {
    return res.status(400).json({ error: 'primary_fsi_commercial_pct must be between 0 and 100' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query(
      'SELECT * FROM project_area_statements WHERE project_id = $1 FOR UPDATE',
      [projectId]
    );
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Area statement not found' });
    }

    if (expected_version !== undefined && expected_version !== null && Number(expected_version) !== Number(existing.version)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Area statement was modified by another session. Please reload before saving.' });
    }

    const effectivePlotLimit = pPlotArea !== null ? pPlotArea : parseNum(existing.plot_area_sqm, 0);
    const effectiveDpVal = pDp !== null ? pDp : parseNum(existing.dp_deductions_sqm, 0);
    if (effectiveDpVal > effectivePlotLimit + 0.0001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Deductions For Proposed D.P. (${effectiveDpVal}) cannot exceed Area Of Plot (${effectivePlotLimit}). Net Plotable Area cannot be negative.`
      });
    }

    const parsedWidth = road_width_m !== undefined
      ? (road_width_m === null || road_width_m === '' ? null : parseFloat(road_width_m))
      : (existing.road_width_m !== null && existing.road_width_m !== undefined ? parseFloat(existing.road_width_m) : null);
    const gunthFlag = is_gunthewari !== undefined ? Boolean(is_gunthewari) : Boolean(existing.is_gunthewari);

    const effectivePaidLimit = pPaidFsi !== null ? pPaidFsi : parseNum(existing.paid_fsi_factor, 0.5);
    const resultingPaidProposed = Object.prototype.hasOwnProperty.call(req.body, 'proposed_paid_fsi_factor')
      ? pProposedPaidFsi
      : parseOptNum(existing.proposed_paid_fsi_factor);
    if (resultingPaidProposed !== null && resultingPaidProposed > effectivePaidLimit + 0.0001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Proposed Paid FSI factor (${resultingPaidProposed}) cannot exceed maximum eligible Paid FSI (${effectivePaidLimit})`
      });
    }

    const hasPrimaryResPctKey = Object.prototype.hasOwnProperty.call(req.body, 'primary_fsi_residential_pct');
    const hasPrimaryCommPctKey = Object.prototype.hasOwnProperty.call(req.body, 'primary_fsi_commercial_pct');
    const resultingUse = building_use ? building_use.trim() : (existing.building_use || 'Residential');
    let finalPrimaryResPct = hasPrimaryResPctKey ? pPrimaryResPct : parseOptNum(existing.primary_fsi_residential_pct);
    let finalPrimaryCommPct = hasPrimaryCommPctKey ? pPrimaryCommPct : parseOptNum(existing.primary_fsi_commercial_pct);

    if (resultingUse.toLowerCase().includes('mixed')) {
      if (hasPrimaryResPctKey && hasPrimaryCommPctKey && pPrimaryResPct !== null && pPrimaryCommPct !== null) {
        if (Math.abs((pPrimaryResPct + pPrimaryCommPct) - 100) > 0.01) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Mixed-Use Primary FSI allocations must total 100% (Residential ${pPrimaryResPct}% + Commercial ${pPrimaryCommPct}%).`
          });
        }
        if (pPrimaryResPct <= 0 || pPrimaryCommPct <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Mixed Use requires both Residential and Commercial allocations to be greater than 0%. Select Residential or Commercial instead.'
          });
        }
        finalPrimaryResPct = pPrimaryResPct;
        finalPrimaryCommPct = pPrimaryCommPct;
      } else if (hasPrimaryResPctKey && pPrimaryResPct !== null) {
        if (pPrimaryResPct <= 0 || pPrimaryResPct >= 100) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Mixed Use requires both Residential and Commercial allocations to be greater than 0%. Select Residential or Commercial instead.'
          });
        }
        finalPrimaryResPct = pPrimaryResPct;
        finalPrimaryCommPct = Math.round((100 - pPrimaryResPct) * 100) / 100;
      } else if (hasPrimaryCommPctKey && pPrimaryCommPct !== null) {
        if (pPrimaryCommPct <= 0 || pPrimaryCommPct >= 100) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Mixed Use requires both Residential and Commercial allocations to be greater than 0%. Select Residential or Commercial instead.'
          });
        }
        finalPrimaryCommPct = pPrimaryCommPct;
        finalPrimaryResPct = Math.round((100 - pPrimaryCommPct) * 100) / 100;
      }
    } else if (resultingUse.toLowerCase().includes('comm')) {
      finalPrimaryResPct = 0;
      finalPrimaryCommPct = 100;
    } else {
      finalPrimaryResPct = 100;
      finalPrimaryCommPct = 0;
    }

    // Resolve Permissible TDR per Section 4 & FR-08:
    // - Road-width plots always keep the underlying 50/50 (or Admin-overridden) Total TDR split intact across classification switches.
    // - Gunthewari locks Eligible Regular TDR = 0 and Eligible Slum TDR = 50% of Total TDR without clobbering underlying split.
    let resolvedTotalTdr = pReqTotalTdr;
    let resolvedRegularTdr = null;
    let resolvedSlumTdr = null;
    let nextIsRegOverridden = null;
    let eligibleRegLimit = 0;
    let eligibleSlumLimit = 0;

    const existingWidth = existing.road_width_m !== null && existing.road_width_m !== undefined ? parseFloat(existing.road_width_m) : null;
    const isRoadWidthChanged = parsedWidth !== null && existingWidth !== parsedWidth;
    const isSwitchedFromGunth = Boolean(existing.is_gunthewari) && !gunthFlag;

    if (gunthFlag) {
      if (req.body.regular_tdr_factor !== undefined && req.body.regular_tdr_factor !== null && req.body.regular_tdr_factor !== '') {
        const reqRegNum = parseFloat(req.body.regular_tdr_factor);
        const existingStoredReg = parseOptNum(existing.regular_tdr_factor);
        const defaultRoadHalf = parsedWidth && ROAD_WIDTH_TDR_MAP[parsedWidth] ? ROAD_WIDTH_TDR_MAP[parsedWidth].regular : 0;
        const isTryingToEditReg = req.body.is_regular_tdr_overridden === true || (reqRegNum > 0.0001 && Math.abs(reqRegNum - (existingStoredReg ?? defaultRoadHalf)) > 0.0001 && existingStoredReg !== null);
        if (isTryingToEditReg || (parsedWidth && Math.abs(reqRegNum - defaultRoadHalf) > 0.0001 && reqRegNum > 0.0001) || (reqRegNum > 0.0001 && existingStoredReg === null)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Regular TDR is not permitted for Gunthewari plots (Slum TDR only).' });
        }
      }
      if (pPropRegTdr !== null && pPropRegTdr > 0.0001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Proposed Regular TDR cannot be greater than 0 for Gunthewari plots.' });
      }
      eligibleRegLimit = 0;

      if (parsedWidth && ROAD_WIDTH_TOTAL_TDR_MAP[parsedWidth] !== undefined) {
        const roadTotalTdr = ROAD_WIDTH_TOTAL_TDR_MAP[parsedWidth];
        const gunthSlumTier = ROAD_WIDTH_TDR_MAP[parsedWidth].gunthewari;
        if (slum_tdr_factor !== undefined && slum_tdr_factor !== null && slum_tdr_factor !== '') {
          const reqSlumNum = parseFloat(slum_tdr_factor);
          const halfTotal = ROAD_WIDTH_TDR_MAP[parsedWidth].slum;
          if (Math.abs(reqSlumNum - gunthSlumTier) > 0.0001 && Math.abs(reqSlumNum - halfTotal) > 0.0001) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: `Gunthewari Slum TDR is strictly road-width derived (${gunthSlumTier} for ${parsedWidth}m road); independent overrides are not permitted.`
            });
          }
        }
        if (pReqTotalTdr !== null && Math.abs(pReqTotalTdr - roadTotalTdr) > 0.0001 && Math.abs(pReqTotalTdr - gunthSlumTier) > 0.0001) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Total TDR for ${parsedWidth}m road is strictly ${roadTotalTdr} (Gunthewari Eligible Slum TDR = ${gunthSlumTier}).`
          });
        }
        eligibleSlumLimit = gunthSlumTier;

        // Preserve underlying road split without overwriting when merely toggling classification
        const split = deriveTdrSplit(roadTotalTdr, isRoadWidthChanged ? null : (existing.is_regular_tdr_overridden ? existing.regular_tdr_factor : null));
        resolvedTotalTdr = split.totalTdrFactor;
        resolvedRegularTdr = split.regularTdrFactor;
        resolvedSlumTdr = split.slumTdrFactor;
        if (isRoadWidthChanged) nextIsRegOverridden = false;
      } else {
        eligibleSlumLimit = parseOptNum(slum_tdr_factor) ?? parseNum(existing.slum_tdr_factor, 0);
        resolvedTotalTdr = parseOptNum(existing.total_tdr_factor) ?? (eligibleSlumLimit > 0 ? Math.round(eligibleSlumLimit * 2 * 10000) / 10000 : 0);
        resolvedSlumTdr = eligibleSlumLimit;
        resolvedRegularTdr = parseOptNum(existing.regular_tdr_factor) ?? eligibleSlumLimit;
      }
    } else if (parsedWidth && ROAD_WIDTH_TOTAL_TDR_MAP[parsedWidth] !== undefined) {
      const roadTotalTdr = ROAD_WIDTH_TOTAL_TDR_MAP[parsedWidth];
      if (pReqTotalTdr !== null && Math.abs(pReqTotalTdr - roadTotalTdr) > 0.0001) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Total TDR is strictly road-width derived (${roadTotalTdr} for ${parsedWidth}m road); unrestricted Total TDR override is not permitted.`
        });
      }
      resolvedTotalTdr = roadTotalTdr;

      if (req.body.reset_regular_tdr === true || req.body.regular_tdr_factor === null) {
        const split = deriveTdrSplit(resolvedTotalTdr, null);
        resolvedRegularTdr = split.regularTdrFactor;
        resolvedSlumTdr = split.slumTdrFactor;
        nextIsRegOverridden = false;
      } else if (req.body.regular_tdr_factor !== undefined) {
        if (req.body.regular_tdr_factor === '') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Regular TDR factor must be a valid number or null to reset' });
        }
        const split = deriveTdrSplit(resolvedTotalTdr, req.body.regular_tdr_factor);
        if (!split.isSplitValid) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: split.validationError });
        }
        resolvedRegularTdr = split.regularTdrFactor;
        resolvedSlumTdr = split.slumTdrFactor;
        nextIsRegOverridden = split.isRegularTdrOverridden;
      } else {
        const existingRegular = parseOptNum(existing.regular_tdr_factor);
        const existingWasOverridden = Boolean(existing.is_regular_tdr_overridden);

        if (isRoadWidthChanged && !existingWasOverridden) {
          // Changing road width on non-overridden split cleanly derives new 50/50 split
          const split = deriveTdrSplit(resolvedTotalTdr, null);
          resolvedRegularTdr = split.regularTdrFactor;
          resolvedSlumTdr = split.slumTdrFactor;
          nextIsRegOverridden = false;
        } else if (existingRegular !== null && existingWasOverridden) {
          if (isRoadWidthChanged && existingRegular > resolvedTotalTdr) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: `Existing Regular TDR override (${existingRegular}) exceeds new Total Road TDR (${resolvedTotalTdr}) for ${parsedWidth}m road width. Please specify a valid regular_tdr_factor or explicitly reset it.`
            });
          }
          const split = deriveTdrSplit(resolvedTotalTdr, existingRegular);
          resolvedRegularTdr = split.regularTdrFactor;
          resolvedSlumTdr = split.slumTdrFactor;
          nextIsRegOverridden = split.isRegularTdrOverridden;
        } else {
          const split = deriveTdrSplit(resolvedTotalTdr, null);
          resolvedRegularTdr = split.regularTdrFactor;
          resolvedSlumTdr = split.slumTdrFactor;
          nextIsRegOverridden = false;
        }
      }

      if (slum_tdr_factor !== undefined && slum_tdr_factor !== null && slum_tdr_factor !== '' && !isSwitchedFromGunth) {
        const reqSlum = parseFloat(slum_tdr_factor);
        if (!isNaN(reqSlum) && Math.abs(reqSlum - resolvedSlumTdr) > 0.0001) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Slum TDR (${resolvedSlumTdr}) is automatically calculated as remaining balance (Total ${resolvedTotalTdr} − Regular ${resolvedRegularTdr}); independent Slum TDR overrides are not permitted.`
          });
        }
      }
      eligibleRegLimit = resolvedRegularTdr;
      eligibleSlumLimit = resolvedSlumTdr;
    } else if (pReqTotalTdr !== null) {
      const split = deriveTdrSplit(pReqTotalTdr, regular_tdr_factor !== undefined ? regular_tdr_factor : existing.regular_tdr_factor);
      if (!split.isSplitValid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: split.validationError });
      }
      resolvedRegularTdr = split.regularTdrFactor;
      resolvedSlumTdr = split.slumTdrFactor;
      nextIsRegOverridden = is_regular_tdr_overridden !== undefined ? Boolean(is_regular_tdr_overridden) : split.isRegularTdrOverridden;
      eligibleRegLimit = resolvedRegularTdr;
      eligibleSlumLimit = resolvedSlumTdr;
    } else {
      eligibleRegLimit = parseNum(existing.regular_tdr_factor, 0);
      eligibleSlumLimit = parseNum(existing.slum_tdr_factor, 0);
    }

    // Revalidate resulting Proposed TDR consumption against classification-specific limits (Section 4.4 & FR-09)
    const maxRegLimit = eligibleRegLimit;
    const maxSlumLimit = eligibleSlumLimit;

    const hasPropPaidKey = Object.prototype.hasOwnProperty.call(req.body, 'proposed_paid_fsi_factor');
    const hasPropRegKey = Object.prototype.hasOwnProperty.call(req.body, 'proposed_regular_tdr_factor');
    const hasPropSlumKey = Object.prototype.hasOwnProperty.call(req.body, 'proposed_slum_tdr_factor');
    const hasLegacyPropTdrKey = Object.prototype.hasOwnProperty.call(req.body, 'proposed_tdr_factor');
    const hasRoadWidthKey = Object.prototype.hasOwnProperty.call(req.body, 'road_width_m');

    const checkFinalPropReg = hasPropRegKey
      ? pPropRegTdr
      : (req.body.reset_proposed ? (gunthFlag ? 0 : null) : parseOptNum(existing.proposed_regular_tdr_factor));
    const checkFinalPropSlum = hasPropSlumKey
      ? pPropSlumTdr
      : (req.body.reset_proposed ? null : parseOptNum(existing.proposed_slum_tdr_factor));

    if (gunthFlag && checkFinalPropReg !== null && checkFinalPropReg > 0.0001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Existing Proposed Regular TDR (${checkFinalPropReg}) exceeds Gunthewari eligibility (0). Reset or set proposed_regular_tdr_factor to 0 before switching to Gunthewari.`
      });
    }
    if (!gunthFlag && checkFinalPropReg !== null && checkFinalPropReg > maxRegLimit + 0.0001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Proposed Regular TDR (${checkFinalPropReg}) cannot exceed Permissible Regular TDR (${maxRegLimit})`
      });
    }
    if (checkFinalPropSlum !== null && checkFinalPropSlum > maxSlumLimit + 0.0001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Proposed Slum TDR (${checkFinalPropSlum}) cannot exceed Permissible Slum TDR (${maxSlumLimit})`
      });
    }
    const maxCombinedLimit = Math.round((maxRegLimit + maxSlumLimit) * 10000) / 10000;
    const combinedPropTdr = (checkFinalPropReg || 0) + (checkFinalPropSlum || 0);
    if (combinedPropTdr > maxCombinedLimit + 0.0001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Combined Proposed TDR (${combinedPropTdr}) cannot exceed Total Eligible TDR (${maxCombinedLimit}).`
      });
    }

    const finalPropPaid = req.body.reset_proposed && !hasPropPaidKey ? null : pProposedPaidFsi;
    const finalPropReg = gunthFlag ? 0 : (hasPropRegKey ? pPropRegTdr : (req.body.reset_proposed ? null : existing.proposed_regular_tdr_factor));
    const finalPropSlum = hasPropSlumKey ? pPropSlumTdr : (req.body.reset_proposed ? null : existing.proposed_slum_tdr_factor);

    const { rows: [updated] } = await client.query(
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
        total_tdr_factor = CASE WHEN $11::numeric IS NOT NULL THEN $11::numeric ELSE total_tdr_factor END,
        proposed_tdr_factor = CASE WHEN $12::boolean THEN $13::numeric ELSE proposed_tdr_factor END,
        proposed_paid_fsi_factor = CASE WHEN $14::boolean THEN $15::numeric ELSE proposed_paid_fsi_factor END,
        proposed_regular_tdr_factor = CASE WHEN $16::boolean THEN $17::numeric ELSE proposed_regular_tdr_factor END,
        proposed_slum_tdr_factor = CASE WHEN $18::boolean THEN $19::numeric ELSE proposed_slum_tdr_factor END,
        regular_tdr_factor = COALESCE($20, regular_tdr_factor),
        slum_tdr_factor = COALESCE($21, slum_tdr_factor),
        is_regular_tdr_overridden = COALESCE($38, is_regular_tdr_overridden),
        is_gunthewari = COALESCE($22, is_gunthewari),
        road_width_m = CASE WHEN $23::boolean THEN $24::numeric ELSE road_width_m END,
        building_use = COALESCE($25, building_use),
        primary_fsi_residential_pct = CASE WHEN $26::boolean THEN $27::numeric ELSE primary_fsi_residential_pct END,
        primary_fsi_commercial_pct = CASE WHEN $39::boolean THEN $40::numeric ELSE primary_fsi_commercial_pct END,
        ancillary_commercial_pct = COALESCE($28, ancillary_commercial_pct),
        ancillary_residential_pct = COALESCE($29, ancillary_residential_pct),
        unit_display = COALESCE($30, unit_display),
        total_proposed_pline_override_sqm = CASE WHEN $32 = TRUE THEN $31 ELSE (CASE WHEN $32 = FALSE THEN NULL ELSE total_proposed_pline_override_sqm END) END,
        is_proposed_pline_overridden = COALESCE($32, is_proposed_pline_overridden),
        proposed_pline_override_reason = CASE WHEN $32 = TRUE THEN $33 ELSE (CASE WHEN $32 = FALSE THEN NULL ELSE proposed_pline_override_reason END) END,
        proposed_pline_overridden_by = CASE WHEN $32 = TRUE THEN $34 ELSE (CASE WHEN $32 = FALSE THEN NULL ELSE proposed_pline_overridden_by END) END,
        proposed_pline_overridden_at = CASE WHEN $32 = TRUE THEN NOW() ELSE (CASE WHEN $32 = FALSE THEN NULL ELSE proposed_pline_overridden_at END) END,
        parking_config = COALESCE($36, parking_config),
        regulatory_profile = COALESCE($37, regulatory_profile),
        version = version + 1,
        updated_at = NOW()
       WHERE project_id = $35
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
        resolvedTotalTdr,
        hasLegacyPropTdrKey || Boolean(req.body.reset_proposed),
        pLegacyPropTdr,
        hasPropPaidKey || Boolean(req.body.reset_proposed),
        finalPropPaid,
        hasPropRegKey || gunthFlag || Boolean(req.body.reset_proposed),
        finalPropReg,
        hasPropSlumKey || Boolean(req.body.reset_proposed),
        finalPropSlum,
        resolvedRegularTdr,
        resolvedSlumTdr,
        is_gunthewari !== undefined ? Boolean(is_gunthewari) : null,
        hasRoadWidthKey,
        parsedWidth,
        building_use ? building_use.trim() : null,
        hasPrimaryResPctKey || hasPrimaryCommPctKey || Boolean(building_use),
        finalPrimaryResPct,
        pAncComm,
        pAncRes,
        unit_display || null,
        total_proposed_pline_override_sqm !== undefined ? (total_proposed_pline_override_sqm !== null && total_proposed_pline_override_sqm !== '' ? parseFloat(total_proposed_pline_override_sqm) : null) : null,
        is_proposed_pline_overridden !== undefined ? Boolean(is_proposed_pline_overridden) : null,
        proposed_pline_override_reason !== undefined ? proposed_pline_override_reason : null,
        req.user.id,
        projectId,
        req.body.parking_config !== undefined ? (typeof req.body.parking_config === 'string' ? req.body.parking_config : JSON.stringify(req.body.parking_config)) : null,
        req.body.regulatory_profile !== undefined ? req.body.regulatory_profile.trim() : null,
        nextIsRegOverridden,
        hasPrimaryResPctKey || hasPrimaryCommPctKey || Boolean(building_use),
        finalPrimaryCommPct
      ]
    );

    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_AREA_STATEMENT', 'area', 'project_area_statements', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing || {}), JSON.stringify(updated)]
    );

    await client.query('COMMIT');

    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      statement: updated,
      floors: recalc?.floors,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Area statement updated successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating area statement:', err);
    res.status(500).json({ error: 'Failed to update area statement' });
  } finally {
    client.release();
  }
});

// 3. POST /api/projects/:projectId/feasibility/area/floors (Legacy compatibility)
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
    if (!stmt) {
      const { rows: projRows } = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      if (!projRows[0]) return res.status(404).json({ error: 'Project not found' });
      const defaultPlotArea = parseFloat(projRows[0].area_sq_ft) ? (parseFloat(projRows[0].area_sq_ft) / SQM_TO_SQFT) : 0;
      const { rows: [newStmt] } = await pool.query(
        `INSERT INTO project_area_statements
          (project_id, plot_area_sqm, city_survey_area_sqm, site_area_sqm, dp_deductions_sqm, existing_builtup_area_sqm, dividing_factor, basic_fsi_factor, paid_fsi_factor, tdr_factor, proposed_tdr_factor, building_use, regular_tdr_factor, slum_tdr_factor, is_gunthewari, road_width_m, created_by)
         VALUES ($1, $2, $2, $2, 0, 0, 1.6, 1.1, 0.5, 0.65, NULL, 'Residential', NULL, NULL, false, null, $3)
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
    const isPlineOv = Boolean(is_pline_overridden);
    const plineOvReason = pline_override_reason || null;
    const lobby = isOverride ? (parseFloat(lobby_area_sqm) || 0) : Math.round(pline * 0.15 * 100) / 100;
    if (isOverride && lobby > pline + 0.0001) {
      return res.status(400).json({ error: `Lobby Area (${lobby} sq m) cannot exceed P-Line Area (${pline} sq m).` });
    }
    if (no_of_units !== undefined && no_of_units !== null && no_of_units !== '') {
      const uNum = Number(no_of_units);
      if (!Number.isFinite(uNum) || !Number.isInteger(uNum) || uNum < 0) {
        return res.status(400).json({ error: 'No. of Units must be a non-negative integer.' });
      }
    }
    const units = no_of_units !== undefined && no_of_units !== null && no_of_units !== '' ? parseInt(no_of_units, 10) : 1;
    const sale = builtup_for_sale_sqm !== undefined && builtup_for_sale_sqm !== null ? (parseFloat(builtup_for_sale_sqm) || 0) : Math.round((pline - lobby) * 10000) / 10000;
    const areaFor1Unit = units > 0 ? Math.round((sale / units) * 10000) / 10000 : 0;
    const rate = parseFloat(rate_per_sqm) || 0;
    const computedCost1Unit = units > 0 && rate > 0 ? Math.round(areaFor1Unit * rate * 100) / 100 : (parseFloat(cost_for_1_unit) || 0);

    const { rows: [newFloor] } = await pool.query(
      `INSERT INTO project_area_floors
        (area_statement_id, floor_name, floor_order, height_meters, pline_area_sqm, lobby_area_sqm, is_lobby_overridden, is_pline_overridden, pline_override_reason, builtup_for_owners_sqm, builtup_for_sale_sqm, usage_type, floor_type, no_of_units, area_for_1_unit, rate_per_sqm, cost_for_1_unit, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        stmt.id,
        floor_name ? floor_name.trim() : defaultFloorName,
        floor_order || nextOrder,
        parseNum(height_meters, 2.85),
        pline,
        lobby,
        isOverride,
        isPlineOv,
        plineOvReason,
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

// 4a. PUT /api/projects/:projectId/feasibility/area/floors/batch
// Transactional batch update of all floor rows on Save Feasibility
router.put('/area/floors/batch', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { floors: floorUpdates } = req.body;
  if (!Array.isArray(floorUpdates)) {
    return res.status(400).json({ error: 'floors array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [stmt] } = await client.query('SELECT id FROM project_area_statements WHERE project_id = $1 FOR UPDATE', [projectId]);
    if (!stmt) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Area statement not found' });
    }

    for (const f of floorUpdates) {
      if (!f || !f.id) continue;
      const pline = parseNum(f.pline_area_sqm, 0);
      if (pline < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${f.floor_name || 'Floor'}: P-Line Area cannot be negative.` });
      }
      const height = parseNum(f.height_meters, 0);
      if (height < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${f.floor_name || 'Floor'}: Height cannot be negative.` });
      }
      const isLobbyOv = Boolean(f.is_lobby_overridden);
      const isHabitable = f.floor_type !== 'parking' && f.floor_type !== 'terrace' && f.floor_type !== 'service';
      const lobby = !isHabitable ? 0 : (isLobbyOv ? parseNum(f.lobby_area_sqm, 0) : Math.round(pline * 0.15 * 100) / 100);
      if (lobby < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${f.floor_name || 'Floor'}: Lobby Area cannot be negative.` });
      }
      if (isHabitable && isLobbyOv && lobby > pline + 0.0001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${f.floor_name || 'Floor'}: Lobby Area (${lobby} sq m) cannot exceed P-Line Area (${pline} sq m).` });
      }
      if (f.no_of_units !== undefined && f.no_of_units !== null && f.no_of_units !== '') {
        const uNum = Number(f.no_of_units);
        if (!Number.isFinite(uNum) || !Number.isInteger(uNum) || uNum < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `${f.floor_name || 'Floor'}: No. of Units must be a non-negative integer.` });
        }
      }
      const sale = isHabitable ? Math.round((pline - lobby) * 10000) / 10000 : 0;
      const units = isHabitable ? parseInt(parseNum(f.no_of_units, 1), 10) : 0;
      const areaFor1Unit = units > 0 ? Math.round((sale / units) * 10000) / 10000 : 0;
      const isPlineOv = Boolean(f.is_pline_overridden);

      await client.query(
        `UPDATE project_area_floors SET
          height_meters = $1,
          pline_area_sqm = $2,
          lobby_area_sqm = $3,
          is_lobby_overridden = $4,
          builtup_for_sale_sqm = $5,
          usage_type = COALESCE($6, usage_type),
          no_of_units = $7,
          area_for_1_unit = $8,
          is_pline_overridden = $9,
          pline_override_reason = CASE WHEN $9 = TRUE THEN $10 ELSE NULL END,
          remarks = COALESCE($11, remarks),
          updated_at = NOW()
         WHERE id = $12 AND area_statement_id = $13`,
        [
          height,
          pline,
          lobby,
          isLobbyOv,
          sale,
          f.usage_type || null,
          units,
          areaFor1Unit,
          isPlineOv,
          f.pline_override_reason || null,
          f.remarks !== undefined ? f.remarks : null,
          parseInt(f.id, 10),
          stmt.id
        ]
      );
    }

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      floors: recalc?.floors,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Floors updated successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error batch updating floors:', err);
    res.status(500).json({ error: 'Failed to update floors' });
  } finally {
    client.release();
  }
});

// 4b. PUT /api/projects/:projectId/feasibility/area/floors/:floorId
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
      'SELECT * FROM project_area_floors WHERE id = $1 AND area_statement_id = (SELECT id FROM project_area_statements WHERE project_id = $2)',
      [floorId, projectId]
    );
    if (!existing) return res.status(404).json({ error: 'Floor record not found' });

    const pline = pline_area_sqm !== undefined ? parseNum(pline_area_sqm, 0) : parseNum(existing.pline_area_sqm, 0);
    if (pline < 0) return res.status(400).json({ error: 'P-Line Area cannot be negative.' });
    const isOverride = is_lobby_overridden !== undefined ? Boolean(is_lobby_overridden) : Boolean(existing.is_lobby_overridden);

    let lobby = existing.lobby_area_sqm;
    if (isOverride) {
      if (lobby_area_sqm !== undefined) lobby = parseNum(lobby_area_sqm, 0);
      if (lobby < 0) return res.status(400).json({ error: 'Lobby Area cannot be negative.' });
      if (lobby > pline + 0.0001) {
        return res.status(400).json({ error: `Lobby Area (${lobby} sq m) cannot exceed P-Line Area (${pline} sq m).` });
      }
    } else {
      lobby = Math.round(pline * 0.15 * 100) / 100;
    }

    if (no_of_units !== undefined && no_of_units !== null && no_of_units !== '') {
      const uNum = Number(no_of_units);
      if (!Number.isFinite(uNum) || !Number.isInteger(uNum) || uNum < 0) {
        return res.status(400).json({ error: 'No. of Units must be a non-negative integer.' });
      }
    }
    const sale = builtup_for_sale_sqm !== undefined ? parseNum(builtup_for_sale_sqm, 0) : Math.round((pline - lobby) * 10000) / 10000;
    const units = no_of_units !== undefined && no_of_units !== null && no_of_units !== '' ? parseInt(no_of_units, 10) : (existing.no_of_units !== null && existing.no_of_units !== undefined ? parseInt(existing.no_of_units, 10) : 1);
    const areaFor1Unit = units > 0 ? Math.round((sale / units) * 10000) / 10000 : 0;
    const rate = rate_per_sqm !== undefined ? parseNum(rate_per_sqm, 0) : parseNum(existing.rate_per_sqm, 0);
    const computedCost1Unit = units > 0 && rate > 0
      ? Math.round(areaFor1Unit * rate * 100) / 100
      : (cost_for_1_unit !== undefined ? parseNum(cost_for_1_unit, 0) : parseNum(existing.cost_for_1_unit, 0));
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
        height_meters !== undefined ? parseNum(height_meters, 3.0) : null,
        pline,
        lobby,
        isOverride,
        builtup_for_owners_sqm !== undefined ? parseNum(builtup_for_owners_sqm, 0) : null,
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
router.delete('/area/floors/:floorId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const floorId = parseInt(req.params.floorId, 10);

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM project_area_floors WHERE id = $1 AND area_statement_id = (SELECT id FROM project_area_statements WHERE project_id = $2)',
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
router.post('/area/reconcile-floors', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: confRows } = await client.query('SELECT * FROM timeline_configurations WHERE project_id = $1', [projectId]);
    const conf = confRows[0] || { floors_above_ground: 4, ground_floor_config: 'stilt', has_stilt_parking: true, has_terrace_tank_slab: true };
    await reconcileBuildingFloors(client, projectId, req.user.id, conf);
    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      floors: recalc?.floors || [],
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Floors reconciled successfully with Building Configuration'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reconciling floors:', err);
    res.status(500).json({ error: 'Failed to reconcile floors' });
  } finally {
    client.release();
  }
});

// 5c. PUT /api/projects/:projectId/feasibility/financial/overrides
router.put('/financial/overrides', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { key, override_val, calculated_basis_val, reason } = req.body;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Override key is required' });
  }

  if (key === 'statutory_LABOUR_WELFARE_PARKING') {
    return res.status(400).json({
      error: 'Labour Welfare on Parking Area is a direct manual admin input and cannot be saved as a formula override.'
    });
  }

  const parsedVal = parseFloat(override_val);
  if (override_val === undefined || override_val === null || isNaN(parsedVal) || !isFinite(parsedVal) || parsedVal < 0) {
    return res.status(400).json({ error: 'Override amount must be a valid non-negative number' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [fin] } = await client.query(
      'SELECT * FROM project_financial_viabilities WHERE project_id = $1 FOR UPDATE',
      [projectId]
    );
    if (!fin) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial viability not found' });
    }

    let overrides = fin.overrides || {};
    if (typeof overrides === 'string') {
      try { overrides = JSON.parse(overrides); } catch { overrides = {}; }
    }
    let history = fin.override_history || [];
    if (typeof history === 'string') {
      try { history = JSON.parse(history); } catch { history = []; }
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

    const { rows: [updated] } = await client.query(
      'UPDATE project_financial_viabilities SET overrides = $1, override_history = $2, version = version + 1, updated_at = NOW() WHERE project_id = $3 RETURNING *',
      [JSON.stringify(overrides), JSON.stringify(history), projectId]
    );

    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'SET_FINANCIAL_OVERRIDE', 'financial', 'project_financial_viabilities', $3, $4)`,
      [projectId, req.user.id, JSON.stringify({ key, oldOverride }), JSON.stringify({ key, newOverride: overrides[key] })]
    );

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);

    res.json({
      financial: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      statutoryCharges: recalc?.statutoryCharges,
      message: `Override for ${key} updated successfully`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating financial override:', err);
    res.status(500).json({ error: 'Failed to update financial override' });
  } finally {
    client.release();
  }
});

// 5d. POST /api/projects/:projectId/feasibility/financial/overrides/reset
router.post('/financial/overrides/reset', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { key } = req.body;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Override key is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [fin] } = await client.query(
      'SELECT * FROM project_financial_viabilities WHERE project_id = $1 FOR UPDATE',
      [projectId]
    );
    if (!fin) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial viability not found' });
    }

    let overrides = fin.overrides || {};
    if (typeof overrides === 'string') {
      try { overrides = JSON.parse(overrides); } catch { overrides = {}; }
    }
    let history = fin.override_history || [];
    if (typeof history === 'string') {
      try { history = JSON.parse(history); } catch { history = []; }
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

    const { rows: [updated] } = await client.query(
      'UPDATE project_financial_viabilities SET overrides = $1, override_history = $2, version = version + 1, updated_at = NOW() WHERE project_id = $3 RETURNING *',
      [JSON.stringify(overrides), JSON.stringify(history), projectId]
    );

    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'RESET_FINANCIAL_OVERRIDE', 'financial', 'project_financial_viabilities', $3, $4)`,
      [projectId, req.user.id, JSON.stringify({ key, oldOverride }), JSON.stringify({ key, newOverride: null })]
    );

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);

    res.json({
      financial: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      statutoryCharges: recalc?.statutoryCharges,
      message: `Override for ${key} reset to calculated successfully`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error resetting financial override:', err);
    res.status(500).json({ error: 'Failed to reset financial override' });
  } finally {
    client.release();
  }
});

// 6. PUT /api/projects/:projectId/feasibility/financial
router.put('/financial', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const {
    rr_rate_per_sqm,
    tdr_purchase_factor,
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
    notes,
    expected_version
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

  let pRrRate, pTdrFactor, pCostARate, pCostBRate, pCostPlot, pCostPlotRate, pCostConstRate, pCostInfra;
  let pCostBasement, pBasementArea, pBasementRate, pInterest, pRentAmt, pRentTenements, pRentPerMonth, pRentMonths;
  let pStackedCost, pStackedSlots, pStackedCostPerSlot, pMinorExp, pBpms, pAirport, pFire, pEntertainment, pExtraStamp, pAdvocate;

  try {
    pRrRate = parseFinParam(rr_rate_per_sqm, 'rr_rate_per_sqm');
    pTdrFactor = parseFinParam(tdr_purchase_factor, 'tdr_purchase_factor');
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
  } catch (validationErr) {
    return res.status(400).json({ error: validationErr.message });
  }

  // period_months is a display string such as "21-24 Months"
  const pPeriodStr = period_months !== undefined ? (period_months === null ? '' : String(period_months).trim()) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query('SELECT * FROM project_financial_viabilities WHERE project_id = $1 FOR UPDATE', [projectId]);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial viability not found' });
    }

    if (expected_version !== undefined && expected_version !== null && Number(expected_version) !== Number(existing.version)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Financial viability record was modified by another session. Please reload before saving.' });
    }

    const { rows: [updated] } = await client.query(
      `UPDATE project_financial_viabilities SET
        rr_rate_per_sqm = COALESCE($1, rr_rate_per_sqm),
        tdr_purchase_factor = COALESCE($2, tdr_purchase_factor),
        estimated_cost_a_rate = COALESCE($3, estimated_cost_a_rate),
        estimated_cost_b_rate = COALESCE($4, estimated_cost_b_rate),
        cost_of_plot = COALESCE($5, cost_of_plot),
        cost_of_plot_rate_per_sqm = COALESCE($6, cost_of_plot_rate_per_sqm),
        cost_of_construction_rate = COALESCE($7, cost_of_construction_rate),
        cost_of_infrastructure = COALESCE($8, cost_of_infrastructure),
        cost_of_basement = COALESCE($9, cost_of_basement),
        basement_area_sqm = COALESCE($10, basement_area_sqm),
        basement_rate_per_sqm = COALESCE($11, basement_rate_per_sqm),
        interest_amount = COALESCE($12, interest_amount),
        rent_amount = COALESCE($13, rent_amount),
        rent_tenements = COALESCE($14, rent_tenements),
        rent_per_tenement_per_month = COALESCE($15, rent_per_tenement_per_month),
        rent_months = COALESCE($16, rent_months),
        stacked_parking_cost = COALESCE($17, stacked_parking_cost),
        stacked_parking_slots = COALESCE($18, stacked_parking_slots),
        stacked_parking_cost_per_slot = COALESCE($19, stacked_parking_cost_per_slot),
        minor_expenses = COALESCE($20, minor_expenses),
        bpms_staff_charges = COALESCE($21, bpms_staff_charges),
        airport_noc = COALESCE($22, airport_noc),
        fire_noc = COALESCE($23, fire_noc),
        entertainment_charges = COALESCE($24, entertainment_charges),
        extra_stamp_duty = COALESCE($25, extra_stamp_duty),
        advocate_fees = COALESCE($26, advocate_fees),
        period_months = COALESCE($27, period_months),
        notes = COALESCE($28, notes),
        is_cost_of_plot_included = COALESCE($29, is_cost_of_plot_included),
        version = version + 1,
        updated_at = NOW()
       WHERE project_id = $30
       RETURNING *`,
      [
        pRrRate,
        pTdrFactor,
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
        pPeriodStr,
        notes !== undefined ? notes : null,
        is_cost_of_plot_included !== undefined ? Boolean(is_cost_of_plot_included) : null,
        projectId
      ]
    );

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

// Shared salable unit parser supporting fixed sq ft, percentage loading, & optional Area Statement floor link
function parseSalableUnitInput(body) {
  const rawCarpetSqft = parseOptNum(body.carpet_area_sqft);
  const rawCarpetSqm = parseOptNum(body.carpet_area_sqm);
  let carpetSqft = 0;
  let carpetSqm = 0;
  if (rawCarpetSqft !== null && rawCarpetSqft >= 0 && (rawCarpetSqft > 0 || rawCarpetSqm === null || rawCarpetSqm === 0)) {
    carpetSqft = rawCarpetSqft;
    carpetSqm = carpetSqft / SQM_TO_SQFT;
  } else if (rawCarpetSqm !== null && rawCarpetSqm > 0) {
    carpetSqm = rawCarpetSqm;
    carpetSqft = carpetSqm * SQM_TO_SQFT;
  }

  const loadingMode = body.loading_mode === 'percentage' ? 'percentage' : 'fixed_sqft';
  const loadingPct = Math.max(0, parseNum(body.loading_pct, 0));
  const rawLoading = body.super_buildup_loading_sqft !== undefined ? body.super_buildup_loading_sqft : body.loading_sqft;
  const loadingSqft = loadingMode === 'percentage'
    ? (carpetSqft * (loadingPct / 100))
    : Math.max(0, parseNum(rawLoading, 0));

  const superSqft = carpetSqft + loadingSqft;
  const hasUnitCount = body.unit_count !== undefined && body.unit_count !== null && body.unit_count !== '';
  const units = hasUnitCount ? Math.max(0, parseInt(parseNum(body.unit_count, 0), 10)) : null;
  const rawLandowner = body.landowner_unit_count !== undefined ? body.landowner_unit_count : body.landowner_units;
  const hasLandowner = rawLandowner !== undefined && rawLandowner !== null && rawLandowner !== '';
  const landownerUnits = hasLandowner ? Math.max(0, parseInt(parseNum(rawLandowner, 0), 10)) : 0;
  const finalBuildingUse = (body.building_use || body.use_type || 'Residential').trim();
  const rateSqft = Math.max(0, parseNum(body.rate_per_sqft, 0));
  const unitPrice = Math.round(superSqft * rateSqft * 100) / 100;
  const effectiveUnits = units !== null ? units : 0;
  const totalAmount = Math.round(unitPrice * effectiveUnits * 100) / 100;
  const sourceFloorId = (body.source_floor_id !== undefined && body.source_floor_id !== null && body.source_floor_id !== '')
    ? parseInt(body.source_floor_id, 10)
    : null;

  return {
    unitName: body.unit_name ? body.unit_name.trim() : null,
    finalBuildingUse,
    sourceFloorId: Number.isInteger(sourceFloorId) && sourceFloorId > 0 ? sourceFloorId : null,
    carpetSqm,
    carpetSqft,
    loadingMode,
    loadingPct,
    loadingSqft,
    superSqft,
    units,
    landownerUnits,
    rateSqft,
    unitPrice,
    totalAmount
  };
}

// 7. POST /api/projects/:projectId/feasibility/financial/salable-units
router.post('/financial/salable-units', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const parsed = parseSalableUnitInput(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows: [fin] } = await client.query('SELECT id FROM project_financial_viabilities WHERE project_id = $1 FOR UPDATE', [projectId]);
    if (!fin) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial viability record not found' });
    }

    let floorUnits = null;
    let floorName = null;
    let floorBuiltupSaleSqm = 0;
    if (parsed.sourceFloorId) {
      const { rows: [validFloor] } = await client.query(
        `SELECT f.id, f.no_of_units, f.floor_name, f.builtup_for_sale_sqm FROM project_area_floors f
         JOIN project_area_statements s ON s.id = f.area_statement_id
         WHERE f.id = $1 AND s.project_id = $2`,
        [parsed.sourceFloorId, projectId]
      );
      if (!validFloor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid source_floor_id for this project' });
      }
      floorUnits = Math.max(0, parseInt(validFloor.no_of_units, 10) || 0);
      floorName = validFloor.floor_name;
      floorBuiltupSaleSqm = parseNum(validFloor.builtup_for_sale_sqm, 0);
    }

    const finalUnits = parsed.units !== null ? parsed.units : (floorUnits !== null ? floorUnits : 1);
    const finalLandowner = Math.min(finalUnits, parsed.landownerUnits);
    let finalSuperSqft = parsed.superSqft;
    let finalCarpetSqm = parsed.carpetSqm;
    let finalCarpetSqft = parsed.carpetSqft;
    if (parsed.sourceFloorId && finalSuperSqft === 0 && floorBuiltupSaleSqm > 0 && finalUnits > 0) {
      const perUnitSqm = floorBuiltupSaleSqm / finalUnits;
      finalCarpetSqm = perUnitSqm;
      finalCarpetSqft = perUnitSqm * SQM_TO_SQFT;
      finalSuperSqft = finalCarpetSqft;
    }
    const finalUnitPrice = Math.round(finalSuperSqft * parsed.rateSqft * 100) / 100;
    const finalTotalAmount = Math.round(finalUnitPrice * finalUnits * 100) / 100;

    const { rows: [maxOrder] } = await client.query(
      'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM project_salable_units WHERE financial_viability_id = $1',
      [fin.id]
    );

    const { rows: [newUnit] } = await client.query(
      `INSERT INTO project_salable_units
        (financial_viability_id, source_floor_id, unit_name, carpet_area_sqm, carpet_area_sqft, super_buildup_area_sqft, super_buildup_loading_sqft, loading_mode, loading_pct, unit_count, landowner_unit_count, building_use, rate_per_sqft, unit_price, total_amount, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        fin.id,
        parsed.sourceFloorId,
        parsed.unitName || (floorName ? `${floorName} Units` : 'Salable Unit'),
        finalCarpetSqm,
        finalCarpetSqft,
        finalSuperSqft,
        parsed.loadingSqft,
        parsed.loadingMode,
        parsed.loadingPct,
        finalUnits,
        finalLandowner,
        parsed.finalBuildingUse,
        parsed.rateSqft,
        finalUnitPrice,
        finalTotalAmount,
        maxOrder.next_order
      ]
    );

    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'ADD_SALABLE_UNIT', 'financial', 'project_salable_units', NULL, $3)`,
      [projectId, req.user.id, JSON.stringify(newUnit)]
    );

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.status(201).json({
      unit: newUnit,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Salable unit added successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adding salable unit:', err);
    res.status(500).json({ error: 'Failed to add salable unit' });
  } finally {
    client.release();
  }
});

// 8. PUT /api/projects/:projectId/feasibility/financial/salable-units/:unitId
router.put('/financial/salable-units/:unitId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const unitId = parseInt(req.params.unitId, 10);
  const parsed = parseSalableUnitInput(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query(
      `SELECT u.* FROM project_salable_units u
       JOIN project_financial_viabilities f ON f.id = u.financial_viability_id
       WHERE u.id = $1 AND f.project_id = $2 FOR UPDATE`,
      [unitId, projectId]
    );
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Salable unit not found' });
    }

    const hasSourceFloorKey = Object.prototype.hasOwnProperty.call(req.body, 'source_floor_id');
    const resolvedFloorId = hasSourceFloorKey ? parsed.sourceFloorId : existing.source_floor_id;
    let floorUnits = null;
    let floorBuiltupSaleSqm = 0;
    if (resolvedFloorId) {
      const { rows: [validFloor] } = await client.query(
        `SELECT f.id, f.no_of_units, f.builtup_for_sale_sqm FROM project_area_floors f
         JOIN project_area_statements s ON s.id = f.area_statement_id
         WHERE f.id = $1 AND s.project_id = $2`,
        [resolvedFloorId, projectId]
      );
      if (!validFloor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid source_floor_id for this project' });
      }
      floorUnits = Math.max(0, parseInt(validFloor.no_of_units, 10) || 0);
      floorBuiltupSaleSqm = parseNum(validFloor.builtup_for_sale_sqm, 0);
    }

    const finalUnits = parsed.units !== null ? parsed.units : (floorUnits !== null ? floorUnits : existing.unit_count);
    const hasExplicitLandowner = req.body.landowner_unit_count !== undefined || req.body.landowner_units !== undefined;
    const finalLandowner = Math.min(finalUnits, hasExplicitLandowner ? parsed.landownerUnits : existing.landowner_unit_count);
    let finalSuperSqft = parsed.superSqft;
    let finalCarpetSqm = parsed.carpetSqm;
    let finalCarpetSqft = parsed.carpetSqft;
    if (resolvedFloorId && finalSuperSqft === 0 && floorBuiltupSaleSqm > 0 && finalUnits > 0) {
      const perUnitSqm = floorBuiltupSaleSqm / finalUnits;
      finalCarpetSqm = perUnitSqm;
      finalCarpetSqft = perUnitSqm * SQM_TO_SQFT;
      finalSuperSqft = finalCarpetSqft;
    }
    const finalUnitPrice = Math.round(finalSuperSqft * parsed.rateSqft * 100) / 100;
    const finalTotalAmount = Math.round(finalUnitPrice * finalUnits * 100) / 100;

    const { rows: [updatedUnit] } = await client.query(
      `UPDATE project_salable_units SET
        source_floor_id = $14,
        unit_name = COALESCE($1, unit_name),
        carpet_area_sqm = $2,
        carpet_area_sqft = $3,
        super_buildup_area_sqft = $4,
        super_buildup_loading_sqft = $5,
        loading_mode = $6,
        loading_pct = $7,
        unit_count = $8,
        landowner_unit_count = $9,
        building_use = COALESCE($10, building_use),
        rate_per_sqft = $11,
        unit_price = $12,
        total_amount = $13
       WHERE id = $15
       RETURNING *`,
      [
        parsed.unitName,
        finalCarpetSqm,
        finalCarpetSqft,
        finalSuperSqft,
        parsed.loadingSqft,
        parsed.loadingMode,
        parsed.loadingPct,
        finalUnits,
        finalLandowner,
        parsed.finalBuildingUse,
        parsed.rateSqft,
        finalUnitPrice,
        finalTotalAmount,
        resolvedFloorId,
        unitId
      ]
    );

    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_SALABLE_UNIT', 'financial', 'project_salable_units', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing), JSON.stringify(updatedUnit)]
    );

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      unit: updatedUnit,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Salable unit updated successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating salable unit:', err);
    res.status(500).json({ error: 'Failed to update salable unit' });
  } finally {
    client.release();
  }
});

// 8b. POST /api/projects/:projectId/feasibility/financial/salable-units/sync-floors
// Creates or refreshes floor-linked Receipts rows from Area Statement habitable floors (no duplicate entry table)
router.post('/financial/salable-units/sync-floors', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows: [fin] } = await client.query('SELECT id FROM project_financial_viabilities WHERE project_id = $1 FOR UPDATE', [projectId]);
    if (!fin) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Financial viability record not found' });
    }

    const recalcBefore = await getRecalculatedFeasibility(client, projectId);
    const floors = (recalcBefore?.areaMetrics?.evaluatedFloors || []).filter(
      (f) => f.floor_type !== 'parking' && f.floor_type !== 'terrace' && f.floor_type !== 'service' && (f.no_of_units || 0) > 0
    );

    const { rows: existingUnits } = await client.query(
      'SELECT * FROM project_salable_units WHERE financial_viability_id = $1 ORDER BY order_index ASC, id ASC',
      [fin.id]
    );
    const existingByFloorId = new Map();
    let maxOrd = 0;
    for (const u of existingUnits) {
      maxOrd = Math.max(maxOrd, u.order_index || 0);
      if (u.source_floor_id) existingByFloorId.set(Number(u.source_floor_id), u);
    }

    for (const fl of floors) {
      const unitAreaSqm = parseNum(fl.area_for_1_unit_raw ?? fl.area_for_1_unit, 0);
      const unitAreaSqft = unitAreaSqm * SQM_TO_SQFT;
      const unitsCnt = parseInt(fl.no_of_units, 10) || 0;
      const existingRow = existingByFloorId.get(Number(fl.id));

      if (existingRow) {
        const rate = parseNum(existingRow.rate_per_sqft, 0);
        const lSqft = parseNum(existingRow.super_buildup_loading_sqft, 0);
        const superSqft = unitAreaSqft + lSqft;
        const unitPrice = Math.round(superSqft * rate * 100) / 100;
        const totalAmt = Math.round(unitPrice * unitsCnt * 100) / 100;
        const ownUnits = Math.min(unitsCnt, parseInt(existingRow.landowner_unit_count, 10) || 0);
        await client.query(
          `UPDATE project_salable_units SET
            carpet_area_sqm = $1,
            carpet_area_sqft = $2,
            super_buildup_area_sqft = $3,
            unit_count = $4,
            landowner_unit_count = $5,
            building_use = $6,
            unit_price = $7,
            total_amount = $8
           WHERE id = $9`,
          [unitAreaSqm, unitAreaSqft, superSqft, unitsCnt, ownUnits, fl.usage_type || 'Residential', unitPrice, totalAmt, existingRow.id]
        );
      } else {
        maxOrd += 1;
        await client.query(
          `INSERT INTO project_salable_units
            (financial_viability_id, source_floor_id, unit_name, carpet_area_sqm, carpet_area_sqft, super_buildup_area_sqft, super_buildup_loading_sqft, loading_mode, loading_pct, unit_count, landowner_unit_count, building_use, rate_per_sqft, unit_price, total_amount, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 'fixed_sqft', 0, $7, 0, $8, 0, 0, 0, $9)`,
          [fin.id, fl.id, `${fl.floor_name} Units`, unitAreaSqm, unitAreaSqft, unitAreaSqft, unitsCnt, fl.usage_type || 'Residential', maxOrd]
        );
      }
    }

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      salableUnits: recalc?.salableUnits || [],
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Receipts synchronized with Area Statement floor unit areas'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error syncing salable units from floors:', err);
    res.status(500).json({ error: 'Failed to sync salable units from floors' });
  } finally {
    client.release();
  }
});

// 9. DELETE /api/projects/:projectId/feasibility/financial/salable-units/:unitId
router.delete('/financial/salable-units/:unitId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const unitId = parseInt(req.params.unitId, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query(
      `SELECT u.* FROM project_salable_units u
       JOIN project_financial_viabilities f ON f.id = u.financial_viability_id
       WHERE u.id = $1 AND f.project_id = $2 FOR UPDATE`,
      [unitId, projectId]
    );
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Salable unit not found' });
    }

    await client.query('DELETE FROM project_salable_units WHERE id = $1', [unitId]);
    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'DELETE_SALABLE_UNIT', 'financial', 'project_salable_units', $3, NULL)`,
      [projectId, req.user.id, JSON.stringify(existing)]
    );

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Salable unit deleted successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting salable unit:', err);
    res.status(500).json({ error: 'Failed to delete salable unit' });
  } finally {
    client.release();
  }
});

// 10. PATCH /api/projects/:projectId/feasibility/statutory/:chargeId
router.patch('/statutory/:chargeId', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const chargeId = parseInt(req.params.chargeId, 10);
  const { is_enabled, rr_percentage, amount, is_custom, charge_name } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query(
      `SELECT c.* FROM project_statutory_charges c
       JOIN project_financial_viabilities f ON f.id = c.financial_viability_id
       WHERE c.id = $1 AND f.project_id = $2 FOR UPDATE`,
      [chargeId, projectId]
    );

    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Statutory charge not found' });
    }

    let parsedAmount = null;
    if (amount !== undefined) {
      if (amount === null || (typeof amount === 'string' && amount.trim() === '')) {
        parsedAmount = 0;
      } else {
        const p = parseFloat(amount);
        if (isNaN(p) || !isFinite(p)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Statutory charge amount must be a valid number' });
        }
        if (p < 0) {
          await client.query('ROLLBACK');
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
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'RR percentage must be a valid number' });
        }
        if (p < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'RR percentage cannot be negative' });
        }
        parsedRrPct = p;
      }
    }

    // Only allow amount updates on manual/custom charges so calculated rows cannot drift via arbitrary amount writes
    const isManualOrCustom = existing.charge_code === 'LABOUR_WELFARE_PARKING' || existing.is_custom || Boolean(is_custom);
    const amountToWrite = isManualOrCustom ? parsedAmount : null;

    const { rows: [updated] } = await client.query(
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
        amountToWrite,
        is_custom !== undefined ? Boolean(is_custom) : null,
        charge_name ? charge_name.trim() : null,
        chargeId
      ]
    );

    await client.query(
      `INSERT INTO feasibility_audit_logs (project_id, user_id, action, module, entity_type, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_STATUTORY_CHARGE', 'financial', 'project_statutory_charges', $3, $4)`,
      [projectId, req.user.id, JSON.stringify(existing), JSON.stringify(updated)]
    );

    await client.query('COMMIT');
    const recalc = await getRecalculatedFeasibility(pool, projectId);
    res.json({
      charge: updated,
      areaMetrics: recalc?.areaMetrics,
      financialMetrics: recalc?.financialMetrics,
      message: 'Statutory charge updated successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating statutory charge:', err);
    res.status(500).json({ error: 'Failed to update statutory charge' });
  } finally {
    client.release();
  }
});

// 11. DELETE /api/projects/:projectId/feasibility/statutory/:chargeId
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

    const { rows: [archived] } = await pool.query(
      `UPDATE project_statutory_charges SET
        is_deleted = TRUE,
        is_enabled = FALSE,
        deleted_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [chargeId]
    );

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

// 12. POST /api/projects/:projectId/feasibility/snapshots
router.post('/snapshots', authenticate, checkProjectAccess(), requireFeasibilityEdit, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { snapshot_name, area_data_snapshot, financial_data_snapshot } = req.body;

  try {
    const { rows: [maxVer] } = await pool.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_ver FROM project_feasibility_snapshots WHERE project_id = $1',
      [projectId]
    );

    let areaPayload = area_data_snapshot;
    let finPayload = financial_data_snapshot;
    if (!areaPayload || !finPayload) {
      const recalc = await getRecalculatedFeasibility(pool, projectId);
      if (!areaPayload) areaPayload = { statement: recalc?.statement || {}, floors: recalc?.floors || [], areaMetrics: recalc?.areaMetrics || {} };
      if (!finPayload) finPayload = { financial: recalc?.financial || {}, statutoryCharges: recalc?.statutoryCharges || [], salableUnits: recalc?.salableUnits || [], financialMetrics: recalc?.financialMetrics || {} };
    }

    const { rows: [snapshot] } = await pool.query(
      `INSERT INTO project_feasibility_snapshots
        (project_id, version_number, snapshot_name, area_data_snapshot, financial_data_snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        projectId,
        maxVer.next_ver,
        (snapshot_name || `Feasibility Snapshot v${maxVer.next_ver}`).trim(),
        JSON.stringify(areaPayload || {}),
        JSON.stringify(finPayload || {}),
        req.user.id
      ]
    );

    res.status(201).json({ snapshot, message: 'Feasibility snapshot created successfully' });
  } catch (err) {
    console.error('Error creating snapshot:', err);
    res.status(500).json({ error: 'Failed to create feasibility snapshot' });
  }
});

// 13a. GET /api/projects/:projectId/feasibility/snapshots
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

// 13b. GET /api/projects/:projectId/feasibility/snapshots/:snapshotId
router.get('/snapshots/:snapshotId', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const snapshotId = parseInt(req.params.snapshotId, 10);
  try {
    const { rows: [snapshot] } = await pool.query(
      `SELECT s.*, u.name as created_by_name
       FROM project_feasibility_snapshots s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.id = $1 AND s.project_id = $2`,
      [snapshotId, projectId]
    );
    if (!snapshot) return res.status(404).json({ error: 'Feasibility snapshot not found' });
    res.json({ snapshot });
  } catch (err) {
    console.error('Error reading snapshot:', err);
    res.status(500).json({ error: 'Failed to read feasibility snapshot' });
  }
});

async function resolveExportData(projectId, snapshotIdParam) {
  const { rows: [project] } = await pool.query('SELECT id, name, area_sq_ft, type, location, client_name, status FROM projects WHERE id = $1', [projectId]);
  if (!project) return null;

  if (snapshotIdParam) {
    const sid = parseInt(snapshotIdParam, 10);
    const { rows: [snap] } = await pool.query(
      'SELECT * FROM project_feasibility_snapshots WHERE id = $1 AND project_id = $2',
      [sid, projectId]
    );
    if (!snap) return { notFoundSnapshot: true };
    const areaSnap = snap.area_data_snapshot || {};
    const finSnap = snap.financial_data_snapshot || {};
    const statement = areaSnap.statement || {};
    const floors = areaSnap.floors || [];
    const financial = finSnap.financial || {};
    const statutoryCharges = finSnap.statutoryCharges || [];
    const salableUnits = finSnap.salableUnits || [];
    const areaMetrics = areaSnap.areaMetrics || calculateAreaMetrics(statement, floors);
    const financialMetrics = finSnap.financialMetrics || calculateFinancialMetrics(financial, statutoryCharges, salableUnits, areaMetrics);
    return {
      project,
      statement,
      floors: areaMetrics.evaluatedFloors || floors,
      financial,
      statutoryCharges: financialMetrics.evaluatedStatutoryCharges || statutoryCharges,
      salableUnits: financialMetrics.evaluatedSalableUnits || salableUnits,
      areaMetrics,
      financialMetrics
    };
  }

  return getRecalculatedFeasibility(pool, projectId);
}

// 14a. GET /api/projects/:projectId/feasibility/export/excel
router.get('/export/excel', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const data = await resolveExportData(projectId, req.query.snapshotId);
    if (!data) return res.status(404).json({ error: 'Project or feasibility data not found' });
    if (data.notFoundSnapshot) return res.status(404).json({ error: 'Requested feasibility snapshot not found' });

    const buffer = await generateFeasibilityExcelBuffer(data);
    const safeName = String(data.project?.name || 'Statement').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="DS16_Feasibility_${safeName}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Error generating Excel feasibility workbook:', err);
    res.status(500).json({ error: 'Failed to generate feasibility Excel workbook' });
  }
});

// 14b. GET /api/projects/:projectId/feasibility/export/pdf
router.get('/export/pdf', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const data = await resolveExportData(projectId, req.query.snapshotId);
    if (!data) return res.status(404).json({ error: 'Project or feasibility data not found' });
    if (data.notFoundSnapshot) return res.status(404).json({ error: 'Requested feasibility snapshot not found' });

    const buffer = await generateFeasibilityPdfBuffer(data);
    const safeName = String(data.project?.name || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="DS16_Feasibility_Report_${safeName}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('Error generating PDF feasibility report:', err);
    res.status(500).json({ error: 'Failed to generate feasibility PDF report' });
  }
});

// 15. GET /api/projects/:projectId/feasibility/export (JSON summary compatibility)
router.get('/export', authenticate, checkProjectAccess(), requireFeasibilityAccess, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  try {
    const data = await resolveExportData(projectId, req.query.snapshotId);
    if (!data) return res.status(404).json({ error: 'Project not found' });
    if (data.notFoundSnapshot) return res.status(404).json({ error: 'Requested feasibility snapshot not found' });

    const { project, statement, floors, financial, areaMetrics, financialMetrics } = data;
    res.json({
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
          proposed_paid_fsi_sqm: areaMetrics.proposedPaidFsiSqm,
          tdr_sqm: areaMetrics.permissibleTdrSqm,
          proposed_tdr_sqm: areaMetrics.proposedTdrSqm,
          total_proposed_pline_sqm: areaMetrics.totalProposedPlineSqm,
          total_units_count: areaMetrics.totalUnitsCount,
          total_salable_area_sqm: areaMetrics.totalBuiltupForSaleSqm,
          weighted_avg_area_per_unit_sqm: areaMetrics.weightedAverageAreaPerUnitSqm,
          net_balance_sqm: areaMetrics.areaBalanceSqm,
          margin_h_by_5_m: areaMetrics.marginHBy5Meters
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
          tenant_rent: financialMetrics.rentCostF,
          stacked_parking: financialMetrics.stackedParkingCostG,
          plot_cost: financialMetrics.costOfPlotH,
          infrastructure_cost: financialMetrics.costOfInfrastructure,
          interest_amount: financialMetrics.interestAmount,
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
          roi_pct: financialMetrics.roiPct,
          profit_margin_pct: financialMetrics.profitMarginPct
        }
      }
    });
  } catch (err) {
    console.error('Error generating feasibility export:', err);
    res.status(500).json({ error: 'Failed to generate feasibility export document' });
  }
});

module.exports = router;

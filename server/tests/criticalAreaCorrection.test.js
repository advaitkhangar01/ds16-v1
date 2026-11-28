// server/tests/criticalAreaCorrection.test.js
// Section 12 Comprehensive Test Suite — Critical Area Statement Correction
// Verifies Net Plotable Area, FSI non-auto-consumption, TDR road-width split + Gunthewari preservation,
// Mixed-Use % validation & ancillary allocation, 6-column Proposed P-Line unit arithmetic,
// Weighted Average Area per Unit, Area Balance tolerance, Basement/Terrace height exclusion,
// Financial Viability floor-linked receipts, and Excel/PDF exports.

const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const {
  SQM_TO_SQFT,
  AREA_BALANCE_ROUNDING_TOLERANCE_SQM,
  ROAD_WIDTH_TOTAL_TDR_MAP,
  ROAD_WIDTH_TDR_MAP,
  validateAreaStatementInputs,
  calculateAreaMetrics,
  calculateFinancialMetrics
} = require('../services/feasibilityEngine');

describe('Critical Area Statement Correction Suite (Section 12)', () => {
  let adminUser;
  let testClientId;
  let testProjectId;

  beforeAll(async () => {
    const { rows: [admin] } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    adminUser = { ...admin, token: signToken(admin.id) };

    const { rows: [clientRow] } = await pool.query(
      "INSERT INTO clients (name, email) VALUES ('Critical Area Test Client', 'critical_area_test@example.com') RETURNING id"
    );
    testClientId = clientRow.id;

    const { rows: [proj] } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name, area_sq_ft)
       VALUES ('Critical Area Test Project', $1, 'Commercial', 'Planning', $2, 'Critical Area Test Client', 10763.91)
       RETURNING *`,
      [testClientId, adminUser.id]
    );
    testProjectId = proj.id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await pool.query('DELETE FROM project_feasibility_snapshots WHERE project_id = $1', [testProjectId]);
      await pool.query('DELETE FROM feasibility_audit_logs WHERE project_id = $1', [testProjectId]);
      await pool.query(
        'DELETE FROM project_salable_units WHERE financial_viability_id IN (SELECT id FROM project_financial_viabilities WHERE project_id = $1)',
        [testProjectId]
      );
      await pool.query(
        'DELETE FROM project_statutory_charges WHERE financial_viability_id IN (SELECT id FROM project_financial_viabilities WHERE project_id = $1)',
        [testProjectId]
      );
      await pool.query('DELETE FROM project_financial_viabilities WHERE project_id = $1', [testProjectId]);
      await pool.query(
        'DELETE FROM project_area_floors WHERE area_statement_id IN (SELECT id FROM project_area_statements WHERE project_id = $1)',
        [testProjectId]
      );
      await pool.query('DELETE FROM project_area_statements WHERE project_id = $1', [testProjectId]);
      await pool.query('DELETE FROM timeline_configurations WHERE project_id = $1', [testProjectId]);
      await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    }
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    }
    await pool.end();
  });

  describe('1. Net Plotable Area & Independent Reference Measurements', () => {
    test('calculates Net Plotable Area = Plot - DP without substituting City Survey or Site Area', () => {
      const m = calculateAreaMetrics({
        plot_area_sqm: 500,
        city_survey_area_sqm: 550,
        site_area_sqm: 480,
        dp_deductions_sqm: 50,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5
      }, []);

      expect(m.plotAreaSqm).toBe(500);
      expect(m.citySurveyAreaSqm).toBe(550);
      expect(m.siteAreaSqm).toBe(480);
      expect(m.plotableAreaSqm).toBe(450);
      expect(m.permissibleFsiSqm).toBeCloseTo(495, 4);
    });

    test('rejects DP Deductions > Plot Area and never clamps negative Net Plotable Area', () => {
      const v = validateAreaStatementInputs({ plot_area_sqm: 400, dp_deductions_sqm: 450 });
      expect(v.valid).toBe(false);
      expect(v.error).toMatch(/exceed Area Of Plot/i);

      const m = calculateAreaMetrics({ plot_area_sqm: 400, dp_deductions_sqm: 450 }, []);
      expect(m.plotableAreaSqm).toBe(-50);
    });
  });

  describe('2. Paid FSI & Non-Auto-Consumption Rules', () => {
    test('keeps Max Permissible, Suggested (0 when no over-demand), and Effective Paid FSI distinct and uncharged when unused', () => {
      const m = calculateAreaMetrics({
        plot_area_sqm: 1000,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        road_width_m: 12
      }, []);

      expect(m.permissiblePaidFsiFactor).toBe(0.5);
      expect(m.permissiblePaidFsiSqm).toBe(500);
      expect(m.suggestedPaidFsiFactor).toBe(0);
      expect(m.effectiveProposedPaidFsiFactor).toBe(0);
      expect(m.proposedPaidFsiSqm).toBe(0);
      expect(m.remainingPaidFsiFactor).toBe(0.5);
      expect(m.remainingPaidFsiSqm).toBe(500);
      expect(m.suggestedTdrFactor).toBe(0);
      expect(m.totalProposedTdrFactor).toBe(0);
      expect(m.proposedTdrSqm).toBe(0);
      expect(m.proposedTotalBuiltupSqm).toBe(1100);

      const fin = calculateFinancialMetrics(
        { rr_rate_per_sqm: 30000, tdr_purchase_factor: 0.55 },
        [{ id: 1, charge_code: 'PREMIUM_FSI', charge_name: 'Premium FSI', rr_percentage: 40, is_enabled: true }],
        [],
        m
      );
      expect(fin.evaluatedStatutoryCharges[0].effective_amount).toBe(0);
      expect(fin.costOfTdrB).toBe(0);
    });

    test('sequentials auto-suggestion Basic -> Paid -> Eligible TDR only when floor/H demand exceeds Basic FSI', () => {
      const m = calculateAreaMetrics({
        plot_area_sqm: 1000,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        road_width_m: 12,
        building_use: 'Residential',
        is_proposed_pline_overridden: true,
        total_proposed_pline_override_sqm: 3200 // Primary FSI needed = 2000 -> 1100 Basic + 500 Paid (0.5) + 400 TDR (0.4)
      }, []);

      expect(m.suggestedPaidFsiFactor).toBe(0.5);
      expect(m.suggestedRegularTdrFactor).toBe(0.2);
      expect(m.suggestedSlumTdrFactor).toBe(0.2);
      expect(m.suggestedTdrFactor).toBe(0.4);
      expect(m.remainingTdrFactor).toBe(0.25);
    });
  });

  describe('3. TDR Road-Width 50/50 Split, 9m Defect Fix & Gunthewari Preservation', () => {
    test('enforces exact 50/50 default split across all 5 road widths (9m, 12m, 15m, 18m, 24m)', () => {
      const expected = [
        [9, 0.40, 0.20, 0.20],
        [12, 0.65, 0.325, 0.325],
        [15, 0.80, 0.40, 0.40],
        [18, 0.90, 0.45, 0.45],
        [24, 1.10, 0.55, 0.55]
      ];
      for (const [rw, tot, reg, slum] of expected) {
        expect(ROAD_WIDTH_TOTAL_TDR_MAP[rw]).toBe(tot);
        expect(ROAD_WIDTH_TDR_MAP[rw].regular).toBe(reg);
        expect(ROAD_WIDTH_TDR_MAP[rw].slum).toBe(slum);
        const m = calculateAreaMetrics({ plot_area_sqm: 1000, road_width_m: rw }, []);
        expect(m.totalTdrFactor).toBe(tot);
        expect(m.regularTdrFactor).toBe(reg);
        expect(m.slumTdrFactor).toBe(slum);
      }
    });

    test('heals legacy un-overridden 9m (0.40, 0.00) defect to 0.20/0.20 while respecting explicit custom override', () => {
      const legacyDefect = calculateAreaMetrics({
        plot_area_sqm: 1000,
        road_width_m: 9,
        total_tdr_factor: 0.40,
        regular_tdr_factor: 0.40,
        slum_tdr_factor: 0.00,
        is_regular_tdr_overridden: false
      }, []);
      expect(legacyDefect.regularTdrFactor).toBe(0.20);
      expect(legacyDefect.slumTdrFactor).toBe(0.20);
      expect(legacyDefect.isRegularTdrOverridden).toBe(false);

      const intentionalOverride = calculateAreaMetrics({
        plot_area_sqm: 1000,
        road_width_m: 12,
        total_tdr_factor: 0.65,
        regular_tdr_factor: 0.50,
        slum_tdr_factor: 0.15,
        is_regular_tdr_overridden: true
      }, []);
      expect(intentionalOverride.regularTdrFactor).toBe(0.50);
      expect(intentionalOverride.slumTdrFactor).toBe(0.15);
      expect(intentionalOverride.isRegularTdrOverridden).toBe(true);
    });

    test('Gunthewari restricts Eligible TDR to 50% Slum only WITHOUT modifying underlying 50/50 split', () => {
      const g9 = calculateAreaMetrics({
        plot_area_sqm: 1000,
        road_width_m: 9,
        is_gunthewari: true,
        proposed_slum_tdr_factor: 0.15
      }, []);
      expect(g9.totalTdrFactor).toBe(0.40);
      expect(g9.regularTdrFactor).toBe(0.20);
      expect(g9.slumTdrFactor).toBe(0.20);
      expect(g9.eligibleRegularTdrFactor).toBe(0);
      expect(g9.eligibleSlumTdrFactor).toBe(0.20);
      expect(g9.eligibleTdrFactor).toBe(0.20);
      expect(g9.effectiveProposedRegularTdrFactor).toBe(0);
      expect(g9.effectiveProposedSlumTdrFactor).toBe(0.15);
      expect(g9.remainingRegularTdrFactor).toBe(0);
      expect(g9.remainingSlumTdrFactor).toBe(0.05);
      expect(g9.remainingTdrFactor).toBe(0.05);
    });
  });

  describe('4. Mixed-Use Allocation Validation & Ancillary Application', () => {
    test('rejects Mixed-Use percentages with zero component or sum != 100%', () => {
      const badSum = validateAreaStatementInputs({
        plot_area_sqm: 1000,
        building_use: 'Mixed Use',
        primary_fsi_residential_pct: 60,
        primary_fsi_commercial_pct: 30
      });
      expect(badSum.valid).toBe(false);
      expect(badSum.error).toMatch(/100%/);

      const zeroPart = validateAreaStatementInputs({
        plot_area_sqm: 1000,
        building_use: 'Mixed Use',
        primary_fsi_residential_pct: 0,
        primary_fsi_commercial_pct: 100
      });
      expect(zeroPart.valid).toBe(false);
      expect(zeroPart.error).toMatch(/greater than 0%/i);
    });

    test('applies 60% Residential / 80% Commercial ancillary strictly to Res / Comm portions (60/40 split)', () => {
      const m = calculateAreaMetrics({
        plot_area_sqm: 1000,
        basic_fsi_factor: 1.0,
        paid_fsi_factor: 0,
        building_use: 'Mixed Use',
        primary_fsi_residential_pct: 60,
        primary_fsi_commercial_pct: 40
      }, [
        { id: 1, floor_name: '1st Floor', floor_type: 'habitable', pline_area_sqm: 0, height_meters: 3, no_of_units: 2 },
        { id: 2, floor_name: '2nd Floor', floor_type: 'habitable', pline_area_sqm: 0, height_meters: 3, no_of_units: 2 }
      ]);

      // 1000 Primary -> 600 Res (60% -> 360 Anc), 400 Comm (80% -> 320 Anc) -> P-Line 1680
      expect(m.proposedResidentialFsiSqm).toBe(600);
      expect(m.proposedCommercialFsiSqm).toBe(400);
      expect(m.proposedResidentialAncillarySqm).toBe(360);
      expect(m.proposedCommercialAncillarySqm).toBe(320);
      expect(m.calculatedProposedPlineSqm).toBe(1680);
      expect(m.totalProposedPlineSqm).toBe(1680);
    });
  });

  describe('5. Floor-wise Proposed P-Line Unit Arithmetic, Weighted Avg, Balance Tolerance & Height H', () => {
    test('computes exact example 219.63 - 32.94 = 186.69 / 2 = 93.345 sqm & full-precision sqft, zero units = 0/null, multi-floor weighted avg', () => {
      const m = calculateAreaMetrics({
        plot_area_sqm: 400,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5
      }, [
        {
          id: 10,
          floor_name: 'Basement 1',
          floor_type: 'parking',
          floor_subtype: 'basement',
          height_meters: 3.00,
          pline_area_sqm: 0,
          no_of_units: 0
        },
        {
          id: 11,
          floor_name: 'Stilt Floor',
          floor_type: 'parking',
          floor_subtype: 'stilt',
          height_meters: 3.00,
          pline_area_sqm: 0,
          no_of_units: 0
        },
        {
          id: 12,
          floor_name: 'Upper Parking 1',
          floor_type: 'parking',
          floor_subtype: 'upper_parking',
          height_meters: 3.00,
          pline_area_sqm: 0,
          no_of_units: 0
        },
        {
          id: 13,
          floor_name: '1st Floor',
          floor_type: 'habitable',
          height_meters: 3.00,
          pline_area_sqm: 219.63,
          lobby_area_sqm: 32.94,
          is_pline_overridden: true,
          is_lobby_overridden: true,
          no_of_units: 2
        },
        {
          id: 14,
          floor_name: '2nd Floor',
          floor_type: 'habitable',
          height_meters: 3.00,
          pline_area_sqm: 300,
          lobby_area_sqm: 0,
          is_pline_overridden: true,
          is_lobby_overridden: true,
          no_of_units: 5
        },
        {
          id: 15,
          floor_name: '3rd Floor',
          floor_type: 'habitable',
          height_meters: 3.00,
          pline_area_sqm: 100,
          lobby_area_sqm: 0,
          is_pline_overridden: true,
          is_lobby_overridden: true,
          no_of_units: 0
        },
        {
          id: 16,
          floor_name: 'Terrace Floor',
          floor_type: 'terrace',
          height_meters: 3.00,
          pline_area_sqm: 0,
          no_of_units: 0
        }
      ]);

      const fl1 = m.evaluatedFloors.find(f => f.id === 13);
      expect(fl1.total_saleable_area_sqm).toBeCloseTo(186.69, 4);
      expect(fl1.area_for_1_unit_raw).toBeCloseTo(93.345, 6);
      expect(fl1.area_for_1_unit).toBeCloseTo(93.345, 4);
      expect(fl1.area_for_1_unit_sqft).toBeCloseTo(93.345 * SQM_TO_SQFT, 6);

      const fl3 = m.evaluatedFloors.find(f => f.id === 15);
      expect(fl3.area_for_1_unit_raw).toBeNull();
      expect(fl3.area_for_1_unit).toBe(0);

      // Total saleable = 186.69 + 300 + 100 = 586.69; Total units = 2 + 5 + 0 = 7
      // Weighted Avg = 586.69 / 7 = 83.812857...
      expect(m.totalBuiltupForSaleSqm).toBeCloseTo(586.69, 4);
      expect(m.totalUnitsCount).toBe(7);
      expect(m.weightedAverageAreaPerUnitRaw).toBeCloseTo(586.69 / 7, 6);

      // Building Height H: excludes Basement 1 (3.00) and Terrace (3.00), includes Stilt + Upper Parking + 1st/2nd/3rd = 5 * 3 = 15.00m -> Margin H/5 = 3.00m
      expect(m.totalHeightMeters).toBeCloseTo(15.00, 2);
      expect(m.excludedHeightFloorsCount).toBe(2);
      expect(m.marginHBy5Meters).toBeCloseTo(3.00, 2);
    });

    test('rejects Lobby > P-Line, negative units, fractional units and documents Area Balance within ±0.05 tolerance', () => {
      const badLobby = validateAreaStatementInputs({ plot_area_sqm: 500 }, [
        { floor_name: '1st Floor', pline_area_sqm: 100, lobby_area_sqm: 120, is_lobby_overridden: true, no_of_units: 2 }
      ]);
      expect(badLobby.valid).toBe(false);
      expect(badLobby.error).toMatch(/exceed P-Line/i);

      const badFrac = validateAreaStatementInputs({ plot_area_sqm: 500 }, [
        { floor_name: '1st Floor', pline_area_sqm: 100, no_of_units: 2.5 }
      ]);
      expect(badFrac.valid).toBe(false);
      expect(badFrac.error).toMatch(/integer/i);

      const badNeg = validateAreaStatementInputs({ plot_area_sqm: 500 }, [
        { floor_name: '1st Floor', pline_area_sqm: 100, no_of_units: -1 }
      ]);
      expect(badNeg.valid).toBe(false);

      expect(AREA_BALANCE_ROUNDING_TOLERANCE_SQM).toBe(0.05);
    });
  });

  describe('6. End-to-End API, Revalidation, Financial Integration & Excel/PDF Exports', () => {
    test('revalidates Road Width & Gunthewari switching, syncs floor units into Receipts with distinct rates, and exports updated 6-col Excel/PDF', async () => {
      // 0. Initialize feasibility statement via GET
      const initRes = await request(app)
        .get(`/api/projects/${testProjectId}/feasibility`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(initRes.status).toBe(200);

      // 1. Setup 9m Mixed Use (60/40) Regular
      const saveArea = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          plot_area_sqm: 500,
          dp_deductions_sqm: 0,
          road_width_m: 9,
          is_gunthewari: false,
          basic_fsi_factor: 1.1,
          paid_fsi_factor: 0.5,
          proposed_paid_fsi_factor: 0.3,
          proposed_regular_tdr_factor: 0.15,
          proposed_slum_tdr_factor: 0.10,
          building_use: 'Mixed Use',
          primary_fsi_residential_pct: 60,
          primary_fsi_commercial_pct: 40
        });
      expect(saveArea.status).toBe(200);
      expect(saveArea.body.areaMetrics.totalTdrFactor).toBe(0.40);
      expect(saveArea.body.areaMetrics.regularTdrFactor).toBe(0.20);
      expect(saveArea.body.areaMetrics.slumTdrFactor).toBe(0.20);

      // 2. Reject invalid Mixed Use 60/30 via API
      const badMixed = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          building_use: 'Mixed Use',
          primary_fsi_residential_pct: 60,
          primary_fsi_commercial_pct: 30
        });
      expect(badMixed.status).toBe(400);

      // 3. Switch Regular -> Gunthewari with active proposed_regular_tdr_factor = 0.15 fails without reset, succeeds with reset & preserves 0.20/0.20 underlying split
      const gunthFail = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ is_gunthewari: true });
      expect(gunthFail.status).toBe(400);

      const gunthOk = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ is_gunthewari: true, reset_proposed: true });
      expect(gunthOk.status).toBe(200);
      expect(parseFloat(gunthOk.body.statement.total_tdr_factor)).toBe(0.40);
      expect(parseFloat(gunthOk.body.statement.regular_tdr_factor)).toBe(0.20);
      expect(parseFloat(gunthOk.body.statement.slum_tdr_factor)).toBe(0.20);
      expect(gunthOk.body.areaMetrics.eligibleRegularTdrFactor).toBe(0);
      expect(gunthOk.body.areaMetrics.eligibleSlumTdrFactor).toBe(0.20);

      // Switch back to Regular and keep clean 9m + 0.2/0.2 split
      const backToReg = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ is_gunthewari: false });
      expect(backToReg.status).toBe(200);
      expect(backToReg.body.areaMetrics.eligibleRegularTdrFactor).toBe(0.20);

      // 4. Create floors (Basement 1, Ground Commercial, 1st Floor Residential, Terrace) and test batch floor validation & updates
      await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/timeline/config`) // ignore if not used
        .set('Authorization', `Bearer ${adminUser.token}`);

      const fBase = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/area/floors`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ floor_name: 'Basement 1', floor_type: 'parking', floor_subtype: 'basement', height_meters: 3.00, no_of_units: 0 });
      const fComm = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/area/floors`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ floor_name: 'Ground Commercial', floor_type: 'habitable', usage_type: 'Commercial', height_meters: 3.60, pline_area_sqm: 219.63, is_pline_overridden: true, lobby_area_sqm: 32.94, is_lobby_overridden: true, no_of_units: 2 });
      const fRes = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/area/floors`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ floor_name: '1st Floor Residential', floor_type: 'habitable', usage_type: 'Residential', height_meters: 3.00, pline_area_sqm: 300, is_pline_overridden: true, lobby_area_sqm: 45, is_lobby_overridden: true, no_of_units: 4 });
      const fTerr = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/area/floors`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ floor_name: 'Terrace', floor_type: 'terrace', height_meters: 3.00, no_of_units: 0 });

      expect(fBase.status).toBe(201);
      expect(fComm.status).toBe(201);
      expect(fRes.status).toBe(201);
      expect(fTerr.status).toBe(201);

      // Reject negative / fractional units & lobby > pline on PUT /floors/:id
      const badUnitUpdate = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area/floors/${fComm.body.floor.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ no_of_units: 2.5 });
      expect(badUnitUpdate.status).toBe(400);

      const badLobbyUpdate = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area/floors/${fComm.body.floor.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ lobby_area_sqm: 300, is_lobby_overridden: true });
      expect(badLobbyUpdate.status).toBe(400);

      // 5. Clean prior salable units and link floors into Salable Units with distinct rates and landowner exclusion
      await pool.query(
        'DELETE FROM project_salable_units WHERE financial_viability_id IN (SELECT id FROM project_financial_viabilities WHERE project_id = $1)',
        [testProjectId]
      );

      const uComm = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/financial/salable-units`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          source_floor_id: fComm.body.floor.id,
          unit_name: 'Ground Commercial Shops',
          rate_per_sqft: 10000,
          landowner_unit_count: 0
        });
      expect(uComm.status).toBe(201);

      const uRes = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/financial/salable-units`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          source_floor_id: fRes.body.floor.id,
          unit_name: '1st Floor Flats',
          rate_per_sqft: 6000,
          landowner_unit_count: 1
        });
      expect(uRes.status).toBe(201);

      // Ground Comm: (219.63 - 32.94) / 2 = 93.345 sqm * 10.7639104167 = 1004.7582178 sqft -> Unit Price = round2(1004.7582178 * 10000) = 10047582.18 * 2 = 20095164.36
      // 1st Res: (300 - 45) / 4 = 63.75 sqm * 10.7639104167 = 686.199289 sqft * 6000 = 4117195.73 -> 3 dev units = 12351587.19
      const finData = uRes.body.financialMetrics;
      const expectedCommPrice = Math.round(93.345 * SQM_TO_SQFT * 10000 * 100) / 100;
      const expectedResPrice = Math.round(63.75 * SQM_TO_SQFT * 6000 * 100) / 100;
      expect(finData.totalReceipts).toBeCloseTo(expectedCommPrice * 2 + expectedResPrice * 3, 2);

      // Changing Ground Commercial no_of_units from 2 -> 3 immediately updates financial Receipts!
      const updateUnits = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area/floors/${fComm.body.floor.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ no_of_units: 3 });
      expect(updateUnits.status).toBe(200);
      const expectedComm3Price = Math.round((186.69 / 3) * SQM_TO_SQFT * 10000 * 100) / 100;
      expect(updateUnits.body.financialMetrics.totalReceipts).toBeCloseTo(
        expectedComm3Price * 3 + expectedResPrice * 3,
        2
      );

      // Verify Height excludes Basement 1 and Terrace: only Ground (3.60) + 1st Floor (3.00) = 6.60m -> Margin H/5 = 1.32m
      expect(updateUnits.body.areaMetrics.totalHeightMeters).toBeCloseTo(6.60, 2);
      expect(updateUnits.body.areaMetrics.marginHBy5Meters).toBeCloseTo(1.32, 2);

      // 6. Export Excel & PDF and inspect updated Table 2 formulas and Receipt links
      const xlsxRes = await request(app)
        .get(`/api/projects/${testProjectId}/feasibility/export/excel`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(xlsxRes.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsxRes.body);

      const wsM = wb.getWorksheet('Area (SQ M)');
      expect(wsM.getCell('A22').value).toBe('1. Floor');
      expect(wsM.getCell('F22').value).toBe('5. No. of Units');
      expect(wsM.getCell('G22').value).toBe('6. Built-up for Sale (1 Unit) (Sq. Mtr.)');

      // Find TOTAL row in Table 2
      let totalRowNum = null;
      let commFloorRowNum = null;
      wsM.eachRow((row, rn) => {
        if (rn > 22 && String(row.getCell(1).value || '').toUpperCase().includes('WEIGHTED AVG')) totalRowNum = rn;
        if (rn > 22 && row.getCell(1).value === 'Ground Commercial') commFloorRowNum = rn;
      });
      expect(totalRowNum).not.toBeNull();
      expect(commFloorRowNum).not.toBeNull();
      expect(wsM.getCell(`G${commFloorRowNum}`).formula).toBe(`IF(F${commFloorRowNum}>0,(D${commFloorRowNum}-E${commFloorRowNum})/F${commFloorRowNum},"—")`);
      expect(wsM.getCell(`G${totalRowNum}`).formula).toBe(`IF(F${totalRowNum}>0,(D${totalRowNum}-E${totalRowNum})/F${totalRowNum},"—")`);
      expect(wsM.getCell(`G${totalRowNum}`).numFmt).toContain('Avg:');
      expect(wsM.getCell(`A${totalRowNum + 1}`).value).toContain('Total Saleable Area');

      const wsFin = wb.getWorksheet('FINANCIAL VIABILITY');
      let foundLinkedReceiptFormula = false;
      wsFin.eachRow((row) => {
        const v = row.getCell(3).value;
        if (v && typeof v === 'object' && v.formula && v.formula.includes(`'Area (SQ M)'!G${commFloorRowNum}*${SQM_TO_SQFT}`)) {
          foundLinkedReceiptFormula = true;
        }
      });
      expect(foundLinkedReceiptFormula).toBe(true);

      const pdfRes = await request(app)
        .get(`/api/projects/${testProjectId}/feasibility/export/pdf`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.body.slice(0, 5).toString()).toBe('%PDF-');
    });
  });
});

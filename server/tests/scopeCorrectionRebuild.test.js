// server/tests/scopeCorrectionRebuild.test.js
// Phase 9 comprehensive verification for DS16 Scope-Corrected 2-Tab Feasibility Rebuild,
// authoritative backend formulas, persistence endpoints, and Excel/PDF binary exports.

const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const {
  SQM_TO_SQFT,
  calculateAreaMetrics,
  calculateFinancialMetrics
} = require('../services/feasibilityEngine');

describe('Phase 9: Scope-Corrected DS16 Feasibility Rebuild Suite', () => {
  let adminUser;
  let testClientId;
  let testProjectId;

  beforeAll(async () => {
    const { rows: [admin] } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    adminUser = { ...admin, token: signToken(admin.id) };

    const { rows: [clientRow] } = await pool.query(
      "INSERT INTO clients (name, email) VALUES ('Scope Rebuild Test Client', 'scope_rebuild@example.com') RETURNING id"
    );
    testClientId = clientRow.id;

    const { rows: [proj] } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name, area_sq_ft)
       VALUES ('Scope Rebuild Verification Project', $1, 'Commercial', 'Planning', $2, 'Scope Rebuild Test Client', 10763.91)
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

  describe('1. Engine Unit Rules (FR-01, FR-02, FR-05/09, FR-08, FR-11, FR-15)', () => {
    test('FR-01: Uses exact metric-to-sqft factor 10.7639104167', () => {
      expect(SQM_TO_SQFT).toBe(10.7639104167);
    });

    test('FR-02: Net Plotable Area = max(0, Plot Area - D.P. Deductions) while keeping City Survey & Site independent', () => {
      const m = calculateAreaMetrics({
        plot_area_sqm: 1000,
        city_survey_area_sqm: 1025.5,
        site_area_sqm: 990.25,
        dp_deductions_sqm: 150,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5
      }, []);

      expect(m.citySurveyAreaSqm).toBe(1025.5);
      expect(m.siteAreaSqm).toBe(990.25);
      expect(m.plotableAreaSqm).toBe(850);
      expect(m.permissibleFsiSqm).toBeCloseTo(850 * 1.1, 3);

      // Section 4: Never silently clamp negative Net Plotable Area in engine
      const negM = calculateAreaMetrics({ plot_area_sqm: 500, dp_deductions_sqm: 650 }, []);
      expect(negM.plotableAreaSqm).toBe(-150);
    });

    test('FR-05 & FR-09: Auto-suggested vs architect-edited Paid FSI & TDR excludes unused FSI/TDR from costs', () => {
      const stmt = {
        plot_area_sqm: 1000,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        proposed_paid_fsi_factor: 0.2,
        regular_tdr_factor: 0.325,
        slum_tdr_factor: 0.325,
        total_tdr_factor: 0.65,
        proposed_regular_tdr_factor: 0,
        proposed_slum_tdr_factor: 0.1,
        building_use: 'Residential'
      };
      const area = calculateAreaMetrics(stmt, []);
      expect(area.isProposedPaidFsiEdited).toBe(true);
      expect(area.effectiveProposedPaidFsiFactor).toBe(0.2);
      expect(area.proposedPaidFsiSqm).toBe(200);
      expect(area.permissiblePaidFsiSqm).toBe(500);
      expect(area.proposedTdrSqm).toBe(100);
      expect(area.permissibleTdrSqm).toBe(650);

      const fin = calculateFinancialMetrics({
        rr_rate_per_sqm: 40000,
        tdr_purchase_factor: 0.55
      }, [], [], area);

      const premFsi = fin.evaluatedStatutoryCharges.find(c => c.charge_code === 'PREMIUM_FSI');
      const tdrLoad = fin.evaluatedStatutoryCharges.find(c => c.charge_code === 'TDR_LOADING_CHARGES');

      // Premium FSI charged ONLY on proposedPaidFsiSqm (200 sqm), not permissible 500 sqm
      expect(premFsi.effective_amount).toBe(3200000);
      // TDR Loading & TDR Cost B charged ONLY on proposedTdrSqm (100 sqm), not permissible 650 sqm
      expect(tdrLoad.effective_amount).toBe(120000);
      expect(fin.costOfTdrB).toBe(2200000);
    });

    test('FR-08: Gunthewari locks Regular TDR eligibility to 0, computes Slum TDR only, preserves underlying split, and rejects invalid Regular TDR inputs', () => {
      const { validateAreaStatementInputs } = require('../services/feasibilityEngine');
      const invalidCheck = validateAreaStatementInputs({
        plot_area_sqm: 1000,
        dp_deductions_sqm: 0,
        is_gunthewari: true,
        road_width_m: 15,
        proposed_regular_tdr_factor: 0.99
      });
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.error).toMatch(/Gunthewari/i);

      const m = calculateAreaMetrics({
        plot_area_sqm: 1000,
        dp_deductions_sqm: 0,
        is_gunthewari: true,
        road_width_m: 15
      }, []);

      expect(m.isGunthewari).toBe(true);
      // Underlying road-width 50/50 split preserved (0.80 -> 0.40 + 0.40)
      expect(m.totalTdrFactor).toBe(0.80);
      expect(m.regularTdrFactor).toBe(0.40);
      expect(m.slumTdrFactor).toBe(0.40);
      // Gunthewari eligibility restricts to Slum TDR only (0.40), Regular = 0
      expect(m.eligibleRegularTdrFactor).toBe(0);
      expect(m.eligibleSlumTdrFactor).toBe(0.40);
      expect(m.eligibleTdrFactor).toBe(0.40);
      expect(m.effectiveProposedRegularTdrFactor).toBe(0);
    });

    test('FR-11: Mixed-Use explicit Residential/Commercial % split drives separate 60% & 80% ancillary', () => {
      const m = calculateAreaMetrics({
        plot_area_sqm: 1000,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        proposed_paid_fsi_factor: 0.5,
        regular_tdr_factor: 0.2,
        slum_tdr_factor: 0.2,
        total_tdr_factor: 0.4,
        proposed_regular_tdr_factor: 0.2,
        proposed_slum_tdr_factor: 0.2,
        building_use: 'Mixed Use',
        primary_fsi_residential_pct: 60,
        primary_fsi_commercial_pct: 40
      }, []);

      // Total primary builtup = 1000 * 2.0 = 2000 sqm -> Res 60% = 1200, Comm 40% = 800
      expect(m.primaryFsiResidentialPct).toBe(60);
      expect(m.primaryFsiCommercialPct).toBe(40);
      expect(m.proposedResidentialFsiSqm).toBe(1200);
      expect(m.proposedCommercialFsiSqm).toBe(800);
      // Ancillary: Res = 1200 * 0.60 = 720, Comm = 800 * 0.80 = 640
      expect(m.proposedResidentialAncillarySqm).toBe(720);
      expect(m.proposedCommercialAncillarySqm).toBe(640);
      expect(m.totalProposedAncillarySqm).toBe(1360);
      expect(m.calculatedProposedPlineSqm).toBe(3360);
    });

    test('FR-15 & FR-32: Zero civil rate does not fall back to Cost B, and percentage loading computes Salable Receipts', () => {
      const area = calculateAreaMetrics({ plot_area_sqm: 1000, basic_fsi_factor: 1.1, paid_fsi_factor: 0 }, []);
      const fin = calculateFinancialMetrics(
        {
          rr_rate_per_sqm: 30000,
          estimated_cost_b_rate: 25000,
          cost_of_construction_rate: 0,
          rent_tenements: 10,
          rent_per_tenement_per_month: 5000,
          rent_months: 12,
          period_months: '21-24 Months'
        },
        [],
        [
          {
            unit_name: 'Shop 1',
            building_use: 'Commercial',
            carpet_area_sqft: 500,
            loading_mode: 'percentage',
            loading_pct: 30,
            unit_count: 5,
            landowner_unit_count: 1,
            rate_per_sqft: 10000
          }
        ],
        area
      );

      expect(fin.costOfConstructionD).toBe(0);
      expect(fin.rentCostF).toBe(10 * 5000 * 12);
      const u = fin.evaluatedSalableUnits[0];
      expect(u.super_buildup_area_sqft).toBe(650); // 500 + 30%
      expect(u.developer_unit_count).toBe(4);
      expect(u.unit_price).toBe(6500000);
      expect(fin.totalReceipts).toBe(26000000);
    });
  });

  describe('2. Authoritative API Routes, Preview, Persistence & Exports', () => {
    test('Hydrates GET /feasibility and computes non-persisted POST /preview drafts', async () => {
      const initRes = await request(app)
        .get(`/api/projects/${testProjectId}/feasibility`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(initRes.status).toBe(200);
      expect(initRes.body.statement).toBeDefined();
      expect(initRes.body.financial).toBeDefined();

      const prevRes = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/preview`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          statement: {
            ...initRes.body.statement,
            plot_area_sqm: 1200,
            dp_deductions_sqm: 200,
            basic_fsi_factor: 1.1,
            paid_fsi_factor: 0.5,
            building_use: 'Mixed Use',
            primary_fsi_residential_pct: 50
          },
          financial: {
            ...initRes.body.financial,
            rr_rate_per_sqm: 30000,
            tdr_purchase_factor: 0.60
          }
        });

      expect(prevRes.status).toBe(200);
      expect(prevRes.body.areaMetrics.plotableAreaSqm).toBe(1000);
      expect(prevRes.body.financialMetrics.tdrPurchaseFactor).toBe(0.60);
    });

    test('PUT /area rejects Gunthewari Regular TDR > 0 and persists approved inputs + optimistic version check', async () => {
      const badGunth = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ is_gunthewari: true, road_width_m: 12, regular_tdr_factor: 0.2 });
      expect(badGunth.status).toBe(400);

      const getRes = await request(app)
        .get(`/api/projects/${testProjectId}/feasibility`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      const ver = getRes.body.statement.version;

      const saveRes = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          plot_area_sqm: 1000,
          city_survey_area_sqm: 1015,
          site_area_sqm: 995,
          dp_deductions_sqm: 0,
          basic_fsi_factor: 1.1,
          paid_fsi_factor: 0.5,
          proposed_paid_fsi_factor: 0.4,
          is_gunthewari: false,
          road_width_m: 12,
          reset_regular_tdr: true,
          building_use: 'Mixed Use',
          primary_fsi_residential_pct: 50,
          expected_version: ver
        });
      expect(saveRes.status).toBe(200);
      expect(parseFloat(saveRes.body.statement.city_survey_area_sqm)).toBe(1015);
      expect(parseFloat(saveRes.body.statement.proposed_paid_fsi_factor)).toBe(0.4);
      expect(saveRes.body.areaMetrics.primaryFsiResidentialPct).toBe(50);

      // Stale version fails with 409 Conflict
      const staleRes = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ plot_area_sqm: 1500, expected_version: ver });
      expect(staleRes.status).toBe(409);
    });

    test('PUT /financial persists tdr_purchase_factor, period_months VARCHAR, rent_months & rejects LABOUR_WELFARE_PARKING override', async () => {
      const rejOverride = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/financial/overrides`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ key: 'statutory_LABOUR_WELFARE_PARKING', override_val: 12345 });
      expect(rejOverride.status).toBe(400);

      const finRes = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/financial`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          rr_rate_per_sqm: 32000,
          tdr_purchase_factor: 0.62,
          estimated_cost_a_rate: 15000,
          estimated_cost_b_rate: 26620,
          cost_of_plot: 5000000,
          is_cost_of_plot_included: true,
          cost_of_construction_rate: 20000,
          cost_of_infrastructure: 250000,
          interest_amount: 100000,
          minor_expenses: 50000,
          rent_tenements: 5,
          rent_per_tenement_per_month: 10000,
          rent_months: 18,
          period_months: '21-24 Months'
        });

      expect(finRes.status).toBe(200);
      expect(parseFloat(finRes.body.financial.tdr_purchase_factor)).toBe(0.62);
      expect(finRes.body.financial.period_months).toBe('21-24 Months');
      expect(finRes.body.financial.rent_months).toBe(18);
      expect(finRes.body.financialMetrics.rentCostF).toBe(900000);

      // Add a salable unit with percentage loading & landowner exclusion
      const unitRes = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/financial/salable-units`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          unit_name: '3 BHK Flat',
          building_use: 'Residential',
          carpet_area_sqft: 1000,
          loading_mode: 'percentage',
          loading_pct: 25,
          unit_count: 10,
          landowner_unit_count: 2,
          rate_per_sqft: 6000
        });
      expect(unitRes.status).toBe(201);
      expect(unitRes.body.financialMetrics.totalReceipts).toBe(60000000); // 8 dev units * 1250 sqft * 6000
    });

    test('PUT /area/floors/batch & GET /export/excel produces genuine formula workbook & GET /export/pdf produces valid PDF', async () => {
      // Create floors & batch update
      const recRes = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/area/reconcile-floors`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(recRes.status).toBe(200);
      const floors = recRes.body.floors;
      expect(floors.length).toBeGreaterThan(0);

      const batchPayload = floors.map((f) => ({
        id: f.id,
        floor_type: f.floor_type,
        height_meters: f.floor_type === 'habitable' ? 3.2 : f.height_meters,
        pline_area_sqm: f.pline_area_sqm,
        is_pline_overridden: false,
        lobby_area_sqm: f.lobby_area_sqm,
        is_lobby_overridden: false,
        usage_type: f.usage_type,
        no_of_units: f.floor_type === 'habitable' ? 4 : 0
      }));
      const batchRes = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area/floors/batch`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ floors: batchPayload });
      expect(batchRes.status).toBe(200);
      const firstHabitable = batchRes.body.floors.find((f) => f.floor_type === 'habitable');
      const expectedSale = Math.max(0, firstHabitable.pline_area_sqm - firstHabitable.lobby_area_sqm);
      expect(firstHabitable.builtup_for_sale_sqm).toBeCloseTo(expectedSale, 1);
      expect(firstHabitable.area_for_1_unit_raw).toBeCloseTo(expectedSale / 4, 3);

      // Export binary Excel workbook and inspect sheets & formulas via ExcelJS
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
      expect(xlsxRes.headers['content-type']).toContain('spreadsheetml.sheet');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsxRes.body);
      const sheetNames = wb.worksheets.map((w) => w.name);
      expect(sheetNames).toEqual(['Area (SQ M)', 'Area (SQ FT)', 'FINANCIAL VIABILITY']);

      // Verify Area (SQ M) & Area (SQ FT) Table 2 has strictly the 6 approved columns (Col 5 = No. of Units, Col 6 = Built-up for Sale (1 Unit))
      const wsM = wb.getWorksheet('Area (SQ M)');
      expect(wsM.getCell('A22').value).toBe('1. Floor');
      expect(wsM.getCell('C22').value).toBe('2. Height (m)');
      expect(wsM.getCell('D22').value).toContain('3. P-Line Area');
      expect(wsM.getCell('E22').value).toContain('4. Lobby Area');
      expect(wsM.getCell('F22').value).toContain('5. No. of Units');
      expect(wsM.getCell('G22').value).toContain('6. Built-up for Sale (1 Unit)');
      expect(wsM.getCell('H22').value).toBeNull();

      // Ensure NO ExcelJS formula starts with '=' anywhere in the workbook
      wb.worksheets.forEach((ws) => {
        ws.eachRow((row) => {
          row.eachCell((cell) => {
            if (cell.value && typeof cell.value === 'object' && cell.value.formula) {
              expect(cell.value.formula.startsWith('=')).toBe(false);
            }
          });
        });
      });

      // Verify Area (SQ FT) FSI Ratio row (Row 16) is copied as ratio without multiplying by 10.7639104167
      const wsFt = wb.getWorksheet('Area (SQ FT)');
      expect(wsFt.getCell('E16').formula).toBe("'Area (SQ M)'!E16");
      expect(wsFt.getCell('E10').formula).toContain(String(SQM_TO_SQFT));

      // Verify Financial Viability cross-references & live formulas (P-Line total now in Col D)
      const wsFin = wb.getWorksheet('FINANCIAL VIABILITY');
      expect(wsFin.getCell('A4').formula).toBe("'Area (SQ M)'!E9");
      expect(wsFin.getCell('H6').formula).toContain("'Area (SQ M)'!D");
      expect(wsFin.getCell('E8').formula).toBe('C8*D8');

      // Export binary PDF report and verify PDF header signature
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
      expect(pdfRes.headers['content-type']).toContain('application/pdf');
      expect(pdfRes.body.slice(0, 5).toString()).toBe('%PDF-');
      expect(pdfRes.body.length).toBeGreaterThan(2500);
    });

    test('Acceptance Audit Criteria 3 & 4: rejects invalid DP deductions, independent TDR overrides, and revalidates classification change', async () => {
      // 1. POST /preview rejects dp_deductions_sqm > plot_area_sqm
      const badPrevDp = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/preview`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ statement: { plot_area_sqm: 500, dp_deductions_sqm: 600, road_width_m: 12 } });
      expect(badPrevDp.status).toBe(400);
      expect(badPrevDp.body.error).toMatch(/exceed Area Of Plot/i);

      // 2. PUT /area rejects dp_deductions_sqm > plot_area_sqm and preserves last valid saved data
      const badSaveDp = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ plot_area_sqm: 500, dp_deductions_sqm: 600 });
      expect(badSaveDp.status).toBe(400);
      const reloadAfterBadDp = await request(app)
        .get(`/api/projects/${testProjectId}/feasibility`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(parseFloat(reloadAfterBadDp.body.statement.plot_area_sqm)).toBe(1000);
      expect(parseFloat(reloadAfterBadDp.body.statement.dp_deductions_sqm)).toBe(0);

      // 3. Reject unrestricted Total TDR override & independent Slum TDR override on road-width plot
      const badTotalTdr = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ road_width_m: 12, is_gunthewari: false, total_tdr_factor: 0.90 });
      expect(badTotalTdr.status).toBe(400);

      const badIndepSlum = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ road_width_m: 12, is_gunthewari: false, regular_tdr_factor: 0.30, slum_tdr_factor: 0.50 });
      expect(badIndepSlum.status).toBe(400);

      // 4. Reject excess proposedPaidFsi in POST /preview (never clamp)
      const badPrevPaid = await request(app)
        .post(`/api/projects/${testProjectId}/feasibility/preview`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ statement: { plot_area_sqm: 1000, dp_deductions_sqm: 0, paid_fsi_factor: 0.5, proposed_paid_fsi_factor: 0.8, road_width_m: 12 } });
      expect(badPrevPaid.status).toBe(400);

      // 5. Revalidate proposed TDR when changing classification (Regular -> Gunthewari)
      const setRegProp = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ road_width_m: 12, is_gunthewari: false, proposed_regular_tdr_factor: 0.30, proposed_slum_tdr_factor: 0.30 });
      expect(setRegProp.status).toBe(200);

      // Switching to Gunthewari WITHOUT resetting invalidates existing proposed_regular_tdr_factor (0.30 > 0)
      const switchNoReset = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ is_gunthewari: true });
      expect(switchNoReset.status).toBe(400);

      // Switching to Gunthewari WITH reset_proposed: true succeeds, preserves underlying split (0.325/0.325), and restricts eligibility to Slum only
      const switchWithReset = await request(app)
        .put(`/api/projects/${testProjectId}/feasibility/area`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ is_gunthewari: true, reset_proposed: true });
      expect(switchWithReset.status).toBe(200);
      expect(parseFloat(switchWithReset.body.statement.total_tdr_factor)).toBe(0.65);
      expect(parseFloat(switchWithReset.body.statement.regular_tdr_factor)).toBe(0.325);
      expect(parseFloat(switchWithReset.body.statement.slum_tdr_factor)).toBe(0.325);
      expect(switchWithReset.body.areaMetrics.eligibleRegularTdrFactor).toBe(0);
      expect(switchWithReset.body.areaMetrics.eligibleSlumTdrFactor).toBe(0.325);
      expect(switchWithReset.body.areaMetrics.eligibleTdrFactor).toBe(0.325);
    });
  });
});

// server/tests/remediationDefects.test.js
// Comprehensive test suite verifying all 7 defects from 13_independent_verification_report.md

const {
  deriveTdrSplit,
  ROAD_WIDTH_TOTAL_TDR_MAP,
  ROAD_WIDTH_TDR_MAP,
  calculateAreaMetrics,
  calculateFinancialMetrics
} = require('../services/feasibilityEngine');

describe('Remediation Verification Suite — 7 Audit Findings', () => {

  // =========================================================================
  // FIND-01: TDR Validation (Rejection vs Silent Clamping)
  // =========================================================================
  describe('FIND-01: TDR Validation & Remainder Precision', () => {
    test('Rejects negative Regular TDR factor', () => {
      const split = deriveTdrSplit(0.65, -0.2);
      expect(split.isSplitValid).toBe(false);
      expect(split.validationError).toMatch(/cannot be negative/);
    });

    test('Rejects Regular TDR factor exceeding Total Road TDR', () => {
      const split = deriveTdrSplit(0.65, 0.70);
      expect(split.isSplitValid).toBe(false);
      expect(split.validationError).toMatch(/cannot exceed Total TDR factor/);
    });

    test('Rejects non-numeric Regular TDR string', () => {
      const split = deriveTdrSplit(0.65, 'invalid_abc');
      expect(split.isSplitValid).toBe(false);
      expect(split.validationError).toMatch(/must be a valid number/);
    });

    test('Accepts boundary values: explicit zero (0) and maximum total', () => {
      // Zero Regular TDR -> All Slum TDR
      const splitZero = deriveTdrSplit(0.65, 0);
      expect(splitZero.isSplitValid).toBe(true);
      expect(splitZero.regularTdrFactor).toBe(0);
      expect(splitZero.slumTdrFactor).toBe(0.65);
      expect(splitZero.isRegularTdrOverridden).toBe(true);
      expect(splitZero.regularTdrFactor + splitZero.slumTdrFactor).toBeCloseTo(0.65, 3);

      // Max Regular TDR -> Zero Slum TDR
      const splitMax = deriveTdrSplit(0.65, 0.65);
      expect(splitMax.isSplitValid).toBe(true);
      expect(splitMax.regularTdrFactor).toBe(0.65);
      expect(splitMax.slumTdrFactor).toBe(0);
      expect(splitMax.isRegularTdrOverridden).toBe(true);
      expect(splitMax.regularTdrFactor + splitMax.slumTdrFactor).toBeCloseTo(0.65, 3);
    });

    test('Accepts valid decimal override and satisfies precision policy: Regular + Slum === Total', () => {
      const split = deriveTdrSplit(0.65, 0.425);
      expect(split.isSplitValid).toBe(true);
      expect(split.regularTdrFactor).toBe(0.425);
      expect(split.slumTdrFactor).toBe(0.225);
      expect(split.regularTdrFactor + split.slumTdrFactor).toBe(0.65);
    });
  });

  // =========================================================================
  // Section 9: 24m Road Default Decision (1.10 vs 1.15)
  // =========================================================================
  describe('Road Width TDR Default Configuration Matrix', () => {
    test('Standard matrix matches regulatory decision (24m = 1.10, 9m = 0.40)', () => {
      expect(ROAD_WIDTH_TOTAL_TDR_MAP[9]).toBe(0.40);
      expect(ROAD_WIDTH_TOTAL_TDR_MAP[12]).toBe(0.65);
      expect(ROAD_WIDTH_TOTAL_TDR_MAP[15]).toBe(0.80);
      expect(ROAD_WIDTH_TOTAL_TDR_MAP[18]).toBe(0.90);
      expect(ROAD_WIDTH_TOTAL_TDR_MAP[24]).toBe(1.10);

      expect(ROAD_WIDTH_TDR_MAP[9].regular).toBe(0.20);
      expect(ROAD_WIDTH_TDR_MAP[9].slum).toBe(0.20);
      expect(ROAD_WIDTH_TDR_MAP[24].regular).toBe(0.55);
      expect(ROAD_WIDTH_TDR_MAP[24].slum).toBe(0.55);
    });
  });

  // =========================================================================
  // FIND-02: Preserve TDR Overrides on Partial Updates
  // =========================================================================
  describe('FIND-02: TDR Override Preservation', () => {
    test('calculateAreaMetrics preserves explicit Regular TDR override when plot area changes', () => {
      const statement1 = {
        plot_area_sqm: 1000,
        road_width_m: 12,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        regular_tdr_factor: 0.40 // Custom override on 0.65 total
      };
      const metrics1 = calculateAreaMetrics(statement1, []);
      expect(metrics1.regularTdrFactor).toBe(0.40);
      expect(metrics1.slumTdrFactor).toBe(0.25);
      expect(metrics1.isRegularTdrOverridden).toBe(true);

      // Now update plot area without changing regular_tdr_factor
      const statement2 = {
        ...statement1,
        plot_area_sqm: 1500
      };
      const metrics2 = calculateAreaMetrics(statement2, []);
      expect(metrics2.regularTdrFactor).toBe(0.40);
      expect(metrics2.slumTdrFactor).toBe(0.25);
      expect(metrics2.isRegularTdrOverridden).toBe(true);
      expect(metrics2.plotableAreaSqm).toBe(1500);
    });
  });

  // =========================================================================
  // FIND-03: Authoritative Statutory Calculation Bases (No Competing Formula)
  // =========================================================================
  describe('FIND-03: Authoritative Statutory Calculation Bases', () => {
    test('Statutory charges use correct regulatory area bases, not indiscriminately P-Line', () => {
      const statement = {
        plot_area_sqm: 1000,
        road_width_m: 12,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        regular_tdr_factor: 0.325,
        slum_tdr_factor: 0.325,
        building_use: 'RESIDENTIAL'
      };
      const floors = [
        { floor_name: 'G', usage_type: 'Residential', pline_area_sqm: 1000, fsi_area_sqm: 625, ancillary_area_sqm: 375 },
        { floor_name: '1', usage_type: 'Residential', pline_area_sqm: 1000, fsi_area_sqm: 625, ancillary_area_sqm: 375 }
      ];
      const area = calculateAreaMetrics(statement, floors);
      // Pline = 2000, Ancillary = 750, Paid FSI = 500, TDR = 650
      expect(area.totalProposedPlineSqm).toBe(2000);
      expect(area.totalProposedAncillarySqm).toBe(750);
      expect(area.proposedPaidFsiSqm).toBe(500);
      expect(area.proposedTdrSqm).toBe(650);

      const rrRate = 20000;
      const financial = {
        rr_rate_per_sqm: rrRate,
        is_cost_of_plot_included: true
      };

      const statutoryCharges = [
        { id: 1, charge_code: 'ANCILLARY_CHARGES', charge_name: 'Ancillary Charges', rr_percentage: 10, is_enabled: true },
        { id: 2, charge_code: 'PREMIUM_FSI', charge_name: 'Premium FSI Charges', rr_percentage: 40, is_enabled: true },
        { id: 3, charge_code: 'TDR_LOADING_CHARGES', charge_name: 'TDR Loading Charges', rr_percentage: 3, is_enabled: true }
      ];

      const finMetrics = calculateFinancialMetrics(financial, statutoryCharges, [], area);
      const charges = finMetrics.evaluatedStatutoryCharges;

      // 1. Ancillary Charges = Ancillary Area (750) * 10% * RR (20000) = 1,500,000
      // (If it used P-Line 2000 * 10% * 20000, it would be 4,000,000!)
      const ancCharge = charges.find(c => c.charge_code === 'ANCILLARY_CHARGES');
      expect(ancCharge.calculated_amount).toBe(1500000);

      // 2. Premium FSI = Paid FSI Area (500) * 40% * RR (20000) = 4,000,000
      // (If it used P-Line 2000 * 40% * 20000, it would be 16,000,000!)
      const premCharge = charges.find(c => c.charge_code === 'PREMIUM_FSI');
      expect(premCharge.calculated_amount).toBe(4000000);

      // 3. TDR Loading = TDR Area (650) * 3% * RR (20000) = 390,000
      const tdrCharge = charges.find(c => c.charge_code === 'TDR_LOADING_CHARGES');
      expect(tdrCharge.calculated_amount).toBe(390000);
    });
  });

  // =========================================================================
  // FIND-04: Labour Welfare on Parking Area as Manual Admin Input
  // =========================================================================
  describe('FIND-04: Labour Welfare on Parking Area as Direct Manual Input', () => {
    test('Treats Labour Welfare on Parking as manual input without formula derivation', () => {
      const financial = { rr_rate_per_sqm: 20000 };
      const statutoryCharges = [
        { id: 10, charge_code: 'LABOUR_WELFARE_PARKING', charge_name: 'Labour Welfare on Parking', amount: 85000, is_enabled: true }
      ];

      const finMetrics = calculateFinancialMetrics(financial, statutoryCharges, [], {});
      const lwCharge = finMetrics.evaluatedStatutoryCharges.find(c => c.charge_code === 'LABOUR_WELFARE_PARKING');

      expect(lwCharge.is_manual).toBe(true);
      expect(lwCharge.calculated_amount).toBeNull();
      expect(lwCharge.effective_amount).toBe(85000);
      expect(lwCharge.amount).toBe(85000);
    });

    test('Allows explicit zero for Labour Welfare on Parking', () => {
      const financial = { rr_rate_per_sqm: 20000 };
      const statutoryCharges = [
        { id: 10, charge_code: 'LABOUR_WELFARE_PARKING', charge_name: 'Labour Welfare on Parking', amount: 0, is_enabled: true }
      ];

      const finMetrics = calculateFinancialMetrics(financial, statutoryCharges, [], {});
      const lwCharge = finMetrics.evaluatedStatutoryCharges.find(c => c.charge_code === 'LABOUR_WELFARE_PARKING');

      expect(lwCharge.effective_amount).toBe(0);
      expect(lwCharge.amount).toBe(0);
    });
  });

  // =========================================================================
  // FIND-05: Salable Inventory & Landowner Equity Allocation
  // =========================================================================
  describe('FIND-05: Salable Inventory & Landowner Equity Allocation', () => {
    test('Calculates unit price, total value, and partitions developer vs landowner equity', () => {
      const financial = { rr_rate_per_sqm: 20000 };
      const salableUnits = [
        {
          id: 1,
          unit_name: '2 BHK Deluxe',
          building_use: 'Residential',
          carpet_area_sqm: 65.0, // 65 * 10.764 = 699.66 sq ft
          super_buildup_loading_sqft: 250, // Super = 949.66 sq ft
          unit_count: 10,
          landowner_unit_count: 3, // 3 to owner, 7 to developer
          rate_per_sqft: 5000
        }
      ];

      const finMetrics = calculateFinancialMetrics(financial, [], salableUnits, {});
      const unit = finMetrics.evaluatedSalableUnits[0];

      // Super sqft = 699.66 + 250 = 949.66
      expect(unit.carpet_area_sqft).toBeCloseTo(699.66, 2);
      expect(unit.super_buildup_area_sqft).toBeCloseTo(949.66, 2);

      // Unit Price = 949.66 * 5000 = 4,748,300
      expect(unit.unit_price).toBeCloseTo(4748300, 0);

      // Developer Units = 7, Landowner Units = 3
      expect(unit.developer_unit_count).toBe(7);
      expect(unit.landowner_unit_count).toBe(3);

      // Developer Realization = 4,748,300 * 7 = 33,238,100
      expect(unit.developer_amount).toBeCloseTo(33238100, 0);

      // Landowner Asset Value = 4,748,300 * 3 = 14,244,900
      expect(unit.landowner_amount).toBeCloseTo(14244900, 0);

      // Total Receipts in financialMetrics strictly counts Developer Realization
      expect(finMetrics.totalReceipts).toBeCloseTo(33238100, 0);
      expect(finMetrics.totalGrossReceipts).toBeCloseTo(47483000, 0);
      expect(finMetrics.totalLandownerReceipts).toBeCloseTo(14244900, 0);
    });
  });

  // =========================================================================
  // FIND-06: Cost of Plot Transparency & Independence
  // =========================================================================
  describe('FIND-06: Cost of Plot Transparency & Independence', () => {
    test('Cost of Plot does not change when RR Rate or Plot Area changes', () => {
      const fin1 = {
        rr_rate_per_sqm: 20000,
        cost_of_plot: 50000000,
        is_cost_of_plot_included: true
      };
      const area1 = { plotableAreaSqm: 1000, totalProposedPlineSqm: 2000 };
      const m1 = calculateFinancialMetrics(fin1, [], [], area1);
      expect(m1.costOfPlotH).toBe(50000000);

      // Double RR rate and double Plot Area
      const fin2 = {
        ...fin1,
        rr_rate_per_sqm: 40000
      };
      const area2 = { plotableAreaSqm: 2000, totalProposedPlineSqm: 4000 };
      const m2 = calculateFinancialMetrics(fin2, [], [], area2);
      expect(m2.costOfPlotH).toBe(50000000); // Strictly unchanged!
    });

    test('Preserves entered Cost of Plot amount in details when excluded from total cost', () => {
      const finExcluded = {
        rr_rate_per_sqm: 20000,
        cost_of_plot: 45000000,
        is_cost_of_plot_included: false
      };
      const m = calculateFinancialMetrics(finExcluded, [], [], {});
      expect(m.costOfPlotH).toBe(0); // Excluded from total project cost calculation
      expect(m.isCostOfPlotIncluded).toBe(false);
      expect(m.costOfPlotH_details.raw_amount).toBe(45000000); // Retained for display & export!
    });
  });

  // =========================================================================
  // FIND-07: Numeric Sanitization
  // =========================================================================
  describe('FIND-07: Numeric Sanitization', () => {
    test('Does not convert empty string to NaN in financial inputs', () => {
      const finEmpty = {
        rr_rate_per_sqm: '',
        cost_of_plot: '',
        is_cost_of_plot_included: true
      };
      const m = calculateFinancialMetrics(finEmpty, [], [], {});
      expect(isNaN(m.costOfPlotH)).toBe(false);
      expect(m.costOfPlotH).toBe(0);
      expect(isNaN(m.rrRate)).toBe(false);
      expect(m.rrRate).toBe(0);
    });
  });
});

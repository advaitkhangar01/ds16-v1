// server/tests/tdrSplitAndOverrides.test.js
// Regression test suite for Section 4 (TDR 50/50 Split & Overrides) and Section 6 (All Domain Overrides)

const {
  deriveTdrSplit,
  ROAD_WIDTH_TOTAL_TDR_MAP,
  calculateAreaMetrics,
  calculateFinancialMetrics
} = require('../services/feasibilityEngine');

describe('Master Rebuild — TDR 50/50 Split & Remainder Logic (Section 4)', () => {
  test('ROAD_WIDTH_TOTAL_TDR_MAP contains all prescribed regulatory road widths', () => {
    expect(ROAD_WIDTH_TOTAL_TDR_MAP[9]).toBe(0.40);
    expect(ROAD_WIDTH_TOTAL_TDR_MAP[12]).toBe(0.65);
    expect(ROAD_WIDTH_TOTAL_TDR_MAP[15]).toBe(0.80);
    expect(ROAD_WIDTH_TOTAL_TDR_MAP[18]).toBe(0.90);
    expect(ROAD_WIDTH_TOTAL_TDR_MAP[24]).toBe(1.10);
  });

  test('Default 50/50 split across all road widths', () => {
    // 9m road: Total 0.40 -> Regular 0.20, Slum 0.20
    const split9 = deriveTdrSplit(0.40);
    expect(split9.totalTdrFactor).toBe(0.40);
    expect(split9.regularTdrFactor).toBe(0.20);
    expect(split9.slumTdrFactor).toBe(0.20);
    expect(split9.isRegularTdrOverridden).toBe(false);

    // 12m road: Total 0.65 -> Regular 0.325, Slum 0.325
    const split12 = deriveTdrSplit(0.65);
    expect(split12.totalTdrFactor).toBe(0.65);
    expect(split12.regularTdrFactor).toBe(0.325);
    expect(split12.slumTdrFactor).toBe(0.325);
    expect(split12.isRegularTdrOverridden).toBe(false);

    // 15m road: Total 0.80 -> Regular 0.40, Slum 0.40
    const split15 = deriveTdrSplit(0.80);
    expect(split15.totalTdrFactor).toBe(0.80);
    expect(split15.regularTdrFactor).toBe(0.40);
    expect(split15.slumTdrFactor).toBe(0.40);
    expect(split15.isRegularTdrOverridden).toBe(false);

    // 18m road: Total 0.90 -> Regular 0.45, Slum 0.45
    const split18 = deriveTdrSplit(0.90);
    expect(split18.totalTdrFactor).toBe(0.90);
    expect(split18.regularTdrFactor).toBe(0.45);
    expect(split18.slumTdrFactor).toBe(0.45);
    expect(split18.isRegularTdrOverridden).toBe(false);

    // 24m road: Total 1.10 -> Regular 0.55, Slum 0.55
    const split24 = deriveTdrSplit(1.10);
    expect(split24.totalTdrFactor).toBe(1.10);
    expect(split24.regularTdrFactor).toBe(0.55);
    expect(split24.slumTdrFactor).toBe(0.55);
    expect(split24.isRegularTdrOverridden).toBe(false);
  });

  test('Regular TDR override recalculates Slum TDR as exact remainder', () => {
    // 12m road: Total 0.65, admin overrides Regular TDR to 0.40
    const split = deriveTdrSplit(0.65, 0.40);
    expect(split.totalTdrFactor).toBe(0.65);
    expect(split.regularTdrFactor).toBe(0.40);
    expect(split.slumTdrFactor).toBe(0.25);
    expect(split.isRegularTdrOverridden).toBe(true);
    expect(split.regularTdrFactor + split.slumTdrFactor).toBeCloseTo(0.65, 3);
  });

  test('Regular TDR override with zero (0) leaves full remainder to Slum TDR', () => {
    // 12m road: Total 0.65, admin overrides Regular TDR to 0
    const split = deriveTdrSplit(0.65, 0);
    expect(split.totalTdrFactor).toBe(0.65);
    expect(split.regularTdrFactor).toBe(0);
    expect(split.slumTdrFactor).toBe(0.65);
    expect(split.isRegularTdrOverridden).toBe(true);
  });

  test('Rejects Regular TDR when exceeding Total TDR with clear validation error', () => {
    // Admin inputs Regular TDR 0.80 on 12m road (Total 0.65)
    const split = deriveTdrSplit(0.65, 0.80);
    expect(split.isSplitValid).toBe(false);
    expect(split.validationError).toBe('Regular TDR factor (0.8) cannot exceed Total TDR factor (0.65)');
  });

  test('Rejects negative Regular TDR with clear validation error', () => {
    const split = deriveTdrSplit(0.65, -0.15);
    expect(split.isSplitValid).toBe(false);
    expect(split.validationError).toBe('Regular TDR factor (-0.15) cannot be negative');
  });

  test('calculateAreaMetrics respects Road Width and 50/50 TDR split in full area statements', () => {
    const statement = {
      plot_area_sqm: 1000.00,
      dp_deductions_sqm: 0,
      road_width_m: 12, // Total TDR 0.65 -> Reg 0.325, Slum 0.325
      basic_fsi_factor: 1.10,
      paid_fsi_factor: 0.50
    };

    const metrics = calculateAreaMetrics(statement, []);
    expect(metrics.totalTdrFactor).toBe(0.65);
    expect(metrics.regularTdrFactor).toBe(0.325);
    expect(metrics.slumTdrFactor).toBe(0.325);
    expect(metrics.isRegularTdrOverridden).toBe(false);

    // Permissible TDR = 1000 * 0.65 = 650 sq m
    expect(metrics.permissibleTdrSqm).toBeCloseTo(650.00, 2);
    expect(metrics.permissibleRegularTdrSqm).toBeCloseTo(325.00, 2);
    expect(metrics.permissibleSlumTdrSqm).toBeCloseTo(325.00, 2);
  });

  test('calculateAreaMetrics respects Regular TDR override and derives Slum TDR remainder', () => {
    const statement = {
      plot_area_sqm: 1000.00,
      dp_deductions_sqm: 0,
      road_width_m: 12,
      basic_fsi_factor: 1.10,
      paid_fsi_factor: 0.50,
      regular_tdr_factor: 0.45 // Override from default 0.325
    };

    const metrics = calculateAreaMetrics(statement, []);
    expect(metrics.totalTdrFactor).toBe(0.65);
    expect(metrics.regularTdrFactor).toBe(0.45);
    expect(metrics.slumTdrFactor).toBe(0.20); // 0.65 - 0.45
    expect(metrics.isRegularTdrOverridden).toBe(true);

    expect(metrics.regularTdrSqm).toBeCloseTo(450.00, 2);
    expect(metrics.slumTdrSqm).toBeCloseTo(200.00, 2);
    expect(metrics.regularTdrSqm + metrics.slumTdrSqm).toBeCloseTo(650.00, 2);
  });
});

describe('Master Rebuild — Controlled Overrides Across All Cost Sections (Section 6)', () => {
  const baseAreaMetrics = {
    plotableAreaSqm: 1000.00,
    totalProposedPlineSqm: 2000.00,
    totalProposedTdrSqm: 650.00
  };

  const baseFinancial = {
    rr_rate_per_sqm: 25000,
    tdr_purchase_factor: 0.55,
    cost_of_construction_rate: 20000,
    basement_area_sqm: 500,
    basement_rate_per_sqm: 6000,
    rent_tenements: 4,
    rent_per_tenement_per_month: 25000,
    period_months: 18,
    stacked_parking_slots: 10,
    stacked_parking_cost_per_slot: 250000,
    cost_of_plot: 50000000,
    is_cost_of_plot_included: true
  };

  test('Overrides Section B (Cost of TDR)', () => {
    // Calculated: 650 * 25000 * 0.55 = 8,937,500
    const calcNormal = calculateFinancialMetrics(baseFinancial, [], [], baseAreaMetrics);
    expect(calcNormal.costOfTdrB).toBe(8937500);

    // Override to 7,500,000
    const finOverridden = {
      ...baseFinancial,
      overrides: {
        cost_of_tdr: { override_val: 7500000, reason: 'Negotiated bulk TDR purchase' }
      }
    };
    const calcOverridden = calculateFinancialMetrics(finOverridden, [], [], baseAreaMetrics);
    expect(calcOverridden.costOfTdrB).toBe(7500000);
    expect(calcOverridden.costOfTdrB_details.has_override).toBe(true);
    expect(calcOverridden.costOfTdrB_details.calculated).toBe(8937500);
  });

  test('Overrides Section D (Civil Construction Cost) including explicit zero', () => {
    // Calculated: 2000 * 20000 = 40,000,000
    const calcNormal = calculateFinancialMetrics(baseFinancial, [], [], baseAreaMetrics);
    expect(calcNormal.costOfConstructionD).toBe(40000000);

    // Override to explicit 0
    const finZero = {
      ...baseFinancial,
      overrides: {
        cost_of_construction: { override_val: 0, reason: 'Turnkey investor contract' }
      }
    };
    const calcZero = calculateFinancialMetrics(finZero, [], [], baseAreaMetrics);
    expect(calcZero.costOfConstructionD).toBe(0);
    expect(calcZero.costOfConstructionD_details.has_override).toBe(true);
  });

  test('Overrides Section E (Basement Cost)', () => {
    // Calculated: 500 * 6000 = 3,000,000
    const calcNormal = calculateFinancialMetrics(baseFinancial, [], [], baseAreaMetrics);
    expect(calcNormal.costOfBasementE).toBe(3000000);

    const finOverridden = {
      ...baseFinancial,
      overrides: {
        cost_of_basement: { override_val: 2800000, reason: 'Soil excavation discount' }
      }
    };
    const calcOverridden = calculateFinancialMetrics(finOverridden, [], [], baseAreaMetrics);
    expect(calcOverridden.costOfBasementE).toBe(2800000);
    expect(calcOverridden.costOfBasementE_details.has_override).toBe(true);
  });

  test('Overrides Section F (Rent / Relocation Compensation)', () => {
    // Calculated: 4 * 25000 * 18 = 1,800,000
    const calcNormal = calculateFinancialMetrics(baseFinancial, [], [], baseAreaMetrics);
    expect(calcNormal.rentF).toBe(1800000);

    const finOverridden = {
      ...baseFinancial,
      overrides: {
        rent_amount: { override_val: 2000000, reason: 'Tenant settlement agreement' }
      }
    };
    const calcOverridden = calculateFinancialMetrics(finOverridden, [], [], baseAreaMetrics);
    expect(calcOverridden.rentF).toBe(2000000);
    expect(calcOverridden.rentF_details.has_override).toBe(true);
  });

  test('Overrides Section G (Stacked Car Parking Cost)', () => {
    // Calculated: 10 * 250000 = 2,500,000
    const calcNormal = calculateFinancialMetrics(baseFinancial, [], [], baseAreaMetrics);
    expect(calcNormal.stackedParkingG).toBe(2500000);

    const finOverridden = {
      ...baseFinancial,
      overrides: {
        stacked_parking_cost: { override_val: 2200000, reason: 'Vendor bulk pricing' }
      }
    };
    const calcOverridden = calculateFinancialMetrics(finOverridden, [], [], baseAreaMetrics);
    expect(calcOverridden.stackedParkingG).toBe(2200000);
    expect(calcOverridden.stackedParkingG_details.has_override).toBe(true);
  });

  test('Overrides Section H (Cost of Plot) and verifies inclusion toggle', () => {
    // Base: 50,000,000 included
    const calcNormal = calculateFinancialMetrics(baseFinancial, [], [], baseAreaMetrics);
    expect(calcNormal.costOfPlotH).toBe(50000000);
    expect(calcNormal.isCostOfPlotIncluded).toBe(true);

    // Overridden amount
    const finOverridden = {
      ...baseFinancial,
      overrides: {
        cost_of_plot: { override_val: 45000000, reason: 'Direct landowner agreement' }
      }
    };
    const calcOverridden = calculateFinancialMetrics(finOverridden, [], [], baseAreaMetrics);
    expect(calcOverridden.costOfPlotH).toBe(45000000);

    // Excluded from total cost
    const finExcluded = {
      ...finOverridden,
      is_cost_of_plot_included: false
    };
    const calcExcluded = calculateFinancialMetrics(finExcluded, [], [], baseAreaMetrics);
    expect(calcExcluded.costOfPlotH).toBe(0);
    expect(calcExcluded.isCostOfPlotIncluded).toBe(false);
    expect(calcExcluded.costOfPlotH_details.raw_amount).toBe(45000000);
  });

  test('Treats Labour Welfare on Parking Area as pure manual admin input (ignores formula overrides per FR-28)', () => {
    const statutoryCharges = [
      { id: 1, charge_code: 'LABOUR_WELFARE_PARKING', charge_name: 'Labour Welfare on Parking', amount: 50000, calculated_amount: null }
    ];

    const finWithOverride = {
      ...baseFinancial,
      overrides: {
        statutory_LABOUR_WELFARE_PARKING: { override_val: 35000, reason: 'Revised calculation' }
      }
    };

    const calc = calculateFinancialMetrics(finWithOverride, statutoryCharges, [], baseAreaMetrics);
    const parkingCharge = calc.evaluatedStatutoryCharges.find(sc => sc.charge_code === 'LABOUR_WELFARE_PARKING');
    expect(parkingCharge.effective_amount).toBe(50000);
    expect(parkingCharge.has_override).toBe(false);
    expect(parkingCharge.is_manual).toBe(true);
  });
});

// server/tests/manewadaBenchmark.test.js
// Strict benchmark verification test against Manewada Commercial + Residential Proposal
const {
  calculateAreaMetrics,
  calculateFinancialMetrics,
  calculateParkingRequirements,
  REGULATORY_PROFILES
} = require('../services/feasibilityEngine');

describe('Manewada Commercial + Residential Benchmark Feasibility Suite', () => {
  const manewadaStatement = {
    plot_area_sqm: 1101.140,
    dp_deductions_sqm: 0,
    existing_builtup_area_sqm: 0,
    basic_fsi_factor: 1.10,
    paid_fsi_factor: 0.50,
    regular_tdr_factor: 1.15,
    slum_tdr_factor: 0,
    road_width_m: 24,
    building_use: 'Mixed Use',
    dividing_factor: 1.6,
    is_proposed_pline_overridden: true,
    total_proposed_pline_override_sqm: 4072.457,
    parking_config: {
      commercial_carpet_sqm: 749.216,
      residential_tenements_40_80: 32,
      residential_tenements_under_40: 0,
      residential_tenements_over_80: 0,
      proposed_cars: 34,
      proposed_two_wheelers: 75,
      visitor_parking_pct: 0.05,
      authority_multiplier: 0.90
    }
  };

  // Floors configured in Manewada benchmark:
  // G: 269.040 sqm
  // 1: 480.176 sqm
  // 2 to 9 (8 floors): 415.358 sqm each -> sum = 3,322.864 sqm
  // Total floor sum = 4,072.080 sqm (0.377 sqm residual against 4,072.457 target)
  const manewadaFloors = [
    { floor_name: 'Ground Floor', usage_type: 'Commercial', pline_area_sqm: 269.040, is_pline_overridden: true, height_meters: 3.5, no_of_units: 4, lobby_area_sqm: 40.356, builtup_for_sale_sqm: 228.684 },
    { floor_name: 'First Floor', usage_type: 'Commercial', pline_area_sqm: 480.176, is_pline_overridden: true, height_meters: 3.5, no_of_units: 4, lobby_area_sqm: 72.026, builtup_for_sale_sqm: 408.150 },
    ...Array.from({ length: 8 }, (_, i) => ({
      floor_name: `Floor ${i + 2}`,
      usage_type: 'Residential',
      pline_area_sqm: 415.358,
      is_pline_overridden: true,
      height_meters: 3.0,
      no_of_units: 3,
      lobby_area_sqm: 62.304,
      builtup_for_sale_sqm: 353.054
    }))
  ];

  test('1. Authoritative Primary FSI Potential matches Manewada reference (3,028.135 sqm)', () => {
    const area = calculateAreaMetrics(manewadaStatement, manewadaFloors);

    // Basic FSI: 1,101.140 * 1.10 = 1,211.254 sqm
    expect(area.permissibleFsiSqm).toBeCloseTo(1211.254, 2);
    // Paid FSI: 1,101.140 * 0.50 = 550.570 sqm
    expect(area.permissiblePaidFsiSqm).toBeCloseTo(550.570, 2);
    // Regular TDR: 1,101.140 * 1.15 = 1,266.311 sqm
    expect(area.permissibleRegularTdrSqm).toBeCloseTo(1266.311, 2);
    // Primary Total Builtup FSI: 1,211.254 + 550.570 + 1,266.311 = 3,028.135 sqm
    expect(area.permissibleTotalBuiltupSqm).toBeCloseTo(3028.135, 2);
  });

  test('2. Dual Ancillary Area & Historical Source Potential reconciliation', () => {
    const area = calculateAreaMetrics(manewadaStatement, manewadaFloors);

    // Historical unallocated potential exposes the 60% Res + 80% Comm dual baseline:
    // 3,028.135 * 0.60 = 1,816.881 sqm
    expect(area.sourceUnallocatedResidentialAncillarySqm).toBeCloseTo(1816.881, 2);
    // 3,028.135 * 0.80 = 2,422.508 sqm
    expect(area.sourceUnallocatedCommercialAncillarySqm).toBeCloseTo(2422.508, 2);
    // Sum = 7,267.524 sqm
    expect(area.sourceUnallocatedPermissiblePlineSqm).toBeCloseTo(7267.524, 2);

    // UDCPR pro-rata compliant permissible P-line is also calculated without crash
    expect(area.permissiblePlineTotalSqm).toBeGreaterThan(3028.135);
  });

  test('3. Proposed P-Line Target vs Floor Sum reconciles 0.377 sqm residual difference', () => {
    const area = calculateAreaMetrics(manewadaStatement, manewadaFloors);

    // Stated proposed target
    expect(area.effectiveProposedPlineSqm).toBeCloseTo(4072.457, 3);
    // Sum of configured floors: 269.040 + 480.176 + (8 * 415.358 = 3322.864) = 4,072.080 sqm
    expect(area.floorSumPlineSqm).toBeCloseTo(4072.080, 3);
    // Stated difference: 4,072.457 - 4,072.080 = 0.377 sqm
    expect(area.sourceProposedPlineDifferenceSqm).toBeCloseTo(0.377, 3);
  });

  test('4. Occupancy-Based Parking Statement (UDCPR Chapter 8) requirements & surplus', () => {
    const area = calculateAreaMetrics(manewadaStatement, manewadaFloors);
    const parking = area.parkingRequirements;

    expect(parking).toBeDefined();
    // Commercial carpet: 749.216 sqm -> cars = 14.984, scooters = 44.953
    expect(parking.commercialCarpetSqm).toBeCloseTo(749.216, 2);
    expect(parking.commercialCars).toBeCloseTo(14.984, 2);
    expect(parking.commercialTwoWheelers).toBeCloseTo(44.953, 2);

    // Residential: 32 tenements (40-80 sqm) -> cars = 16, scooters = 32
    expect(parking.totalResidentialTenements).toBe(32);
    expect(parking.residentialCars).toBeCloseTo(16.0, 1);
    expect(parking.residentialTwoWheelers).toBeCloseTo(32.0, 1);

    // Visitor 5% added, Nagpur 0.90 applied
    // Gross: Cars = (14.984 + 16.0) * 1.05 = 32.533
    // NMC 0.90: ceil(32.533 * 0.90) = ceil(29.280) = 30
    // Gross: Scooters = (44.953 + 32.0) * 1.05 = 80.801
    // NMC 0.90: ceil(80.801 * 0.90) = ceil(72.721) = 73
    expect(parking.requiredCars).toBe(30);
    expect(parking.requiredTwoWheelers).toBe(73);

    // Proposed provision: 34 cars, 75 scooters
    expect(parking.proposedCars).toBe(34);
    expect(parking.proposedTwoWheelers).toBe(75);
    expect(parking.surplusDeficitCars).toBe(4); // 34 - 30 = +4
    expect(parking.surplusDeficitTwoWheelers).toBe(2); // 75 - 73 = +2
    expect(parking.isCarRequirementMet).toBe(true);
    expect(parking.isTwoWheelerRequirementMet).toBe(true);
  });

  test('5. Financial Viability preserves Cost A and Cost B separately, handles statutory charges with caps', () => {
    const area = calculateAreaMetrics(manewadaStatement, manewadaFloors);

    const financialData = {
      rr_rate_per_sqm: 24340,
      estimated_cost_a_rate: 15000,
      estimated_cost_b_rate: 26620,
      cost_of_construction_rate: 22000,
      tdr_purchase_factor: 0.55
    };

    const fin = calculateFinancialMetrics(
      financialData,
      [],
      [],
      area
    );

    // Cost A and Cost B are preserved separately
    expect(fin.estimatedCostA).toBeGreaterThan(0);
    expect(fin.estimatedCostB).toBeGreaterThan(0);
    expect(fin.estimatedCostA).not.toBe(fin.estimatedCostB);

    // Cost of Construction D uses civil construction rate ₹22,000/sqm
    const expectedCivil = 4072.080 * 22000;
    expect(fin.costOfConstructionD).toBeCloseTo(expectedCivil, 0);

    // Check individual statutory charge caps:
    const charges = fin.evaluatedStatutoryCharges;
    const secDep = charges.find(c => c.charge_code === 'SECURITY_DEPOSIT');
    // Security Deposit capped at ₹75,000
    expect(secDep.calculated_amount).toBe(75000.00);

    const stacking = charges.find(c => c.charge_code === 'STACKING_CHARGES');
    // Stacking capped at ₹50,000
    expect(stacking.calculated_amount).toBe(50000.00);

    const tree = charges.find(c => c.charge_code === 'TREE_PLANTATION');
    // Tree plantation capped at ₹25,000
    expect(tree.calculated_amount).toBe(25000.00);

    const planReg = charges.find(c => c.charge_code === 'PLAN_REGISTRATION');
    // Plan reg: 4,072.080 * 5.90 = 24,025.27
    expect(planReg.calculated_amount).toBeCloseTo(4072.080 * 5.90, 1);
  });

  test('6. Landowner unit allocation strictly partitions developer receipts and owner entitlement', () => {
    const area = calculateAreaMetrics(manewadaStatement, manewadaFloors);

    const units = [
      {
        unit_name: '2 BHK Luxury',
        building_use: 'Residential',
        carpet_area_sqm: 65.0, // ~700 sqft
        super_buildup_loading_sqft: 300,
        unit_count: 24,
        landowner_unit_count: 6, // 6 units allocated to landowner
        rate_per_sqft: 6500
      },
      {
        unit_name: 'Commercial Retail',
        building_use: 'Commercial',
        carpet_area_sqm: 90.0, // ~968 sqft
        super_buildup_loading_sqft: 300,
        unit_count: 8,
        landowner_unit_count: 2, // 2 units allocated to landowner
        rate_per_sqft: 9000
      }
    ];

    const fin = calculateFinancialMetrics(
      { rr_rate_per_sqm: 24340, cost_of_construction_rate: 22000 },
      [],
      units,
      area
    );

    // Total units = 32
    // Total landowner units = 6 + 2 = 8
    // Total developer units = 18 + 6 = 24
    expect(fin.totalLandownerUnits).toBe(8);
    expect(fin.totalDeveloperUnits).toBe(24);

    // Developer receipts must strictly equal developer units only
    expect(fin.totalReceipts).toBeGreaterThan(0);
    expect(fin.totalLandownerReceipts).toBeGreaterThan(0);
    expect(fin.totalGrossReceipts).toBe(fin.totalReceipts + fin.totalLandownerReceipts);

    // Check individual unit calculations
    const u1 = fin.evaluatedSalableUnits[0];
    expect(u1.developer_unit_count).toBe(18);
    expect(u1.landowner_unit_count).toBe(6);
    expect(u1.developer_amount).toBe(u1.unit_price * 18);
    expect(u1.landowner_amount).toBe(u1.unit_price * 6);
    expect(u1.total_amount).toBe(u1.unit_price * 24);
  });
});

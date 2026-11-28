// server/tests/equalPlineDistribution.test.js
// Verification suite for Proposed P-Line Equal Distribution, Rounding Reconciliation, and Floor-Wise Area Statement

const {
  distributePlineEqually,
  calculateAreaMetrics,
  calculateFinancialMetrics
} = require('../services/feasibilityEngine');
const {
  generateStandardFloorHierarchy
} = require('../services/buildingHierarchyService');

describe('Building Hierarchy & Standard Floor Generation', () => {
  test('generates canonical floors for dynamic G+4 with stilt parking and basements', () => {
    const config = {
      floors_above_ground: 4,
      ground_floor_config: 'stilt',
      basement_count: 2,
      upper_parking_count: 1,
      has_terrace_tank_slab: true
    };

    const floors = generateStandardFloorHierarchy(config);

    // Expected: Basement 2, Basement 1, Stilt Parking (Ground), Upper Parking 1, Floor 1, Floor 2, Floor 3, Floor 4, Terrace
    expect(floors).toHaveLength(9);
    expect(floors[0].floor_key).toBe('basement_2');
    expect(floors[0].floor_type).toBe('parking');
    expect(floors[1].floor_key).toBe('basement_1');
    expect(floors[2].floor_key).toBe('ground_floor');
    expect(floors[2].floor_type).toBe('parking');
    expect(floors[3].floor_key).toBe('upper_parking_1');
    expect(floors[4].floor_key).toBe('floor_1');
    expect(floors[4].floor_type).toBe('habitable');
    expect(floors[7].floor_key).toBe('floor_4');
    expect(floors[8].floor_key).toBe('terrace');
    expect(floors[8].floor_type).toBe('terrace');
  });

  test('generates canonical floors for G+1 habitable ground floor', () => {
    const config = {
      floors_above_ground: 1,
      ground_floor_config: 'parking_and_rooms',
      basement_count: 0,
      upper_parking_count: 0,
      has_terrace_tank_slab: true
    };

    const floors = generateStandardFloorHierarchy(config);
    expect(floors).toHaveLength(3); // Ground Floor, 1st Floor, Terrace Floor
    expect(floors[0].floor_key).toBe('ground_floor');
    expect(floors[0].floor_type).toBe('habitable');
    expect(floors[1].floor_key).toBe('floor_1');
    expect(floors[1].floor_type).toBe('habitable');
    expect(floors[2].floor_key).toBe('terrace');
  });
});

describe('Equal P-Line Distribution & Exact Rounding Reconciliation', () => {
  test('distributes total P-Line equally across 5 floors with exact rounding reconciliation', () => {
    // 926.64 / 5 = 185.328
    // With cent reconciliation: 185.33, 185.33, 185.33, 185.33, 185.32 -> exact sum 926.64
    const floors = [
      { id: 1, floor_key: 'floor_1', is_pline_overridden: false },
      { id: 2, floor_key: 'floor_2', is_pline_overridden: false },
      { id: 3, floor_key: 'floor_3', is_pline_overridden: false },
      { id: 4, floor_key: 'floor_4', is_pline_overridden: false },
      { id: 5, floor_key: 'floor_5', is_pline_overridden: false }
    ];

    const { assignedMap, isPlineInconsistent } = distributePlineEqually(926.64, floors);
    expect(isPlineInconsistent).toBe(false);

    let sum = 0;
    for (const f of floors) {
      const share = assignedMap.get(f.id).pline;
      sum += share;
      expect([185.33, 185.32]).toContain(share);
    }
    expect(Math.round(sum * 100) / 100).toBe(926.64);
  });

  test('distributes total P-Line equally across 3 floors when not evenly divisible', () => {
    // 100.00 / 3 = 33.3333...
    // Cent reconciliation gives 33.34, 33.33, 33.33 -> exact sum 100.00
    const floors = [
      { id: 10, floor_key: 'floor_1' },
      { id: 11, floor_key: 'floor_2' },
      { id: 12, floor_key: 'floor_3' }
    ];

    const { assignedMap } = distributePlineEqually(100.00, floors);
    let sum = 0;
    for (const f of floors) {
      sum += assignedMap.get(f.id).pline;
    }
    expect(Math.round(sum * 100) / 100).toBe(100.00);
  });

  test('reallocates remaining P-Line when an individual floor P-Line is manually overridden', () => {
    // Total 1000 sq.m across 4 floors. Floor 1 is overridden to 400.
    // Remaining 600 distributed equally across Floors 2, 3, 4 -> 200 each.
    const floors = [
      { id: 1, is_pline_overridden: true, pline_area_sqm: 400.00 },
      { id: 2, is_pline_overridden: false },
      { id: 3, is_pline_overridden: false },
      { id: 4, is_pline_overridden: false }
    ];

    const { assignedMap, isPlineInconsistent } = distributePlineEqually(1000.00, floors);
    expect(isPlineInconsistent).toBe(false);
    expect(assignedMap.get(1).pline).toBe(400.00);
    expect(assignedMap.get(1).is_overridden).toBe(true);
    expect(assignedMap.get(2).pline).toBe(200.00);
    expect(assignedMap.get(3).pline).toBe(200.00);
    expect(assignedMap.get(4).pline).toBe(200.00);

    const total = assignedMap.get(1).pline + assignedMap.get(2).pline + assignedMap.get(3).pline + assignedMap.get(4).pline;
    expect(total).toBe(1000.00);
  });

  test('flags inconsistency when sum of overridden floor P-Lines exceeds target proposed P-Line', () => {
    const floors = [
      { id: 1, is_pline_overridden: true, pline_area_sqm: 600.00 },
      { id: 2, is_pline_overridden: true, pline_area_sqm: 500.00 },
      { id: 3, is_pline_overridden: false }
    ];

    const { assignedMap, isPlineInconsistent, plineInconsistencyMessage } = distributePlineEqually(1000.00, floors);
    expect(isPlineInconsistent).toBe(true);
    expect(plineInconsistencyMessage).toContain('exceeds project proposed P-Line');
    expect(assignedMap.get(3).pline).toBe(0);
  });
});

describe('Full Area Metrics Calculation with Floor-Wise Columns', () => {
  const statement = {
    plot_area_sqm: 440.00,
    dp_deductions_sqm: 0,
    road_width_m: 12,
    basic_fsi_factor: 1.1,
    paid_fsi_factor: 0.5,
    proposed_paid_fsi_factor: 0.5,
    tdr_factor: 0.65,
    proposed_regular_tdr_factor: 0.325,
    proposed_slum_tdr_factor: 0.325,
    building_use: 'Residential',
    ancillary_residential_pct: 0.60
  };

  const floors = [
    { id: 1, floor_key: 'ground_floor', floor_name: 'Stilt Parking', floor_type: 'parking', pline_area_sqm: 0, height_meters: 3.00 },
    { id: 2, floor_key: 'floor_1', floor_name: '1st Floor', floor_type: 'habitable', height_meters: 3.00, no_of_units: 2 },
    { id: 3, floor_key: 'floor_2', floor_name: '2nd Floor', floor_type: 'habitable', height_meters: 3.00, no_of_units: 2 },
    { id: 4, floor_key: 'floor_3', floor_name: '3rd Floor', floor_type: 'habitable', height_meters: 3.00, no_of_units: 3 },
    { id: 5, floor_key: 'floor_4', floor_name: '4th Floor', floor_type: 'habitable', height_meters: 3.00, no_of_units: 1 },
    { id: 6, floor_key: 'terrace', floor_name: 'Terrace Floor', floor_type: 'terrace', pline_area_sqm: 0, height_meters: 3.00 }
  ];

  test('calculates permissible independent from proposed and distributes proposed equally across 4 habitable floors', () => {
    const result = calculateAreaMetrics(statement, floors);

    // Permissible: 440 * (1.1 + 0.5 + 0.65) * 1.6 = 440 * 2.25 * 1.6 = 1584.00 sq.m
    expect(result.permissiblePlineTotalSqm).toBeCloseTo(1584.00, 1);

    // Proposed: 440 * (1.1 + 0.5 + 0.65) * 1.6 = 440 * 2.25 * 1.6 = 1584.00 sq.m
    expect(result.calculatedProposedPlineSqm).toBeCloseTo(1584.00, 1);
    expect(result.effectiveProposedPlineSqm).toBeCloseTo(1584.00, 1);

    // Stilt Parking & Terrace excluded from habitable distribution
    expect(result.applicableHabitableFloorsCount).toBe(4);

    // 1584.00 / 4 = 396.00 per habitable floor
    const habitableFloors = result.evaluatedFloors.filter(f => f.floor_type === 'habitable');
    expect(habitableFloors).toHaveLength(4);
    for (const hf of habitableFloors) {
      expect(hf.pline_area_sqm).toBe(396.00);
      // Lobby = 15% of 396.00 = 59.40
      expect(hf.lobby_area_sqm).toBe(59.40);
      // Built-up for sale = 396.00 - 59.40 = 336.60
      expect(hf.builtup_for_sale_sqm).toBe(336.60);
    }

    // Units and Area for 1 unit checks:
    // Floor 1 (2 units): 336.60 / 2 = 168.30
    expect(habitableFloors[0].area_for_1_unit).toBe(168.30);
    // Floor 3 (3 units): 336.60 / 3 = 112.20
    expect(habitableFloors[2].area_for_1_unit).toBe(112.20);
    // Floor 4 (1 unit): 336.60 / 1 = 336.60
    expect(habitableFloors[3].area_for_1_unit).toBe(336.60);

    // Total floor P-Line exactly equals effective proposed P-Line
    expect(result.totalProposedPlineSqm).toBe(1584.00);
    // Total units count = 2 + 2 + 3 + 1 = 8
    expect(result.totalUnitsCount).toBe(8);
  });

  test('safely handles zero-unit floor without division-by-zero errors', () => {
    const zeroUnitFloors = [
      { id: 1, floor_key: 'floor_1', floor_type: 'habitable', height_meters: 3.00, no_of_units: 0 }
    ];
    const result = calculateAreaMetrics(statement, zeroUnitFloors);
    expect(result.evaluatedFloors[0].no_of_units).toBe(0);
    expect(result.evaluatedFloors[0].area_for_1_unit).toBe(0);
  });

  test('respects project-level override of total proposed P-Line', () => {
    const overriddenStatement = {
      ...statement,
      is_proposed_pline_overridden: true,
      total_proposed_pline_override_sqm: 1200.00
    };

    const result = calculateAreaMetrics(overriddenStatement, floors);
    expect(result.isProposedPlineOverridden).toBe(true);
    expect(result.effectiveProposedPlineSqm).toBe(1200.00);

    // 1200 / 4 = 300.00 per habitable floor
    const habitableFloors = result.evaluatedFloors.filter(f => f.floor_type === 'habitable');
    for (const hf of habitableFloors) {
      expect(hf.pline_area_sqm).toBe(300.00);
      expect(hf.lobby_area_sqm).toBe(45.00); // 15% of 300
      expect(hf.builtup_for_sale_sqm).toBe(255.00);
    }
    expect(result.totalProposedPlineSqm).toBe(1200.00);
  });

  test('financial viability consumes authoritative salable units receipts and controlled overrides', () => {
    const areaResult = calculateAreaMetrics(statement, floors);

    const financialRecord = {
      rr_rate_per_sqm: 35000,
      estimated_cost_a_rate: 15000,
      estimated_cost_b_rate: 26620,
      cost_of_construction_rate: 20000,
      overrides: {
        cost_of_construction: {
          override_val: 35000000,
          calculated_basis_val: 36256000,
          overridden_by: 1
        }
      }
    };

    const salableUnits = [
      {
        id: 1,
        unit_name: 'Standard 2 BHK',
        carpet_area_sqft: 700,
        super_buildup_loading_sqft: 300,
        unit_count: 10,
        landowner_unit_count: 0,
        rate_per_sqft: 5000
      }
    ];

    const finResult = calculateFinancialMetrics(financialRecord, [], salableUnits, areaResult);
    expect(finResult.costOfConstructionD).toBe(35000000); // Overridden amount
    expect(finResult.costOfConstructionD_details.has_override).toBe(true);
    expect(finResult.totalReceipts).toBe(50000000);
  });
});

describe('Pure Commercial & Mixed-Use Ancillary Area Integration', () => {
  test('Pure Commercial project applies 80% ancillary and produces approved floor-wise columns', () => {
    const commercialStatement = {
      plot_area_sqm: 500.00,
      dp_deductions_sqm: 0,
      road_width_m: 12, // total 0.65 (Reg 0.325, Slum 0.325)
      basic_fsi_factor: 1.1,
      paid_fsi_factor: 0.5,
      proposed_paid_fsi_factor: 0.5,
      proposed_regular_tdr_factor: 0.325,
      proposed_slum_tdr_factor: 0.325,
      building_use: 'Commercial',
      ancillary_commercial_pct: 0.80
    };

    const commercialFloors = [
      { id: 1, floor_key: 'ground_floor', floor_name: 'Ground Floor Commercial', floor_type: 'habitable', height_meters: 3.60, no_of_units: 4 },
      { id: 2, floor_key: 'floor_1', floor_name: '1st Floor Commercial', floor_type: 'habitable', height_meters: 3.30, no_of_units: 4 },
      { id: 3, floor_key: 'floor_2', floor_name: '2nd Floor Commercial', floor_type: 'habitable', height_meters: 3.30, no_of_units: 2 }
    ];

    const result = calculateAreaMetrics(commercialStatement, commercialFloors);

    expect(result.buildingUse).toBe('Commercial');
    expect(result.isCommercial).toBe(true);
    expect(result.commAncillaryPct).toBe(0.80);

    // Permissible: 500 * (1.1 + 0.5 + 0.65) = 500 * 2.25 = 1125.00 FSI
    // Commercial Ancillary = 1125 * 0.80 = 900.00
    // Total Permissible P-Line = 1125 + 900 = 2025.00
    expect(result.permissibleTotalBuiltupSqm).toBeCloseTo(1125.00, 1);
    expect(result.permissibleCommercialAncillarySqm).toBeCloseTo(900.00, 1);
    expect(result.permissiblePlineTotalSqm).toBeCloseTo(2025.00, 1);

    // Proposed: 500 * (1.1 + 0.5 + 0.65) = 500 * 2.25 = 1125.00 FSI
    // Commercial Ancillary = 1125.00 * 0.80 = 900.00
    // Total Proposed P-Line = 1125.00 + 900.00 = 2025.00
    expect(result.proposedCommercialFsiSqm).toBeCloseTo(1125.00, 1);
    expect(result.proposedCommercialAncillarySqm).toBeCloseTo(900.00, 1);
    expect(result.totalProposedPlineSqm).toBeCloseTo(2025.00, 1);

    // Floor-wise verification of 10 mandatory columns:
    expect(result.evaluatedFloors).toHaveLength(3);
    for (const fl of result.evaluatedFloors) {
      expect(fl.usage_type).toBe('Commercial');
      expect(fl.ancillary_pct).toBe(0.80);
      // FSI: 1125.00 / 3 = 375.00
      expect(fl.fsi_area_sqm).toBe(375.00);
      // Ancillary is FSI * 0.80 = 300.00
      expect(fl.ancillary_area_sqm).toBeCloseTo(300.00, 2);
      // P-Line = FSI + Ancillary = 675.00
      expect(fl.pline_area_sqm).toBeCloseTo(675.00, 2);
      // Lobby = 15% of P-Line = 101.25
      expect(fl.lobby_area_sqm).toBeCloseTo(101.25, 2);
      // Built-up for Sale = P-Line - Lobby = 573.75
      expect(fl.builtup_for_sale_sqm).toBeCloseTo(573.75, 2);
      // Area for 1 Unit = Built-up for Sale / no_of_units
      expect(fl.area_for_1_unit).toBeCloseTo(fl.builtup_for_sale_sqm / fl.no_of_units, 2);
    }
  });

  test('Mixed-Use project calculates residential (60%) and commercial (80%) independently', () => {
    const mixedStatement = {
      plot_area_sqm: 600.00,
      dp_deductions_sqm: 0,
      road_width_m: 12,
      basic_fsi_factor: 1.1,
      paid_fsi_factor: 0.5,
      proposed_paid_fsi_factor: 0.5,
      proposed_regular_tdr_factor: 0.325,
      proposed_slum_tdr_factor: 0.325,
      building_use: 'Mixed Use'
    };

    // 1 Commercial Floor + 3 Residential Floors = 4 Habitable floors
    const mixedFloors = [
      { id: 101, floor_key: 'ground_floor', floor_name: 'Ground Commercial', floor_type: 'habitable', usage_type: 'Commercial', height_meters: 3.60, no_of_units: 4 },
      { id: 102, floor_key: 'floor_1', floor_name: '1st Floor Residential', floor_type: 'habitable', usage_type: 'Residential', height_meters: 3.00, no_of_units: 2 },
      { id: 103, floor_key: 'floor_2', floor_name: '2nd Floor Residential', floor_type: 'habitable', usage_type: 'Residential', height_meters: 3.00, no_of_units: 2 },
      { id: 104, floor_key: 'floor_3', floor_name: '3rd Floor Residential', floor_type: 'habitable', usage_type: 'Residential', height_meters: 3.00, no_of_units: 2 }
    ];

    const result = calculateAreaMetrics(mixedStatement, mixedFloors);

    expect(result.isMixedUse).toBe(true);

    // Total Proposed FSI: 600 * (1.1 + 0.5 + 0.65) = 600 * 2.25 = 1350.00 sq.m
    // 4 floors -> 1350 / 4 = 337.50 sq.m FSI per floor
    // Commercial Floor (1 floor): FSI = 337.50 sq.m, Ancillary (80%) = 337.50 * 0.8 = 270.00 sq.m
    //   -> P-Line = 337.50 + 270.00 = 607.50 sq.m
    // Residential Floors (3 floors): each FSI = 337.50 sq.m, Ancillary (60%) = 337.50 * 0.6 = 202.50 sq.m
    //   -> P-Line per floor = 337.50 + 202.50 = 540.00 sq.m
    // Total Proposed Residential FSI = 337.50 * 3 = 1012.50 sq.m
    // Total Proposed Commercial FSI = 337.50 sq.m
    // Total Proposed Residential Ancillary = 202.50 * 3 = 607.50 sq.m
    // Total Proposed Commercial Ancillary = 270.00 sq.m
    // Total Proposed Ancillary = 607.50 + 270.00 = 877.50 sq.m
    // Total Proposed P-Line = 1350.00 + 877.50 = 2227.50 sq.m

    expect(result.proposedCommercialFsiSqm).toBeCloseTo(337.50, 2);
    expect(result.proposedResidentialFsiSqm).toBeCloseTo(1012.50, 2);
    expect(result.proposedTotalFsiSqm).toBeCloseTo(1350.00, 2);

    expect(result.proposedCommercialAncillarySqm).toBeCloseTo(270.00, 2);
    expect(result.proposedResidentialAncillarySqm).toBeCloseTo(607.50, 2);
    expect(result.totalProposedAncillarySqm).toBeCloseTo(877.50, 2);

    expect(result.totalProposedPlineSqm).toBeCloseTo(2227.50, 2);

    // Floor checks
    const commFloor = result.evaluatedFloors.find(f => f.id === 101);
    expect(commFloor.usage_type).toBe('Commercial');
    expect(commFloor.ancillary_pct).toBe(0.80);
    expect(commFloor.fsi_area_sqm).toBeCloseTo(337.50, 2);
    expect(commFloor.ancillary_area_sqm).toBeCloseTo(270.00, 2);
    expect(commFloor.pline_area_sqm).toBeCloseTo(607.50, 2);

    const resFloor1 = result.evaluatedFloors.find(f => f.id === 102);
    expect(resFloor1.usage_type).toBe('Residential');
    expect(resFloor1.ancillary_pct).toBe(0.60);
    expect(resFloor1.fsi_area_sqm).toBeCloseTo(337.50, 2);
    expect(resFloor1.ancillary_area_sqm).toBeCloseTo(202.50, 2);
    expect(resFloor1.pline_area_sqm).toBeCloseTo(540.00, 2);
  });

  test('Mixed-Use reverse-derives FSI and ancillary when commercial or residential floor is overridden', () => {
    const mixedStatement = {
      plot_area_sqm: 600.00,
      dp_deductions_sqm: 0,
      road_width_m: 12,
      basic_fsi_factor: 1.1,
      paid_fsi_factor: 0.5,
      proposed_paid_fsi_factor: 0.5,
      proposed_regular_tdr_factor: 0.325,
      proposed_slum_tdr_factor: 0.325,
      building_use: 'Mixed Use'
    };

    // Override Commercial floor P-Line to 540.00 sq.m
    // For Commercial: multiplier is 1.80 -> floor FSI = 540 / 1.80 = 300.00 sq.m
    // Floor Ancillary = 540 - 300 = 240.00 sq.m (which is 300 * 0.8)
    // Total Proposed FSI = 1350.00 sq.m
    // Remaining FSI = 1350.00 - 300.00 = 1050.00 sq.m across 3 residential floors -> 1050 / 3 = 350.00 sq.m each
    const mixedFloorsWithOverride = [
      { id: 201, floor_key: 'ground_floor', floor_type: 'habitable', usage_type: 'Commercial', is_pline_overridden: true, pline_area_sqm: 540.00, height_meters: 3.60, no_of_units: 4 },
      { id: 202, floor_key: 'floor_1', floor_type: 'habitable', usage_type: 'Residential', is_pline_overridden: false, height_meters: 3.00, no_of_units: 2 },
      { id: 203, floor_key: 'floor_2', floor_type: 'habitable', usage_type: 'Residential', is_pline_overridden: false, height_meters: 3.00, no_of_units: 2 },
      { id: 204, floor_key: 'floor_3', floor_type: 'habitable', usage_type: 'Residential', is_pline_overridden: false, height_meters: 3.00, no_of_units: 2 }
    ];

    const result = calculateAreaMetrics(mixedStatement, mixedFloorsWithOverride);

    const commFloor = result.evaluatedFloors.find(f => f.id === 201);
    expect(commFloor.is_pline_overridden).toBe(true);
    expect(commFloor.pline_area_sqm).toBe(540.00);
    expect(commFloor.fsi_area_sqm).toBeCloseTo(300.00, 2);
    expect(commFloor.ancillary_area_sqm).toBeCloseTo(240.00, 2);

    const resFloors = result.evaluatedFloors.filter(f => f.usage_type === 'Residential');
    let resFsiSum = 0;
    for (const rf of resFloors) {
      resFsiSum += rf.fsi_area_sqm;
      expect(rf.ancillary_area_sqm).toBeCloseTo(rf.fsi_area_sqm * 0.60, 2);
      expect(rf.pline_area_sqm).toBeCloseTo(rf.fsi_area_sqm + rf.ancillary_area_sqm, 2);
    }
    // Total FSI across all floors reconciles to 1350.00
    expect(Math.round((commFloor.fsi_area_sqm + resFsiSum) * 100) / 100).toBe(1350.00);
  });
});

// server/services/feasibilityEngine.js
// Authoritative calculation engine for Project Area Statement & Financial Viability
// Faithfully reproduces verified engineering & statutory formulas from reference models

const SQM_TO_SQFT = 10.764;

/**
 * Road-width based TDR Factor matrix for Gunthewari and Regular plots
 * Strictly enforced - no interpolation
 */
const ROAD_WIDTH_TDR_MAP = {
  9: { regular: 0.40, gunthewari: 0.20 },
  12: { regular: 0.65, gunthewari: 0.325 },
  15: { regular: 0.80, gunthewari: 0.40 },
  18: { regular: 0.90, gunthewari: 0.45 },
  24: { regular: 1.10, gunthewari: 0.50 }
};

/**
 * Calculate derived Area Statement metrics from inputs and floor rows
 * @param {Object} statement Area statement database record
 * @param {Array} floors List of floor records
 * @returns {Object} Calculated metrics
 */
function calculateAreaMetrics(statement = {}, floors = []) {
  const plotArea = parseFloat(statement.plot_area_sqm) || 0;
  const dpDeductions = parseFloat(statement.dp_deductions_sqm) || 0;
  const existingBuiltup = parseFloat(statement.existing_builtup_area_sqm) || 0;

  const basicFsiFactor = statement.basic_fsi_factor !== undefined && !isNaN(parseFloat(statement.basic_fsi_factor))
    ? parseFloat(statement.basic_fsi_factor)
    : 1.1;
  const paidFsiFactor = statement.paid_fsi_factor !== undefined && !isNaN(parseFloat(statement.paid_fsi_factor))
    ? parseFloat(statement.paid_fsi_factor)
    : 0.5;

  // Dual TDR: Regular TDR & Slum TDR
  let regularTdrFactor = parseFloat(statement.regular_tdr_factor);
  let slumTdrFactor = parseFloat(statement.slum_tdr_factor);

  // If road width is specified, determine road-width suggested factor if regular_tdr_factor is not explicitly overridden
  const roadWidth = parseFloat(statement.road_width_m);
  const isGunthewari = Boolean(statement.is_gunthewari);
  let suggestedRoadTdrFactor = null;
  if (!isNaN(roadWidth) && ROAD_WIDTH_TDR_MAP[roadWidth]) {
    suggestedRoadTdrFactor = isGunthewari ? ROAD_WIDTH_TDR_MAP[roadWidth].gunthewari : ROAD_WIDTH_TDR_MAP[roadWidth].regular;
    if (isNaN(regularTdrFactor) || statement.regular_tdr_factor === null || statement.regular_tdr_factor === undefined) {
      regularTdrFactor = suggestedRoadTdrFactor;
    }
  }

  if (isNaN(regularTdrFactor)) {
    regularTdrFactor = parseFloat(statement.proposed_tdr_factor) || 0;
  }
  if (isNaN(slumTdrFactor)) {
    slumTdrFactor = 0;
  }

  const permissibleTdrFactor = parseFloat(statement.tdr_factor) || 0.65;
  const totalProposedTdrFactor = regularTdrFactor + slumTdrFactor;

  // Ancillary Percentage by Building Use: Commercial = 80%, Residential = 60%
  const rawBuildingUse = statement.building_use || 'Residential';
  const buildingUse = rawBuildingUse.charAt(0).toUpperCase() + rawBuildingUse.slice(1).toLowerCase();
  const isCommercial = rawBuildingUse.toLowerCase() === 'commercial';
  const applicableAncillaryPct = isCommercial
    ? (parseFloat(statement.ancillary_commercial_pct) || 0.80)
    : (parseFloat(statement.ancillary_residential_pct) || 0.60);

  const dividingFactor = parseFloat(statement.dividing_factor) || 1.6;

  // 1. Plotable Area
  const plotableAreaSqm = Math.max(0, plotArea - dpDeductions);

  // 2. Permissible FSI
  const permissibleFsiSqm = plotableAreaSqm * basicFsiFactor;
  const proposedBasicFsiSqm = permissibleFsiSqm;

  // 3. Paid FSI
  const permissiblePaidFsiSqm = plotableAreaSqm * paidFsiFactor;
  const proposedPaidFsiSqm = permissiblePaidFsiSqm;

  // 4. Dual TDR Calculations
  const permissibleTdrSqm = plotableAreaSqm * permissibleTdrFactor;
  const regularTdrSqm = plotableAreaSqm * regularTdrFactor;
  const slumTdrSqm = plotableAreaSqm * slumTdrFactor;
  const proposedTdrSqm = regularTdrSqm + slumTdrSqm;

  // 5. Total Builtup Area (B + C + D)
  const permissibleTotalBuiltupSqm = permissibleFsiSqm + permissiblePaidFsiSqm + permissibleTdrSqm;
  const proposedTotalBuiltupSqm = proposedBasicFsiSqm + proposedPaidFsiSqm + proposedTdrSqm;

  // 6. TOTAL FSI
  const permissibleTotalFsi = plotableAreaSqm > 0 ? permissibleTotalBuiltupSqm / plotableAreaSqm : 0;
  const proposedTotalFsi = plotableAreaSqm > 0 ? proposedTotalBuiltupSqm / plotableAreaSqm : 0;

  // 7. Ancillary Area (60% residential / 80% commercial)
  const permissibleAncillaryResSqm = permissibleTotalBuiltupSqm * applicableAncillaryPct;
  const proposedAncillaryResSqm = proposedTotalBuiltupSqm * applicableAncillaryPct;

  // 8. Total Permissible P-Line Area (Builtup + Ancillary)
  const permissiblePlineTotalSqm = permissibleTotalBuiltupSqm + permissibleAncillaryResSqm;
  const proposedPlineTotalSqm = proposedTotalBuiltupSqm + proposedAncillaryResSqm;

  // 9. Floor Rows Aggregation
  let totalProposedPlineSqm = 0;
  let totalLobbyAreaSqm = 0;
  let totalBuiltupForOwnersSqm = 0;
  let totalBuiltupForSaleSqm = 0;
  let totalHeightMeters = 0;
  let totalUnitsCount = 0;

  const evaluatedFloors = (floors || []).map((floor, idx) => {
    const pline = parseFloat(floor.pline_area_sqm) || 0;
    const height = parseFloat(floor.height_meters) || 0;
    const floorTypeUpper = (floor.floor_type || '').toUpperCase();
    const isParking = ['PARKING', 'BASEMENT_1', 'BASEMENT_2', 'STILT', 'UPPER_PARKING'].includes(floorTypeUpper) || 
                      (floor.usage_type && floor.usage_type.toLowerCase().includes('parking')) ||
                      (floor.floor_name && floor.floor_name.toLowerCase().includes('parking'));
    
    // Automatic Lobby Area: 15% of P-Line area unless manually overridden
    const isLobbyOverridden = Boolean(floor.is_lobby_overridden);
    let lobby = parseFloat(floor.lobby_area_sqm);
    if (!isLobbyOverridden || isNaN(lobby)) {
      lobby = Math.round(pline * 0.15 * 100) / 100;
    }

    // Builtup for Sale: Parking floors do not contribute to saleable area unless commercial
    let sale = isParking ? 0 : (parseFloat(floor.builtup_for_sale_sqm) || 0);

    // Number of units and Area for 1 unit
    let noOfUnits = parseInt(floor.no_of_units, 10);
    if (isNaN(noOfUnits)) noOfUnits = isParking ? 0 : 1;
    
    const areaFor1Unit = noOfUnits > 0 ? Math.round((sale / noOfUnits) * 10000) / 10000 : 0;

    // Builtup for Owners = P-Line Area - Lobby Area (Ground floor/parking owners is 0 unless overridden)
    let owners = parseFloat(floor.builtup_for_owners_sqm);
    if (isNaN(owners) || floor.builtup_for_owners_sqm === null || floor.builtup_for_owners_sqm === undefined) {
      owners = (idx === 0 || isParking) ? 0 : Math.max(0, pline - lobby);
    }

    totalProposedPlineSqm += pline;
    totalLobbyAreaSqm += lobby;
    totalBuiltupForOwnersSqm += owners;
    totalBuiltupForSaleSqm += sale;
    totalHeightMeters += height;
    totalUnitsCount += noOfUnits;

    return {
      ...floor,
      pline_area_sqm: pline,
      lobby_area_sqm: lobby,
      is_lobby_overridden: isLobbyOverridden,
      height_meters: height,
      builtup_for_owners_sqm: owners,
      builtup_for_sale_sqm: sale,
      no_of_units: noOfUnits,
      area_for_1_unit: areaFor1Unit,
      total_floor_area_sqm: pline,
      pline_area_sqft: pline * SQM_TO_SQFT,
      lobby_area_sqft: lobby * SQM_TO_SQFT,
      builtup_for_owners_sqft: owners * SQM_TO_SQFT,
      builtup_for_sale_sqft: sale * SQM_TO_SQFT
    };
  });

  // 10. Proposed After Deducting Existing Construction
  const proposedAfterExistingSqm = Math.max(0, totalProposedPlineSqm - existingBuiltup);

  // 11. Dividing Factor 1.6 Calculation
  const baseDividingFactorSqm = dividingFactor > 0 ? (proposedAfterExistingSqm / dividingFactor) : 0;

  // 12. Derived Ancillary Area = Total Proposed P-Line - Base Dividing Factor Area
  const derivedAncillaryAreaSqm = Math.max(0, totalProposedPlineSqm - baseDividingFactorSqm);

  // 13. Basic FSI (1.1) and TDR (30%) of Plot Area
  const basicFsiOfPlotSqm = plotableAreaSqm * basicFsiFactor;
  const tdrOfPlotSqm = plotableAreaSqm * 0.30;

  // 14. Paid FSI Required (B - D - E = F)
  const paidFsiRequiredSqm = Math.max(0, baseDividingFactorSqm - basicFsiOfPlotSqm - tdrOfPlotSqm);

  // 15. Area Balance (Difference between permissible and proposed)
  const areaBalanceSqm = proposedPlineTotalSqm - totalProposedPlineSqm;

  const isConfigured = (plotArea > 0) || ((floors || []).length > 0);

  return {
    isConfigured,
    buildingUse,
    isCommercial,
    applicableAncillaryPct,
    isGunthewari,
    roadWidth,
    suggestedRoadTdrFactor,
    regularTdrFactor,
    slumTdrFactor,
    totalProposedTdrFactor,

    plotableAreaSqm,
    plotableAreaSqft: plotableAreaSqm * SQM_TO_SQFT,
    permissibleFsiSqm,
    proposedBasicFsiSqm,
    permissiblePaidFsiSqm,
    proposedPaidFsiSqm,
    permissibleTdrSqm,
    regularTdrSqm,
    permissibleRegularTdrSqm: regularTdrSqm,
    proposedRegularTdrSqm: regularTdrSqm,
    slumTdrSqm,
    permissibleSlumTdrSqm: slumTdrSqm,
    proposedSlumTdrSqm: slumTdrSqm,
    ancillaryPct: applicableAncillaryPct,
    proposedTdrSqm,
    permissibleTotalBuiltupSqm,
    proposedTotalBuiltupSqm,
    permissibleTotalFsi,
    proposedTotalFsi,
    permissibleAncillaryResSqm,
    proposedAncillaryResSqm,
    permissiblePlineTotalSqm,
    proposedPlineTotalSqm,
    
    // Aggregates from floor table
    totalProposedPlineSqm,
    totalProposedPlineSqft: totalProposedPlineSqm * SQM_TO_SQFT,
    totalLobbyAreaSqm,
    totalLobbyAreaSqft: totalLobbyAreaSqm * SQM_TO_SQFT,
    totalBuiltupForOwnersSqm,
    totalBuiltupForOwnersSqft: totalBuiltupForOwnersSqm * SQM_TO_SQFT,
    totalBuiltupForSaleSqm,
    totalBuiltupForSaleSqft: totalBuiltupForSaleSqm * SQM_TO_SQFT,
    totalOwnersAndSaleSqm: totalBuiltupForOwnersSqm + totalBuiltupForSaleSqm,
    totalOwnersAndSaleSqft: (totalBuiltupForOwnersSqm + totalBuiltupForSaleSqm) * SQM_TO_SQFT,
    totalHeightMeters,
    totalUnitsCount,

    // Secondary verified formulas
    proposedAfterExistingSqm,
    baseDividingFactorSqm,
    derivedAncillaryAreaSqm,
    basicFsiOfPlotSqm,
    tdrOfPlotSqm,
    paidFsiRequiredSqm,
    areaBalanceSqm,

    evaluatedFloors
  };
}

/**
 * Calculate complete Financial Viability figures based on financial inputs, statutory items, salable units and area statement
 * @param {Object} financial Financial viability database record
 * @param {Array} statutoryItems List of statutory charge rows
 * @param {Array} salableUnits List of salable units
 * @param {Object} areaMetrics Result of calculateAreaMetrics
 * @returns {Object} Calculated financial statement
 */
function calculateFinancialMetrics(financial = {}, statutoryItems = [], salableUnits = [], areaMetrics = {}) {
  const rrRate = parseFloat(financial.rr_rate_per_sqm) || 0.00;
  const estimatedCostARate = parseFloat(financial.estimated_cost_a_rate) || 0.00;
  const estimatedCostBRate = parseFloat(financial.estimated_cost_b_rate) || 0.00;

  // Use effective P-Line area from proposed area calculation (0 if floors not yet populated)
  const effectivePlineSqm = areaMetrics.totalProposedPlineSqm > 0 
    ? areaMetrics.totalProposedPlineSqm 
    : (areaMetrics.proposedPlineTotalSqm || 0);
  const effectiveAncillarySqm = areaMetrics.proposedAncillaryResSqm || 0;
  const effectivePaidFsiSqm = areaMetrics.proposedPaidFsiSqm || 0;
  const effectiveTdrSqm = areaMetrics.proposedTdrSqm || 0;
  const plotAreaSqm = areaMetrics.plotableAreaSqm || 0;

  // Benchmark estimated costs (only computed if rates & area are entered)
  const estimatedCostA = effectivePlineSqm * estimatedCostARate;
  const estimatedCostB = effectivePlineSqm * estimatedCostBRate;

  // 1. STATUTORY CHARGES (SECTION A: NMC / Local Authority Demand)
  // Per-charge RR percentages: defaults if not explicitly configured on the row
  const defaultRrPercentages = {
    ANCILLARY_CHARGES: 10.0,
    DEVELOPMENT_CHARGES: 2.0,
    PREMIUM_FSI: 40.0,
    TDR_LOADING_CHARGES: 3.0
  };

  // Standard statutory calculation base map
  const getStatutoryAmount = (chargeCode, item) => {
    // If charge has a custom amount entered, use it
    if (item.is_custom && item.amount !== null && !isNaN(parseFloat(item.amount))) {
      return parseFloat(item.amount);
    }

    // Configured RR percentage applied to RR rate
    const configuredRrPct = (item.rr_percentage !== null && item.rr_percentage !== undefined && !isNaN(parseFloat(item.rr_percentage)))
      ? parseFloat(item.rr_percentage)
      : (defaultRrPercentages[chargeCode] || null);

    switch (chargeCode) {
      case 'PLAN_REGISTRATION':
        return effectivePlineSqm * 5.90;
      case 'SECURITY_DEPOSIT':
        return estimatedCostA > 0 ? Math.min(0.01 * estimatedCostA, 75000.00) : 0;
      case 'STACKING_CHARGES':
        return estimatedCostA > 0 ? Math.min(0.005 * estimatedCostA, 50000.00) : 0;
      case 'ANCILLARY_CHARGES':
        return (rrRate > 0 && configuredRrPct !== null) ? effectiveAncillarySqm * ((configuredRrPct / 100) * rrRate) : 0;
      case 'SEWER_CONNECTION':
        return effectivePlineSqm * 2.50;
      case 'DEVELOPMENT_CHARGES':
        return (rrRate > 0 && configuredRrPct !== null) ? effectivePlineSqm * ((configuredRrPct / 100) * rrRate) : 0;
      case 'PREMIUM_FSI':
        return (rrRate > 0 && configuredRrPct !== null) ? effectivePaidFsiSqm * ((configuredRrPct / 100) * rrRate) : 0;
      case 'TREE_PLANTATION':
        return effectivePlineSqm > 0 ? Math.min((effectivePlineSqm / 74.32) * 500.00, 25000.00) : 0;
      case 'HERITAGE_FUND': {
        const devCharge = (rrRate > 0 && configuredRrPct !== null) ? (effectivePlineSqm * ((configuredRrPct / 100) * rrRate)) : (effectivePlineSqm * 0.02 * rrRate);
        return 0.02 * devCharge;
      }
      case 'LABOUR_WELFARE_CESS':
        return estimatedCostB > 0 ? 0.01 * estimatedCostB : 0;
      case 'TDR_LOADING_CHARGES':
        return (rrRate > 0 && configuredRrPct !== null) ? effectiveTdrSqm * ((configuredRrPct / 100) * rrRate) : 0;
      case 'AMALGAMATION':
        // Amalgamation charges removed from active calculations (REQ-J)
        return 0;
      case 'LABOUR_WELFARE_PARKING':
        return estimatedCostBRate > 0 ? (225 * estimatedCostBRate * 0.01) : 0;
      default:
        return parseFloat(item.amount) || 0;
    }
  };

  let totalStatutoryDemandA = 0;
  const evaluatedStatutoryCharges = (statutoryItems && statutoryItems.length > 0)
    ? statutoryItems
        .filter(item => !item.is_deleted)
        .map((item, idx) => {
          const isEnabled = item.is_enabled !== false;
          const calculatedAmount = getStatutoryAmount(item.charge_code, item);
          const finalAmount = isEnabled ? Math.round(calculatedAmount * 100) / 100 : 0;
          
          if (isEnabled) {
            totalStatutoryDemandA += finalAmount;
          }

          return {
            ...item,
            is_enabled: isEnabled,
            calculated_amount: Math.round(calculatedAmount * 100) / 100,
            effective_amount: finalAmount
          };
        })
    : [
        { charge_code: 'PLAN_REGISTRATION', charge_name: 'PLAN REGISTRATION FEES', is_enabled: true },
        { charge_code: 'SECURITY_DEPOSIT', charge_name: 'SECURITY DEPOSIT (MAX RS 75,000.00)', is_enabled: true },
        { charge_code: 'STACKING_CHARGES', charge_name: 'STACKING CHARGES (MAX RS 50,000.00)', is_enabled: true },
        { charge_code: 'ANCILLARY_CHARGES', charge_name: 'ANCILLARY AREA CHARGES', rr_percentage: 10.0, is_enabled: true },
        { charge_code: 'SEWER_CONNECTION', charge_name: 'SEWER CONNECTION CHARGES', is_enabled: true },
        { charge_code: 'DEVELOPMENT_CHARGES', charge_name: 'DEVELOPMENT CHARGES', rr_percentage: 2.0, is_enabled: true },
        { charge_code: 'PREMIUM_FSI', charge_name: 'PREMIUM FSI CHARGES', rr_percentage: 40.0, is_enabled: true },
        { charge_code: 'TREE_PLANTATION', charge_name: 'TREE PLANTATION (RS 500 / 74.32 SQM)', is_enabled: true },
        { charge_code: 'HERITAGE_FUND', charge_name: 'HERITAGE FUND (2% OF DEV CHARGES)', is_enabled: true },
        { charge_code: 'LABOUR_WELFARE_CESS', charge_name: 'LABOUR WELFARE CESS (1% OF RR CONST)', is_enabled: true },
        { charge_code: 'TDR_LOADING_CHARGES', charge_name: 'TDR LOADING CHARGES', rr_percentage: 3.0, is_enabled: true },
        { charge_code: 'LABOUR_WELFARE_PARKING', charge_name: 'LABOUR WELFARE ON PARKING AREA', is_enabled: true },
      ].map((it, idx) => {
        const amt = getStatutoryAmount(it.charge_code, it);
        totalStatutoryDemandA += amt;
        return {
          id: `default-${idx}`,
          ...it,
          calculated_amount: Math.round(amt * 100) / 100,
          effective_amount: Math.round(amt * 100) / 100
        };
      });

  // 2. COST OF TDR (SECTION B)
  const costOfTdrB = rrRate > 0 ? effectiveTdrSqm * (0.55 * rrRate) : 0;

  // 3. MINOR EXPENSES & NOCs (SECTION C)
  const minorExpenses = parseFloat(financial.minor_expenses) || 0.00;
  const bpmsCharges = parseFloat(financial.bpms_staff_charges) || 0.00;
  const airportNoc = parseFloat(financial.airport_noc) || 0.00;
  const fireNoc = parseFloat(financial.fire_noc) || 0.00;
  const entertainment = parseFloat(financial.entertainment_charges) || 0.00;
  const extraStampDuty = parseFloat(financial.extra_stamp_duty) || 0.00;
  const advocateFees = parseFloat(financial.advocate_fees) || 0.00;
  const totalExpensesC = minorExpenses + bpmsCharges + airportNoc + fireNoc + entertainment + extraStampDuty + advocateFees;

  // 4. DEVELOPMENT COSTS (SECTIONS D to H)
  const plotCostRate = parseFloat(financial.cost_of_plot_rate_per_sqm) || 0.00;
  const costOfPlotH = parseFloat(financial.cost_of_plot) > 0 ? parseFloat(financial.cost_of_plot) : (plotAreaSqm * plotCostRate);

  const constRate = parseFloat(financial.cost_of_construction_rate) || 0.00;
  const costOfConstructionD = effectivePlineSqm * constRate;

  // Basement Cost
  const basementArea = parseFloat(financial.basement_area_sqm) || 0.00;
  const basementRate = parseFloat(financial.basement_rate_per_sqm) || 0.00;
  const costOfBasementE = parseFloat(financial.cost_of_basement) > 0 ? parseFloat(financial.cost_of_basement) : (basementArea * basementRate);

  // Rent During Construction
  const rentTenements = parseInt(financial.rent_tenements, 10) || 0;
  const rentPerMonth = parseFloat(financial.rent_per_tenement_per_month) || 0.00;
  const rentMonths = parseInt(financial.rent_months, 10) || 0;
  const rentCostF = parseFloat(financial.rent_amount) > 0 ? parseFloat(financial.rent_amount) : (rentTenements * rentPerMonth * rentMonths);

  // Stacked Parking
  const parkingSlots = parseInt(financial.stacked_parking_slots, 10) || 0;
  const parkingSlotCost = parseFloat(financial.stacked_parking_cost_per_slot) || 0.00;
  const stackedParkingCostG = parseFloat(financial.stacked_parking_cost) > 0 ? parseFloat(financial.stacked_parking_cost) : (parkingSlots * parkingSlotCost);

  const costOfInfra = parseFloat(financial.cost_of_infrastructure) || 0.00;
  const interestCost = parseFloat(financial.interest_amount) || 0.00;

  // Total Project Cost = A + B + C + D + E + F + G + H + infra + interest
  const totalProjectCost = totalStatutoryDemandA + costOfTdrB + totalExpensesC + costOfConstructionD + costOfBasementE + rentCostF + stackedParkingCostG + costOfPlotH + costOfInfra + interestCost;

  // 5. RECEIPTS & SALABLE UNITS
  let totalReceipts = 0;
  let totalSalableCarpetSqft = 0;
  let totalSalableSuperSqft = 0;

  const evaluatedSalableUnits = (salableUnits || []).map((unit) => {
    const carpetSqm = parseFloat(unit.carpet_area_sqm) || 0;
    const carpetSqft = carpetSqm * SQM_TO_SQFT;
    const loadingSqft = parseFloat(unit.super_buildup_loading_sqft) || 300.00;
    const superSqft = carpetSqft + loadingSqft;
    const units = parseInt(unit.unit_count, 10) || 1;
    const rateSqft = parseFloat(unit.rate_per_sqft) || 6000.00;
    const unitPrice = superSqft * rateSqft;
    const totalAmount = unitPrice * units;

    totalReceipts += totalAmount;
    totalSalableCarpetSqft += (carpetSqft * units);
    totalSalableSuperSqft += (superSqft * units);

    return {
      ...unit,
      carpet_area_sqm: carpetSqm,
      carpet_area_sqft: Math.round(carpetSqft * 100) / 100,
      super_buildup_area_sqft: Math.round(superSqft * 100) / 100,
      unit_price: Math.round(unitPrice * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100
    };
  });

  // 6. FINANCIAL SUMMARY
  const netProfit = totalReceipts - totalProjectCost;
  const roiPct = totalProjectCost > 0 ? (netProfit / totalProjectCost) * 100 : 0;
  const profitMarginPct = totalReceipts > 0 ? (netProfit / totalReceipts) * 100 : 0;

  const isConfigured = (effectivePlineSqm > 0 && rrRate > 0) || totalProjectCost > 0 || totalReceipts > 0;

  return {
    isConfigured,
    rrRate,
    estimatedCostA,
    estimatedCostB,
    totalStatutoryDemandA: Math.round(totalStatutoryDemandA * 100) / 100,
    costOfTdrB: Math.round(costOfTdrB * 100) / 100,
    totalExpensesC: Math.round(totalExpensesC * 100) / 100,
    costOfPlotH: Math.round(costOfPlotH * 100) / 100,
    costOfConstructionD: Math.round(costOfConstructionD * 100) / 100,
    costOfBasementE: Math.round(costOfBasementE * 100) / 100,
    rentCostF: Math.round(rentCostF * 100) / 100,
    stackedParkingCostG: Math.round(stackedParkingCostG * 100) / 100,
    totalProjectCost: Math.round(totalProjectCost * 100) / 100,
    totalReceipts: Math.round(totalReceipts * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    roiPct: Math.round(roiPct * 100) / 100,
    profitMarginPct: Math.round(profitMarginPct * 100) / 100,

    evaluatedStatutoryCharges,
    evaluatedSalableUnits,
    totalSalableCarpetSqft: Math.round(totalSalableCarpetSqft * 100) / 100,
    totalSalableSuperSqft: Math.round(totalSalableSuperSqft * 100) / 100,

    formulaNotes: [
      'Dual TDR (Regular and Slum) modeled independently with combined potential',
      'Ancillary Area percentage applied dynamically (Commercial 80%, Residential 60%)',
      'Lobby Area defaults to 15% with manual override preservation',
      'Statutory Charges support independent RR percentage configuration and enable/disable exclusions'
    ]
  };
}

module.exports = {
  SQM_TO_SQFT,
  ROAD_WIDTH_TDR_MAP,
  calculateAreaMetrics,
  calculateFinancialMetrics
};

// server/services/feasibilityEngine.js
// Authoritative calculation engine for Project Area Statement & Financial Viability
// Faithfully reproduces verified engineering & statutory formulas from reference models

const SQM_TO_SQFT = 10.764;

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

  const basicFsiFactor = parseFloat(statement.basic_fsi_factor) || 1.1;
  const paidFsiFactor = parseFloat(statement.paid_fsi_factor) || 0.5;
  const tdrFactor = parseFloat(statement.tdr_factor) || 0.65;
  const proposedTdrFactor = parseFloat(statement.proposed_tdr_factor) || 0;
  const ancillaryResPct = parseFloat(statement.ancillary_residential_pct) || 0.60;
  const ancillaryCommPct = parseFloat(statement.ancillary_commercial_pct) || 0.80;
  const dividingFactor = parseFloat(statement.dividing_factor) || 1.6;

  // 1. Plotable Area
  const plotableAreaSqm = Math.max(0, plotArea - dpDeductions);

  // 2. Permissible FSI
  const permissibleFsiSqm = plotableAreaSqm * basicFsiFactor;
  const proposedBasicFsiSqm = permissibleFsiSqm;

  // 3. Paid FSI
  const permissiblePaidFsiSqm = plotableAreaSqm * paidFsiFactor;
  const proposedPaidFsiSqm = permissiblePaidFsiSqm;

  // 4. TDR
  const permissibleTdrSqm = plotableAreaSqm * tdrFactor;
  const proposedTdrSqm = plotableAreaSqm * proposedTdrFactor;

  // 5. Total Builtup Area (B + C + D)
  const permissibleTotalBuiltupSqm = permissibleFsiSqm + permissiblePaidFsiSqm + permissibleTdrSqm;
  const proposedTotalBuiltupSqm = proposedBasicFsiSqm + proposedPaidFsiSqm + proposedTdrSqm;

  // 6. TOTAL FSI
  const permissibleTotalFsi = plotableAreaSqm > 0 ? permissibleTotalBuiltupSqm / plotableAreaSqm : 0;
  const proposedTotalFsi = plotableAreaSqm > 0 ? proposedTotalBuiltupSqm / plotableAreaSqm : 0;

  // 7. Ancillary Area (60% residential)
  const permissibleAncillaryResSqm = permissibleTotalBuiltupSqm * ancillaryResPct;
  const proposedAncillaryResSqm = proposedTotalBuiltupSqm * ancillaryResPct;

  // 8. Total Permissible P-Line Area (Builtup + Ancillary)
  const permissiblePlineTotalSqm = permissibleTotalBuiltupSqm + permissibleAncillaryResSqm;
  const proposedPlineTotalSqm = proposedTotalBuiltupSqm + proposedAncillaryResSqm;

  // 9. Floor Rows Aggregation
  let totalProposedPlineSqm = 0;
  let totalLobbyAreaSqm = 0;
  let totalBuiltupForOwnersSqm = 0;
  let totalBuiltupForSaleSqm = 0;
  let totalHeightMeters = 0;

  const evaluatedFloors = (floors || []).map((floor, idx) => {
    const pline = parseFloat(floor.pline_area_sqm) || 0;
    const lobby = parseFloat(floor.lobby_area_sqm) || 0;
    const height = parseFloat(floor.height_meters) || 0;
    const sale = parseFloat(floor.builtup_for_sale_sqm) || 0;
    
    // Builtup for Owners = P-Line Area - Lobby Area (Ground floor owners is 0 unless overridden)
    let owners = parseFloat(floor.builtup_for_owners_sqm);
    if (isNaN(owners) || floor.builtup_for_owners_sqm === null || floor.builtup_for_owners_sqm === undefined) {
      owners = idx === 0 ? 0 : Math.max(0, pline - lobby);
    }

    totalProposedPlineSqm += pline;
    totalLobbyAreaSqm += lobby;
    totalBuiltupForOwnersSqm += owners;
    totalBuiltupForSaleSqm += sale;
    totalHeightMeters += height;

    return {
      ...floor,
      pline_area_sqm: pline,
      lobby_area_sqm: lobby,
      height_meters: height,
      builtup_for_owners_sqm: owners,
      builtup_for_sale_sqm: sale,
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
    plotableAreaSqm,
    plotableAreaSqft: plotableAreaSqm * SQM_TO_SQFT,
    permissibleFsiSqm,
    proposedBasicFsiSqm,
    permissiblePaidFsiSqm,
    proposedPaidFsiSqm,
    permissibleTdrSqm,
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
  // Standard statutory calculation rules
  const statutoryMap = {
    PLAN_REGISTRATION: effectivePlineSqm * 5.90,
    SECURITY_DEPOSIT: estimatedCostA > 0 ? Math.min(0.01 * estimatedCostA, 75000.00) : 0,
    STACKING_CHARGES: estimatedCostA > 0 ? Math.min(0.005 * estimatedCostA, 50000.00) : 0,
    ANCILLARY_CHARGES: rrRate > 0 ? effectiveAncillarySqm * (0.10 * rrRate) : 0,
    SEWER_CONNECTION: effectivePlineSqm * 2.50,
    DEVELOPMENT_CHARGES: rrRate > 0 ? effectivePlineSqm * (0.02 * rrRate) : 0,
    PREMIUM_FSI: rrRate > 0 ? effectivePaidFsiSqm * (0.40 * rrRate) : 0,
    TREE_PLANTATION: effectivePlineSqm > 0 ? Math.min((effectivePlineSqm / 74.32) * 500.00, 25000.00) : 0,
    HERITAGE_FUND: rrRate > 0 ? 0.02 * (effectivePlineSqm * 0.02 * rrRate) : 0,
    LABOUR_WELFARE_CESS: estimatedCostB > 0 ? 0.01 * estimatedCostB : 0,
    TDR_LOADING_CHARGES: rrRate > 0 ? effectiveTdrSqm * (0.03 * rrRate) : 0,
    AMALGAMATION: plotAreaSqm > 0 ? plotAreaSqm * 200.00 : 0,
    LABOUR_WELFARE_PARKING: estimatedCostBRate > 0 ? (225 * estimatedCostBRate * 0.01) : 0
  };

  let totalStatutoryDemandA = 0;
  const evaluatedStatutoryCharges = (statutoryItems && statutoryItems.length > 0)
    ? statutoryItems.map((item, idx) => {
        let amount = parseFloat(item.amount);
        if (isNaN(amount) || item.amount === null || !item.is_custom) {
          amount = statutoryMap[item.charge_code] !== undefined ? statutoryMap[item.charge_code] : (parseFloat(item.amount) || 0);
        }
        totalStatutoryDemandA += amount;
        return {
          ...item,
          calculated_amount: Math.round(amount * 100) / 100
        };
      })
    : [
        { charge_code: 'PLAN_REGISTRATION', charge_name: 'PLAN REGISTRATION FEES', amount: statutoryMap.PLAN_REGISTRATION },
        { charge_code: 'SECURITY_DEPOSIT', charge_name: 'SECURITY DEPOSIT (MAX RS 75,000.00)', amount: statutoryMap.SECURITY_DEPOSIT },
        { charge_code: 'STACKING_CHARGES', charge_name: 'STACKING CHARGES (MAX RS 50,000.00)', amount: statutoryMap.STACKING_CHARGES },
        { charge_code: 'ANCILLARY_CHARGES', charge_name: 'ANCILLARY AREA (10% OF RR)', amount: statutoryMap.ANCILLARY_CHARGES },
        { charge_code: 'SEWER_CONNECTION', charge_name: 'SEWER CONNECTION CHARGES', amount: statutoryMap.SEWER_CONNECTION },
        { charge_code: 'DEVELOPMENT_CHARGES', charge_name: 'DEVELOPMENT CHARGES (2% OF RR)', amount: statutoryMap.DEVELOPMENT_CHARGES },
        { charge_code: 'PREMIUM_FSI', charge_name: 'PREMIUM FSI CHARGES (40% OF RR)', amount: statutoryMap.PREMIUM_FSI },
        { charge_code: 'TREE_PLANTATION', charge_name: 'TREE PLANTATION (RS 500 / 74.32 SQM)', amount: statutoryMap.TREE_PLANTATION },
        { charge_code: 'HERITAGE_FUND', charge_name: 'HERITAGE FUND (2% OF DEV CHARGES)', amount: statutoryMap.HERITAGE_FUND },
        { charge_code: 'LABOUR_WELFARE_CESS', charge_name: 'LABOUR WELFARE CESS (1% OF RR CONST)', amount: statutoryMap.LABOUR_WELFARE_CESS },
        { charge_code: 'TDR_LOADING_CHARGES', charge_name: 'TDR LOADING CHARGES (3% OF RR)', amount: statutoryMap.TDR_LOADING_CHARGES },
        { charge_code: 'AMALGAMATION', charge_name: 'AMALGAMATION CHARGES (RS 200/SQM)', amount: statutoryMap.AMALGAMATION },
        { charge_code: 'LABOUR_WELFARE_PARKING', charge_name: 'LABOUR WELFARE ON PARKING AREA', amount: statutoryMap.LABOUR_WELFARE_PARKING },
      ].map((it, idx) => {
        totalStatutoryDemandA += it.amount;
        return { id: `default-${idx}`, ...it, calculated_amount: Math.round(it.amount * 100) / 100 };
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
  // Plot cost: can be explicit amount or calculated from rate
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

    // Notes on formula integrity
    formulaNotes: [
      'Cost of Basement Construction modeled explicitly (area * rate) resolving Excel #REF! error',
      'Total Receipts aggregates all salable unit rows dynamically resolving single-row Excel sum anomaly',
      'Ready Reckoner rate, Dividing Factor (1.6), and Super Built-up loading (+300 sq ft) configurable per project'
    ]
  };
}

module.exports = {
  SQM_TO_SQFT,
  calculateAreaMetrics,
  calculateFinancialMetrics
};

// client/src/utils/feasibilityCalculations.js
// Authoritative calculation engine for Project Area Statement & Financial Viability (Client ESM Mirror)
// Faithfully reproduces verified engineering & statutory formulas from server/services/feasibilityEngine.js

export const SQM_TO_SQFT = 10.764;

export const REGULATORY_PROFILES = {
  'UDCPR_2020_NMC_STANDARD': {
    version: '2020.1',
    authority: 'NMC',
    jurisdiction: 'Nagpur',
    basicFsi: 1.10,
    paidFsiMax: 0.50,
    tdrTiers: {
      9: { regular: 0.20, slum: 0.20, gunthewari: 0.20 },
      12: { regular: 0.325, slum: 0.325, gunthewari: 0.325 },
      15: { regular: 0.40, slum: 0.40, gunthewari: 0.40 },
      18: { regular: 0.45, slum: 0.45, gunthewari: 0.45 },
      24: { regular: 0.55, slum: 0.55, gunthewari: 0.50 }
    },
    ancillaryPct: {
      residential: 0.60,
      commercial: 0.80
    },
    parkingMultiplier: 0.90
  },
  'DS16_LEGACY_CONFIG': {
    version: '2025.1',
    authority: 'NMC',
    jurisdiction: 'Nagpur',
    basicFsi: 1.10,
    paidFsiMax: 0.50,
    tdrTiers: {
      9: { regular: 0.40, slum: 0.20, gunthewari: 0.20 },
      12: { regular: 0.65, slum: 0.325, gunthewari: 0.325 },
      15: { regular: 0.80, slum: 0.40, gunthewari: 0.40 },
      18: { regular: 0.90, slum: 0.45, gunthewari: 0.45 },
      24: { regular: 1.10, slum: 0.50, gunthewari: 0.50 }
    },
    ancillaryPct: {
      residential: 0.60,
      commercial: 0.80
    },
    parkingMultiplier: 0.90
  }
};

export const ROAD_WIDTH_TOTAL_TDR_MAP = {
  9: 0.40,
  12: 0.65,
  15: 0.80,
  18: 0.90,
  24: 1.10
};

export const ROAD_WIDTH_TDR_MAP = {
  9: { regular: 0.20, slum: 0.20, gunthewari: 0.20 },
  12: { regular: 0.325, slum: 0.325, gunthewari: 0.325 },
  15: { regular: 0.40, slum: 0.40, gunthewari: 0.40 },
  18: { regular: 0.45, slum: 0.45, gunthewari: 0.45 },
  24: { regular: 0.55, slum: 0.55, gunthewari: 0.50 }
};

export function deriveTdrSplit(totalTdrFactor, requestedRegularTdr = null) {
  const total = Math.max(0, Math.round((parseFloat(totalTdrFactor) || 0) * 1000) / 1000);
  const defaultRegular = Math.round((total / 2) * 1000) / 1000;
  const defaultSlum = Math.round((total - defaultRegular) * 1000) / 1000;

  if (requestedRegularTdr !== null && requestedRegularTdr !== undefined && requestedRegularTdr !== '') {
    const rawReq = parseFloat(requestedRegularTdr);
    if (isNaN(rawReq)) {
      return {
        totalTdrFactor: total,
        regularTdrFactor: defaultRegular,
        slumTdrFactor: defaultSlum,
        defaultRegularTdrFactor: defaultRegular,
        defaultSlumTdrFactor: defaultSlum,
        isRegularTdrOverridden: false,
        isSplitValid: false,
        validationError: 'Regular TDR factor must be a valid number'
      };
    }
    const roundedReq = Math.round(rawReq * 1000) / 1000;
    if (roundedReq < 0) {
      return {
        totalTdrFactor: total,
        regularTdrFactor: defaultRegular,
        slumTdrFactor: defaultSlum,
        defaultRegularTdrFactor: defaultRegular,
        defaultSlumTdrFactor: defaultSlum,
        isRegularTdrOverridden: false,
        isSplitValid: false,
        validationError: `Regular TDR factor (${roundedReq}) cannot be negative`
      };
    }
    if (roundedReq > total) {
      return {
        totalTdrFactor: total,
        regularTdrFactor: defaultRegular,
        slumTdrFactor: defaultSlum,
        defaultRegularTdrFactor: defaultRegular,
        defaultSlumTdrFactor: defaultSlum,
        isRegularTdrOverridden: false,
        isSplitValid: false,
        validationError: `Regular TDR factor (${roundedReq}) cannot exceed Total TDR factor (${total})`
      };
    }
    const derivedSlum = Math.round((total - roundedReq) * 1000) / 1000;
    const isOverridden = Math.abs(roundedReq - defaultRegular) > 0.0001;
    return {
      totalTdrFactor: total,
      regularTdrFactor: roundedReq,
      slumTdrFactor: derivedSlum,
      defaultRegularTdrFactor: defaultRegular,
      defaultSlumTdrFactor: defaultSlum,
      isRegularTdrOverridden: isOverridden,
      isSplitValid: true,
      validationError: null
    };
  }

  return {
    totalTdrFactor: total,
    regularTdrFactor: defaultRegular,
    slumTdrFactor: defaultSlum,
    defaultRegularTdrFactor: defaultRegular,
    defaultSlumTdrFactor: defaultSlum,
    isRegularTdrOverridden: false,
    isSplitValid: true,
    validationError: null
  };
}

export function parseNum(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultVal : parsed;
}

export function distributePlineEqually(targetTotalPline, floors = []) {
  const targetPline = Math.max(0, parseFloat(targetTotalPline) || 0);
  const assignedMap = new Map();

  if (!floors || floors.length === 0) {
    return { assignedMap, isPlineInconsistent: false, plineInconsistencyMessage: null };
  }

  const isFloorOverridden = (f) => {
    if (f.is_pline_overridden === true) return true;
    if (f.is_pline_overridden === false) return false;
    return !f.floor_key && parseFloat(f.pline_area_sqm) > 0;
  };

  const overriddenFloors = floors.filter(isFloorOverridden);
  const unoverriddenFloors = floors.filter(f => !isFloorOverridden(f));

  let sumOverriddenPline = 0;
  for (const f of overriddenFloors) {
    const plineVal = parseFloat(f.pline_area_sqm) || 0;
    sumOverriddenPline += plineVal;
    assignedMap.set(f.id || f.floor_key || f.floor_name, {
      pline: plineVal,
      is_overridden: true
    });
  }

  sumOverriddenPline = Math.round(sumOverriddenPline * 100) / 100;
  const isPlineInconsistent = (sumOverriddenPline > targetPline) && (targetPline > 0);
  const plineInconsistencyMessage = isPlineInconsistent
    ? `Total overridden floor P-Line (${sumOverriddenPline.toFixed(2)} sq m) exceeds project proposed P-Line (${targetPline.toFixed(2)} sq m)`
    : null;

  const remainingPline = Math.max(0, targetPline - sumOverriddenPline);
  const N = unoverriddenFloors.length;

  if (N > 0) {
    const remainingCents = Math.round(remainingPline * 100);
    const baseCents = Math.floor(remainingCents / N);
    let remainderCents = remainingCents - (baseCents * N);

    for (let i = 0; i < N; i++) {
      const floor = unoverriddenFloors[i];
      let cents = baseCents;
      if (remainderCents > 0) {
        cents += 1;
        remainderCents -= 1;
      } else if (remainderCents < 0) {
        cents -= 1;
        remainderCents += 1;
      }

      const floorPline = cents / 100;
      assignedMap.set(floor.id || floor.floor_key || floor.floor_name || i, {
        pline: floorPline,
        is_overridden: false
      });
    }
  }

  return { assignedMap, isPlineInconsistent, plineInconsistencyMessage };
}

export function distributeFsiAndAncillary(targetTotalFsi, applicableFloors = [], options = {}) {
  const targetFsi = Math.max(0, parseFloat(targetTotalFsi) || 0);
  const assignedMap = new Map();

  const resAncillaryPct = options.resAncillaryPct !== undefined ? options.resAncillaryPct : 0.60;
  const commAncillaryPct = options.commAncillaryPct !== undefined ? options.commAncillaryPct : 0.80;

  if (!applicableFloors || applicableFloors.length === 0) {
    return { assignedMap, isPlineInconsistent: false, plineInconsistencyMessage: null };
  }

  const isFloorOverridden = (f) => {
    if (f.is_pline_overridden === true) return true;
    if (f.is_pline_overridden === false) return false;
    return !f.floor_key && parseFloat(f.pline_area_sqm) > 0;
  };

  const getMultiplier = (f) => {
    const u = (f.usage_type || options.defaultUsage || 'Residential').toLowerCase();
    if (u.includes('comm')) return 1 + commAncillaryPct;
    return 1 + resAncillaryPct;
  };

  const getAncillaryPct = (f) => {
    const u = (f.usage_type || options.defaultUsage || 'Residential').toLowerCase();
    if (u.includes('comm')) return commAncillaryPct;
    return resAncillaryPct;
  };

  const overriddenFloors = applicableFloors.filter(isFloorOverridden);
  const unoverriddenFloors = applicableFloors.filter(f => !isFloorOverridden(f));

  let sumOverriddenFsi = 0;
  let sumOverriddenPline = 0;

  for (const f of overriddenFloors) {
    const plineVal = parseFloat(f.pline_area_sqm) || 0;
    const mult = getMultiplier(f);
    const pct = getAncillaryPct(f);
    
    const floorFsi = mult > 0 ? (plineVal / mult) : 0;
    const floorAncillary = plineVal - floorFsi;

    sumOverriddenFsi += floorFsi;
    sumOverriddenPline += plineVal;

    assignedMap.set(f.id || f.floor_key || f.floor_name, {
      fsi: Math.round(floorFsi * 10000) / 10000,
      ancillary: Math.round(floorAncillary * 100) / 100,
      pline: plineVal,
      is_overridden: true,
      ancillary_pct: pct
    });
  }

  sumOverriddenFsi = Math.round(sumOverriddenFsi * 100) / 100;
  const isPlineInconsistent = (sumOverriddenFsi > targetFsi) && (targetFsi > 0);
  const plineInconsistencyMessage = isPlineInconsistent
    ? `Total overridden floor FSI (${sumOverriddenFsi.toFixed(2)} sq m) exceeds project proposed FSI (${targetFsi.toFixed(2)} sq m)`
    : null;

  const remainingFsi = Math.max(0, targetFsi - sumOverriddenFsi);
  const N = unoverriddenFloors.length;

  if (N > 0) {
    const remainingCents = Math.round(remainingFsi * 100);
    const baseCents = Math.floor(remainingCents / N);
    let remainderCents = remainingCents - (baseCents * N);

    for (let i = 0; i < N; i++) {
      const floor = unoverriddenFloors[i];
      let cents = baseCents;
      if (remainderCents > 0) {
        cents += 1;
        remainderCents -= 1;
      } else if (remainderCents < 0) {
        cents -= 1;
        remainderCents += 1;
      }

      const floorFsi = cents / 100;
      const pct = getAncillaryPct(floor);
      const floorAncillary = Math.round(floorFsi * pct * 100) / 100;
      const floorPline = Math.round((floorFsi + floorAncillary) * 100) / 100;

      assignedMap.set(floor.id || floor.floor_key || floor.floor_name || i, {
        fsi: floorFsi,
        ancillary: floorAncillary,
        pline: floorPline,
        is_overridden: false,
        ancillary_pct: pct
      });
    }
  }

  return { assignedMap, isPlineInconsistent, plineInconsistencyMessage };
}

export function calculateParkingRequirements(parkingConfig = {}, areaMetrics = {}, evaluatedFloors = []) {
  let cfg = parkingConfig;
  if (typeof cfg === 'string') {
    try {
      cfg = JSON.parse(cfg || '{}');
    } catch (e) {
      cfg = {};
    }
  }
  cfg = cfg || {};

  let commCarpetSqm = parseFloat(cfg.commercial_carpet_sqm);
  if (isNaN(commCarpetSqm) || commCarpetSqm < 0) {
    commCarpetSqm = (evaluatedFloors || []).reduce((acc, f) => {
      const u = (f.usage_type || '').toLowerCase();
      if (u.includes('comm')) {
        return acc + (parseFloat(f.builtup_for_sale_sqm) || parseFloat(f.pline_area_sqm) || 0);
      }
      return acc;
    }, 0);
  }

  let resTenements40_80 = parseInt(cfg.residential_tenements_40_80, 10);
  let resTenementsUnder40 = parseInt(cfg.residential_tenements_under_40, 10) || 0;
  let resTenementsOver80 = parseInt(cfg.residential_tenements_over_80, 10) || 0;

  if (isNaN(resTenements40_80) || resTenements40_80 < 0) {
    const totalUnits = (evaluatedFloors || []).reduce((acc, f) => {
      const u = (f.usage_type || '').toLowerCase();
      if (!u.includes('comm') && f.floor_type !== 'parking' && f.floor_type !== 'terrace') {
        return acc + (parseInt(f.no_of_units, 10) || 0);
      }
      return acc;
    }, 0);
    resTenements40_80 = totalUnits;
  }

  const visitorPct = parseFloat(cfg.visitor_parking_pct) !== undefined && !isNaN(parseFloat(cfg.visitor_parking_pct))
    ? parseFloat(cfg.visitor_parking_pct)
    : 0.05;
  const authorityMultiplier = parseFloat(cfg.authority_multiplier) !== undefined && !isNaN(parseFloat(cfg.authority_multiplier))
    ? parseFloat(cfg.authority_multiplier)
    : 0.90;

  const proposedCars = parseInt(cfg.proposed_cars, 10) || 0;
  const proposedTwoWheelers = parseInt(cfg.proposed_two_wheelers, 10) || 0;

  const commCars = (commCarpetSqm / 100) * 2;
  const commTwoWheelers = (commCarpetSqm / 100) * 6;

  const resCars = (resTenementsUnder40 * 0) + (resTenements40_80 / 2) + (resTenementsOver80 * 1);
  const resTwoWheelers = (resTenementsUnder40 * 1) + (resTenements40_80 * 1) + (resTenementsOver80 * 2);

  const baseCars = commCars + resCars;
  const baseTwoWheelers = commTwoWheelers + resTwoWheelers;

  const visitorCars = baseCars * visitorPct;
  const visitorTwoWheelers = baseTwoWheelers * visitorPct;

  const totalGrossCars = baseCars + visitorCars;
  const totalGrossTwoWheelers = baseTwoWheelers + visitorTwoWheelers;

  const requiredCars = Math.ceil(totalGrossCars * authorityMultiplier);
  const requiredTwoWheelers = Math.ceil(totalGrossTwoWheelers * authorityMultiplier);

  const surplusDeficitCars = proposedCars - requiredCars;
  const surplusDeficitTwoWheelers = proposedTwoWheelers - requiredTwoWheelers;

  return {
    commercialCarpetSqm: Math.round(commCarpetSqm * 1000) / 1000,
    commercialCars: Math.round(commCars * 1000) / 1000,
    commercialTwoWheelers: Math.round(commTwoWheelers * 1000) / 1000,

    residentialTenements40_80: resTenements40_80,
    residentialTenementsUnder40: resTenementsUnder40,
    residentialTenementsOver80: resTenementsOver80,
    totalResidentialTenements: resTenementsUnder40 + resTenements40_80 + resTenementsOver80,
    residentialCars: Math.round(resCars * 1000) / 1000,
    residentialTwoWheelers: Math.round(resTwoWheelers * 1000) / 1000,

    visitorParkingPct: visitorPct * 100,
    visitorCars: Math.round(visitorCars * 1000) / 1000,
    visitorTwoWheelers: Math.round(visitorTwoWheelers * 1000) / 1000,

    authorityMultiplier,
    totalGrossCars: Math.round(totalGrossCars * 1000) / 1000,
    totalGrossTwoWheelers: Math.round(totalGrossTwoWheelers * 1000) / 1000,

    requiredCars,
    requiredTwoWheelers,
    proposedCars,
    proposedTwoWheelers,
    surplusDeficitCars,
    surplusDeficitTwoWheelers,
    isCarRequirementMet: proposedCars >= requiredCars,
    isTwoWheelerRequirementMet: proposedTwoWheelers >= requiredTwoWheelers
  };
}

export function calculateAreaMetrics(statement = {}, floors = []) {
  const plotArea = parseFloat(statement.plot_area_sqm) || 0;
  const dpDeductions = parseFloat(statement.dp_deductions_sqm) || 0;
  const existingBuiltup = parseFloat(statement.existing_builtup_area_sqm) || 0;

  const basicFsiFactor = statement.basic_fsi_factor !== undefined && !isNaN(parseFloat(statement.basic_fsi_factor))
    ? parseFloat(statement.basic_fsi_factor)
    : 1.1;
  const paidFsiFactor = statement.paid_fsi_factor !== undefined && !isNaN(parseFloat(statement.paid_fsi_factor))
    ? parseFloat(statement.paid_fsi_factor)
    : 0.5;

  // Total TDR & 50/50 Regular/Slum Split with Override Support (Section 4 of Master Rebuild)
  const isGunthewari = Boolean(statement.is_gunthewari);
  const roadWidth = parseFloat(statement.road_width_m);

  let baseTotalTdrFactor = 0;
  if (statement.total_tdr_factor !== undefined && statement.total_tdr_factor !== null && !isNaN(parseFloat(statement.total_tdr_factor))) {
    baseTotalTdrFactor = parseFloat(statement.total_tdr_factor);
  } else if (statement.tdr_factor !== undefined && statement.tdr_factor !== null && !isNaN(parseFloat(statement.tdr_factor))) {
    baseTotalTdrFactor = parseFloat(statement.tdr_factor);
  } else if (statement.regular_tdr_factor !== undefined && statement.slum_tdr_factor !== undefined &&
             !isNaN(parseFloat(statement.regular_tdr_factor)) && !isNaN(parseFloat(statement.slum_tdr_factor))) {
    baseTotalTdrFactor = parseFloat(statement.regular_tdr_factor) + parseFloat(statement.slum_tdr_factor);
  } else if (!isNaN(roadWidth) && ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] !== undefined) {
    baseTotalTdrFactor = ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth];
  } else if (!isNaN(roadWidth) && ROAD_WIDTH_TDR_MAP[roadWidth]) {
    baseTotalTdrFactor = ROAD_WIDTH_TDR_MAP[roadWidth].regular;
  } else {
    baseTotalTdrFactor = 0.65;
  }

  // Evaluate requested or existing Regular TDR
  let requestedRegularTdr = null;
  if (statement.regular_tdr_factor !== undefined && statement.regular_tdr_factor !== null && !isNaN(parseFloat(statement.regular_tdr_factor))) {
    requestedRegularTdr = parseFloat(statement.regular_tdr_factor);
  } else if (statement.proposed_tdr_factor !== undefined && !isNaN(parseFloat(statement.proposed_tdr_factor))) {
    requestedRegularTdr = parseFloat(statement.proposed_tdr_factor);
  }

  const tdrSplit = deriveTdrSplit(baseTotalTdrFactor, requestedRegularTdr);
  const totalTdrFactor = tdrSplit.totalTdrFactor;
  const regularTdrFactor = tdrSplit.regularTdrFactor;
  const slumTdrFactor = tdrSplit.slumTdrFactor;
  const isRegularTdrOverridden = tdrSplit.isRegularTdrOverridden;

  const suggestedRoadTdrFactor = ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] || (ROAD_WIDTH_TDR_MAP[roadWidth] ? ROAD_WIDTH_TDR_MAP[roadWidth].regular : 0);
  const permissibleTdrFactor = totalTdrFactor;
  const totalProposedTdrFactor = regularTdrFactor + slumTdrFactor;

  const rawBuildingUse = (statement.building_use || 'Residential').trim();
  const lowerUse = rawBuildingUse.toLowerCase();
  const isMixedUse = lowerUse.includes('mixed');
  const isCommercial = !isMixedUse && lowerUse.includes('comm');
  const isResidential = !isMixedUse && !isCommercial;

  const buildingUse = isMixedUse ? 'Mixed Use' : (isCommercial ? 'Commercial' : 'Residential');

  const resAncillaryPct = statement.ancillary_residential_pct !== undefined && !isNaN(parseFloat(statement.ancillary_residential_pct))
    ? parseFloat(statement.ancillary_residential_pct)
    : 0.60;
  const commAncillaryPct = statement.ancillary_commercial_pct !== undefined && !isNaN(parseFloat(statement.ancillary_commercial_pct))
    ? parseFloat(statement.ancillary_commercial_pct)
    : 0.80;

  const rawDividingFactor = parseNum(statement.dividing_factor, 1.6);
  const dividingFactor = rawDividingFactor > 0 ? rawDividingFactor : 1.6;

  const plotableAreaSqm = Math.max(0, plotArea - dpDeductions);

  const permissibleFsiSqm = plotableAreaSqm * basicFsiFactor;
  const permissiblePaidFsiSqm = plotableAreaSqm * paidFsiFactor;
  const permissibleRegularTdrSqm = plotableAreaSqm * regularTdrFactor;
  const permissibleSlumTdrSqm = plotableAreaSqm * slumTdrFactor;
  const permissibleTdrSqm = plotableAreaSqm * permissibleTdrFactor;
  const permissibleTotalBuiltupSqm = permissibleFsiSqm + permissiblePaidFsiSqm + permissibleTdrSqm;
  const permissibleTotalFsi = plotableAreaSqm > 0 ? permissibleTotalBuiltupSqm / plotableAreaSqm : 0;

  const proposedBasicFsiSqm = permissibleFsiSqm;
  const proposedPaidFsiSqm = permissiblePaidFsiSqm;
  const regularTdrSqm = plotableAreaSqm * regularTdrFactor;
  const slumTdrSqm = plotableAreaSqm * slumTdrFactor;
  const proposedTdrSqm = regularTdrSqm + slumTdrSqm;
  const proposedTotalBuiltupSqm = proposedBasicFsiSqm + proposedPaidFsiSqm + proposedTdrSqm;
  const proposedTotalFsi = plotableAreaSqm > 0 ? proposedTotalBuiltupSqm / plotableAreaSqm : 0;

  const activeFloors = (floors || []).filter(f => f.is_active !== false);

  const getFloorUsage = (f) => {
    const ft = (f.floor_type || '').toLowerCase();
    if (ft === 'parking') return 'Parking';
    if (ft === 'terrace') return 'Terrace';
    if (ft === 'service') return 'Services';

    const fname = (f.floor_name || '').toLowerCase();
    if (fname.includes('basement') || fname.includes('parking')) return 'Parking';
    if (fname.includes('terrace')) return 'Terrace';

    if (isCommercial) return 'Commercial';
    if (isResidential) return 'Residential';

    const u = (f.usage_type || '').toLowerCase();
    if (u.includes('comm') || fname.includes('shop') || fname.includes('office') || fname.includes('commercial')) {
      return 'Commercial';
    }
    return 'Residential';
  };

  const applicableHabitableFloors = activeFloors.filter(f => {
    const u = getFloorUsage(f);
    return u === 'Commercial' || u === 'Residential';
  });

  const N_habitable = applicableHabitableFloors.length;
  let N_comm = 0;
  let N_res = 0;
  applicableHabitableFloors.forEach(f => {
    if (getFloorUsage(f) === 'Commercial') N_comm++;
    else N_res++;
  });

  const commRatio = N_habitable > 0 ? (N_comm / N_habitable) : (isCommercial ? 1 : 0);
  const resRatio = N_habitable > 0 ? (N_res / N_habitable) : (isResidential ? 1 : 0);

  const permissibleCommercialFsiSqm = permissibleTotalBuiltupSqm * commRatio;
  const permissibleResidentialFsiSqm = permissibleTotalBuiltupSqm * resRatio;
  const permissibleCommercialAncillarySqm = permissibleCommercialFsiSqm * commAncillaryPct;
  const permissibleResidentialAncillarySqm = permissibleResidentialFsiSqm * resAncillaryPct;
  const permissibleTotalAncillarySqm = permissibleCommercialAncillarySqm + permissibleResidentialAncillarySqm;
  const permissiblePlineTotalSqm = permissibleTotalBuiltupSqm + permissibleTotalAncillarySqm;

  const isProposedPlineOverridden = Boolean(statement.is_proposed_pline_overridden);
  const totalProposedPlineOverrideSqm = (statement.total_proposed_pline_override_sqm !== null && statement.total_proposed_pline_override_sqm !== undefined)
    ? parseFloat(statement.total_proposed_pline_override_sqm)
    : null;

  const weightedMultiplier = N_habitable > 0
    ? ((N_comm * (1 + commAncillaryPct) + N_res * (1 + resAncillaryPct)) / N_habitable)
    : (isCommercial ? (1 + commAncillaryPct) : (1 + resAncillaryPct));

  const targetProposedFsi = (isProposedPlineOverridden && totalProposedPlineOverrideSqm !== null && !isNaN(totalProposedPlineOverrideSqm) && weightedMultiplier > 0)
    ? (totalProposedPlineOverrideSqm / weightedMultiplier)
    : proposedTotalBuiltupSqm;

  const { assignedMap, isPlineInconsistent, plineInconsistencyMessage } = distributeFsiAndAncillary(
    targetProposedFsi,
    applicableHabitableFloors,
    {
      resAncillaryPct,
      commAncillaryPct,
      defaultUsage: isCommercial ? 'Commercial' : 'Residential'
    }
  );

  let proposedResidentialFsiSqm = 0;
  let proposedCommercialFsiSqm = 0;
  let proposedResidentialAncillarySqm = 0;
  let proposedCommercialAncillarySqm = 0;
  let totalProposedPlineSqm = 0;
  let totalLobbyAreaSqm = 0;
  let totalBuiltupForOwnersSqm = 0;
  let totalBuiltupForSaleSqm = 0;
  let totalHeightMeters = 0;
  let totalUnitsCount = 0;

  const evaluatedFloors = activeFloors.map((floor) => {
    const usage = getFloorUsage(floor);
    const isParking = usage === 'Parking';
    const isTerrace = usage === 'Terrace' || usage === 'Services';
    const isHabitable = !isParking && !isTerrace;

    const key = floor.id || floor.floor_key || floor.floor_name;
    const distributionInfo = assignedMap.get(key);

    let fsi = 0;
    let ancillary = 0;
    let pline = 0;
    let isPlineOverridden = Boolean(floor.is_pline_overridden);
    let ancPct = usage === 'Commercial' ? commAncillaryPct : resAncillaryPct;

    if (distributionInfo) {
      fsi = distributionInfo.fsi;
      ancillary = distributionInfo.ancillary;
      pline = distributionInfo.pline;
      isPlineOverridden = distributionInfo.is_overridden;
      ancPct = distributionInfo.ancillary_pct;
    } else {
      pline = parseFloat(floor.pline_area_sqm) || 0;
      fsi = 0;
      ancillary = 0;
    }

    if (isHabitable) {
      if (usage === 'Commercial') {
        proposedCommercialFsiSqm += fsi;
        proposedCommercialAncillarySqm += ancillary;
      } else {
        proposedResidentialFsiSqm += fsi;
        proposedResidentialAncillarySqm += ancillary;
      }
    }

    const height = parseNum(floor.height_meters, 3.00);

    const isLobbyOverridden = Boolean(floor.is_lobby_overridden);
    let lobby = parseFloat(floor.lobby_area_sqm);
    const calculatedLobby = Math.round(pline * 0.15 * 100) / 100;
    if (!isLobbyOverridden || isNaN(lobby)) {
      lobby = calculatedLobby;
    }

    let sale = 0;
    if (isHabitable) {
      if (floor.builtup_for_sale_sqm !== undefined && floor.builtup_for_sale_sqm !== null && !floor.floor_key) {
        sale = parseFloat(floor.builtup_for_sale_sqm) || 0;
      } else {
        sale = Math.max(0, Math.round((pline - lobby) * 100) / 100);
      }
    }

    let noOfUnits = parseInt(floor.no_of_units, 10);
    if (isNaN(noOfUnits)) noOfUnits = isHabitable ? 1 : 0;
    if (!isHabitable) noOfUnits = 0;

    const areaFor1Unit = noOfUnits > 0 ? Math.round((sale / noOfUnits) * 10000) / 10000 : 0;

    let owners = parseFloat(floor.builtup_for_owners_sqm);
    if (isNaN(owners) || floor.builtup_for_owners_sqm === null || floor.builtup_for_owners_sqm === undefined) {
      owners = isHabitable ? sale : 0;
    }

    totalProposedPlineSqm += pline;
    totalLobbyAreaSqm += lobby;
    totalBuiltupForOwnersSqm += owners;
    totalBuiltupForSaleSqm += sale;
    totalHeightMeters += height;
    totalUnitsCount += noOfUnits;

    const ratePerSqm = parseFloat(floor.rate_per_sqm) || 0;
    const costFor1Unit = areaFor1Unit > 0 && ratePerSqm > 0
      ? Math.round(areaFor1Unit * ratePerSqm * 100) / 100
      : (parseFloat(floor.cost_for_1_unit) || 0);

    return {
      ...floor,
      usage_type: usage,
      height_meters: height,
      fsi_area_sqm: Math.round(fsi * 100) / 100,
      ancillary_area_sqm: Math.round(ancillary * 100) / 100,
      ancillary_pct: ancPct,
      pline_area_sqm: Math.round(pline * 100) / 100,
      calculated_pline_sqm: Math.round(pline * 100) / 100,
      is_pline_overridden: isPlineOverridden,
      lobby_area_sqm: Math.round(lobby * 100) / 100,
      calculated_lobby_sqm: calculatedLobby,
      is_lobby_overridden: isLobbyOverridden,
      builtup_for_owners_sqm: Math.round(owners * 100) / 100,
      builtup_for_sale_sqm: Math.round(sale * 100) / 100,
      no_of_units: noOfUnits,
      area_for_1_unit: areaFor1Unit,
      rate_per_sqm: ratePerSqm,
      cost_for_1_unit: costFor1Unit,
      total_floor_area_sqm: Math.round(pline * 100) / 100,
      pline_area_sqft: pline * SQM_TO_SQFT,
      lobby_area_sqft: lobby * SQM_TO_SQFT,
      builtup_for_owners_sqft: owners * SQM_TO_SQFT,
      builtup_for_sale_sqft: sale * SQM_TO_SQFT
    };
  });

  proposedResidentialFsiSqm = Math.round(proposedResidentialFsiSqm * 100) / 100;
  proposedCommercialFsiSqm = Math.round(proposedCommercialFsiSqm * 100) / 100;
  const proposedTotalFsiSqm = Math.round((proposedResidentialFsiSqm + proposedCommercialFsiSqm) * 100) / 100;

  proposedResidentialAncillarySqm = Math.round(proposedResidentialAncillarySqm * 100) / 100;
  proposedCommercialAncillarySqm = Math.round(proposedCommercialAncillarySqm * 100) / 100;
  const totalProposedAncillarySqm = Math.round((proposedResidentialAncillarySqm + proposedCommercialAncillarySqm) * 100) / 100;

  totalProposedPlineSqm = Math.round(totalProposedPlineSqm * 100) / 100;
  totalLobbyAreaSqm = Math.round(totalLobbyAreaSqm * 100) / 100;
  totalBuiltupForOwnersSqm = Math.round(totalBuiltupForOwnersSqm * 100) / 100;
  totalBuiltupForSaleSqm = Math.round(totalBuiltupForSaleSqm * 100) / 100;
  totalHeightMeters = Math.round(totalHeightMeters * 100) / 100;

  const calculatedProposedPlineSqm = totalProposedPlineSqm;
  const effectiveProposedPlineSqm = (isProposedPlineOverridden && totalProposedPlineOverrideSqm !== null && !isNaN(totalProposedPlineOverrideSqm))
    ? totalProposedPlineOverrideSqm
    : calculatedProposedPlineSqm;

  const proposedAfterExistingSqm = Math.max(0, totalProposedPlineSqm - existingBuiltup);
  const baseDividingFactorSqm = dividingFactor > 0 ? (proposedAfterExistingSqm / dividingFactor) : 0;
  const derivedAncillaryAreaSqm = Math.max(0, totalProposedPlineSqm - baseDividingFactorSqm);
  const basicFsiOfPlotSqm = plotableAreaSqm * basicFsiFactor;
  const tdrOfPlotSqm = plotableAreaSqm * 0.30;
  const paidFsiRequiredSqm = Math.max(0, baseDividingFactorSqm - basicFsiOfPlotSqm - tdrOfPlotSqm);
  const areaBalanceSqm = permissiblePlineTotalSqm - totalProposedPlineSqm;

  const isConfigured = (plotArea > 0) || (activeFloors.length > 0);

  const requiredTdrSqm = Math.max(0, proposedTotalBuiltupSqm - proposedBasicFsiSqm - proposedPaidFsiSqm);

  const sourceUnallocatedResidentialAncillarySqm = Math.round(permissibleTotalBuiltupSqm * resAncillaryPct * 1000) / 1000;
  const sourceUnallocatedCommercialAncillarySqm = Math.round(permissibleTotalBuiltupSqm * commAncillaryPct * 1000) / 1000;
  const sourceUnallocatedPermissiblePlineSqm = Math.round((permissibleTotalBuiltupSqm + sourceUnallocatedResidentialAncillarySqm + sourceUnallocatedCommercialAncillarySqm) * 1000) / 1000;
  const floorSumPlineSqm = Math.round(totalProposedPlineSqm * 1000) / 1000;
  const sourceProposedPlineDifferenceSqm = Math.round((effectiveProposedPlineSqm - totalProposedPlineSqm) * 1000) / 1000;

  const parkingRequirements = calculateParkingRequirements(statement.parking_config, { totalProposedPlineSqm }, evaluatedFloors);

  return {
    isConfigured,
    buildingUse,
    isResidential,
    isCommercial,
    isMixedUse,
    resAncillaryPct,
    commAncillaryPct,
    ancillaryPct: isCommercial ? commAncillaryPct : resAncillaryPct,
    isGunthewari,
    roadWidth,
    suggestedRoadTdrFactor,
    totalTdrFactor,
    regularTdrFactor,
    slumTdrFactor,
    defaultRegularTdrFactor: tdrSplit.defaultRegularTdrFactor,
    defaultSlumTdrFactor: tdrSplit.defaultSlumTdrFactor,
    isRegularTdrOverridden,
    totalProposedTdrFactor,

    plotableAreaSqm,
    plotableAreaSqft: plotableAreaSqm * SQM_TO_SQFT,

    permissibleFsiSqm,
    permissiblePaidFsiSqm,
    permissibleRegularTdrSqm,
    permissibleSlumTdrSqm,
    permissibleTdrSqm,
    permissibleTotalBuiltupSqm,
    permissibleTotalFsi,
    permissibleCommercialFsiSqm,
    permissibleResidentialFsiSqm,
    permissibleCommercialAncillarySqm,
    permissibleResidentialAncillarySqm,
    permissibleTotalAncillarySqm,
    permissiblePlineTotalSqm,

    permissibleAncillaryResSqm: permissibleTotalAncillarySqm,
    proposedAncillaryResSqm: (proposedTotalBuiltupSqm * (isCommercial ? commAncillaryPct : resAncillaryPct)),
    proposedPlineTotalSqm: (proposedTotalBuiltupSqm + (proposedTotalBuiltupSqm * (isCommercial ? commAncillaryPct : resAncillaryPct))),

    proposedBasicFsiSqm,
    proposedPaidFsiSqm,
    regularTdrSqm,
    slumTdrSqm,
    proposedRegularTdrSqm: regularTdrSqm,
    proposedSlumTdrSqm: slumTdrSqm,
    proposedTdrSqm,
    requiredTdrSqm,
    proposedTotalBuiltupSqm,
    proposedTotalFsi,
    proposedResidentialFsiSqm,
    proposedCommercialFsiSqm,
    proposedTotalFsiSqm,
    proposedResidentialAncillarySqm,
    proposedCommercialAncillarySqm,
    totalProposedAncillarySqm,

    sourceUnallocatedResidentialAncillarySqm,
    sourceUnallocatedCommercialAncillarySqm,
    sourceUnallocatedPermissiblePlineSqm,
    floorSumPlineSqm,
    sourceProposedPlineDifferenceSqm,
    parkingRequirements,

    calculatedProposedPlineSqm,
    totalProposedPlineOverrideSqm,
    isProposedPlineOverridden,
    effectiveProposedPlineSqm,
    applicableHabitableFloorsCount: applicableHabitableFloors.length,
    isPlineInconsistent,
    plineInconsistencyMessage,

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

export function calculateFinancialMetrics(financial = {}, statutoryItems = [], salableUnits = [], areaMetrics = {}) {
  const rrRate = parseFloat(financial.rr_rate_per_sqm) || 0.00;
  const estimatedCostARate = parseFloat(financial.estimated_cost_a_rate) || 0.00;
  const estimatedCostBRate = parseFloat(financial.estimated_cost_b_rate) || 0.00;

  const effectivePlineSqm = areaMetrics.totalProposedPlineSqm > 0 
    ? areaMetrics.totalProposedPlineSqm 
    : (areaMetrics.effectiveProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0);
  const effectiveAncillarySqm = areaMetrics.totalProposedAncillarySqm !== undefined 
    ? areaMetrics.totalProposedAncillarySqm 
    : (areaMetrics.proposedAncillaryResSqm || 0);
  const effectivePaidFsiSqm = areaMetrics.proposedPaidFsiSqm || 0;
  const effectiveTdrSqm = areaMetrics.proposedTdrSqm || areaMetrics.totalProposedTdrSqm || 0;
  const plotAreaSqm = areaMetrics.plotableAreaSqm || 0;

  const estimatedCostA = effectivePlineSqm * estimatedCostARate;
  const estimatedCostB = effectivePlineSqm * estimatedCostBRate;

  let overrides = financial.overrides || {};
  if (typeof overrides === 'string') {
    try { overrides = JSON.parse(overrides); } catch (e) { overrides = {}; }
  }

  const defaultRrPercentages = {
    ANCILLARY_CHARGES: 10.0,
    DEVELOPMENT_CHARGES: 2.0,
    PREMIUM_FSI: 40.0,
    TDR_LOADING_CHARGES: 3.0
  };

  const getStatutoryAmount = (chargeCode, item) => {
    if (item.is_custom && item.amount !== null && !isNaN(parseFloat(item.amount))) {
      return parseFloat(item.amount);
    }

    const configuredRrPct = (item.rr_percentage !== null && item.rr_percentage !== undefined && !isNaN(parseFloat(item.rr_percentage)))
      ? parseFloat(item.rr_percentage)
      : (defaultRrPercentages[chargeCode] || null);

    switch (chargeCode) {
      case 'PLAN_REGISTRATION':
        return effectivePlineSqm * 5.90;
      case 'SECURITY_DEPOSIT':
        return Math.min(estimatedCostA * 0.01, 75000.00);
      case 'STACKING_CHARGES':
        return Math.min(estimatedCostA * 0.005, 50000.00);
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
        const devChargeItem = Array.isArray(statutoryItems) ? statutoryItems.find(it => it.charge_code === 'DEVELOPMENT_CHARGES') : null;
        if (devChargeItem && devChargeItem.is_enabled === false) {
          return 0;
        }
        const devOverride = overrides && overrides['statutory_DEVELOPMENT_CHARGES'];
        let devChargeAmount = 0;
        if (devOverride && devOverride.override_val !== undefined && devOverride.override_val !== null) {
          devChargeAmount = parseFloat(devOverride.override_val) || 0;
        } else if (devChargeItem) {
          const devRrPct = devChargeItem.rr_percentage !== null && devChargeItem.rr_percentage !== undefined ? parseFloat(devChargeItem.rr_percentage) : 2.0;
          devChargeAmount = (rrRate > 0) ? (effectivePlineSqm * ((devRrPct / 100) * rrRate)) : 0;
        } else {
          devChargeAmount = (rrRate > 0) ? (effectivePlineSqm * 0.02 * rrRate) : 0;
        }
        return Math.round(0.02 * devChargeAmount * 100) / 100;
      }
      case 'LABOUR_WELFARE_CESS':
        return estimatedCostB > 0 ? 0.01 * estimatedCostB : 0;
      case 'TDR_LOADING_CHARGES':
        return (rrRate > 0 && configuredRrPct !== null) ? effectiveTdrSqm * ((configuredRrPct / 100) * rrRate) : 0;
      case 'AMALGAMATION':
        return 0;
      case 'LABOUR_WELFARE_PARKING':
        return item && item.amount !== null && item.amount !== undefined && !isNaN(parseFloat(item.amount))
          ? parseFloat(item.amount)
          : 0;
      default:
        return parseFloat(item.amount) || 0;
    }
  };

  let totalStatutoryDemandA = 0;
  const evaluatedStatutoryCharges = (statutoryItems && statutoryItems.length > 0)
    ? statutoryItems
        .filter(item => !item.is_deleted)
        .map((item) => {
          const isEnabled = item.is_enabled !== false;

          if (item.charge_code === 'LABOUR_WELFARE_PARKING') {
            const overrideKey = `statutory_${item.charge_code}`;
            const itemOverride = overrides[overrideKey];
            const hasOverride = Boolean(itemOverride && itemOverride.override_val !== undefined && itemOverride.override_val !== null);
            const overrideVal = hasOverride ? parseFloat(itemOverride.override_val) : null;

            const manualAmt = hasOverride
              ? overrideVal
              : ((item.amount !== null && item.amount !== undefined && !isNaN(parseFloat(item.amount)))
                  ? Math.round(parseFloat(item.amount) * 100) / 100
                  : 0);
            const effectiveAmount = isEnabled ? manualAmt : 0;
            if (isEnabled) {
              totalStatutoryDemandA += effectiveAmount;
            }
            return {
              ...item,
              is_enabled: isEnabled,
              is_manual: true,
              calculated_amount: null,
              effective_amount: effectiveAmount,
              amount: manualAmt,
              has_override: hasOverride,
              override_val: overrideVal,
              has_basis_drift: false,
              calculated_basis_val: null
            };
          }

          const calculatedAmount = getStatutoryAmount(item.charge_code, item);
          
          const overrideKey = `statutory_${item.charge_code}`;
          const itemOverride = overrides[overrideKey];
          const hasOverride = Boolean(itemOverride && itemOverride.override_val !== undefined && itemOverride.override_val !== null);
          const overrideVal = hasOverride ? parseFloat(itemOverride.override_val) : null;
          const rawBasis = itemOverride ? (itemOverride.calculated_basis_val ?? itemOverride.basis_val) : null;
          const basisVal = hasOverride && rawBasis !== null && rawBasis !== undefined && !isNaN(parseFloat(rawBasis))
            ? parseFloat(rawBasis)
            : null;
          const hasBasisDrift = hasOverride && basisVal !== null && Math.abs(calculatedAmount - basisVal) > 1.0;

          const effectiveAmount = isEnabled 
            ? (hasOverride ? overrideVal : Math.round(calculatedAmount * 100) / 100)
            : 0;
          
          if (isEnabled) {
            totalStatutoryDemandA += effectiveAmount;
          }

          return {
            ...item,
            is_enabled: isEnabled,
            is_manual: false,
            calculated_amount: Math.round(calculatedAmount * 100) / 100,
            effective_amount: effectiveAmount,
            has_override: hasOverride,
            override_val: overrideVal,
            has_basis_drift: hasBasisDrift,
            calculated_basis_val: basisVal
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
        const overrideKey = `statutory_${it.charge_code}`;
        const itemOverride = overrides[overrideKey];
        const hasOverride = Boolean(itemOverride && itemOverride.override_val !== undefined && itemOverride.override_val !== null);
        const overrideVal = hasOverride ? parseFloat(itemOverride.override_val) : null;
        const rawBasis = itemOverride ? (itemOverride.calculated_basis_val ?? itemOverride.basis_val) : null;
        const basisVal = hasOverride && rawBasis !== null && rawBasis !== undefined && !isNaN(parseFloat(rawBasis)) ? parseFloat(rawBasis) : null;

        if (it.charge_code === 'LABOUR_WELFARE_PARKING') {
          const manualAmt = hasOverride ? overrideVal : (parseFloat(it.amount) || 0);
          totalStatutoryDemandA += manualAmt;
          return {
            id: `default-${idx}`,
            ...it,
            is_manual: true,
            calculated_amount: null,
            effective_amount: manualAmt,
            amount: manualAmt,
            has_override: hasOverride,
            override_val: overrideVal,
            has_basis_drift: false,
            calculated_basis_val: null
          };
        }

        const calculatedAmount = getStatutoryAmount(it.charge_code, it);
        const hasBasisDrift = hasOverride && basisVal !== null && Math.abs(calculatedAmount - basisVal) > 1.0;
        const effectiveAmount = hasOverride ? overrideVal : Math.round(calculatedAmount * 100) / 100;
        totalStatutoryDemandA += effectiveAmount;

        return {
          id: `default-${idx}`,
          ...it,
          is_manual: false,
          calculated_amount: Math.round(calculatedAmount * 100) / 100,
          effective_amount: effectiveAmount,
          has_override: hasOverride,
          override_val: overrideVal,
          has_basis_drift: hasBasisDrift,
          calculated_basis_val: basisVal
        };
      });

  const resolveCostItem = (key, calculatedVal) => {
    const roundedCalc = Math.round(calculatedVal * 100) / 100;
    const itemOverride = overrides[key];
    const hasOverride = Boolean(itemOverride && itemOverride.override_val !== undefined && itemOverride.override_val !== null);
    const overrideVal = hasOverride ? parseFloat(itemOverride.override_val) : null;
    const rawBasis = itemOverride ? (itemOverride.calculated_basis_val ?? itemOverride.basis_val) : null;
    const basisVal = hasOverride && rawBasis !== null && rawBasis !== undefined && !isNaN(parseFloat(rawBasis))
      ? parseFloat(rawBasis)
      : null;
    const hasBasisDrift = hasOverride && basisVal !== null && Math.abs(roundedCalc - basisVal) > 1.0;

    return {
      calculated: roundedCalc,
      effective: hasOverride ? overrideVal : roundedCalc,
      has_override: hasOverride,
      override_val: overrideVal,
      has_basis_drift: hasBasisDrift,
      calculated_basis_val: basisVal
    };
  };

  const calcTdrCost = rrRate > 0 ? effectiveTdrSqm * (0.55 * rrRate) : 0;
  const costOfTdrB = resolveCostItem('cost_of_tdr', calcTdrCost);

  const minorExpenses = parseFloat(financial.minor_expenses) || 0.00;
  const bpmsCharges = parseFloat(financial.bpms_staff_charges) || 0.00;
  const airportNoc = parseFloat(financial.airport_noc) || 0.00;
  const fireNoc = parseFloat(financial.fire_noc) || 0.00;
  const entertainment = parseFloat(financial.entertainment_charges) || 0.00;
  const extraStampDuty = parseFloat(financial.extra_stamp_duty) || 0.00;
  const advocateFees = parseFloat(financial.advocate_fees) || 0.00;
  const totalExpensesC = minorExpenses + bpmsCharges + airportNoc + fireNoc + entertainment + extraStampDuty + advocateFees;

  const isCostOfPlotIncluded = financial.is_cost_of_plot_included !== false;
  const rawCostOfPlot = parseFloat(financial.cost_of_plot) > 0 ? parseFloat(financial.cost_of_plot) : 0.00;
  const calcCostOfPlot = isCostOfPlotIncluded ? rawCostOfPlot : 0.00;
  const costOfPlotH = resolveCostItem('cost_of_plot', calcCostOfPlot);
  costOfPlotH.is_included = isCostOfPlotIncluded;
  costOfPlotH.raw_amount = costOfPlotH.has_override ? costOfPlotH.override_val : rawCostOfPlot;
  if (!isCostOfPlotIncluded) {
    costOfPlotH.effective = 0.00;
  }

  const constRate = parseFloat(financial.cost_of_construction_rate) || parseFloat(financial.estimated_cost_b_rate) || 0.00;
  const calcConstCost = effectivePlineSqm * constRate;
  const costOfConstructionD = resolveCostItem('cost_of_construction', calcConstCost);

  const basementArea = parseFloat(financial.basement_area_sqm) || 0.00;
  const basementRate = parseFloat(financial.basement_rate_per_sqm) || 0.00;
  const calcBasementCost = parseFloat(financial.cost_of_basement) > 0 ? parseFloat(financial.cost_of_basement) : (basementArea * basementRate);
  const costOfBasementE = resolveCostItem('cost_of_basement', calcBasementCost);

  const rentTenements = parseInt(financial.rent_tenements, 10) || 0;
  const rentPerMonth = parseFloat(financial.rent_per_tenement_per_month) || 0.00;
  const rentMonths = parseInt(financial.rent_months || financial.period_months, 10) || 0;
  const calcRentCost = parseFloat(financial.rent_amount) > 0 ? parseFloat(financial.rent_amount) : (rentTenements * rentPerMonth * rentMonths);
  const rentCostF = resolveCostItem('rent_amount', calcRentCost);

  const parkingSlots = parseInt(financial.stacked_parking_slots, 10) || 0;
  const parkingSlotCost = parseFloat(financial.stacked_parking_cost_per_slot) || 0.00;
  const calcParkingCost = parseFloat(financial.stacked_parking_cost) > 0 ? parseFloat(financial.stacked_parking_cost) : (parkingSlots * parkingSlotCost);
  const stackedParkingCostG = resolveCostItem('stacked_parking_cost', calcParkingCost);

  const costOfInfra = parseFloat(financial.cost_of_infrastructure) || 0.00;
  const interestCost = parseFloat(financial.interest_amount) || 0.00;

  const totalProjectCost = totalStatutoryDemandA + costOfTdrB.effective + totalExpensesC + costOfConstructionD.effective + costOfBasementE.effective + rentCostF.effective + stackedParkingCostG.effective + costOfPlotH.effective + costOfInfra + interestCost;

  let totalReceipts = 0;
  let totalGrossReceipts = 0;
  let totalLandownerReceipts = 0;
  let totalDeveloperUnits = 0;
  let totalLandownerUnits = 0;
  let totalSalableCarpetSqft = 0;
  let totalSalableSuperSqft = 0;

  let floorWiseReceipts = 0;
  const evaluatedFloors = (areaMetrics.evaluatedFloors || []).map(fl => {
    const saleSqm = parseFloat(fl.builtup_for_sale_sqm) || 0;
    const ratePerSqm = parseFloat(fl.rate_per_sqm) || 0;
    const units = parseInt(fl.no_of_units, 10) || 0;
    const costFor1Unit = parseFloat(fl.cost_for_1_unit) || (units > 0 ? (saleSqm * ratePerSqm) / units : 0);
    const floorTotal = ratePerSqm > 0 ? (saleSqm * ratePerSqm) : (costFor1Unit * units);
    floorWiseReceipts += floorTotal;
    return {
      ...fl,
      floor_realization: floorTotal
    };
  });

  const evaluatedSalableUnits = (salableUnits || []).map((unit) => {
    const carpetSqft = parseFloat(unit.carpet_area_sqft) || (parseFloat(unit.carpet_area_sqm) ? parseFloat(unit.carpet_area_sqm) * SQM_TO_SQFT : 0);
    const carpetSqm = parseFloat(unit.carpet_area_sqm) || (carpetSqft / SQM_TO_SQFT);
    const rawLoading = unit.super_buildup_loading_sqft !== undefined ? unit.super_buildup_loading_sqft : unit.loading_sqft;
    const loadingSqft = parseNum(rawLoading, 300.00);
    const superSqft = parseFloat(unit.super_buildup_area_sqft) || (carpetSqft + loadingSqft);
    const totalUnitsCount = parseInt(unit.unit_count, 10) || 1;
    const rawLandowner = unit.landowner_unit_count !== undefined ? unit.landowner_unit_count : unit.landowner_units;
    const landownerUnits = Math.min(totalUnitsCount, Math.max(0, parseInt(rawLandowner, 10) || 0));
    const developerUnits = Math.max(0, totalUnitsCount - landownerUnits);

    const rateSqft = parseNum(unit.rate_per_sqft, 6000.00);
    const unitPrice = superSqft * rateSqft;
    const developerAmount = unitPrice * developerUnits;
    const grossAmount = unitPrice * totalUnitsCount;
    const landownerAmount = unitPrice * landownerUnits;

    totalDeveloperUnits += developerUnits;
    totalLandownerUnits += landownerUnits;
    totalGrossReceipts += grossAmount;
    totalLandownerReceipts += landownerAmount;
    totalSalableCarpetSqft += (carpetSqft * totalUnitsCount);
    totalSalableSuperSqft += (superSqft * totalUnitsCount);

    return {
      ...unit,
      carpet_area_sqm: carpetSqm,
      carpet_area_sqft: Math.round(carpetSqft * 100) / 100,
      super_buildup_area_sqft: Math.round(superSqft * 100) / 100,
      unit_count: totalUnitsCount,
      landowner_unit_count: landownerUnits,
      developer_unit_count: developerUnits,
      unit_price: Math.round(unitPrice * 100) / 100,
      total_amount: Math.round(grossAmount * 100) / 100,
      developer_amount: Math.round(developerAmount * 100) / 100,
      landowner_amount: Math.round(landownerAmount * 100) / 100
    };
  });

  if (evaluatedSalableUnits.length > 0) {
    evaluatedSalableUnits.forEach(u => {
      totalReceipts += (u.developer_amount !== undefined ? u.developer_amount : u.total_amount);
    });
  } else if (floorWiseReceipts > 0) {
    totalReceipts = floorWiseReceipts;
    totalGrossReceipts = floorWiseReceipts;
  }

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
    costOfTdrB: costOfTdrB.effective,
    costOfTdrB_details: costOfTdrB,
    totalExpensesC: Math.round(totalExpensesC * 100) / 100,
    costOfPlotH: costOfPlotH.effective,
    costOfPlotH_details: costOfPlotH,
    isCostOfPlotIncluded: costOfPlotH.is_included !== false,
    costOfConstructionD: costOfConstructionD.effective,
    costOfConstructionD_details: costOfConstructionD,
    costOfBasementE: costOfBasementE.effective,
    costOfBasementE_details: costOfBasementE,
    rentCostF: rentCostF.effective,
    rentF: rentCostF.effective,
    rentCostF_details: rentCostF,
    rentF_details: rentCostF,
    stackedParkingCostG: stackedParkingCostG.effective,
    stackedParkingG: stackedParkingCostG.effective,
    stackedParkingCostG_details: stackedParkingCostG,
    stackedParkingG_details: stackedParkingCostG,
    totalProjectCost: Math.round(totalProjectCost * 100) / 100,
    totalReceipts: Math.round(totalReceipts * 100) / 100,
    totalGrossReceipts: Math.round(totalGrossReceipts * 100) / 100,
    totalLandownerReceipts: Math.round(totalLandownerReceipts * 100) / 100,
    totalDeveloperUnits,
    totalLandownerUnits,
    netProfit: Math.round(netProfit * 100) / 100,
    roiPct: Math.round(roiPct * 100) / 100,
    profitMarginPct: Math.round(profitMarginPct * 100) / 100,

    evaluatedStatutoryCharges,
    evaluatedSalableUnits,
    totalSalableCarpetSqft: Math.round(totalSalableCarpetSqft * 100) / 100,
    totalSalableSuperSqft: Math.round(totalSalableSuperSqft * 100) / 100,

    formulaNotes: [
      'Dual TDR (Regular and Slum) modeled independently with combined potential',
      'Residential Ancillary (60%) and Commercial Ancillary (80%) calculated independently per floor use',
      'Floor-wise table strictly exposes 10 columns: Level, Building Use, Height, FSI Area, Ancillary Area, P-Line Area, Lobby Area, Built-up for Sale, Number of Units, Area for 1 Unit',
      'Statutory item ANCILLARY_CHARGES consumes authoritative total ancillary area',
      'Controlled overrides with basis-drift detection supported across statutory and cost items'
    ]
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SQM_TO_SQFT,
    REGULATORY_PROFILES,
    ROAD_WIDTH_TDR_MAP,
    ROAD_WIDTH_TOTAL_TDR_MAP,
    deriveTdrSplit,
    parseNum,
    distributePlineEqually,
    distributeFsiAndAncillary,
    calculateParkingRequirements,
    calculateAreaMetrics,
    calculateFinancialMetrics
  };
}

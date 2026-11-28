// server/services/feasibilityEngine.js
// Authoritative calculation engine for Project Area Statement & Financial Viability
// Implements all Scope-Corrected DS16 rules cleanly from one backend source of truth.

const SQM_TO_SQFT = 10.7639104167;

/**
 * Versioned Regulatory Profiles for Maharashtra State (UDCPR 2020)
 */
const REGULATORY_PROFILES = {
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
      24: { regular: 0.55, slum: 0.55, gunthewari: 0.55 }
    },
    ancillaryPct: {
      residential: 0.60,
      commercial: 0.80
    }
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
      24: { regular: 1.10, slum: 0.55, gunthewari: 0.55 }
    },
    ancillaryPct: {
      residential: 0.60,
      commercial: 0.80
    }
  }
};

/**
 * Total TDR Factor matrix for Regular Development plots strictly determined by Road Width.
 * Split 50% Regular TDR + 50% Slum TDR by default.
 * Gunthewari plots use Slum TDR only (FR-08: Regular TDR = 0).
 */
const ROAD_WIDTH_TOTAL_TDR_MAP = {
  9: 0.40,
  12: 0.65,
  15: 0.80,
  18: 0.90,
  24: 1.10
};

const ROAD_WIDTH_TDR_MAP = {
  9: { regular: 0.20, slum: 0.20, gunthewari: 0.20 },
  12: { regular: 0.325, slum: 0.325, gunthewari: 0.325 },
  15: { regular: 0.40, slum: 0.40, gunthewari: 0.40 },
  18: { regular: 0.45, slum: 0.45, gunthewari: 0.45 },
  24: { regular: 0.55, slum: 0.55, gunthewari: 0.55 }
};

/**
 * Safely parses numeric inputs while preserving explicit 0 and 0.0 values.
 */
function parseNum(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Parses optional numeric field, returning null if omitted/empty/NaN and preserving explicit 0.
 */
function parseOptNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

function roundTo(val, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Derives Regular/Slum 50/50 TDR split from Total TDR Factor, rejecting invalid bounds.
 * Enforces: Regular TDR + Slum TDR = Total TDR Factor.
 */
function deriveTdrSplit(totalTdrFactor, requestedRegularTdr = null) {
  const total = Math.max(0, roundTo(parseFloat(totalTdrFactor) || 0, 4));
  const defaultRegular = roundTo(total / 2, 4);
  const defaultSlum = roundTo(total - defaultRegular, 4);

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
    const roundedReq = roundTo(rawReq, 4);
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
    const derivedSlum = roundTo(total - roundedReq, 4);
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

/**
 * Resolve permissible Regular, Slum, and Total TDR factors enforcing FR-08 & Section 3:
 * - Total TDR is strictly road-width-derived when road_width_m is set.
 * - Regular plots split Total TDR into Regular TDR + Slum TDR (where Slum = Total - Regular).
 * - Gunthewari plots use Slum TDR only (Regular TDR = 0 locked).
 */
function resolvePermissibleTdr(statement = {}) {
  const isGunthewari = Boolean(statement.is_gunthewari);
  const roadWidth = parseOptNum(statement.road_width_m);
  const explicitTotal = parseOptNum(statement.total_tdr_factor);
  const legacyTdr = parseOptNum(statement.tdr_factor);
  const explicitReg = parseOptNum(statement.regular_tdr_factor);
  const explicitSlum = parseOptNum(statement.slum_tdr_factor);

  const roadTotal = (roadWidth !== null && ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] !== undefined)
    ? ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth]
    : null;

  if (isGunthewari) {
    // Gunthewari scheme: Regular TDR ineligible (0); Slum TDR only from road matrix
    let slumFactor = 0;
    if (roadWidth !== null && ROAD_WIDTH_TDR_MAP[roadWidth]) {
      slumFactor = ROAD_WIDTH_TDR_MAP[roadWidth].gunthewari;
    } else if (explicitSlum !== null && explicitSlum >= 0) {
      slumFactor = roundTo(explicitSlum, 4);
    } else if (explicitTotal !== null && explicitTotal >= 0) {
      slumFactor = roundTo(explicitTotal / 2, 4);
    }

    return {
      isGunthewari: true,
      roadWidth,
      totalTdrFactor: slumFactor,
      regularTdrFactor: 0,
      slumTdrFactor: slumFactor,
      defaultRegularTdrFactor: 0,
      defaultSlumTdrFactor: slumFactor,
      isRegularTdrOverridden: false,
      suggestedRoadTdrFactor: slumFactor
    };
  }

  // Regular plot: When roadWidth is set, Total TDR is strictly road-width-derived; Slum = Total - Regular.
  let baseTotal = 0.65;
  if (roadTotal !== null) {
    baseTotal = roadTotal;
  } else if (explicitTotal !== null) {
    baseTotal = explicitTotal;
  } else if (legacyTdr !== null) {
    baseTotal = legacyTdr;
  } else if (explicitReg !== null && explicitSlum !== null) {
    baseTotal = explicitReg + explicitSlum;
  }

  const split = deriveTdrSplit(baseTotal, explicitReg);

  return {
    isGunthewari: false,
    roadWidth,
    totalTdrFactor: split.totalTdrFactor,
    regularTdrFactor: split.regularTdrFactor,
    slumTdrFactor: split.slumTdrFactor,
    defaultRegularTdrFactor: split.defaultRegularTdrFactor,
    defaultSlumTdrFactor: split.defaultSlumTdrFactor,
    isRegularTdrOverridden: split.isRegularTdrOverridden,
    suggestedRoadTdrFactor: roadTotal !== null ? roadTotal : 0
  };
}

/**
 * Authoritative validation of Area Statement inputs (never silently clamps invalid values).
 */
function validateAreaStatementInputs(statement = {}) {
  const plotArea = parseOptNum(statement.plot_area_sqm);
  const dpDed = parseOptNum(statement.dp_deductions_sqm);
  const basicFsi = parseOptNum(statement.basic_fsi_factor);
  const paidFsi = parseOptNum(statement.paid_fsi_factor);
  const propPaidFsi = parseOptNum(statement.proposed_paid_fsi_factor);
  const propRegTdr = parseOptNum(statement.proposed_regular_tdr_factor);
  const propSlumTdr = parseOptNum(statement.proposed_slum_tdr_factor);
  const primaryResPct = parseOptNum(statement.primary_fsi_residential_pct);
  const roadWidth = parseOptNum(statement.road_width_m);
  const isGunthewari = Boolean(statement.is_gunthewari);

  if (plotArea !== null && plotArea < 0) {
    return { valid: false, error: 'Area Of Plot cannot be negative.' };
  }
  if (dpDed !== null && dpDed < 0) {
    return { valid: false, error: 'Deductions For Proposed D.P. cannot be negative.' };
  }
  const effectivePlot = plotArea ?? 0;
  const effectiveDp = dpDed ?? 0;
  if (effectiveDp > effectivePlot + 0.0001) {
    return {
      valid: false,
      error: `Deductions For Proposed D.P. (${effectiveDp}) cannot exceed Area Of Plot (${effectivePlot}). Net Plotable Area cannot be negative.`
    };
  }

  if (statement.road_width_m !== undefined && statement.road_width_m !== null && statement.road_width_m !== '') {
    if (roadWidth === null || ![9, 12, 15, 18, 24].includes(roadWidth)) {
      return { valid: false, error: 'Invalid road width. Supported road widths are strictly 9m, 12m, 15m, 18m, or 24m.' };
    }
  }

  if (basicFsi !== null && basicFsi < 0) {
    return { valid: false, error: 'Basic FSI factor cannot be negative.' };
  }
  if (paidFsi !== null && paidFsi < 0) {
    return { valid: false, error: 'Paid FSI factor cannot be negative.' };
  }
  if (primaryResPct !== null && (primaryResPct < 0 || primaryResPct > 100)) {
    return { valid: false, error: 'primary_fsi_residential_pct must be between 0 and 100.' };
  }

  const paidLimit = paidFsi ?? 0.5;
  if (propPaidFsi !== null) {
    if (propPaidFsi < 0) {
      return { valid: false, error: 'Proposed Paid FSI factor cannot be negative.' };
    }
    if (propPaidFsi > paidLimit + 0.0001) {
      return { valid: false, error: `Proposed Paid FSI factor (${propPaidFsi}) cannot exceed maximum eligible Paid FSI (${paidLimit}).` };
    }
  }

  const reqReg = parseOptNum(statement.regular_tdr_factor);
  const reqSlum = parseOptNum(statement.slum_tdr_factor);
  const reqTotal = parseOptNum(statement.total_tdr_factor);

  if (isGunthewari) {
    if (reqReg !== null && reqReg > 0.0001) {
      return { valid: false, error: 'Regular TDR is not permitted for Gunthewari plots (Slum TDR only).' };
    }
    if (propRegTdr !== null && propRegTdr > 0.0001) {
      return { valid: false, error: 'Proposed Regular TDR cannot exceed 0 for Gunthewari plots.' };
    }
    const maxGunthSlum = roadWidth !== null && ROAD_WIDTH_TDR_MAP[roadWidth]
      ? ROAD_WIDTH_TDR_MAP[roadWidth].gunthewari
      : (reqSlum ?? 0);
    if (roadWidth !== null && reqSlum !== null && Math.abs(reqSlum - maxGunthSlum) > 0.0001) {
      return {
        valid: false,
        error: `Gunthewari Slum TDR is strictly road-width derived (${maxGunthSlum} for ${roadWidth}m road); independent overrides are not permitted.`
      };
    }
    if (roadWidth !== null && reqTotal !== null && Math.abs(reqTotal - maxGunthSlum) > 0.0001) {
      return {
        valid: false,
        error: `Total TDR for ${roadWidth}m Gunthewari plot is strictly ${maxGunthSlum}.`
      };
    }
    if (propSlumTdr !== null) {
      if (propSlumTdr < 0) {
        return { valid: false, error: 'Proposed Slum TDR factor cannot be negative.' };
      }
      if (propSlumTdr > maxGunthSlum + 0.0001) {
        return { valid: false, error: `Proposed Slum TDR (${propSlumTdr}) cannot exceed Gunthewari Slum TDR eligibility (${maxGunthSlum}).` };
      }
    }
    return { valid: true, error: null };
  }

  // Regular plot TDR validation
  const baseTotal = roadWidth !== null && ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] !== undefined
    ? ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth]
    : (reqTotal ?? parseOptNum(statement.tdr_factor) ?? 0.65);

  if (roadWidth !== null && reqTotal !== null && Math.abs(reqTotal - baseTotal) > 0.0001) {
    return {
      valid: false,
      error: `Total TDR is strictly road-width derived (${baseTotal} for ${roadWidth}m road); unrestricted Total TDR override is not permitted.`
    };
  }

  const split = deriveTdrSplit(baseTotal, reqReg);
  if (!split.isSplitValid) {
    return { valid: false, error: split.validationError };
  }

  if (roadWidth !== null && reqSlum !== null && Math.abs(reqSlum - split.slumTdrFactor) > 0.0001) {
    return {
      valid: false,
      error: `Slum TDR (${split.slumTdrFactor}) is automatically derived as the remaining balance (Total ${baseTotal} − Regular ${split.regularTdrFactor}); independent Slum TDR overrides are not permitted.`
    };
  }

  if (propRegTdr !== null) {
    if (propRegTdr < 0) {
      return { valid: false, error: 'Proposed Regular TDR factor cannot be negative.' };
    }
    if (propRegTdr > split.regularTdrFactor + 0.0001) {
      return { valid: false, error: `Proposed Regular TDR (${propRegTdr}) cannot exceed Permissible Regular TDR (${split.regularTdrFactor}).` };
    }
  }
  if (propSlumTdr !== null) {
    if (propSlumTdr < 0) {
      return { valid: false, error: 'Proposed Slum TDR factor cannot be negative.' };
    }
    if (propSlumTdr > split.slumTdrFactor + 0.0001) {
      return { valid: false, error: `Proposed Slum TDR (${propSlumTdr}) cannot exceed Permissible Slum TDR (${split.slumTdrFactor}).` };
    }
  }

  return { valid: true, error: null };
}

/**
 * Legacy helper retained only as deprecated no-crash export for external callers if any.
 */
function calculateParkingRequirements() {
  return { excludedFromScope: true };
}

/**
 * Distribute target proposed P-Line directly and equally across applicable floors
 */
function distributePlineEqually(targetTotalPline, floors = []) {
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

  sumOverriddenPline = roundTo(sumOverriddenPline, 2);
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

/**
 * Distribute target proposed Primary FSI across applicable floors with cent-level reconciliation
 * and compute floor-specific ancillary areas (60% Residential, 80% Commercial).
 */
function distributeFsiAndAncillary(targetTotalFsi, applicableFloors = [], options = {}) {
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
    return u.includes('comm') ? (1 + commAncillaryPct) : (1 + resAncillaryPct);
  };

  const getAncillaryPct = (f) => {
    const u = (f.usage_type || options.defaultUsage || 'Residential').toLowerCase();
    return u.includes('comm') ? commAncillaryPct : resAncillaryPct;
  };

  const overriddenFloors = applicableFloors.filter(isFloorOverridden);
  const unoverriddenFloors = applicableFloors.filter(f => !isFloorOverridden(f));

  let sumOverriddenFsi = 0;

  for (const f of overriddenFloors) {
    const plineVal = parseFloat(f.pline_area_sqm) || 0;
    const mult = getMultiplier(f);
    const pct = getAncillaryPct(f);

    const floorFsi = mult > 0 ? (plineVal / mult) : 0;
    const floorAncillary = plineVal - floorFsi;

    sumOverriddenFsi += floorFsi;

    assignedMap.set(f.id || f.floor_key || f.floor_name, {
      fsi: roundTo(floorFsi, 4),
      ancillary: roundTo(floorAncillary, 2),
      pline: plineVal,
      is_overridden: true,
      ancillary_pct: pct
    });
  }

  sumOverriddenFsi = roundTo(sumOverriddenFsi, 2);
  const isPlineInconsistent = (sumOverriddenFsi > targetFsi + 0.01) && (targetFsi > 0);
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
      const floorAncillary = roundTo(floorFsi * pct, 2);
      const floorPline = roundTo(floorFsi + floorAncillary, 2);

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

/**
 * Authoritative Area Statement & Floor-wise P-Line Calculation Engine
 */
function calculateAreaMetrics(statement = {}, floors = []) {
  // 1. Independent Plot & Survey Baseline (FR-02)
  const plotAreaSqm = parseNum(statement.plot_area_sqm, 0);
  const citySurveyAreaSqm = parseNum(statement.city_survey_area_sqm, 0);
  const siteAreaSqm = parseNum(statement.site_area_sqm, 0);
  const dpDeductionsSqm = parseNum(statement.dp_deductions_sqm, 0);
  const existingBuiltup = parseNum(statement.existing_builtup_area_sqm, 0);

  // Approved Formula (Section 4): Net Plotable Area = Plot Area − Proposed DP Deductions (never silently clamped)
  const plotableAreaSqm = roundTo(plotAreaSqm - dpDeductionsSqm, 4);

  // 2. Permissible FSI & TDR Factors (FR-03, FR-04, FR-06, FR-07, FR-08)
  const basicFsiFactor = parseNum(statement.basic_fsi_factor, 1.1);
  const paidFsiFactor = parseNum(statement.paid_fsi_factor, 0.5);
  const tdrPermissible = resolvePermissibleTdr(statement);
  const {
    isGunthewari,
    roadWidth,
    totalTdrFactor,
    regularTdrFactor,
    slumTdrFactor,
    defaultRegularTdrFactor,
    defaultSlumTdrFactor,
    isRegularTdrOverridden,
    suggestedRoadTdrFactor
  } = tdrPermissible;
  const permissibleTdrFactor = totalTdrFactor;

  // 3. Building Use & Ancillary Configuration (FR-11)
  const rawBuildingUse = (statement.building_use || 'Residential').trim();
  const lowerUse = rawBuildingUse.toLowerCase();
  const isMixedUse = lowerUse.includes('mixed');
  const isCommercial = !isMixedUse && lowerUse.includes('comm');
  const isResidential = !isMixedUse && !isCommercial;
  const buildingUse = isMixedUse ? 'Mixed Use' : (isCommercial ? 'Commercial' : 'Residential');

  const resAncillaryPct = parseNum(statement.ancillary_residential_pct, 0.60);
  const commAncillaryPct = parseNum(statement.ancillary_commercial_pct, 0.80);

  const rawDividingFactor = parseNum(statement.dividing_factor, 1.6);
  const dividingFactor = rawDividingFactor > 0 ? rawDividingFactor : 1.6;

  // 4. Floor Classification (strictly sourced from active floors)
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
  const commFloors = [];
  const resFloors = [];
  applicableHabitableFloors.forEach(f => {
    if (getFloorUsage(f) === 'Commercial') commFloors.push(f);
    else resFloors.push(f);
  });
  const N_comm = commFloors.length;
  const N_res = resFloors.length;

  // Explicit Mixed-Use Primary FSI Allocation totaling 100% (FR-11)
  const explicitResPct = parseOptNum(statement.primary_fsi_residential_pct);
  const explicitCommPct = parseOptNum(statement.primary_fsi_commercial_pct);
  let primaryFsiResidentialPct = 100;
  let primaryFsiCommercialPct = 0;
  let isPrimaryFsiSplitExplicit = false;

  if (isResidential) {
    primaryFsiResidentialPct = 100;
    primaryFsiCommercialPct = 0;
  } else if (isCommercial) {
    primaryFsiResidentialPct = 0;
    primaryFsiCommercialPct = 100;
  } else {
    if (explicitResPct !== null) {
      primaryFsiResidentialPct = Math.max(0, Math.min(100, roundTo(explicitResPct, 2)));
      primaryFsiCommercialPct = roundTo(100 - primaryFsiResidentialPct, 2);
      isPrimaryFsiSplitExplicit = true;
    } else if (explicitCommPct !== null) {
      primaryFsiCommercialPct = Math.max(0, Math.min(100, roundTo(explicitCommPct, 2)));
      primaryFsiResidentialPct = roundTo(100 - primaryFsiCommercialPct, 2);
      isPrimaryFsiSplitExplicit = true;
    } else if (N_habitable > 0) {
      primaryFsiResidentialPct = roundTo((N_res / N_habitable) * 100, 4);
      primaryFsiCommercialPct = roundTo(100 - primaryFsiResidentialPct, 4);
    } else {
      primaryFsiResidentialPct = 50;
      primaryFsiCommercialPct = 50;
    }
  }

  // 5. Permissible Areas & Ancillary (FR-03, FR-04, FR-11)
  const permissibleFsiSqm = plotableAreaSqm * basicFsiFactor;
  const permissiblePaidFsiSqm = plotableAreaSqm * paidFsiFactor;
  const permissibleRegularTdrSqm = plotableAreaSqm * regularTdrFactor;
  const permissibleSlumTdrSqm = plotableAreaSqm * slumTdrFactor;
  const permissibleTdrSqm = permissibleRegularTdrSqm + permissibleSlumTdrSqm;
  const permissibleTotalBuiltupSqm = permissibleFsiSqm + permissiblePaidFsiSqm + permissibleTdrSqm;
  const permissibleTotalFsi = plotableAreaSqm > 0 ? permissibleTotalBuiltupSqm / plotableAreaSqm : 0;

  const commRatio = primaryFsiCommercialPct / 100;
  const resRatio = primaryFsiResidentialPct / 100;

  const permissibleCommercialFsiSqm = permissibleTotalBuiltupSqm * commRatio;
  const permissibleResidentialFsiSqm = permissibleTotalBuiltupSqm * resRatio;
  const permissibleCommercialAncillarySqm = permissibleCommercialFsiSqm * commAncillaryPct;
  const permissibleResidentialAncillarySqm = permissibleResidentialFsiSqm * resAncillaryPct;
  const permissibleTotalAncillarySqm = permissibleCommercialAncillarySqm + permissibleResidentialAncillarySqm;
  const permissiblePlineTotalSqm = permissibleTotalBuiltupSqm + permissibleTotalAncillarySqm;

  // 6. Auto-Suggested vs Architect-Edited Proposed Paid FSI & TDR Consumption (FR-05, FR-09)
  const isProposedPlineOverridden = Boolean(statement.is_proposed_pline_overridden);
  const totalProposedPlineOverrideSqm = parseOptNum(statement.total_proposed_pline_override_sqm);

  const isFloorOverridden = (f) => {
    if (f.is_pline_overridden === true) return true;
    if (f.is_pline_overridden === false) return false;
    return false;
  };
  const allHabitableOverridden = N_habitable > 0 && applicableHabitableFloors.every(isFloorOverridden);

  let designPrimaryFsiNeededSqm = null;
  if (isProposedPlineOverridden && totalProposedPlineOverrideSqm !== null) {
    const weightedMultiplier = (commRatio * (1 + commAncillaryPct)) + (resRatio * (1 + resAncillaryPct));
    designPrimaryFsiNeededSqm = weightedMultiplier > 0 ? (totalProposedPlineOverrideSqm / weightedMultiplier) : 0;
  } else if (allHabitableOverridden) {
    designPrimaryFsiNeededSqm = applicableHabitableFloors.reduce((acc, f) => {
      const u = getFloorUsage(f);
      const mult = u === 'Commercial' ? (1 + commAncillaryPct) : (1 + resAncillaryPct);
      return acc + (parseNum(f.pline_area_sqm, 0) / mult);
    }, 0);
  }

  let suggestedPaidFsiFactor = paidFsiFactor;
  let suggestedRegularTdrFactor = regularTdrFactor;
  let suggestedSlumTdrFactor = slumTdrFactor;

  if (designPrimaryFsiNeededSqm !== null && plotableAreaSqm > 0) {
    const additionalFsiNeeded = Math.max(0, designPrimaryFsiNeededSqm - permissibleFsiSqm);
    const additionalFactorNeeded = additionalFsiNeeded / plotableAreaSqm;

    suggestedPaidFsiFactor = Math.min(paidFsiFactor, roundTo(additionalFactorNeeded, 4));
    const remainingAfterPaid = Math.max(0, additionalFactorNeeded - suggestedPaidFsiFactor);
    const neededTdrTotal = Math.min(totalTdrFactor, roundTo(remainingAfterPaid, 4));

    if (isGunthewari) {
      suggestedRegularTdrFactor = 0;
      suggestedSlumTdrFactor = neededTdrTotal;
    } else if (totalTdrFactor > 0) {
      suggestedRegularTdrFactor = roundTo(neededTdrTotal * (regularTdrFactor / totalTdrFactor), 4);
      suggestedSlumTdrFactor = roundTo(neededTdrTotal - suggestedRegularTdrFactor, 4);
    } else {
      suggestedRegularTdrFactor = 0;
      suggestedSlumTdrFactor = 0;
    }
  }

  // Apply explicit architect edits to Proposed Paid FSI & TDR consumption (no silent clamping)
  const rawProposedPaidFactor = parseOptNum(statement.proposed_paid_fsi_factor);
  const effectiveProposedPaidFsiFactor = rawProposedPaidFactor !== null
    ? roundTo(rawProposedPaidFactor, 4)
    : suggestedPaidFsiFactor;
  const isProposedPaidFsiEdited = rawProposedPaidFactor !== null && Math.abs(effectiveProposedPaidFsiFactor - suggestedPaidFsiFactor) > 0.0001;

  const rawProposedRegTdr = parseOptNum(statement.proposed_regular_tdr_factor);
  const rawProposedSlumTdr = parseOptNum(statement.proposed_slum_tdr_factor);
  const legacyProposedTdr = parseOptNum(statement.proposed_tdr_factor);

  let effectiveProposedRegularTdrFactor = suggestedRegularTdrFactor;
  let effectiveProposedSlumTdrFactor = suggestedSlumTdrFactor;
  let isProposedTdrEdited = false;

  if (rawProposedRegTdr !== null || rawProposedSlumTdr !== null) {
    effectiveProposedRegularTdrFactor = rawProposedRegTdr !== null
      ? roundTo(rawProposedRegTdr, 4)
      : (isGunthewari ? 0 : suggestedRegularTdrFactor);
    effectiveProposedSlumTdrFactor = rawProposedSlumTdr !== null
      ? roundTo(rawProposedSlumTdr, 4)
      : suggestedSlumTdrFactor;
    isProposedTdrEdited =
      Math.abs(effectiveProposedRegularTdrFactor - suggestedRegularTdrFactor) > 0.0001 ||
      Math.abs(effectiveProposedSlumTdrFactor - suggestedSlumTdrFactor) > 0.0001;
  } else if (
    legacyProposedTdr !== null &&
    legacyProposedTdr > 0 &&
    statement.total_tdr_factor === undefined &&
    Math.abs(legacyProposedTdr - totalTdrFactor) > 0.0001
  ) {
    // Legacy compatibility (e.g. sample proposed_tdr_factor = 0.545 vs 0.65)
    const legacyFactor = roundTo(legacyProposedTdr, 4);
    if (isGunthewari) {
      effectiveProposedRegularTdrFactor = 0;
      effectiveProposedSlumTdrFactor = legacyFactor;
    } else if (totalTdrFactor > 0) {
      effectiveProposedRegularTdrFactor = roundTo(legacyFactor * (regularTdrFactor / totalTdrFactor), 4);
      effectiveProposedSlumTdrFactor = roundTo(legacyFactor - effectiveProposedRegularTdrFactor, 4);
    }
    isProposedTdrEdited = true;
  }

  const totalProposedTdrFactor = roundTo(effectiveProposedRegularTdrFactor + effectiveProposedSlumTdrFactor, 4);

  // Calculated (Auto-Suggested) vs Effective (Consumed/Chargeable) Areas
  const proposedBasicFsiSqm = permissibleFsiSqm;
  const calculatedProposedPaidFsiSqm = plotableAreaSqm * suggestedPaidFsiFactor;
  const proposedPaidFsiSqm = plotableAreaSqm * effectiveProposedPaidFsiFactor;

  const calculatedProposedRegularTdrSqm = plotableAreaSqm * suggestedRegularTdrFactor;
  const calculatedProposedSlumTdrSqm = plotableAreaSqm * suggestedSlumTdrFactor;
  const calculatedProposedTdrSqm = calculatedProposedRegularTdrSqm + calculatedProposedSlumTdrSqm;

  const regularTdrSqm = plotableAreaSqm * effectiveProposedRegularTdrFactor;
  const slumTdrSqm = plotableAreaSqm * effectiveProposedSlumTdrFactor;
  const proposedTdrSqm = regularTdrSqm + slumTdrSqm;

  const proposedTotalBuiltupSqm = proposedBasicFsiSqm + proposedPaidFsiSqm + proposedTdrSqm;
  const proposedTotalFsi = plotableAreaSqm > 0 ? proposedTotalBuiltupSqm / plotableAreaSqm : 0;

  // 7. Floor-wise Distribution of Proposed FSI Area
  const targetWeightedMultiplier = (commRatio * (1 + commAncillaryPct)) + (resRatio * (1 + resAncillaryPct));
  const targetProposedFsi = (isProposedPlineOverridden && totalProposedPlineOverrideSqm !== null && targetWeightedMultiplier > 0)
    ? (totalProposedPlineOverrideSqm / targetWeightedMultiplier)
    : proposedTotalBuiltupSqm;

  let assignedMap = new Map();
  let isPlineInconsistent = false;
  let plineInconsistencyMessage = null;

  if (isMixedUse && isPrimaryFsiSplitExplicit && N_comm > 0 && N_res > 0) {
    const commTargetFsi = targetProposedFsi * commRatio;
    const resTargetFsi = targetProposedFsi * resRatio;
    const commDist = distributeFsiAndAncillary(commTargetFsi, commFloors, {
      resAncillaryPct,
      commAncillaryPct,
      defaultUsage: 'Commercial'
    });
    const resDist = distributeFsiAndAncillary(resTargetFsi, resFloors, {
      resAncillaryPct,
      commAncillaryPct,
      defaultUsage: 'Residential'
    });
    commDist.assignedMap.forEach((v, k) => assignedMap.set(k, v));
    resDist.assignedMap.forEach((v, k) => assignedMap.set(k, v));
    isPlineInconsistent = commDist.isPlineInconsistent || resDist.isPlineInconsistent;
    plineInconsistencyMessage = [commDist.plineInconsistencyMessage, resDist.plineInconsistencyMessage].filter(Boolean).join(' | ') || null;
  } else {
    const dist = distributeFsiAndAncillary(targetProposedFsi, applicableHabitableFloors, {
      resAncillaryPct,
      commAncillaryPct,
      defaultUsage: isCommercial ? 'Commercial' : 'Residential'
    });
    assignedMap = dist.assignedMap;
    isPlineInconsistent = dist.isPlineInconsistent;
    plineInconsistencyMessage = dist.plineInconsistencyMessage;
  }

  // 8. Floor Rows Aggregation (10 Mandatory Columns)
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
    const calculatedLobby = roundTo(pline * 0.15, 2);
    if (!isLobbyOverridden || isNaN(lobby)) {
      lobby = calculatedLobby;
    }

    let owners = parseFloat(floor.builtup_for_owners_sqm);
    if (isNaN(owners) || floor.builtup_for_owners_sqm === null || floor.builtup_for_owners_sqm === undefined || owners < 0) {
      owners = 0;
    }

    let sale = 0;
    if (isHabitable) {
      if (floor.builtup_for_sale_sqm !== undefined && floor.builtup_for_sale_sqm !== null && !floor.floor_key && floor.is_pline_overridden === undefined && owners === 0) {
        sale = parseFloat(floor.builtup_for_sale_sqm) || 0;
      } else {
        sale = Math.max(0, roundTo(pline - lobby - owners, 2));
      }
    }

    let noOfUnits = parseInt(floor.no_of_units, 10);
    if (isNaN(noOfUnits)) noOfUnits = isHabitable ? 1 : 0;
    if (!isHabitable) noOfUnits = 0;

    const areaFor1Unit = noOfUnits > 0 ? roundTo(sale / noOfUnits, 4) : 0;

    totalProposedPlineSqm += pline;
    totalLobbyAreaSqm += lobby;
    totalBuiltupForOwnersSqm += owners;
    totalBuiltupForSaleSqm += sale;
    totalHeightMeters += height;
    totalUnitsCount += noOfUnits;

    return {
      ...floor,
      usage_type: usage,
      height_meters: height,
      fsi_area_sqm: roundTo(fsi, 2),
      ancillary_area_sqm: roundTo(ancillary, 2),
      ancillary_pct: ancPct,
      pline_area_sqm: roundTo(pline, 2),
      calculated_pline_sqm: roundTo(pline, 2),
      is_pline_overridden: isPlineOverridden,
      lobby_area_sqm: roundTo(lobby, 2),
      calculated_lobby_sqm: calculatedLobby,
      is_lobby_overridden: isLobbyOverridden,
      builtup_for_owners_sqm: roundTo(owners, 2),
      builtup_for_sale_sqm: roundTo(sale, 2),
      no_of_units: noOfUnits,
      area_for_1_unit: areaFor1Unit,
      total_floor_area_sqm: roundTo(pline, 2),
      pline_area_sqft: pline * SQM_TO_SQFT,
      lobby_area_sqft: lobby * SQM_TO_SQFT,
      builtup_for_sale_sqft: sale * SQM_TO_SQFT
    };
  });

  // Fallback Proposed Primary FSI & Ancillary summary when 0 habitable floors exist yet
  if (N_habitable === 0) {
    proposedCommercialFsiSqm = roundTo(proposedTotalBuiltupSqm * commRatio, 2);
    proposedResidentialFsiSqm = roundTo(proposedTotalBuiltupSqm * resRatio, 2);
    proposedCommercialAncillarySqm = roundTo(proposedCommercialFsiSqm * commAncillaryPct, 2);
    proposedResidentialAncillarySqm = roundTo(proposedResidentialFsiSqm * resAncillaryPct, 2);
  } else {
    proposedResidentialFsiSqm = roundTo(proposedResidentialFsiSqm, 2);
    proposedCommercialFsiSqm = roundTo(proposedCommercialFsiSqm, 2);
    proposedResidentialAncillarySqm = roundTo(proposedResidentialAncillarySqm, 2);
    proposedCommercialAncillarySqm = roundTo(proposedCommercialAncillarySqm, 2);
  }

  const proposedTotalFsiSqm = roundTo(proposedResidentialFsiSqm + proposedCommercialFsiSqm, 2);
  const totalProposedAncillarySqm = roundTo(proposedResidentialAncillarySqm + proposedCommercialAncillarySqm, 2);

  totalProposedPlineSqm = roundTo(totalProposedPlineSqm, 2);
  totalLobbyAreaSqm = roundTo(totalLobbyAreaSqm, 2);
  totalBuiltupForOwnersSqm = roundTo(totalBuiltupForOwnersSqm, 2);
  totalBuiltupForSaleSqm = roundTo(totalBuiltupForSaleSqm, 2);
  totalHeightMeters = roundTo(totalHeightMeters, 2);

  const marginHBy5Meters = roundTo(totalHeightMeters / 5, 2);

  const calculatedProposedPlineSqm = N_habitable > 0
    ? totalProposedPlineSqm
    : roundTo(proposedTotalBuiltupSqm + totalProposedAncillarySqm, 2);
  const effectiveProposedPlineSqm = (isProposedPlineOverridden && totalProposedPlineOverrideSqm !== null)
    ? totalProposedPlineOverrideSqm
    : calculatedProposedPlineSqm;

  // Derived Compliance Checks & Area Balance
  const proposedAfterExistingSqm = Math.max(0, totalProposedPlineSqm - existingBuiltup);
  const baseDividingFactorSqm = dividingFactor > 0 ? (proposedAfterExistingSqm / dividingFactor) : 0;
  const derivedAncillaryAreaSqm = Math.max(0, totalProposedPlineSqm - baseDividingFactorSqm);
  const basicFsiOfPlotSqm = plotableAreaSqm * basicFsiFactor;
  const tdrOfPlotSqm = plotableAreaSqm * 0.30;
  const paidFsiRequiredSqm = Math.max(0, baseDividingFactorSqm - basicFsiOfPlotSqm - tdrOfPlotSqm);
  const areaBalanceSqm = roundTo(permissiblePlineTotalSqm - effectiveProposedPlineSqm, 2);

  const isConfigured = (plotAreaSqm > 0) || (activeFloors.length > 0);
  const requiredTdrSqm = Math.max(0, proposedTotalBuiltupSqm - proposedBasicFsiSqm - proposedPaidFsiSqm);

  // Reference comparison values (legacy compatibility)
  const sourceUnallocatedResidentialAncillarySqm = roundTo(permissibleTotalBuiltupSqm * resAncillaryPct, 3);
  const sourceUnallocatedCommercialAncillarySqm = roundTo(permissibleTotalBuiltupSqm * commAncillaryPct, 3);
  const sourceUnallocatedPermissiblePlineSqm = roundTo(permissibleTotalBuiltupSqm + sourceUnallocatedResidentialAncillarySqm + sourceUnallocatedCommercialAncillarySqm, 3);
  const floorSumPlineSqm = roundTo(totalProposedPlineSqm, 3);
  const sourceProposedPlineDifferenceSqm = roundTo(effectiveProposedPlineSqm - totalProposedPlineSqm, 3);

  const singleAncillaryPct = isCommercial ? commAncillaryPct : resAncillaryPct;
  const table1ProposedCommAncSqm = roundTo((proposedTotalBuiltupSqm * commRatio) * commAncillaryPct, 2);
  const table1ProposedResAncSqm = roundTo((proposedTotalBuiltupSqm * resRatio) * resAncillaryPct, 2);
  const table1ProposedTotalAncSqm = roundTo(table1ProposedCommAncSqm + table1ProposedResAncSqm, 2);
  const table1ProposedPlineTotalSqm = roundTo(proposedTotalBuiltupSqm + table1ProposedTotalAncSqm, 2);

  return {
    isConfigured,
    buildingUse,
    isResidential,
    isCommercial,
    isMixedUse,
    resAncillaryPct,
    commAncillaryPct,
    ancillaryPct: singleAncillaryPct,
    primaryFsiResidentialPct,
    primaryFsiCommercialPct,
    isPrimaryFsiSplitExplicit,

    isGunthewari,
    roadWidth,
    suggestedRoadTdrFactor,
    totalTdrFactor,
    regularTdrFactor,
    slumTdrFactor,
    defaultRegularTdrFactor,
    defaultSlumTdrFactor,
    isRegularTdrOverridden,
    totalProposedTdrFactor,

    // Baseline Measurements (FR-02)
    plotAreaSqm,
    plotAreaSqft: plotAreaSqm * SQM_TO_SQFT,
    citySurveyAreaSqm,
    citySurveyAreaSqft: citySurveyAreaSqm * SQM_TO_SQFT,
    siteAreaSqm,
    siteAreaSqft: siteAreaSqm * SQM_TO_SQFT,
    dpDeductionsSqm,
    dpDeductionsSqft: dpDeductionsSqm * SQM_TO_SQFT,
    plotableAreaSqm,
    plotableAreaSqft: plotableAreaSqm * SQM_TO_SQFT,

    // Permissible Column (FR-03, FR-04, FR-08, FR-11)
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

    // Backward-compatible Table 1 aliases
    permissibleAncillaryResSqm: permissibleTotalAncillarySqm,
    proposedAncillaryResSqm: table1ProposedTotalAncSqm,
    proposedPlineTotalSqm: table1ProposedPlineTotalSqm,
    table1ProposedCommAncSqm,
    table1ProposedResAncSqm,

    // Auto-Suggested vs Effective Proposed Paid FSI & TDR (FR-05, FR-09)
    suggestedPaidFsiFactor,
    effectiveProposedPaidFsiFactor,
    isProposedPaidFsiEdited,
    calculatedProposedPaidFsiSqm,

    suggestedRegularTdrFactor,
    suggestedSlumTdrFactor,
    effectiveProposedRegularTdrFactor,
    effectiveProposedSlumTdrFactor,
    isProposedTdrEdited,
    calculatedProposedRegularTdrSqm,
    calculatedProposedSlumTdrSqm,
    calculatedProposedTdrSqm,

    // Proposed Column (FR-10, FR-11)
    proposedBasicFsiSqm,
    proposedPaidFsiSqm,
    regularTdrSqm,
    slumTdrSqm,
    proposedRegularTdrSqm: regularTdrSqm,
    proposedSlumTdrSqm: slumTdrSqm,
    proposedTdrSqm,
    requiredTdrSqm,
    proposedTotalBuiltupSqm,
    proposedPrimaryFsiSqm: proposedTotalBuiltupSqm,
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

    // Floor Totals, P-Line, Height & Margin H/5
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
    marginHBy5Meters,
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

/**
 * Authoritative Financial Viability Calculation Engine
 */
function calculateFinancialMetrics(financial = {}, statutoryItems = [], salableUnits = [], areaMetrics = {}) {
  const rrRate = parseNum(financial.rr_rate_per_sqm, 0);
  const estimatedCostARate = parseNum(financial.estimated_cost_a_rate, 0);
  const estimatedCostBRate = parseNum(financial.estimated_cost_b_rate, 0);

  // Authoritative Proposed areas synced directly from Area Statement
  const effectivePlineSqm = areaMetrics.totalProposedPlineSqm > 0
    ? areaMetrics.totalProposedPlineSqm
    : (areaMetrics.effectiveProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0);
  const effectiveAncillarySqm = areaMetrics.totalProposedAncillarySqm !== undefined
    ? areaMetrics.totalProposedAncillarySqm
    : (areaMetrics.proposedAncillaryResSqm || 0);
  const effectivePaidFsiSqm = parseNum(areaMetrics.proposedPaidFsiSqm, 0);
  const effectiveTdrSqm = parseNum(areaMetrics.proposedTdrSqm ?? areaMetrics.totalProposedTdrSqm, 0);

  // Benchmark norms (never added directly to Total Project Cost)
  const estimatedCostA = effectivePlineSqm * estimatedCostARate;
  const estimatedCostB = effectivePlineSqm * estimatedCostBRate;

  let overrides = financial.overrides || {};
  if (typeof overrides === 'string') {
    try { overrides = JSON.parse(overrides); } catch (e) { overrides = {}; }
  }

  // 1. STATUTORY CHARGES (SECTION A — NMC/DEMAND)
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
      : (defaultRrPercentages[chargeCode] ?? null);

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
        const devChargeItem = Array.isArray(statutoryItems) ? statutoryItems.find(it => it.charge_code === 'DEVELOPMENT_CHARGES') : null;
        if (devChargeItem && devChargeItem.is_enabled === false) {
          return 0;
        }
        const devOverride = overrides && overrides['statutory_DEVELOPMENT_CHARGES'];
        let devChargeAmount = 0;
        if (devOverride && devOverride.override_val !== undefined && devOverride.override_val !== null) {
          devChargeAmount = parseNum(devOverride.override_val, 0);
        } else if (devChargeItem) {
          const devRrPct = parseNum(devChargeItem.rr_percentage, 2.0);
          devChargeAmount = (rrRate > 0) ? (effectivePlineSqm * ((devRrPct / 100) * rrRate)) : 0;
        } else {
          devChargeAmount = (rrRate > 0) ? (effectivePlineSqm * 0.02 * rrRate) : 0;
        }
        return roundTo(0.02 * devChargeAmount, 2);
      }
      case 'LABOUR_WELFARE_CESS':
        return estimatedCostB > 0 ? 0.01 * estimatedCostB : 0;
      case 'TDR_LOADING_CHARGES':
        return (rrRate > 0 && configuredRrPct !== null) ? effectiveTdrSqm * ((configuredRrPct / 100) * rrRate) : 0;
      case 'AMALGAMATION':
        return 0; // Excluded as approved
      case 'LABOUR_WELFARE_PARKING':
        return Math.max(0, parseNum(item?.amount, 0));
      default:
        return parseNum(item.amount, 0);
    }
  };

  let totalStatutoryDemandA = 0;
  const sourceStatutory = (statutoryItems && statutoryItems.length > 0)
    ? statutoryItems.filter(item => !item.is_deleted)
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
        { charge_code: 'LABOUR_WELFARE_PARKING', charge_name: 'LABOUR WELFARE ON PARKING AREA', is_enabled: true }
      ].map((it, idx) => ({ id: `default-${idx}`, ...it }));

  const evaluatedStatutoryCharges = sourceStatutory.map((item) => {
    const isEnabled = item.is_enabled !== false;

    // LABOUR_WELFARE_PARKING is strictly a direct manual admin input (never a formula override)
    if (item.charge_code === 'LABOUR_WELFARE_PARKING' || item.is_manual === true) {
      const manualAmt = Math.max(0, roundTo(parseNum(item.amount, 0), 2));
      const effectiveAmount = isEnabled ? manualAmt : 0;
      if (isEnabled) totalStatutoryDemandA += effectiveAmount;

      return {
        ...item,
        is_enabled: isEnabled,
        is_manual: true,
        calculated_amount: null,
        effective_amount: effectiveAmount,
        amount: manualAmt,
        has_override: false,
        override_val: null,
        has_basis_drift: false,
        calculated_basis_val: null
      };
    }

    const calculatedAmount = getStatutoryAmount(item.charge_code, item);
    const roundedCalc = roundTo(calculatedAmount, 2);

    const overrideKey = `statutory_${item.charge_code}`;
    const itemOverride = overrides[overrideKey];
    const hasOverride = Boolean(itemOverride && itemOverride.override_val !== undefined && itemOverride.override_val !== null);
    const overrideVal = hasOverride ? parseFloat(itemOverride.override_val) : null;
    const rawBasis = itemOverride ? (itemOverride.calculated_basis_val ?? itemOverride.basis_val) : null;
    const basisVal = hasOverride && rawBasis !== null && rawBasis !== undefined && !isNaN(parseFloat(rawBasis))
      ? parseFloat(rawBasis)
      : null;
    const hasBasisDrift = hasOverride && basisVal !== null && Math.abs(roundedCalc - basisVal) > 1.0;

    const effectiveAmount = isEnabled
      ? (hasOverride ? overrideVal : roundedCalc)
      : 0;

    if (isEnabled) {
      totalStatutoryDemandA += effectiveAmount;
    }

    return {
      ...item,
      is_enabled: isEnabled,
      is_manual: false,
      calculated_amount: roundedCalc,
      effective_amount: effectiveAmount,
      has_override: hasOverride,
      override_val: overrideVal,
      has_basis_drift: hasBasisDrift,
      calculated_basis_val: basisVal
    };
  });

  const resolveCostItem = (key, calculatedVal) => {
    const roundedCalc = roundTo(calculatedVal, 2);
    const itemOverride = overrides[key];
    const hasOverride = itemOverride && itemOverride.override_val !== undefined && itemOverride.override_val !== null;
    const overrideVal = hasOverride ? parseFloat(itemOverride.override_val) : null;
    const basisVal = hasOverride && itemOverride.calculated_basis_val !== undefined && itemOverride.calculated_basis_val !== null
      ? parseFloat(itemOverride.calculated_basis_val)
      : null;
    const hasBasisDrift = hasOverride && basisVal !== null && !isNaN(basisVal) && Math.abs(roundedCalc - basisVal) > 1.0;

    return {
      calculated: roundedCalc,
      effective: hasOverride ? overrideVal : roundedCalc,
      has_override: hasOverride,
      override_val: overrideVal,
      has_basis_drift: hasBasisDrift,
      calculated_basis_val: basisVal
    };
  };

  // 2. COST OF TDR (SECTION B — FR-31: uses configurable tdr_purchase_factor & effective consumed TDR)
  const tdrPurchaseFactor = Math.max(0, parseNum(financial.tdr_purchase_factor, 0.55));
  const calcTdrCost = rrRate > 0 ? effectiveTdrSqm * (tdrPurchaseFactor * rrRate) : 0;
  const costOfTdrB = resolveCostItem('cost_of_tdr', calcTdrCost);

  // 3. ADDITIONAL / NOC EXPENSES (SECTION C)
  const minorExpenses = Math.max(0, parseNum(financial.minor_expenses, 0));
  const bpmsCharges = Math.max(0, parseNum(financial.bpms_staff_charges, 0));
  const airportNoc = Math.max(0, parseNum(financial.airport_noc, 0));
  const fireNoc = Math.max(0, parseNum(financial.fire_noc, 0));
  const entertainment = Math.max(0, parseNum(financial.entertainment_charges, 0));
  const extraStampDuty = Math.max(0, parseNum(financial.extra_stamp_duty, 0));
  const advocateFees = Math.max(0, parseNum(financial.advocate_fees, 0));
  const totalExpensesC = minorExpenses + bpmsCharges + airportNoc + fireNoc + entertainment + extraStampDuty + advocateFees;

  // 4. DEVELOPMENT COSTS (D, E, F, G, H, INFRA, INTEREST)
  // H. Cost of Plot: direct lump-sum only, toggleable inclusion preserving raw amount (FR-16)
  const isCostOfPlotIncluded = financial.is_cost_of_plot_included !== false;
  const rawCostOfPlot = Math.max(0, parseNum(financial.cost_of_plot, 0));
  const calcCostOfPlot = isCostOfPlotIncluded ? rawCostOfPlot : 0;
  const costOfPlotH = resolveCostItem('cost_of_plot', calcCostOfPlot);
  costOfPlotH.is_included = isCostOfPlotIncluded;
  costOfPlotH.raw_amount = costOfPlotH.has_override ? costOfPlotH.override_val : rawCostOfPlot;
  if (!isCostOfPlotIncluded) {
    costOfPlotH.effective = 0;
  }

  // D. Actual Civil Construction Cost (FR-15: decoupled strictly from Cost B; preserves 0)
  const constRate = Math.max(0, parseNum(financial.cost_of_construction_rate, 0));
  const calcConstCost = effectivePlineSqm * constRate;
  const costOfConstructionD = resolveCostItem('cost_of_construction', calcConstCost);

  // E. Basement Construction
  const basementArea = Math.max(0, parseNum(financial.basement_area_sqm, 0));
  const basementRate = Math.max(0, parseNum(financial.basement_rate_per_sqm, 0));
  const calcBasementCost = (basementArea > 0 || basementRate > 0)
    ? (basementArea * basementRate)
    : Math.max(0, parseNum(financial.cost_of_basement, 0));
  const costOfBasementE = resolveCostItem('cost_of_basement', calcBasementCost);

  // F. Rent During Construction
  const rentTenements = Math.max(0, parseInt(parseNum(financial.rent_tenements, 0), 10));
  const rentPerMonth = Math.max(0, parseNum(financial.rent_per_tenement_per_month, 0));
  const rawRentMonths = financial.rent_months !== undefined && financial.rent_months !== null && financial.rent_months !== ''
    ? financial.rent_months
    : financial.period_months;
  const rentMonths = Math.max(0, parseInt(parseNum(rawRentMonths, 0), 10));
  const calcRentCost = (rentTenements > 0 || rentPerMonth > 0)
    ? (rentTenements * rentPerMonth * rentMonths)
    : Math.max(0, parseNum(financial.rent_amount, 0));
  const rentCostF = resolveCostItem('rent_amount', calcRentCost);

  // G. Stacked Parking
  const parkingSlots = Math.max(0, parseInt(parseNum(financial.stacked_parking_slots, 0), 10));
  const parkingSlotCost = Math.max(0, parseNum(financial.stacked_parking_cost_per_slot, 0));
  const calcParkingCost = (parkingSlots > 0 || parkingSlotCost > 0)
    ? (parkingSlots * parkingSlotCost)
    : Math.max(0, parseNum(financial.stacked_parking_cost, 0));
  const stackedParkingCostG = resolveCostItem('stacked_parking_cost', calcParkingCost);

  const costOfInfra = Math.max(0, parseNum(financial.cost_of_infrastructure, 0));
  const interestCost = Math.max(0, parseNum(financial.interest_amount, 0));

  const totalProjectCost =
    totalStatutoryDemandA +
    costOfTdrB.effective +
    totalExpensesC +
    costOfConstructionD.effective +
    costOfBasementE.effective +
    rentCostF.effective +
    stackedParkingCostG.effective +
    costOfPlotH.effective +
    costOfInfra +
    interestCost;

  // 5. RECEIPTS & SALABLE UNITS (Unified model inside Receipts — FR-32)
  let totalReceipts = 0;
  let totalGrossReceipts = 0;
  let totalLandownerReceipts = 0;
  let totalDeveloperUnits = 0;
  let totalLandownerUnits = 0;
  let totalSalableCarpetSqft = 0;
  let totalSalableSuperSqft = 0;

  const evaluatedSalableUnits = (salableUnits || []).map((unit) => {
    const rawCarpetSqft = parseOptNum(unit.carpet_area_sqft);
    const rawCarpetSqm = parseOptNum(unit.carpet_area_sqm);
    let carpetSqft = 0;
    let carpetSqm = 0;
    if (rawCarpetSqft !== null && rawCarpetSqft >= 0 && (rawCarpetSqft > 0 || rawCarpetSqm === null || rawCarpetSqm === 0)) {
      carpetSqft = rawCarpetSqft;
      carpetSqm = carpetSqft / SQM_TO_SQFT;
    } else if (rawCarpetSqm !== null && rawCarpetSqm > 0) {
      carpetSqm = rawCarpetSqm;
      carpetSqft = carpetSqm * SQM_TO_SQFT;
    }

    const loadingMode = unit.loading_mode === 'percentage' ? 'percentage' : 'fixed_sqft';
    const loadingPct = Math.max(0, parseNum(unit.loading_pct, 0));
    const rawLoadingSqft = unit.super_buildup_loading_sqft !== undefined
      ? unit.super_buildup_loading_sqft
      : unit.loading_sqft;
    const loadingSqft = loadingMode === 'percentage'
      ? (carpetSqft * (loadingPct / 100))
      : Math.max(0, parseNum(rawLoadingSqft, 0));

    const superSqft = carpetSqft > 0
      ? (carpetSqft + loadingSqft)
      : Math.max(0, parseNum(unit.super_buildup_area_sqft, 0));

    const totalUnitsCount = Math.max(0, parseInt(parseNum(unit.unit_count, 0), 10));
    const rawLandowner = unit.landowner_unit_count !== undefined ? unit.landowner_unit_count : unit.landowner_units;
    const landownerUnits = Math.min(totalUnitsCount, Math.max(0, parseInt(parseNum(rawLandowner, 0), 10)));
    const developerUnits = Math.max(0, totalUnitsCount - landownerUnits);

    const rateSqft = Math.max(0, parseNum(unit.rate_per_sqft, 0));
    const roundedSuperSqft = roundTo(superSqft, 2);
    const unitPrice = roundTo(roundedSuperSqft * rateSqft, 2);
    const developerAmount = roundTo(unitPrice * developerUnits, 2);
    const grossAmount = roundTo(unitPrice * totalUnitsCount, 2);
    const landownerAmount = roundTo(unitPrice * landownerUnits, 2);

    totalDeveloperUnits += developerUnits;
    totalLandownerUnits += landownerUnits;
    totalReceipts += developerAmount;
    totalGrossReceipts += grossAmount;
    totalLandownerReceipts += landownerAmount;
    totalSalableCarpetSqft += (carpetSqft * totalUnitsCount);
    totalSalableSuperSqft += (roundedSuperSqft * totalUnitsCount);

    return {
      ...unit,
      loading_mode: loadingMode,
      loading_pct: roundTo(loadingPct, 2),
      super_buildup_loading_sqft: roundTo(loadingSqft, 2),
      carpet_area_sqm: roundTo(carpetSqm, 4),
      carpet_area_sqft: roundTo(carpetSqft, 2),
      super_buildup_area_sqft: roundedSuperSqft,
      unit_count: totalUnitsCount,
      landowner_unit_count: landownerUnits,
      developer_unit_count: developerUnits,
      rate_per_sqft: roundTo(rateSqft, 2),
      unit_price: unitPrice,
      total_amount: grossAmount,
      developer_amount: developerAmount,
      landowner_amount: landownerAmount
    };
  });

  // 6. PROJECT VIABILITY SUMMARY
  const netProfit = totalReceipts - totalProjectCost;
  const roiPct = totalProjectCost > 0 ? (netProfit / totalProjectCost) * 100 : 0;
  const profitMarginPct = totalReceipts > 0 ? (netProfit / totalReceipts) * 100 : 0;

  const isConfigured = (effectivePlineSqm > 0 && rrRate > 0) || totalProjectCost > 0 || totalReceipts > 0;

  return {
    isConfigured,
    rrRate,
    tdrPurchaseFactor,
    estimatedCostA,
    estimatedCostB,
    totalStatutoryDemandA: roundTo(totalStatutoryDemandA, 2),
    costOfTdrB: costOfTdrB.effective,
    costOfTdrB_details: costOfTdrB,
    totalExpensesC: roundTo(totalExpensesC, 2),
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
    costOfInfrastructure: roundTo(costOfInfra, 2),
    interestAmount: roundTo(interestCost, 2),
    totalProjectCost: roundTo(totalProjectCost, 2),
    totalReceipts: roundTo(totalReceipts, 2),
    totalGrossReceipts: roundTo(totalGrossReceipts, 2),
    totalLandownerReceipts: roundTo(totalLandownerReceipts, 2),
    totalDeveloperUnits,
    totalLandownerUnits,
    netProfit: roundTo(netProfit, 2),
    roiPct: roundTo(roiPct, 2),
    profitMarginPct: roundTo(profitMarginPct, 2),

    evaluatedStatutoryCharges,
    evaluatedSalableUnits,
    totalSalableCarpetSqft: roundTo(totalSalableCarpetSqft, 2),
    totalSalableSuperSqft: roundTo(totalSalableSuperSqft, 2)
  };
}

module.exports = {
  SQM_TO_SQFT,
  ROAD_WIDTH_TDR_MAP,
  ROAD_WIDTH_TOTAL_TDR_MAP,
  REGULATORY_PROFILES,
  parseNum,
  parseOptNum,
  validateAreaStatementInputs,
  deriveTdrSplit,
  resolvePermissibleTdr,
  distributePlineEqually,
  distributeFsiAndAncillary,
  calculateParkingRequirements,
  calculateAreaMetrics,
  calculateFinancialMetrics
};

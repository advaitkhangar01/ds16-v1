// server/services/feasibilityEngine.js
// Authoritative calculation engine for Project Area Statement & Financial Viability
// Implements all Scope-Corrected DS16 rules cleanly from one backend source of truth.

const SQM_TO_SQFT = 10.7639104167;
const AREA_BALANCE_ROUNDING_TOLERANCE_SQM = 0.05;

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
 * Resolve underlying Road-Width TDR split vs Plot-Classification Eligibility:
 * - Total TDR is strictly derived from ROAD_WIDTH_TOTAL_TDR_MAP when road_width_m is set.
 * - Underlying Regular + Slum TDR split defaults to 50/50 and is NOT destroyed when Gunthewari changes.
 * - Regular plot eligibility: Eligible Regular = regularTdrFactor, Eligible Slum = slumTdrFactor, Eligible Total = Total TDR.
 * - Gunthewari plot eligibility: Eligible Regular = 0 (locked), Eligible Slum = Total TDR × 50%, Eligible Total = Eligible Slum only.
 */
function resolvePermissibleTdr(statement = {}) {
  const isGunthewari = Boolean(statement.is_gunthewari);
  const roadWidth = parseOptNum(statement.road_width_m);
  const explicitTotal = parseOptNum(statement.total_tdr_factor);
  const legacyTdr = parseOptNum(statement.tdr_factor);
  let explicitReg = parseOptNum(statement.regular_tdr_factor);
  let explicitSlum = parseOptNum(statement.slum_tdr_factor);
  const hasExplicitRegOverrideFlag = statement.is_regular_tdr_overridden === true;

  const roadTotal = (roadWidth !== null && ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] !== undefined)
    ? ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth]
    : null;

  // Treat legacy schema-default (0, 0) or un-overridden 9m (0.40, 0.00) legacy defect as unset so 50/50 split applies cleanly
  if (
    !hasExplicitRegOverrideFlag &&
    ((explicitReg === 0 && (explicitSlum === null || explicitSlum === 0)) ||
     (roadWidth === 9 && explicitReg === 0.40 && (explicitSlum === null || explicitSlum === 0))) &&
    (roadTotal !== null || (legacyTdr !== null && legacyTdr > 0))
  ) {
    explicitReg = null;
    explicitSlum = null;
  }

  let baseTotal = 0.65;
  if (roadTotal !== null) {
    baseTotal = roadTotal;
  } else if (explicitTotal !== null) {
    baseTotal = explicitTotal;
  } else if (explicitReg !== null && explicitSlum !== null && (explicitReg > 0 || explicitSlum > 0 || legacyTdr === 0)) {
    baseTotal = roundTo(explicitReg + explicitSlum, 4);
  } else if (legacyTdr !== null) {
    baseTotal = legacyTdr;
  }

  // On Gunthewari, legacy records sometimes saved regular_tdr_factor=0; preserve 50/50 underlying split unless overridden
  let effectiveReqRegForSplit = explicitReg;
  if (isGunthewari && !hasExplicitRegOverrideFlag && effectiveReqRegForSplit === 0) {
    effectiveReqRegForSplit = null;
  }
  const split = deriveTdrSplit(baseTotal, effectiveReqRegForSplit);

  if (isGunthewari) {
    let eligibleSlum = 0;
    if (roadWidth !== null && ROAD_WIDTH_TDR_MAP[roadWidth]) {
      eligibleSlum = ROAD_WIDTH_TDR_MAP[roadWidth].gunthewari;
    } else if (explicitSlum !== null && explicitSlum >= 0 && explicitTotal === null) {
      eligibleSlum = roundTo(explicitSlum, 4);
    } else {
      eligibleSlum = roundTo(split.totalTdrFactor * 0.5, 4);
    }

    return {
      isGunthewari: true,
      roadWidth,
      totalTdrFactor: split.totalTdrFactor,
      regularTdrFactor: split.regularTdrFactor,
      slumTdrFactor: split.slumTdrFactor,
      defaultRegularTdrFactor: split.defaultRegularTdrFactor,
      defaultSlumTdrFactor: split.defaultSlumTdrFactor,
      isRegularTdrOverridden: split.isRegularTdrOverridden,
      eligibleRegularTdrFactor: 0,
      eligibleSlumTdrFactor: eligibleSlum,
      eligibleTdrFactor: eligibleSlum,
      suggestedRoadTdrFactor: eligibleSlum
    };
  }

  return {
    isGunthewari: false,
    roadWidth,
    totalTdrFactor: split.totalTdrFactor,
    regularTdrFactor: split.regularTdrFactor,
    slumTdrFactor: split.slumTdrFactor,
    defaultRegularTdrFactor: split.defaultRegularTdrFactor,
    defaultSlumTdrFactor: split.defaultSlumTdrFactor,
    isRegularTdrOverridden: split.isRegularTdrOverridden,
    eligibleRegularTdrFactor: split.regularTdrFactor,
    eligibleSlumTdrFactor: split.slumTdrFactor,
    eligibleTdrFactor: split.totalTdrFactor,
    suggestedRoadTdrFactor: roadTotal !== null ? roadTotal : 0
  };
}

/**
 * Check whether a floor contributes vertical height above ground datum toward building height H (Margin H/5).
 * Subterranean Basements and roof Terrace / tank slabs contribute 0m; Ground, Stilt, Upper Parking, and upper habitable floors contribute.
 */
function isHeightContributingFloor(floor = {}) {
  const fkey = String(floor.floor_key || '').toLowerCase();
  const fname = String(floor.floor_name || '').toLowerCase();
  const ftype = String(floor.floor_type || '').toLowerCase();
  if (fkey.startsWith('basement') || fname.includes('basement')) return false;
  if (ftype === 'terrace' || fkey === 'terrace' || fname.includes('terrace')) return false;
  return true;
}

/**
 * Authoritative validation of Area Statement and optional Floor inputs (never silently clamps invalid values).
 */
function validateAreaStatementInputs(statement = {}, floors = []) {
  const plotArea = parseOptNum(statement.plot_area_sqm);
  const dpDed = parseOptNum(statement.dp_deductions_sqm);
  const basicFsi = parseOptNum(statement.basic_fsi_factor);
  const paidFsi = parseOptNum(statement.paid_fsi_factor);
  const propPaidFsi = parseOptNum(statement.proposed_paid_fsi_factor);
  const propRegTdr = parseOptNum(statement.proposed_regular_tdr_factor);
  const propSlumTdr = parseOptNum(statement.proposed_slum_tdr_factor);
  const primaryResPct = parseOptNum(statement.primary_fsi_residential_pct);
  const primaryCommPct = parseOptNum(statement.primary_fsi_commercial_pct);
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
    return { valid: false, error: 'Residential Primary FSI allocation (%) must be between 0 and 100.' };
  }
  if (primaryCommPct !== null && (primaryCommPct < 0 || primaryCommPct > 100)) {
    return { valid: false, error: 'Commercial Primary FSI allocation (%) must be between 0 and 100.' };
  }

  const rawUse = String(statement.building_use || 'Residential').trim().toLowerCase();
  if (rawUse.includes('mixed')) {
    if (primaryResPct !== null && primaryCommPct !== null) {
      if (Math.abs((primaryResPct + primaryCommPct) - 100) > 0.01) {
        return {
          valid: false,
          error: `Mixed-Use Primary FSI allocations must total 100% (Residential ${primaryResPct}% + Commercial ${primaryCommPct}% = ${roundTo(primaryResPct + primaryCommPct, 2)}%).`
        };
      }
      if (primaryResPct <= 0 || primaryCommPct <= 0) {
        return {
          valid: false,
          error: 'Mixed Use requires both Residential and Commercial allocations to be greater than 0%. Select Residential or Commercial instead.'
        };
      }
    } else if (primaryResPct !== null && (primaryResPct <= 0 || primaryResPct >= 100)) {
      return {
        valid: false,
        error: 'Mixed Use requires both Residential and Commercial allocations to be greater than 0%. Select Residential or Commercial instead.'
      };
    } else if (primaryCommPct !== null && (primaryCommPct <= 0 || primaryCommPct >= 100)) {
      return {
        valid: false,
        error: 'Mixed Use requires both Residential and Commercial allocations to be greater than 0%. Select Residential or Commercial instead.'
      };
    }
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
    if (statement.is_regular_tdr_overridden === true && reqReg !== null && reqReg > 0.0001 && roadWidth !== null && Math.abs(reqReg - ROAD_WIDTH_TDR_MAP[roadWidth].regular) > 0.0001) {
      return { valid: false, error: 'Regular TDR cannot be overridden for Gunthewari plots (Slum TDR only).' };
    }
    if (propRegTdr !== null && propRegTdr > 0.0001) {
      return { valid: false, error: 'Proposed Regular TDR cannot exceed 0 for Gunthewari plots (Slum TDR only).' };
    }
    const maxGunthSlum = roadWidth !== null && ROAD_WIDTH_TDR_MAP[roadWidth]
      ? ROAD_WIDTH_TDR_MAP[roadWidth].gunthewari
      : (reqSlum ?? (reqTotal !== null ? roundTo(reqTotal * 0.5, 4) : 0));
    const roadTotal = roadWidth !== null ? ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] : null;

    if (roadTotal !== null && reqTotal !== null && Math.abs(reqTotal - roadTotal) > 0.0001 && Math.abs(reqTotal - maxGunthSlum) > 0.0001) {
      return {
        valid: false,
        error: `Total TDR for ${roadWidth}m road is strictly road-width derived (${roadTotal}; Gunthewari eligible Slum TDR = ${maxGunthSlum}).`
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
  } else {
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

    const effectiveReqReg = (
      statement.is_regular_tdr_overridden !== true &&
      reqReg === 0 &&
      (reqSlum === null || reqSlum === 0)
    ) ? null : reqReg;

    const split = deriveTdrSplit(baseTotal, effectiveReqReg);
    if (!split.isSplitValid) {
      return { valid: false, error: split.validationError };
    }

    if (roadWidth !== null && reqSlum !== null && !(reqReg === 0 && reqSlum === 0) && Math.abs(reqSlum - split.slumTdrFactor) > 0.0001) {
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
    const combinedPropTdr = (propRegTdr || 0) + (propSlumTdr || 0);
    if (combinedPropTdr > baseTotal + 0.0001) {
      return { valid: false, error: `Combined Proposed TDR (${roundTo(combinedPropTdr, 4)}) cannot exceed Total Eligible TDR (${baseTotal}).` };
    }
  }

  // Validate floor inputs if supplied (Lobby <= P-Line, non-negative height/pline, non-negative integer units)
  if (Array.isArray(floors)) {
    for (const fl of floors) {
      if (!fl || fl.is_active === false) continue;
      const fname = fl.floor_name || 'Floor';
      const h = parseOptNum(fl.height_meters);
      if (h !== null && h < 0) {
        return { valid: false, error: `${fname}: Height cannot be negative.` };
      }
      const pline = parseOptNum(fl.pline_area_sqm);
      if (pline !== null && pline < 0) {
        return { valid: false, error: `${fname}: P-Line Area cannot be negative.` };
      }
      const isLobbyOv = Boolean(fl.is_lobby_overridden);
      const lobby = parseOptNum(fl.lobby_area_sqm);
      if (lobby !== null && lobby < 0) {
        return { valid: false, error: `${fname}: Lobby Area cannot be negative.` };
      }
      if (isLobbyOv && pline !== null && lobby !== null && lobby > pline + 0.0001) {
        return { valid: false, error: `${fname}: Lobby Area (${lobby} sq m) cannot exceed P-Line Area (${pline} sq m).` };
      }
      if (fl.no_of_units !== undefined && fl.no_of_units !== null && fl.no_of_units !== '') {
        const uNum = Number(fl.no_of_units);
        if (!Number.isFinite(uNum) || !Number.isInteger(uNum) || uNum < 0) {
          return { valid: false, error: `${fname}: No. of Units must be a non-negative integer.` };
        }
      }
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
    eligibleRegularTdrFactor,
    eligibleSlumTdrFactor,
    eligibleTdrFactor,
    suggestedRoadTdrFactor
  } = tdrPermissible;
  const permissibleTdrFactor = eligibleTdrFactor;

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

  // Also normalize explicit Res + Comm Mixed Use fallback if primary_fsi_commercial_pct set alongside residential
  if (isMixedUse && explicitResPct !== null && explicitCommPct !== null) {
    primaryFsiResidentialPct = Math.max(0, Math.min(100, roundTo(explicitResPct, 2)));
    primaryFsiCommercialPct = Math.max(0, Math.min(100, roundTo(explicitCommPct, 2)));
  }

  // 5. Permissible Areas & Ancillary (FR-03, FR-04, FR-11, Section 4.3 Eligibility)
  const permissibleFsiSqm = plotableAreaSqm * basicFsiFactor;
  const permissiblePaidFsiSqm = plotableAreaSqm * paidFsiFactor;
  const underlyingRegularTdrSqm = plotableAreaSqm * regularTdrFactor;
  const underlyingSlumTdrSqm = plotableAreaSqm * slumTdrFactor;
  const underlyingTotalTdrSqm = plotableAreaSqm * totalTdrFactor;
  const permissibleRegularTdrSqm = plotableAreaSqm * eligibleRegularTdrFactor;
  const permissibleSlumTdrSqm = plotableAreaSqm * eligibleSlumTdrFactor;
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
  // Never automatically consume 100% of permissible Paid FSI or TDR: default suggestion = 0 unless P-Line demand exceeds Basic FSI.
  const isProposedPlineOverridden = Boolean(statement.is_proposed_pline_overridden);
  const totalProposedPlineOverrideSqm = parseOptNum(statement.total_proposed_pline_override_sqm);

  const isFloorOverridden = (f) => {
    if (f.is_pline_overridden === true) return true;
    if (f.is_pline_overridden === false) return false;
    return !f.floor_key && parseFloat(f.pline_area_sqm) > 0;
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

  let suggestedPaidFsiFactor = 0;
  let suggestedRegularTdrFactor = 0;
  let suggestedSlumTdrFactor = 0;

  if (designPrimaryFsiNeededSqm !== null && plotableAreaSqm > 0) {
    const additionalFsiNeeded = Math.max(0, designPrimaryFsiNeededSqm - permissibleFsiSqm);
    const additionalFactorNeeded = additionalFsiNeeded / plotableAreaSqm;

    suggestedPaidFsiFactor = Math.min(paidFsiFactor, roundTo(additionalFactorNeeded, 4));
    const remainingAfterPaid = Math.max(0, additionalFactorNeeded - suggestedPaidFsiFactor);
    const neededTdrTotal = Math.min(eligibleTdrFactor, roundTo(remainingAfterPaid, 4));

    if (isGunthewari) {
      suggestedRegularTdrFactor = 0;
      suggestedSlumTdrFactor = Math.min(eligibleSlumTdrFactor, neededTdrTotal);
    } else if (eligibleTdrFactor > 0) {
      suggestedRegularTdrFactor = Math.min(
        eligibleRegularTdrFactor,
        roundTo(neededTdrTotal * (eligibleRegularTdrFactor / eligibleTdrFactor), 4)
      );
      let rawSlum = roundTo(neededTdrTotal - suggestedRegularTdrFactor, 4);
      if (rawSlum > eligibleSlumTdrFactor) {
        const excess = roundTo(rawSlum - eligibleSlumTdrFactor, 4);
        suggestedRegularTdrFactor = Math.min(eligibleRegularTdrFactor, roundTo(suggestedRegularTdrFactor + excess, 4));
        rawSlum = eligibleSlumTdrFactor;
      }
      suggestedSlumTdrFactor = Math.max(0, rawSlum);
    }
  }
  const suggestedTdrFactor = roundTo(suggestedRegularTdrFactor + suggestedSlumTdrFactor, 4);

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
    Math.abs(legacyProposedTdr - suggestedTdrFactor) > 0.0001
  ) {
    // Legacy compatibility (e.g. sample proposed_tdr_factor = 0.545 vs 0.65)
    const legacyFactor = roundTo(legacyProposedTdr, 4);
    if (isGunthewari) {
      effectiveProposedRegularTdrFactor = 0;
      effectiveProposedSlumTdrFactor = legacyFactor;
    } else if (eligibleTdrFactor > 0) {
      effectiveProposedRegularTdrFactor = roundTo(legacyFactor * (eligibleRegularTdrFactor / eligibleTdrFactor), 4);
      effectiveProposedSlumTdrFactor = roundTo(legacyFactor - effectiveProposedRegularTdrFactor, 4);
    }
    isProposedTdrEdited = true;
  }

  const totalProposedTdrFactor = roundTo(effectiveProposedRegularTdrFactor + effectiveProposedSlumTdrFactor, 4);

  // Calculated (Auto-Suggested) vs Effective (Consumed/Chargeable) vs Remaining Eligible Areas
  const proposedBasicFsiSqm = permissibleFsiSqm;
  const calculatedProposedPaidFsiSqm = plotableAreaSqm * suggestedPaidFsiFactor;
  const proposedPaidFsiSqm = plotableAreaSqm * effectiveProposedPaidFsiFactor;
  const remainingPaidFsiFactor = roundTo(Math.max(0, paidFsiFactor - effectiveProposedPaidFsiFactor), 4);
  const remainingPaidFsiSqm = roundTo(Math.max(0, permissiblePaidFsiSqm - proposedPaidFsiSqm), 4);

  const calculatedProposedRegularTdrSqm = plotableAreaSqm * suggestedRegularTdrFactor;
  const calculatedProposedSlumTdrSqm = plotableAreaSqm * suggestedSlumTdrFactor;
  const calculatedProposedTdrSqm = calculatedProposedRegularTdrSqm + calculatedProposedSlumTdrSqm;

  const regularTdrSqm = plotableAreaSqm * effectiveProposedRegularTdrFactor;
  const slumTdrSqm = plotableAreaSqm * effectiveProposedSlumTdrFactor;
  const proposedTdrSqm = regularTdrSqm + slumTdrSqm;

  const remainingRegularTdrFactor = roundTo(Math.max(0, eligibleRegularTdrFactor - effectiveProposedRegularTdrFactor), 4);
  const remainingSlumTdrFactor = roundTo(Math.max(0, eligibleSlumTdrFactor - effectiveProposedSlumTdrFactor), 4);
  const remainingTdrFactor = roundTo(remainingRegularTdrFactor + remainingSlumTdrFactor, 4);
  const remainingRegularTdrSqm = roundTo(Math.max(0, permissibleRegularTdrSqm - regularTdrSqm), 4);
  const remainingSlumTdrSqm = roundTo(Math.max(0, permissibleSlumTdrSqm - slumTdrSqm), 4);
  const remainingTdrSqm = roundTo(Math.max(0, permissibleTdrSqm - proposedTdrSqm), 4);

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

  if (isMixedUse && isPrimaryFsiSplitExplicit) {
    if (N_comm > 0 && N_res > 0) {
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
    } else if (N_habitable > 0) {
      // Floors lack per-floor Commercial vs Residential tags; distribute exact Weighted P-Line proportionally across floors
      const weightedAncillaryTotal = (targetProposedFsi * commRatio * commAncillaryPct) + (targetProposedFsi * resRatio * resAncillaryPct);
      const weightedPlineTarget = targetProposedFsi + weightedAncillaryTotal;
      const plineDist = distributePlineEqually(weightedPlineTarget, applicableHabitableFloors);
      isPlineInconsistent = plineDist.isPlineInconsistent;
      plineInconsistencyMessage = plineDist.plineInconsistencyMessage;
      for (const fl of applicableHabitableFloors) {
        const key = fl.id || fl.floor_key || fl.floor_name;
        const entry = plineDist.assignedMap.get(key) || plineDist.assignedMap.get(applicableHabitableFloors.indexOf(fl));
        if (entry) {
          const shareRatio = weightedPlineTarget > 0 ? (entry.pline / weightedPlineTarget) : (1 / N_habitable);
          const flFsi = roundTo(targetProposedFsi * shareRatio, 4);
          const flAnc = roundTo(entry.pline - flFsi, 2);
          assignedMap.set(key, {
            fsi: flFsi,
            ancillary: flAnc,
            pline: entry.pline,
            is_overridden: entry.is_overridden,
            ancillary_pct: targetWeightedMultiplier - 1
          });
        }
      }
    }
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

  // 8. Floor Rows Aggregation (Approved 6-Column Unit Structure + Building Height H)
  let proposedResidentialFsiSqm = 0;
  let proposedCommercialFsiSqm = 0;
  let proposedResidentialAncillarySqm = 0;
  let proposedCommercialAncillarySqm = 0;
  let totalProposedPlineSqm = 0;
  let totalLobbyAreaSqm = 0;
  let totalSaleableRaw = 0;
  let totalHeightMeters = 0;
  let excludedHeightFloorsCount = 0;
  let totalUnitsCount = 0;

  const evaluatedFloors = activeFloors.map((floor) => {
    const usage = getFloorUsage(floor);
    const isParking = usage === 'Parking';
    const isTerrace = usage === 'Terrace' || usage === 'Services';
    const isHabitable = !isParking && !isTerrace;
    const contributesToHeight = isHeightContributingFloor(floor);

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

    const defaultZeroHeight = !contributesToHeight ? 0 : 3.00;
    const height = parseNum(floor.height_meters, defaultZeroHeight);
    if (contributesToHeight) {
      totalHeightMeters += height;
    } else {
      excludedHeightFloorsCount += 1;
    }

    // Lobby Area = P-Line * 15% default unless manually overridden; never re-applied iteratively
    const isLobbyOverridden = Boolean(floor.is_lobby_overridden);
    let lobby = parseFloat(floor.lobby_area_sqm);
    const calculatedLobby = isHabitable ? roundTo(pline * 0.15, 2) : 0;
    if (!isHabitable) {
      lobby = 0;
    } else if (!isLobbyOverridden || isNaN(lobby)) {
      lobby = calculatedLobby;
    }

    // Section 8.3: Total Saleable Area = P-Line Area - Lobby Area (never silently clamped)
    let saleRaw = 0;
    if (isHabitable) {
      if (floor.pline_area_sqm === undefined && floor.builtup_for_sale_sqm !== undefined && floor.builtup_for_sale_sqm !== null) {
        saleRaw = parseFloat(floor.builtup_for_sale_sqm) || 0;
      } else {
        saleRaw = pline - lobby;
      }
    }
    const saleDisplay = roundTo(saleRaw, 4);

    let noOfUnits = parseInt(floor.no_of_units, 10);
    if (floor.no_of_units === undefined || floor.no_of_units === null || floor.no_of_units === '' || isNaN(noOfUnits)) {
      noOfUnits = isHabitable ? 1 : 0;
    }
    if (!isHabitable || noOfUnits < 0) noOfUnits = 0;

    // Section 8.4: Built-up for Sale (1 Unit) = (P-Line - Lobby) / No. of Units in full precision
    const areaFor1UnitRaw = (isHabitable && noOfUnits > 0) ? (saleRaw / noOfUnits) : null;
    const areaFor1Unit = areaFor1UnitRaw !== null ? roundTo(areaFor1UnitRaw, 4) : 0;
    const areaFor1UnitSqft = areaFor1UnitRaw !== null ? areaFor1UnitRaw * SQM_TO_SQFT : null;

    totalProposedPlineSqm += pline;
    totalLobbyAreaSqm += lobby;
    if (isHabitable) {
      totalSaleableRaw += saleRaw;
      totalUnitsCount += noOfUnits;
    }

    return {
      ...floor,
      usage_type: usage,
      height_meters: height,
      contributes_to_height: contributesToHeight,
      fsi_area_sqm: roundTo(fsi, 2),
      ancillary_area_sqm: roundTo(ancillary, 2),
      ancillary_pct: ancPct,
      pline_area_sqm: roundTo(pline, 2),
      calculated_pline_sqm: roundTo(pline, 2),
      is_pline_overridden: isPlineOverridden,
      lobby_area_sqm: roundTo(lobby, 2),
      calculated_lobby_sqm: calculatedLobby,
      is_lobby_overridden: isLobbyOverridden,
      builtup_for_owners_sqm: 0,
      builtup_for_sale_sqm: roundTo(saleRaw, 2),
      total_saleable_area_sqm: saleDisplay,
      no_of_units: noOfUnits,
      area_for_1_unit_raw: areaFor1UnitRaw,
      area_for_1_unit: areaFor1Unit,
      area_for_1_unit_sqft: areaFor1UnitSqft,
      total_floor_area_sqm: roundTo(pline, 2),
      pline_area_sqft: pline * SQM_TO_SQFT,
      lobby_area_sqft: lobby * SQM_TO_SQFT,
      builtup_for_sale_sqft: saleRaw * SQM_TO_SQFT
    };
  });

  // Ensure Mixed-Use Table 1 & Floor totals reconcile cleanly when explicit % allocation is active
  if (N_habitable === 0 || (isMixedUse && isPrimaryFsiSplitExplicit && (N_comm === 0 || N_res === 0))) {
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
  const totalBuiltupForSaleSqm = roundTo(totalSaleableRaw, 2);
  const weightedAverageAreaPerUnitRaw = totalUnitsCount > 0 ? (totalSaleableRaw / totalUnitsCount) : null;
  const weightedAverageAreaPerUnitSqm = weightedAverageAreaPerUnitRaw !== null ? roundTo(weightedAverageAreaPerUnitRaw, 4) : null;
  const weightedAverageAreaPerUnitSqft = weightedAverageAreaPerUnitRaw !== null ? roundTo(weightedAverageAreaPerUnitRaw * SQM_TO_SQFT, 4) : null;
  totalHeightMeters = roundTo(totalHeightMeters, 2);

  const marginHBy5Meters = roundTo(totalHeightMeters / 5, 2);

  const calculatedProposedPlineSqm = N_habitable > 0
    ? totalProposedPlineSqm
    : roundTo(proposedTotalBuiltupSqm + totalProposedAncillarySqm, 2);
  const effectiveProposedPlineSqm = (isProposedPlineOverridden && totalProposedPlineOverrideSqm !== null)
    ? totalProposedPlineOverrideSqm
    : calculatedProposedPlineSqm;

  // Derived Compliance Checks, Area Balance & Documented Tolerance (Section 9)
  const proposedAfterExistingSqm = Math.max(0, totalProposedPlineSqm - existingBuiltup);
  const baseDividingFactorSqm = dividingFactor > 0 ? (proposedAfterExistingSqm / dividingFactor) : 0;
  const derivedAncillaryAreaSqm = Math.max(0, totalProposedPlineSqm - baseDividingFactorSqm);
  const basicFsiOfPlotSqm = plotableAreaSqm * basicFsiFactor;
  const tdrOfPlotSqm = plotableAreaSqm * 0.30;
  const paidFsiRequiredSqm = Math.max(0, baseDividingFactorSqm - basicFsiOfPlotSqm - tdrOfPlotSqm);

  // Area Balance strictly = Permissible P-Line - Total Proposed Floor P-Line Sum (with documented tolerance)
  const areaBalanceExactSqm = roundTo(permissiblePlineTotalSqm - totalProposedPlineSqm, 4);
  const areaBalanceSqm = roundTo(areaBalanceExactSqm, 2);
  const singleAncillaryPct = isCommercial ? commAncillaryPct : resAncillaryPct;
  const table1ProposedCommAncSqm = roundTo((proposedTotalBuiltupSqm * commRatio) * commAncillaryPct, 2);
  const table1ProposedResAncSqm = roundTo((proposedTotalBuiltupSqm * resRatio) * resAncillaryPct, 2);
  const table1ProposedTotalAncSqm = roundTo(table1ProposedCommAncSqm + table1ProposedResAncSqm, 2);
  const table1ProposedPlineTotalSqm = roundTo(proposedTotalBuiltupSqm + table1ProposedTotalAncSqm, 2);
  const targetVsFloorSumDiffSqm = roundTo(table1ProposedPlineTotalSqm - totalProposedPlineSqm, 4);
  const isAreaBalanceWithinTolerance = Math.abs(areaBalanceExactSqm) <= AREA_BALANCE_ROUNDING_TOLERANCE_SQM;
  const isFloorSumWithinRoundingTolerance = Math.abs(targetVsFloorSumDiffSqm) <= AREA_BALANCE_ROUNDING_TOLERANCE_SQM;

  const isConfigured = (plotAreaSqm > 0) || (activeFloors.length > 0);
  const requiredTdrSqm = Math.max(0, proposedTotalBuiltupSqm - proposedBasicFsiSqm - proposedPaidFsiSqm);

  // Reference comparison values (legacy compatibility)
  const sourceUnallocatedResidentialAncillarySqm = roundTo(permissibleTotalBuiltupSqm * resAncillaryPct, 3);
  const sourceUnallocatedCommercialAncillarySqm = roundTo(permissibleTotalBuiltupSqm * commAncillaryPct, 3);
  const sourceUnallocatedPermissiblePlineSqm = roundTo(permissibleTotalBuiltupSqm + sourceUnallocatedResidentialAncillarySqm + sourceUnallocatedCommercialAncillarySqm, 3);
  const floorSumPlineSqm = roundTo(totalProposedPlineSqm, 3);
  const sourceProposedPlineDifferenceSqm = roundTo(effectiveProposedPlineSqm - totalProposedPlineSqm, 3);

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
    eligibleRegularTdrFactor,
    eligibleSlumTdrFactor,
    eligibleTdrFactor,
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

    // Permissible Column (FR-03, FR-04, FR-08, FR-11, Section 4.3 Eligibility)
    basicFsiFactor,
    paidFsiFactor,
    permissiblePaidFsiFactor: paidFsiFactor,
    permissibleFsiSqm,
    permissiblePaidFsiSqm,
    underlyingTotalTdrSqm,
    underlyingRegularTdrSqm,
    underlyingSlumTdrSqm,
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

    // Auto-Suggested vs Effective Proposed vs Remaining Eligible (FR-05, FR-09)
    suggestedPaidFsiFactor,
    effectiveProposedPaidFsiFactor,
    isProposedPaidFsiEdited,
    calculatedProposedPaidFsiSqm,
    remainingPaidFsiFactor,
    remainingPaidFsiSqm,

    suggestedRegularTdrFactor,
    suggestedSlumTdrFactor,
    suggestedTdrFactor,
    effectiveProposedRegularTdrFactor,
    effectiveProposedSlumTdrFactor,
    isProposedTdrEdited,
    calculatedProposedRegularTdrSqm,
    calculatedProposedSlumTdrSqm,
    calculatedProposedTdrSqm,
    remainingRegularTdrFactor,
    remainingSlumTdrFactor,
    remainingTdrFactor,
    remainingRegularTdrSqm,
    remainingSlumTdrSqm,
    remainingTdrSqm,

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
    totalBuiltupForOwnersSqm: 0,
    totalBuiltupForOwnersSqft: 0,
    totalBuiltupForSaleSqm,
    totalBuiltupForSaleSqft: totalSaleableRaw * SQM_TO_SQFT,
    totalSaleableAreaSqm: totalBuiltupForSaleSqm,
    totalSaleableAreaSqft: totalSaleableRaw * SQM_TO_SQFT,
    weightedAverageAreaPerUnitRaw,
    weightedAverageAreaPerUnitSqm,
    weightedAverageAreaPerUnitSqft,
    totalOwnersAndSaleSqm: totalBuiltupForSaleSqm,
    totalOwnersAndSaleSqft: totalSaleableRaw * SQM_TO_SQFT,
    totalHeightMeters,
    excludedHeightFloorsCount,
    marginHBy5Meters,
    totalUnitsCount,

    proposedAfterExistingSqm,
    baseDividingFactorSqm,
    derivedAncillaryAreaSqm,
    basicFsiOfPlotSqm,
    tdrOfPlotSqm,
    paidFsiRequiredSqm,
    areaBalanceExactSqm,
    areaBalanceSqm,
    targetVsFloorSumDiffSqm,
    roundingToleranceSqm: AREA_BALANCE_ROUNDING_TOLERANCE_SQM,
    isAreaBalanceWithinTolerance,
    isFloorSumWithinRoundingTolerance,

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

  // 5. RECEIPTS & SALABLE UNITS (Unified model inside Receipts — FR-32 & Section 8.6 Floor-wise integration)
  let totalReceipts = 0;
  let totalGrossReceipts = 0;
  let totalLandownerReceipts = 0;
  let totalDeveloperUnits = 0;
  let totalLandownerUnits = 0;
  let totalSalableCarpetSqft = 0;
  let totalSalableSuperSqft = 0;

  const evalFloorMap = new Map();
  const floorUnitAreas = [];
  for (const ef of (areaMetrics.evaluatedFloors || [])) {
    if (ef && ef.id !== undefined && ef.id !== null) {
      evalFloorMap.set(Number(ef.id), ef);
    }
    const isHab = ef.floor_type !== 'parking' && ef.floor_type !== 'terrace' && ef.floor_type !== 'service';
    if (isHab && (ef.no_of_units || 0) > 0) {
      const unitSqm = ef.area_for_1_unit_raw ?? ef.area_for_1_unit ?? 0;
      floorUnitAreas.push({
        floor_id: ef.id,
        floor_name: ef.floor_name,
        usage_type: ef.usage_type || 'Residential',
        no_of_units: ef.no_of_units,
        area_per_unit_sqm: roundTo(unitSqm, 4),
        area_per_unit_sqft: roundTo(unitSqm * SQM_TO_SQFT, 4)
      });
    }
  }

  const evaluatedSalableUnits = (salableUnits || []).map((unit) => {
    const linkedFloor = unit.source_floor_id !== null && unit.source_floor_id !== undefined
      ? evalFloorMap.get(Number(unit.source_floor_id))
      : null;

    const rawCarpetSqft = parseOptNum(unit.carpet_area_sqft);
    const rawCarpetSqm = parseOptNum(unit.carpet_area_sqm);
    let carpetSqft = 0;
    let carpetSqm = 0;
    let hasFloorLink = false;

    if (linkedFloor && (linkedFloor.no_of_units || 0) > 0) {
      hasFloorLink = true;
      carpetSqm = parseNum(linkedFloor.area_for_1_unit_raw ?? linkedFloor.area_for_1_unit, 0);
      carpetSqft = carpetSqm * SQM_TO_SQFT;
    } else if (rawCarpetSqft !== null && rawCarpetSqft >= 0 && (rawCarpetSqft > 0 || rawCarpetSqm === null || rawCarpetSqm === 0)) {
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

    const totalUnitsCount = hasFloorLink
      ? Math.max(0, parseInt(parseNum(linkedFloor.no_of_units, 0), 10))
      : Math.max(0, parseInt(parseNum(unit.unit_count, 0), 10));
    const rawLandowner = unit.landowner_unit_count !== undefined ? unit.landowner_unit_count : unit.landowner_units;
    const landownerUnits = Math.min(totalUnitsCount, Math.max(0, parseInt(parseNum(rawLandowner, 0), 10)));
    const developerUnits = Math.max(0, totalUnitsCount - landownerUnits);

    const rateSqft = Math.max(0, parseNum(unit.rate_per_sqft, 0));
    // Full precision for Section 8.6 floor-linked areas; legacy manual rows preserve 2-decimal super_buildup rounding parity
    const effectiveAreaForPricing = hasFloorLink ? superSqft : roundTo(superSqft, 2);
    const roundedSuperSqft = roundTo(superSqft, 2);
    const unitPrice = roundTo(effectiveAreaForPricing * rateSqft, 2);
    const developerAmount = roundTo(unitPrice * developerUnits, 2);
    const grossAmount = roundTo(unitPrice * totalUnitsCount, 2);
    const landownerAmount = roundTo(unitPrice * landownerUnits, 2);

    totalDeveloperUnits += developerUnits;
    totalLandownerUnits += landownerUnits;
    totalReceipts += developerAmount;
    totalGrossReceipts += grossAmount;
    totalLandownerReceipts += landownerAmount;
    totalSalableCarpetSqft += (carpetSqft * totalUnitsCount);
    totalSalableSuperSqft += (effectiveAreaForPricing * totalUnitsCount);

    return {
      ...unit,
      source_floor_id: unit.source_floor_id ?? null,
      source_floor_name: linkedFloor ? linkedFloor.floor_name : null,
      is_floor_linked: hasFloorLink,
      loading_mode: loadingMode,
      loading_pct: roundTo(loadingPct, 2),
      super_buildup_loading_sqft: roundTo(loadingSqft, 2),
      carpet_area_sqm: roundTo(carpetSqm, 4),
      carpet_area_sqft: roundTo(carpetSqft, 2),
      super_buildup_area_sqft: roundedSuperSqft,
      super_buildup_area_sqft_exact: superSqft,
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
    floorUnitAreas,
    totalSalableCarpetSqft: roundTo(totalSalableCarpetSqft, 2),
    totalSalableSuperSqft: roundTo(totalSalableSuperSqft, 2)
  };
}

module.exports = {
  SQM_TO_SQFT,
  AREA_BALANCE_ROUNDING_TOLERANCE_SQM,
  ROAD_WIDTH_TDR_MAP,
  ROAD_WIDTH_TOTAL_TDR_MAP,
  REGULATORY_PROFILES,
  parseNum,
  parseOptNum,
  isHeightContributingFloor,
  validateAreaStatementInputs,
  deriveTdrSplit,
  resolvePermissibleTdr,
  distributePlineEqually,
  distributeFsiAndAncillary,
  calculateParkingRequirements,
  calculateAreaMetrics,
  calculateFinancialMetrics
};

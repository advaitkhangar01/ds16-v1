// client/src/utils/feasibilityCalculations.js
// Lightweight presentation, unit-conversion, and UI reference helpers for Feasibility.
// NOTE: Authoritative engineering and financial math executes strictly in server/services/feasibilityEngine.js
// via /api/projects/:projectId/feasibility and POST /preview. No shadow calculation engine is duplicated here.

export const SQM_TO_SQFT = 10.7639104167;

export const ROAD_WIDTHS = [9, 12, 15, 18, 24];

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
  24: { regular: 0.55, slum: 0.55, gunthewari: 0.55 }
};

export function toDisplayArea(sqmValue, unitDisplay = 'sq_m') {
  const num = Number(sqmValue);
  if (!Number.isFinite(num)) return 0;
  return unitDisplay === 'sq_ft' ? num * SQM_TO_SQFT : num;
}

export function fromDisplayArea(displayValue, unitDisplay = 'sq_m') {
  if (displayValue === '' || displayValue === null || displayValue === undefined) return '';
  const num = Number(displayValue);
  if (!Number.isFinite(num)) return 0;
  return unitDisplay === 'sq_ft' ? num / SQM_TO_SQFT : num;
}

export function formatArea(sqmValue, unitDisplay = 'sq_m', decimals = 3) {
  const num = toDisplayArea(sqmValue, unitDisplay);
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatNum(val, decimals = 2) {
  const num = Number(val);
  if (!Number.isFinite(num)) return (0).toFixed(decimals);
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatINR(val, decimals = 2) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '₹0.00';
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * UI display helper for TDR split hints before backend /preview resolves.
 * Enforces FR-08: Gunthewari uses Slum TDR only (Regular TDR = 0).
 */
export function deriveTdrSplit(totalTdrFactor, requestedRegularTdr = null, isGunthewari = false) {
  const round4 = (v) => Math.round((v + Number.EPSILON) * 10000) / 10000;
  const total = Math.max(0, round4(parseFloat(totalTdrFactor) || 0));
  const half = round4(total / 2);

  if (isGunthewari) {
    return {
      totalTdrFactor: half,
      regularTdrFactor: 0,
      slumTdrFactor: half,
      defaultRegularTdrFactor: 0,
      defaultSlumTdrFactor: half,
      isRegularTdrOverridden: false,
      isSplitValid: true,
      validationError: null
    };
  }

  const defaultRegular = half;
  const defaultSlum = round4(total - defaultRegular);

  if (requestedRegularTdr !== null && requestedRegularTdr !== undefined && requestedRegularTdr !== '') {
    const rawReq = parseFloat(requestedRegularTdr);
    if (isNaN(rawReq) || rawReq < 0 || round4(rawReq) > total) {
      return {
        totalTdrFactor: total,
        regularTdrFactor: defaultRegular,
        slumTdrFactor: defaultSlum,
        defaultRegularTdrFactor: defaultRegular,
        defaultSlumTdrFactor: defaultSlum,
        isRegularTdrOverridden: false,
        isSplitValid: false,
        validationError: `Regular TDR must be between 0 and ${total.toFixed(3)}`
      };
    }
    const roundedReq = round4(rawReq);
    const derivedSlum = round4(total - roundedReq);
    return {
      totalTdrFactor: total,
      regularTdrFactor: roundedReq,
      slumTdrFactor: derivedSlum,
      defaultRegularTdrFactor: defaultRegular,
      defaultSlumTdrFactor: defaultSlum,
      isRegularTdrOverridden: Math.abs(roundedReq - defaultRegular) > 0.0001,
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

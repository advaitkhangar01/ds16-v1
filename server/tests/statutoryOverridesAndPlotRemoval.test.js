// server/tests/statutoryOverridesAndPlotRemoval.test.js
const { calculateFinancialMetrics } = require('../services/feasibilityEngine');
const pool = require('../db');

describe('Financial Viability: Statutory Overrides, TDR Loading & Plot Rate Removal', () => {
  afterAll(async () => {
    await pool.end();
  });

  const baseAreaMetrics = {
    plotAreaSqm: 1000,
    plotableAreaSqm: 900,
    totalProposedPlineSqm: 1200,
    totalProposedFsiSqm: 1000,
    totalProposedAncillarySqm: 600,
    proposedPaidFsiSqm: 200,
    proposedTdrSqm: 300,
    permissiblePaidFsiSqm: 200,
    permissibleTdrSqm: 300,
    evaluatedFloors: []
  };

  const sampleCharges = [
    { id: 1, charge_code: 'PLAN_REGISTRATION', rr_percentage: null, amount: 20000, is_enabled: true },
    { id: 2, charge_code: 'SECURITY_DEPOSIT', rr_percentage: 0.5, amount: 0, is_enabled: true },
    { id: 3, charge_code: 'STACKING_CHARGES', rr_percentage: 0.2, amount: 0, is_enabled: true },
    { id: 4, charge_code: 'ANCILLARY_CHARGES', rr_percentage: 20, amount: 0, is_enabled: true },
    { id: 5, charge_code: 'SEWER_CONNECTION', rr_percentage: null, amount: 50000, is_enabled: true },
    { id: 6, charge_code: 'DEVELOPMENT_CHARGES', rr_percentage: 2.0, amount: 0, is_enabled: true },
    { id: 7, charge_code: 'PREMIUM_FSI', rr_percentage: 35, amount: 0, is_enabled: true },
    { id: 8, charge_code: 'TREE_PLANTATION', rr_percentage: null, amount: 15000, is_enabled: true },
    { id: 9, charge_code: 'HERITAGE_FUND', rr_percentage: null, amount: 0, is_enabled: true },
    { id: 10, charge_code: 'LABOUR_WELFARE_CESS', rr_percentage: null, amount: 0, is_enabled: true },
    { id: 11, charge_code: 'TDR_LOADING_CHARGES', rr_percentage: 3.0, amount: 0, is_enabled: true },
    { id: 12, charge_code: 'LABOUR_WELFARE_PARKING', rr_percentage: null, amount: 45000, is_enabled: true }
  ];

  describe('1. Plot Acquisition Rate Removal & Lump-sum Land Cost', () => {
    it('completely ignores cost_of_plot_rate_per_sqm even if present in payload', () => {
      const fin = {
        rr_rate_per_sqm: 40000,
        cost_of_plot_rate_per_sqm: 50000, // legacy / unneeded rate
        cost_of_plot: 0
      };

      const res = calculateFinancialMetrics(fin, sampleCharges, [], baseAreaMetrics);
      // costOfPlotH must be 0, not 1000 * 50000 = 50,000,000
      expect(res.costOfPlotH).toBe(0);
    });

    it('only populates costOfPlotH when explicit lump-sum cost_of_plot is > 0', () => {
      const fin = {
        rr_rate_per_sqm: 40000,
        cost_of_plot: 2500000.50
      };

      const res = calculateFinancialMetrics(fin, sampleCharges, [], baseAreaMetrics);
      expect(res.costOfPlotH).toBe(2500000.50);
      expect(res.costOfPlotH_details.is_included).toBe(true);
      expect(res.costOfPlotH_details.raw_amount).toBe(2500000.50);
    });

    it('excludes Cost of Plot from totalProjectCost when is_cost_of_plot_included is false without erasing saved amount', () => {
      const finIncluded = {
        rr_rate_per_sqm: 40000,
        cost_of_plot: 5000000,
        is_cost_of_plot_included: true
      };
      const resIncluded = calculateFinancialMetrics(finIncluded, sampleCharges, [], baseAreaMetrics);

      const finExcluded = {
        rr_rate_per_sqm: 40000,
        cost_of_plot: 5000000,
        is_cost_of_plot_included: false
      };
      const resExcluded = calculateFinancialMetrics(finExcluded, sampleCharges, [], baseAreaMetrics);

      expect(resExcluded.costOfPlotH).toBe(0);
      expect(resExcluded.costOfPlotH_details.is_included).toBe(false);
      expect(resExcluded.costOfPlotH_details.raw_amount).toBe(5000000);
      expect(resIncluded.totalProjectCost - resExcluded.totalProjectCost).toBe(5000000);
    });

    it('changing RR rate or plot area does not modify Cost of Plot', () => {
      const fin1 = { rr_rate_per_sqm: 20000, cost_of_plot: 7500000 };
      const fin2 = { rr_rate_per_sqm: 60000, cost_of_plot: 7500000 };

      const res1 = calculateFinancialMetrics(fin1, sampleCharges, [], baseAreaMetrics);
      const res2 = calculateFinancialMetrics(fin2, sampleCharges, [], { ...baseAreaMetrics, plotAreaSqm: 5000 });

      expect(res1.costOfPlotH).toBe(7500000);
      expect(res2.costOfPlotH).toBe(7500000);
    });
  });

  describe('2. TDR Loading Charges: 3% Formula & Admin Override', () => {
    it('calculates 3% of RR on effective TDR area when no override is present', () => {
      const fin = {
        rr_rate_per_sqm: 50000,
        tdr_purchase_factor: 0.55
      };

      // effectiveTdrAreaSqm = 300, rrRate = 50000, rr_percentage = 3%
      // 300 * (3 / 100) * 50000 = 450,000
      const res = calculateFinancialMetrics(fin, sampleCharges, [], baseAreaMetrics);
      const tdrCharge = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'TDR_LOADING_CHARGES');

      expect(tdrCharge.calculated_amount).toBe(450000);
      expect(tdrCharge.effective_amount).toBe(450000);
      expect(tdrCharge.has_override).toBe(false);
    });

    it('allows Admin to override TDR Loading Charges while preserving calculated amount and basis', () => {
      const fin = {
        rr_rate_per_sqm: 50000,
        overrides: {
          statutory_TDR_LOADING_CHARGES: {
            override_val: 375000,
            basis_val: 450000,
            reason: 'NMC concession per special sanction order',
            updated_at: '2026-11-26T12:00:00Z'
          }
        }
      };

      const res = calculateFinancialMetrics(fin, sampleCharges, [], baseAreaMetrics);
      const tdrCharge = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'TDR_LOADING_CHARGES');

      expect(tdrCharge.calculated_amount).toBe(450000);
      expect(tdrCharge.effective_amount).toBe(375000);
      expect(tdrCharge.has_override).toBe(true);
      expect(tdrCharge.has_basis_drift).toBe(false);
    });

    it('detects basis drift when underlying RR rate changes after override is saved', () => {
      const fin = {
        rr_rate_per_sqm: 60000, // increased RR rate changes calculated basis to 540,000
        overrides: {
          statutory_TDR_LOADING_CHARGES: {
            override_val: 375000,
            basis_val: 450000, // was 450,000 when override was saved
            reason: 'NMC concession'
          }
        }
      };

      const res = calculateFinancialMetrics(fin, sampleCharges, [], baseAreaMetrics);
      const tdrCharge = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'TDR_LOADING_CHARGES');

      // new calculated amount = 300 * 0.03 * 60000 = 540000
      expect(tdrCharge.calculated_amount).toBe(540000);
      expect(tdrCharge.effective_amount).toBe(375000);
      expect(tdrCharge.has_basis_drift).toBe(true);
    });
  });

  describe('3. Statutory Charges Overrides & Dependencies', () => {
    it('applies admin overrides across multiple statutory items and updates total demand', () => {
      const fin = {
        rr_rate_per_sqm: 40000,
        overrides: {
          statutory_PLAN_REGISTRATION: { override_val: 25000, basis_val: 20000, reason: 'Revised scrutiny fee' },
          statutory_SECURITY_DEPOSIT: { override_val: 100000, basis_val: 120000, reason: 'Bank guarantee adjustment' }
        }
      };

      const res = calculateFinancialMetrics(fin, sampleCharges, [], baseAreaMetrics);
      const planItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'PLAN_REGISTRATION');
      const secItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'SECURITY_DEPOSIT');

      expect(planItem.effective_amount).toBe(25000);
      expect(planItem.has_override).toBe(true);

      expect(secItem.effective_amount).toBe(100000);
      expect(secItem.has_override).toBe(true);
    });

    it('correctly calculates Heritage Fund at 2% of overridden Development Charges', () => {
      const fin = {
        rr_rate_per_sqm: 50000,
        overrides: {
          statutory_DEVELOPMENT_CHARGES: {
            override_val: 500000, // overridden from calculated ~1,200,000
            basis_val: 1200000,
            reason: 'Partial phase approval'
          }
        }
      };

      const res = calculateFinancialMetrics(fin, sampleCharges, [], baseAreaMetrics);
      const devItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'DEVELOPMENT_CHARGES');
      const heritageItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'HERITAGE_FUND');

      expect(devItem.effective_amount).toBe(500000);
      // Heritage Fund = 2% of 500,000 = 10,000
      expect(heritageItem.calculated_amount).toBe(10000);
      expect(heritageItem.effective_amount).toBe(10000);
    });

    it('sets Heritage Fund to 0 if Development Charges is disabled', () => {
      const charges = sampleCharges.map(c => 
        c.charge_code === 'DEVELOPMENT_CHARGES' ? { ...c, is_enabled: false } : c
      );

      const fin = { rr_rate_per_sqm: 50000 };
      const res = calculateFinancialMetrics(fin, charges, [], baseAreaMetrics);
      const heritageItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'HERITAGE_FUND');

      expect(heritageItem.calculated_amount).toBe(0);
      expect(heritageItem.effective_amount).toBe(0);
    });
  });

  describe('4. Labour Welfare Parking: Manual Admin Entry', () => {
    it('treats LABOUR_WELFARE_PARKING as manual input rather than an override', () => {
      const charges = sampleCharges.map(c =>
        c.charge_code === 'LABOUR_WELFARE_PARKING' ? { ...c, amount: 65000 } : c
      );

      const fin = { rr_rate_per_sqm: 50000 };
      const res = calculateFinancialMetrics(fin, charges, [], baseAreaMetrics);
      const parkingItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'LABOUR_WELFARE_PARKING');

      expect(parkingItem.is_manual).toBe(true);
      expect(parkingItem.calculated_amount).toBeNull();
      expect(parkingItem.has_override).toBe(false);
      expect(parkingItem.effective_amount).toBe(65000);
    });
  });
});

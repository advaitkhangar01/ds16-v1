const { calculateAreaMetrics, calculateFinancialMetrics } = require('../services/feasibilityEngine');
const pool = require('../db');

describe('Phase 4: Calculation Accuracy & Formula Parity', () => {
  afterAll(async () => {
    await pool.end();
  });

  describe('CALC-004: Explicit Zero-Value Preservation', () => {
    it('preserves tdr_factor = 0 without defaulting to 0.65', () => {
      const stmt = {
        plot_area_sqm: 1000,
        dp_deductions_sqm: 100,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        tdr_factor: 0, // explicit zero
        regular_tdr_factor: 0,
        slum_tdr_factor: 0,
        building_use: 'Residential'
      };
      const metrics = calculateAreaMetrics(stmt, []);
      expect(metrics.plotableAreaSqm).toBe(900);
      expect(metrics.permissibleTdrSqm).toBe(0);
      expect(metrics.permissibleTotalBuiltupSqm).toBe(900 * 1.1 + 900 * 0.5);
    });

    it('preserves floor height_meters = 0 without defaulting to 3.00', () => {
      const stmt = {
        plot_area_sqm: 500,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        tdr_factor: 0.65,
        building_use: 'Residential'
      };
      const floors = [
        { id: 1, floor_name: 'Terrace', floor_type: 'terrace', height_meters: 0, pline_area_sqm: 200 }
      ];
      const metrics = calculateAreaMetrics(stmt, floors);
      expect(metrics.evaluatedFloors[0].height_meters).toBe(0);
      expect(metrics.totalHeightMeters).toBe(0);
    });

    it('preserves unit super_buildup_loading_sqft = 0 without defaulting to 300', () => {
      const fin = { rr_rate_per_sqm: 50000 };
      const salableUnits = [
        { id: 1, carpet_area_sqm: 100, super_buildup_loading_sqft: 0, unit_count: 1, rate_per_sqft: 5000 }
      ];
      const areaMetrics = { evaluatedFloors: [], totalProposedPlineSqm: 200 };
      const res = calculateFinancialMetrics(fin, [], salableUnits, areaMetrics);
      const evaluated = res.evaluatedSalableUnits[0];
      // carpet_area_sqft = 100 * 10.7639104167 = 1076.39 (rounded to 2 decimals)
      expect(evaluated.super_buildup_area_sqft).toBeCloseTo(1076.39, 2); // 1076.39 + 0, not + 300
    });
  });

  describe('CALC-002: Heritage Fund Dependency and Overrides', () => {
    it('calculates Heritage Fund as exactly 2% of effective Development Charges', () => {
      const fin = {
        rr_rate_per_sqm: 50000
      };
      const areaMetrics = {
        totalProposedPlineSqm: 1000,
        totalProposedFsiSqm: 1000,
        totalProposedAncillarySqm: 600,
        evaluatedFloors: []
      };
      const statutoryCharges = [
        { id: 1, charge_code: 'DEVELOPMENT_CHARGES', rr_percentage: 2.0, is_enabled: true },
        { id: 2, charge_code: 'HERITAGE_FUND', is_enabled: true }
      ];
      // dev charges = 1000 * (2 / 100) * 50000 = 1,000,000
      // heritage fund = 0.02 * 1,000,000 = 20,000
      const res = calculateFinancialMetrics(fin, statutoryCharges, [], areaMetrics);
      const devItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'DEVELOPMENT_CHARGES');
      const heritageItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'HERITAGE_FUND');

      expect(devItem.effective_amount).toBe(1000000);
      expect(heritageItem.effective_amount).toBe(20000);
    });

    it('calculates Heritage Fund as 2% of manually overridden Development Charges', () => {
      const fin = {
        rr_rate_per_sqm: 50000,
        overrides: {
          statutory_DEVELOPMENT_CHARGES: { override_val: 500000 }
        }
      };
      const areaMetrics = {
        totalProposedPlineSqm: 1000,
        totalProposedFsiSqm: 1000,
        totalProposedAncillarySqm: 600,
        evaluatedFloors: []
      };
      const statutoryCharges = [
        { id: 1, charge_code: 'DEVELOPMENT_CHARGES', rr_percentage: 2.0, is_enabled: true },
        { id: 2, charge_code: 'HERITAGE_FUND', is_enabled: true }
      ];
      const res = calculateFinancialMetrics(fin, statutoryCharges, [], areaMetrics);
      const heritageItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'HERITAGE_FUND');
      // 2% of 500,000 override = 10,000
      expect(heritageItem.effective_amount).toBe(10000);
    });

    it('returns 0 for Heritage Fund when Development Charges is disabled', () => {
      const fin = { rr_rate_per_sqm: 50000 };
      const areaMetrics = { totalProposedPlineSqm: 1000, evaluatedFloors: [] };
      const statutoryCharges = [
        { id: 1, charge_code: 'DEVELOPMENT_CHARGES', rr_percentage: 2.0, is_enabled: false },
        { id: 2, charge_code: 'HERITAGE_FUND', is_enabled: true }
      ];
      const res = calculateFinancialMetrics(fin, statutoryCharges, [], areaMetrics);
      const heritageItem = res.evaluatedStatutoryCharges.find(c => c.charge_code === 'HERITAGE_FUND');
      expect(heritageItem.effective_amount).toBe(0);
    });
  });

  describe('CALC-001: Mixed Use Ancillary Area Parity', () => {
    it('applies 80% to commercial floors and 60% to residential floors in mixed use', () => {
      const stmt = {
        plot_area_sqm: 1000,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        regular_tdr_factor: 0.4,
        slum_tdr_factor: 0.2,
        building_use: 'Mixed Use'
      };
      // 1 Commercial floor, 1 Residential floor
      const floors = [
        { id: 1, floor_name: '1st Floor - Commercial', usage_type: 'Commercial', is_active: true },
        { id: 2, floor_name: '2nd Floor - Residential', usage_type: 'Residential', is_active: true }
      ];
      const metrics = calculateAreaMetrics(stmt, floors);
      expect(metrics.buildingUse).toBe('Mixed Use');
      // Total proposed builtup = 1000 * (1.1 + 0.5 + 0.4 + 0.2) = 2200
      // 2 habitable floors -> 1100 each
      // Commercial floor: 1100 * 0.80 = 880 ancillary
      // Residential floor: 1100 * 0.60 = 660 ancillary
      expect(metrics.proposedCommercialAncillarySqm).toBe(880);
      expect(metrics.proposedResidentialAncillarySqm).toBe(660);
      expect(metrics.totalProposedAncillarySqm).toBe(1540);
    });
  });
});

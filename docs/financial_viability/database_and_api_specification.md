# Database and API Change Specification

## 1. Database Schema Changes

### 1.1 New Migration: `035_financial_viability_overrides_and_derivations.sql`

```sql
-- Migration 035: Financial Viability Controlled Overrides & Derivations
-- Adds JSONB storage for manual overrides, basis snapshots, and audit trail

ALTER TABLE project_financial_viabilities
  ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS override_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN project_financial_viabilities.overrides IS 
  'Map of controlled manual overrides with active states, override values, calculation-basis snapshots, user, and timestamps';

COMMENT ON COLUMN project_financial_viabilities.override_history IS 
  'Append-only historical audit log of all override modifications and resets';
```

### 1.2 Data Structure: Override Object Schema
Stored in `project_financial_viabilities.overrides`:

```typescript
interface FinancialOverrideItem {
  is_active: boolean;              // Whether manual override is currently active
  override_val: number;            // User-entered manual override amount
  calculated_basis_val: number;    // Calculated amount at the time the override was committed
  basis_snapshot: {                // Key dependencies captured at time of override
    effective_pline_sqm?: number;
    rr_rate_per_sqm?: number;
    plot_area_sqm?: number;
    unit_count?: number;
    timestamp: string;
  };
  reason?: string;                 // Required user justification (e.g. "Official NMC Challan")
  updated_by: number;              // User ID who applied the override
  user_name?: string;              // User display name
  updated_at: string;              // ISO timestamp
}

interface FinancialOverridesMap {
  [metricKey: string]: FinancialOverrideItem;
}
```

Eligible `metricKey` identifiers:
- `totalStatutoryDemandA` (Overriding Total Statutory Demand)
- `costOfTdrB` (Overriding Cost of TDR Loading)
- `costOfConstructionD` (Overriding Civil Construction Cost)
- `costOfBasementE` (Overriding Basement Construction Cost)
- `rentCostF` (Overriding Tenant Rent during Construction)
- `stackedParkingCostG` (Overriding Stacked Parking Cost)
- `costOfPlotH` (Overriding Plot Land Acquisition Cost)
- `totalReceipts` (Overriding Total Salable Realization)

### 1.3 Basis Drift Detection Logic
During each calculation cycle in `feasibilityEngine.calculateFinancialMetrics`:
```javascript
if (override && override.is_active) {
  const currentCalculated = calculatedMetricValue;
  const originalBasis = override.calculated_basis_val;
  
  // Drift detected if calculation basis changed by > 0.01%
  const hasDrifted = Math.abs(currentCalculated - originalBasis) > 1.0;
  
  metricResult = {
    calculated_amount: currentCalculated,
    effective_amount: override.override_val,
    is_overridden: true,
    override_basis_changed: hasDrifted,
    override_details: {
      override_val: override.override_val,
      calculated_basis_val: originalBasis,
      difference_from_current: currentCalculated - override.override_val,
      reason: override.reason,
      updated_by: override.updated_by,
      updated_at: override.updated_at
    }
  };
} else {
  metricResult = {
    calculated_amount: calculatedMetricValue,
    effective_amount: calculatedMetricValue,
    is_overridden: false,
    override_basis_changed: false
  };
}
```

---

## 2. API Specification

### 2.1 `GET /api/projects/:projectId/feasibility`
**Response Enhancement**: Returns `autoSourcedMetadata` block clearly identifying Category A values, alongside calculation outputs:

```json
{
  "project": { "id": 1, "name": "..." },
  "statement": { ... },
  "floors": [ ... ],
  "financial": {
    "id": 1,
    "rr_rate_per_sqm": 24340.00,
    "estimated_cost_a_rate": 15000.00,
    "estimated_cost_b_rate": 26620.00,
    "cost_of_construction_rate": 20000.00,
    "overrides": { ... }
  },
  "autoSourcedMetadata": {
    "plot_area_sqm": { "value": 270.00, "source": "Area Statement", "field": "plot_area_sqm" },
    "basic_fsi_factor": { "value": 1.10, "source": "Area Statement", "field": "basic_fsi_factor" },
    "paid_fsi_factor": { "value": 0.50, "source": "Area Statement", "field": "paid_fsi_factor" },
    "regular_tdr_factor": { "value": 0.545, "source": "Area Statement", "field": "regular_tdr_factor" },
    "total_proposed_pline_sqm": { "value": 926.64, "source": "Floor Plates", "field": "sum(pline_area_sqm)" },
    "basement_area_sqm": { "value": 0.00, "source": "Building Configuration", "field": "basement_floors" },
    "stacked_parking_slots": { "value": 10, "source": "Parking Configuration", "field": "parking_slots" },
    "habitable_floor_count": { "value": 6, "source": "Floor Plates", "field": "count(habitable)" }
  },
  "statutoryCharges": [ ... ],
  "financialMetrics": {
    "totalStatutoryDemandA": { "calculated_amount": 3227294.18, "effective_amount": 3227294.18, "is_overridden": false },
    "costOfConstructionD": { "calculated_amount": 18532800.00, "effective_amount": 18532800.00, "is_overridden": false },
    "totalProjectCost": { "calculated_amount": 38154991.23, "effective_amount": 38154991.23, "is_overridden": false },
    "totalReceipts": { "calculated_amount": 182734203.42, "effective_amount": 182734203.42, "is_overridden": false },
    "netProfit": { "calculated_amount": 144579212.19, "effective_amount": 144579212.19 }
  }
}
```

### 2.2 `PUT /api/projects/:projectId/feasibility/financial/overrides`
**Action**: Sets or updates an active manual override for a specific metric key.

**Request Body**:
```json
{
  "metric_key": "totalStatutoryDemandA",
  "override_value": 3500000.00,
  "reason": "Actual demand challan issued by Nagpur Municipal Corporation"
}
```

**Audit Trail**: Appends old and new values to `override_history` and writes to `feasibility_audit_logs`.

### 2.3 `POST /api/projects/:projectId/feasibility/financial/overrides/reset`
**Action**: Reverts an override back to the live calculated value.

**Request Body**:
```json
{
  "metric_key": "totalStatutoryDemandA",
  "reason": "Reverted back to live calculation engine"
}
```

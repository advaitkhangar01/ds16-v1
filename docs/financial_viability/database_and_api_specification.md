# Database and API Change Specification

## 1. Database Schema Changes

### 1.1 Migration: `035_financial_viability_overrides_and_central_floors.sql`

```sql
-- Migration 035: Financial Viability Controlled Overrides & Centralized Building Floor Hierarchy
-- Adds JSONB storage for manual overrides, basis snapshots, and floor hierarchy keys

-- 1. Financial Viabilities: Overrides & Audit Trail
ALTER TABLE project_financial_viabilities
  ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS override_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN project_financial_viabilities.overrides IS 
  'Map of controlled manual overrides with active states, override values, calculation-basis snapshots, user, and timestamps';

COMMENT ON COLUMN project_financial_viabilities.override_history IS 
  'Append-only historical audit log of all override modifications and resets';

-- 2. Project Area Floors: Centralized Hierarchy Tracking & Reconciliation
ALTER TABLE project_area_floors
  ADD COLUMN IF NOT EXISTS floor_key VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_project_area_floors_key ON project_area_floors(area_statement_id, floor_key);

COMMENT ON COLUMN project_area_floors.floor_key IS 
  'Unique structural identifier linking floor to Building Configuration (e.g. basement_1, ground_floor, floor_1, terrace_floor)';
COMMENT ON COLUMN project_area_floors.is_active IS 
  'Active status maintained by Building Configuration reconciliation; false if floor is retired';
```

---

## 2. Centralised Building Configuration & Floor Reconciliation Engine

### 2.1 The Principle of Central Floor Governance
**Building Configuration (`timeline_configurations`) is the single authoritative source of the project's building structure and floor hierarchy across the entire system.**

- Floors are configured **only once** in Building Configuration.
- **Project Timeline**: Generates activities for all configured floors.
- **Area Statement**: Generates and maintains floor-wise area records from the central floor structure. Allows editing of measurements (P-Line, Lobby, Units, Saleable area), but **never independent addition or deletion of floors**.
- **Financial Viability**: Retrieves floor structure, areas, unit counts, saleable areas, basement areas, and parking configuration from authoritative sources. Never requests duplicate floor configuration.

### 2.2 Standard Floor Hierarchy Generator (`buildingHierarchyService.js`)
Given `config` from `timeline_configurations`:
```javascript
function generateStandardFloorHierarchy(config = {}) {
  const floorsCount = Math.max(1, parseInt(config.floors_above_ground, 10) || 4);
  const basementsCount = Math.max(0, parseInt(config.basement_count, 10) || 0);
  const upperParkCount = Math.max(0, parseInt(config.upper_parking_count, 10) || 0);
  const hasStilt = config.has_stilt_parking !== false;
  const hasTankSlab = config.has_terrace_tank_slab !== false;

  const hierarchy = [];
  let order = 1;

  // 1. Basements (bottom-up: e.g. Basement 2, then Basement 1)
  for (let b = basementsCount; b >= 1; b--) {
    hierarchy.push({
      floor_key: `basement_${b}`,
      floor_name: `Basement ${b}`,
      floor_order: order++,
      floor_type: 'parking',
      usage_type: 'Parking',
      height_meters: 3.00,
      is_parking: true
    });
  }

  // 2. Ground / Stilt Floor
  hierarchy.push({
    floor_key: 'ground_floor',
    floor_name: hasStilt ? 'Ground Floor (Stilt Parking)' : 'Ground Floor',
    floor_order: order++,
    floor_type: hasStilt ? 'parking' : 'habitable',
    usage_type: hasStilt ? 'Parking' : (config.building_type?.includes('Commercial') ? 'Commercial' : 'Residential'),
    height_meters: hasStilt ? 3.30 : 3.00,
    is_parking: hasStilt
  });

  // 3. Upper Parking / Podium Floors
  for (let p = 1; p <= upperParkCount; p++) {
    hierarchy.push({
      floor_key: `podium_${p}`,
      floor_name: `Podium ${p} Parking`,
      floor_order: order++,
      floor_type: 'parking',
      usage_type: 'Parking',
      height_meters: 3.00,
      is_parking: true
    });
  }

  // 4. Habitable Upper Floors
  for (let f = 1; f <= floorsCount; f++) {
    hierarchy.push({
      floor_key: `floor_${f}`,
      floor_name: f === 1 ? 'First Floor' : f === 2 ? 'Second Floor' : f === 3 ? 'Third Floor' : `${f}th Floor`,
      floor_order: order++,
      floor_type: 'habitable',
      usage_type: config.building_type?.includes('Commercial') ? 'Commercial' : 'Residential',
      height_meters: 3.00,
      is_parking: false
    });
  }

  // 5. Terrace / Overhead Tank Floor
  if (hasTankSlab) {
    hierarchy.push({
      floor_key: 'terrace_floor',
      floor_name: 'Terrace & Overhead Tank',
      floor_order: order++,
      floor_type: 'terrace',
      usage_type: 'Service',
      height_meters: 2.85,
      is_parking: false
    });
  }

  return hierarchy;
}
```

### 2.3 Reconciliation Logic (`reconcileBuildingFloors`)
When Building Configuration is saved (`POST /api/projects/:projectId/timeline/config`):
1. Load or initialize `project_area_statements` for `projectId`.
2. Generate target structural hierarchy from the updated config.
3. Fetch existing `project_area_floors` records for this area statement.
4. **Preservation Principle**:
   - For each target floor:
     - Match against existing records by `floor_key` (or matching normalized `floor_name`).
     - If match exists: update `floor_name`, `floor_order`, `floor_type`, `is_active = TRUE`, and **preserve existing user measurements**: `height_meters`, `pline_area_sqm`, `lobby_area_sqm`, `builtup_for_owners_sqm`, `builtup_for_sale_sqm`, `no_of_units`, `rate_per_sqm`, `cost_for_1_unit`, `remarks`.
     - If no match: insert new floor with default parameters and `is_active = TRUE`.
   - Any existing floors not present in the new hierarchy (e.g. floors reduced from 6 to 4): set `is_active = FALSE` (or safely delete if unmeasured), preserving historical financial snapshots and audit history.
5. Reconcile Timeline activities (`reconcileProjectTimeline`).
6. Both Timeline, Area Statement, and Financial Viability immediately consume the synchronized floor records.

---

## 3. Data Structure: Controlled Overrides Schema

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
- `totalStatutoryDemandA` (Total Statutory Demand)
- `costOfTdrB` (Cost of TDR Loading)
- `costOfConstructionD` (Civil Construction Cost)
- `costOfBasementE` (Basement Construction Cost)
- `rentCostF` (Tenant Rent during Construction)
- `stackedParkingCostG` (Stacked Parking Cost)
- `costOfPlotH` (Plot Land Acquisition Cost)
- `totalReceipts` (Total Salable Realization)

### 3.1 Basis Drift Detection Logic
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

## 4. API Specification

### 4.1 `GET /api/projects/:projectId/feasibility`
Returns `autoSourcedMetadata` block clearly identifying Category A values, alongside calculation outputs and active building hierarchy metadata:

```json
{
  "project": { "id": 1, "name": "..." },
  "statement": { ... },
  "floors": [ ... ],
  "buildingConfigSummary": {
    "floors_above_ground": 4,
    "basement_count": 1,
    "upper_parking_count": 0,
    "has_stilt_parking": true,
    "has_terrace_tank_slab": true,
    "total_configured_floors": 7
  },
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
    "habitable_floor_count": { "value": 4, "source": "Building Configuration", "field": "floors_above_ground" }
  },
  "statutoryCharges": [ ... ],
  "financialMetrics": { ... }
}
```

### 4.2 `PUT /api/projects/:projectId/feasibility/financial/overrides`
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

### 4.3 `POST /api/projects/:projectId/feasibility/financial/overrides/reset`
**Action**: Reverts an override back to the live calculated value.

**Request Body**:
```json
{
  "metric_key": "totalStatutoryDemandA",
  "reason": "Reverted back to live calculation engine"
}
```

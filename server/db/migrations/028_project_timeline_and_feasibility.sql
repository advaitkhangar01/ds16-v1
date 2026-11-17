-- server/db/migrations/028_project_timeline_and_feasibility.sql
-- DS16: Project Timeline and Area & Financial Feasibility Data Structures

-- 1. TIMELINE CONFIGURATIONS
CREATE TABLE IF NOT EXISTS timeline_configurations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  floors_above_ground INTEGER NOT NULL DEFAULT 4,
  ground_floor_config VARCHAR(50) NOT NULL DEFAULT 'parking_and_rooms',
  has_terrace_tank_slab BOOLEAN NOT NULL DEFAULT TRUE,
  parking_rooms_config VARCHAR(100) DEFAULT 'Standard',
  building_type VARCHAR(100) DEFAULT 'Residential Apartment',
  stages JSONB DEFAULT '["Site Preparation", "Substructure", "Superstructure & Slab", "Finishing & Services", "Handover"]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  published_version INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TIMELINE VERSIONS
CREATE TABLE IF NOT EXISTS timeline_versions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  configuration_snapshot JSONB NOT NULL,
  tasks_snapshot JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'published',
  published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT uq_timeline_project_version UNIQUE (project_id, version_number)
);

-- 3. TIMELINE ACTIVITY CATALOGUE
CREATE TABLE IF NOT EXISTS timeline_activity_catalogue (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  activity_name VARCHAR(255) NOT NULL,
  construction_stage VARCHAR(100) NOT NULL,
  physical_location VARCHAR(100),
  generation_frequency VARCHAR(50) NOT NULL DEFAULT 'once_per_floor',
  default_duration_days INTEGER NOT NULL DEFAULT 14,
  suggested_predecessor VARCHAR(255),
  trade VARCHAR(100),
  inspection_checkpoints JSONB DEFAULT '[]'::jsonb,
  evidence_required BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CONSTRUCTION TEMPLATES & ACTIVITIES
CREATE TABLE IF NOT EXISTS construction_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  building_type VARCHAR(100) NOT NULL,
  default_floors INTEGER DEFAULT 4,
  default_config JSONB DEFAULT '{}'::jsonb,
  is_system BOOLEAN DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS construction_template_activities (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES construction_templates(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  activity_name VARCHAR(255) NOT NULL,
  stage_name VARCHAR(100) NOT NULL,
  floor_pattern VARCHAR(50) DEFAULT 'all_floors',
  default_duration_days INTEGER NOT NULL DEFAULT 14,
  predecessor_offset INTEGER DEFAULT 0,
  trade VARCHAR(100),
  order_index INTEGER DEFAULT 0
);

-- 5. TIMELINE TASKS
CREATE TABLE IF NOT EXISTS timeline_tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES timeline_versions(id) ON DELETE SET NULL,
  catalogue_activity_id INTEGER REFERENCES timeline_activity_catalogue(id) ON DELETE SET NULL,
  task_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  construction_stage VARCHAR(100) NOT NULL,
  floor_zone VARCHAR(100),
  planned_start_date DATE NOT NULL,
  planned_finish_date DATE NOT NULL,
  actual_start_date DATE,
  actual_finish_date DATE,
  duration_days INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'Completed', 'On Hold')),
  remarks TEXT,
  cost_estimate DECIMAL(15, 2) DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  is_draft BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_tasks_project ON timeline_tasks(project_id, is_archived, is_draft);
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_dates ON timeline_tasks(planned_start_date, planned_finish_date);

-- 6. TIMELINE TASK ASSIGNMENTS
CREATE TABLE IF NOT EXISTS timeline_task_assignments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES timeline_tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_timeline_task_user UNIQUE (task_id, user_id)
);

-- 7. TIMELINE TASK DEPENDENCIES
CREATE TABLE IF NOT EXISTS timeline_task_dependencies (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES timeline_tasks(id) ON DELETE CASCADE,
  predecessor_task_id INTEGER NOT NULL REFERENCES timeline_tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(10) NOT NULL DEFAULT 'FS' CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days INTEGER DEFAULT 0,
  CONSTRAINT uq_timeline_task_dep UNIQUE (task_id, predecessor_task_id)
);

-- 8. TIMELINE TASK EVIDENCE
CREATE TABLE IF NOT EXISTS timeline_task_evidence (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES timeline_tasks(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  notes TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. TIMELINE AUDIT HISTORY
CREATE TABLE IF NOT EXISTS timeline_audit_history (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES timeline_tasks(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timeline_audit_proj ON timeline_audit_history(project_id, created_at DESC);

-- 10. PROJECT AREA STATEMENTS
CREATE TABLE IF NOT EXISTS project_area_statements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  plot_area_sqm NUMERIC(14, 4) DEFAULT 0,
  city_survey_area_sqm NUMERIC(14, 4) DEFAULT 0,
  site_area_sqm NUMERIC(14, 4) DEFAULT 0,
  dp_deductions_sqm NUMERIC(14, 4) DEFAULT 0,
  existing_builtup_area_sqm NUMERIC(14, 4) DEFAULT 0,
  margin_meters NUMERIC(10, 2) DEFAULT 0,
  dividing_factor NUMERIC(8, 4) DEFAULT 1.6,
  basic_fsi_factor NUMERIC(8, 4) DEFAULT 1.1,
  paid_fsi_factor NUMERIC(8, 4) DEFAULT 0.5,
  tdr_factor NUMERIC(8, 4) DEFAULT 0.65,
  proposed_tdr_factor NUMERIC(8, 4) DEFAULT 0,
  ancillary_commercial_pct NUMERIC(8, 4) DEFAULT 0.8,
  ancillary_residential_pct NUMERIC(8, 4) DEFAULT 0.6,
  unit_display VARCHAR(10) DEFAULT 'sq_m',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PROJECT AREA FLOORS
CREATE TABLE IF NOT EXISTS project_area_floors (
  id SERIAL PRIMARY KEY,
  area_statement_id INTEGER NOT NULL REFERENCES project_area_statements(id) ON DELETE CASCADE,
  floor_name VARCHAR(100) NOT NULL,
  floor_order INTEGER NOT NULL DEFAULT 0,
  height_meters NUMERIC(8, 2) DEFAULT 3.00,
  pline_area_sqm NUMERIC(14, 4) DEFAULT 0,
  lobby_area_sqm NUMERIC(14, 4) DEFAULT 0,
  builtup_for_owners_sqm NUMERIC(14, 4) DEFAULT 0,
  builtup_for_sale_sqm NUMERIC(14, 4) DEFAULT 0,
  usage_type VARCHAR(50) DEFAULT 'Residential',
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_area_floors_stmt ON project_area_floors(area_statement_id, floor_order);

-- 12. PROJECT FINANCIAL VIABILITY
CREATE TABLE IF NOT EXISTS project_financial_viabilities (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  rr_rate_per_sqm NUMERIC(14, 2) DEFAULT 0.00,
  estimated_cost_a_rate NUMERIC(14, 2) DEFAULT 0.00,
  estimated_cost_b_rate NUMERIC(14, 2) DEFAULT 0.00,
  cost_of_plot NUMERIC(15, 2) DEFAULT 0.00,
  cost_of_plot_rate_per_sqm NUMERIC(14, 2) DEFAULT 0.00,
  cost_of_construction_rate NUMERIC(14, 2) DEFAULT 0.00,
  cost_of_infrastructure NUMERIC(15, 2) DEFAULT 0.00,
  cost_of_basement NUMERIC(15, 2) DEFAULT 0.00,
  basement_area_sqm NUMERIC(14, 4) DEFAULT 0.00,
  basement_rate_per_sqm NUMERIC(14, 2) DEFAULT 0.00,
  interest_amount NUMERIC(15, 2) DEFAULT 0.00,
  rent_amount NUMERIC(15, 2) DEFAULT 0.00,
  rent_tenements INTEGER DEFAULT 0,
  rent_per_tenement_per_month NUMERIC(14, 2) DEFAULT 0.00,
  rent_months INTEGER DEFAULT 0,
  stacked_parking_cost NUMERIC(15, 2) DEFAULT 0.00,
  stacked_parking_slots INTEGER DEFAULT 0,
  stacked_parking_cost_per_slot NUMERIC(14, 2) DEFAULT 0.00,
  minor_expenses NUMERIC(15, 2) DEFAULT 0.00,
  bpms_staff_charges NUMERIC(15, 2) DEFAULT 0.00,
  airport_noc NUMERIC(15, 2) DEFAULT 0.00,
  fire_noc NUMERIC(15, 2) DEFAULT 0.00,
  entertainment_charges NUMERIC(15, 2) DEFAULT 0.00,
  extra_stamp_duty NUMERIC(15, 2) DEFAULT 0.00,
  advocate_fees NUMERIC(15, 2) DEFAULT 0.00,
  period_months VARCHAR(50) DEFAULT '',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. STATUTORY CHARGES
CREATE TABLE IF NOT EXISTS project_statutory_charges (
  id SERIAL PRIMARY KEY,
  financial_viability_id INTEGER NOT NULL REFERENCES project_financial_viabilities(id) ON DELETE CASCADE,
  charge_code VARCHAR(50) NOT NULL,
  charge_name VARCHAR(255) NOT NULL,
  calculation_basis VARCHAR(100),
  rate_multiplier NUMERIC(14, 4) DEFAULT 0,
  max_cap NUMERIC(14, 2) DEFAULT NULL,
  amount NUMERIC(15, 2) DEFAULT 0,
  is_custom BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_statutory_charges_viability ON project_statutory_charges(financial_viability_id, order_index);

-- 14. SALABLE UNITS
CREATE TABLE IF NOT EXISTS project_salable_units (
  id SERIAL PRIMARY KEY,
  financial_viability_id INTEGER NOT NULL REFERENCES project_financial_viabilities(id) ON DELETE CASCADE,
  unit_name VARCHAR(255) NOT NULL,
  carpet_area_sqm NUMERIC(14, 4) DEFAULT 0,
  carpet_area_sqft NUMERIC(14, 4) DEFAULT 0,
  super_buildup_area_sqft NUMERIC(14, 4) DEFAULT 0,
  super_buildup_loading_sqft NUMERIC(14, 4) DEFAULT 300.00,
  unit_count INTEGER DEFAULT 1,
  rate_per_sqft NUMERIC(14, 2) DEFAULT 6000.00,
  unit_price NUMERIC(15, 2) DEFAULT 0.00,
  total_amount NUMERIC(15, 2) DEFAULT 0.00,
  order_index INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_salable_units_viability ON project_salable_units(financial_viability_id, order_index);

-- 15. FEASIBILITY SNAPSHOTS
CREATE TABLE IF NOT EXISTS project_feasibility_snapshots (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot_name VARCHAR(200) NOT NULL,
  area_data_snapshot JSONB NOT NULL,
  financial_data_snapshot JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. FEASIBILITY AUDIT LOGS
CREATE TABLE IF NOT EXISTS feasibility_audit_logs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feasibility_audit_proj ON feasibility_audit_logs(project_id, created_at DESC);

-- 17. SEED INITIAL ACTIVITY CATALOGUE
INSERT INTO timeline_activity_catalogue 
  (category, activity_name, construction_stage, physical_location, generation_frequency, default_duration_days, suggested_predecessor, trade)
VALUES
  ('Site Preparation & Excavation', 'Site Clearing & Survey Demarcation', 'Site Preparation', 'Site Boundary', 'once_per_project', 7, NULL, 'Surveyor'),
  ('Site Preparation & Excavation', 'Earthwork Excavation for Footings / Raft', 'Substructure', 'Foundation Pit', 'once_per_project', 15, 'Site Clearing & Survey Demarcation', 'Excavation Contractor'),
  ('Foundation & Substructure', 'PCC Bed Concrete under Foundation', 'Substructure', 'Foundation Pit', 'once_per_project', 7, 'Earthwork Excavation for Footings / Raft', 'Civil Contractor'),
  ('Foundation & Substructure', 'Footing / Raft Reinforcement & Concreting', 'Substructure', 'Foundation Pit', 'once_per_project', 14, 'PCC Bed Concrete under Foundation', 'RCC Contractor'),
  ('Foundation & Substructure', 'Plinth Beam & Earth Backfilling / Compaction', 'Substructure', 'Plinth Level', 'once_per_project', 12, 'Footing / Raft Reinforcement & Concreting', 'RCC Contractor'),
  ('RCC Structural Construction', 'Ground Floor Columns & Roof Slab Casting', 'Superstructure & Slab', 'Ground Floor', 'once_per_floor', 14, 'Plinth Beam & Earth Backfilling / Compaction', 'RCC Contractor'),
  ('RCC Structural Construction', 'First Floor Columns & Slab Casting', 'Superstructure & Slab', 'First Floor', 'once_per_floor', 21, 'Ground Floor Columns & Roof Slab Casting', 'RCC Contractor'),
  ('RCC Structural Construction', 'Upper Floor Columns & Slab Casting', 'Superstructure & Slab', 'Typical Upper Floor', 'once_per_floor', 21, 'First Floor Columns & Slab Casting', 'RCC Contractor'),
  ('RCC Structural Construction', 'Terrace Final Roof Slab Casting', 'Superstructure & Slab', 'Terrace', 'once_per_floor', 20, 'Upper Floor Columns & Slab Casting', 'RCC Contractor'),
  ('RCC Structural Construction', 'Terrace Parapet & Water Tank Slab Casting', 'Superstructure & Slab', 'Terrace Top', 'conditional', 20, 'Terrace Final Roof Slab Casting', 'RCC Contractor'),
  ('Masonry & Brickwork', 'External & Internal Brickwork', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 25, 'Columns & Slab Casting', 'Masonry Contractor'),
  ('Plumbing & Sanitary', 'Internal Plumbing Rough-in & Sleeves', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 12, 'External & Internal Brickwork', 'Plumber'),
  ('Electrical & Low Voltage', 'Electrical Concealed Conduit Piping & Boxes', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 15, 'External & Internal Brickwork', 'Electrician'),
  ('Plastering & Surface Preparation', 'Internal Ceiling & Wall Plastering', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 15, 'Electrical Concealed Conduit Piping & Boxes', 'Plasterer'),
  ('Waterproofing', 'Toilet & Wet Area Waterproofing with Brick Bat Coba', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 14, 'Internal Ceiling & Wall Plastering', 'Waterproofing Specialist'),
  ('Waterproofing', 'Terrace Waterproofing with Proper Slopes', 'Finishing & Services', 'Terrace', 'once_per_project', 20, 'Terrace Parapet & Water Tank Slab Casting', 'Waterproofing Specialist'),
  ('Flooring & Tiling', 'Internal Flooring & Wall Tile Cladding', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 20, 'Toilet & Wet Area Waterproofing with Brick Bat Coba', 'Tiler'),
  ('Flooring & Tiling', 'Common Area & Staircase Stone / Tile Flooring', 'Finishing & Services', 'Staircase / Lobby', 'once_per_project', 25, 'Internal Flooring & Wall Tile Cladding', 'Tiler'),
  ('Plastering & Surface Preparation', 'External Wall Double-Coat Weather Plaster', 'Finishing & Services', 'External Facade', 'once_per_project', 45, 'External & Internal Brickwork', 'Plasterer'),
  ('Doors, Windows & Fabrication', 'Window Frame & Shutter Installation with Glass', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 15, 'External Wall Double-Coat Weather Plaster', 'Fabricator'),
  ('Painting & Finishing', 'External Texture & Weatherproof Painting', 'Finishing & Services', 'External Facade', 'once_per_project', 30, 'External Wall Double-Coat Weather Plaster', 'Painter'),
  ('Painting & Finishing', 'Internal Putty, Primer & Emulsion Painting', 'Finishing & Services', 'Floor-wise', 'once_per_floor', 20, 'Internal Flooring & Wall Tile Cladding', 'Painter'),
  ('External Development & Site Works', 'External Drainage, Sewer & Water Main Line', 'Finishing & Services', 'Site Boundary', 'once_per_project', 25, 'Plumbing & Sanitary', 'Infrastructure Contractor'),
  ('External Development & Site Works', 'Compound Wall, Main Gate & Paver Paving', 'Finishing & Services', 'Site Boundary', 'once_per_project', 20, 'External Drainage, Sewer & Water Main Line', 'Civil Contractor'),
  ('Testing, Commissioning & Handover', 'MEP Fixture Installation & Pressure Testing', 'Handover', 'All Areas', 'once_per_project', 15, 'Internal Putty, Primer & Emulsion Painting', 'MEP Contractor'),
  ('Testing, Commissioning & Handover', 'Deep Cleaning & Final Handover Inspection', 'Handover', 'All Areas', 'once_per_project', 10, 'MEP Fixture Installation & Pressure Testing', 'Project Manager')
ON CONFLICT DO NOTHING;

-- 18. SEED SYSTEM CONSTRUCTION TEMPLATES
INSERT INTO construction_templates (name, description, building_type, default_floors, is_system)
VALUES 
  ('Standard Multi-Storey Residential (G+N)', 'Standard G+N residential building with parking on ground floor, typical residential upper floors, and terrace water tank.', 'Residential Apartment', 4, TRUE),
  ('Commercial Complex (G+N)', 'Multi-storey commercial complex with retail at ground level, office floor plates, and HVAC/Fire integration.', 'Commercial Complex', 3, TRUE)
ON CONFLICT DO NOTHING;

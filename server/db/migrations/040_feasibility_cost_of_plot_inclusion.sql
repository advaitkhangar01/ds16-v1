-- Migration: 040_feasibility_cost_of_plot_inclusion.sql
-- Description: Adds is_cost_of_plot_included flag to project_financial_viabilities

ALTER TABLE project_financial_viabilities
  ADD COLUMN IF NOT EXISTS is_cost_of_plot_included BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN project_financial_viabilities.is_cost_of_plot_included IS 
  'Whether Cost of Plot is included in Total Project Development Cost calculation (default: true)';

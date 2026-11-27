-- Rollback Migration: 040_feasibility_cost_of_plot_inclusion.down.sql

ALTER TABLE project_financial_viabilities
  DROP COLUMN IF EXISTS is_cost_of_plot_included;

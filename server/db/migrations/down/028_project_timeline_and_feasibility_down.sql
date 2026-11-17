-- server/db/migrations/down/028_project_timeline_and_feasibility_down.sql
-- DS16: Zero-Data-Loss Rollback Script for Migration 028
-- Drops ONLY the newly created Timeline and Feasibility tables
-- Preserves ALL pre-existing core tables (invoices, transactions, attendance, payroll, projects, users)

DROP TABLE IF EXISTS project_feasibility_snapshots CASCADE;
DROP TABLE IF EXISTS feasibility_audit_logs CASCADE;
DROP TABLE IF EXISTS project_salable_units CASCADE;
DROP TABLE IF EXISTS project_statutory_charges CASCADE;
DROP TABLE IF EXISTS project_financial_viabilities CASCADE;
DROP TABLE IF EXISTS project_area_floors CASCADE;
DROP TABLE IF EXISTS project_area_statements CASCADE;
DROP TABLE IF EXISTS timeline_audit_history CASCADE;
DROP TABLE IF EXISTS timeline_task_evidence CASCADE;
DROP TABLE IF EXISTS timeline_task_dependencies CASCADE;
DROP TABLE IF EXISTS timeline_task_assignments CASCADE;
DROP TABLE IF EXISTS timeline_tasks CASCADE;
DROP TABLE IF EXISTS construction_template_activities CASCADE;
DROP TABLE IF EXISTS construction_templates CASCADE;
DROP TABLE IF EXISTS timeline_activity_catalogue CASCADE;
DROP TABLE IF EXISTS timeline_versions CASCADE;
DROP TABLE IF EXISTS timeline_configurations CASCADE;

DELETE FROM schema_migrations WHERE version = '028_project_timeline_and_feasibility.sql';

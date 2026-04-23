-- Migration: Add prospek_notes to daily_inputs
-- Created at: 2026-04-23
-- Description: Adds a JSONB column to store daily interaction notes for MoU prospects.

-- [UP]
ALTER TABLE daily_inputs 
ADD COLUMN prospek_notes JSONB DEFAULT '[]'::jsonb;

-- [DOWN]
-- ALTER TABLE daily_inputs DROP COLUMN prospek_notes;

-- Migration 016: Unify Legacy Targets into Metric Definitions
-- This script copies values from legacy columns (monthly_target_rp/user) 
-- into the unified program_metric_definitions table.

BEGIN;

-- 1. Insert 'revenue' metric for quantitative and hybrid programs
INSERT INTO public.program_metric_definitions (
    program_id, 
    metric_key, 
    label, 
    data_type, 
    input_type, 
    is_target_metric, 
    is_primary, 
    monthly_target, 
    target_direction, 
    unit_label, 
    show_on_dashboard, 
    show_on_tv, 
    display_order, 
    metric_group
)
SELECT 
    p.id as program_id,
    'revenue' as metric_key,
    'Revenue' as label,
    'currency'::text as data_type,
    'manual'::text as input_type,
    true as is_target_metric,
    true as is_primary,
    p.monthly_target_rp as monthly_target,
    'higher_is_better'::text as target_direction,
    'Rp' as unit_label,
    true as show_on_dashboard,
    true as show_on_tv,
    1 as display_order,
    'revenue' as metric_group
FROM public.programs p
WHERE p.target_type IN ('quantitative', 'hybrid')
  AND (p.monthly_target_rp > 0 OR p.daily_target_rp > 0)
  AND NOT EXISTS (
      SELECT 1 FROM public.program_metric_definitions pmd 
      WHERE pmd.program_id = p.id AND pmd.metric_key = 'revenue'
  );

-- 2. Insert 'user_count' metric for quantitative, hybrid, and mou programs
INSERT INTO public.program_metric_definitions (
    program_id, 
    metric_key, 
    label, 
    data_type, 
    input_type, 
    is_target_metric, 
    is_primary, 
    monthly_target, 
    target_direction, 
    unit_label, 
    show_on_dashboard, 
    show_on_tv, 
    display_order, 
    metric_group
)
SELECT 
    p.id as program_id,
    'user_count' as metric_key,
    'Closing/User' as label,
    'integer'::text as data_type,
    'manual'::text as input_type,
    true as is_target_metric,
    true as is_primary,
    p.monthly_target_user as monthly_target,
    'higher_is_better'::text as target_direction,
    'user' as unit_label,
    true as show_on_dashboard,
    true as show_on_tv,
    2 as display_order,
    'user_acquisition' as metric_group
FROM public.programs p
WHERE p.target_type IN ('quantitative', 'hybrid', 'mou')
  AND (p.monthly_target_user > 0 OR p.daily_target_user > 0)
  AND NOT EXISTS (
      SELECT 1 FROM public.program_metric_definitions pmd 
      WHERE pmd.program_id = p.id AND pmd.metric_key = 'user_count'
  );

COMMIT;

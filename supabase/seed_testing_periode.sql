-- Script untuk men-generate data dummy untuk testing fitur periode & program
-- Cara menjalankan: copy-paste di Supabase SQL Editor

DO $$
DECLARE
  v_admin_id UUID;
  
  -- Periods
  v_period_mar UUID := gen_random_uuid();
  v_period_apr UUID := gen_random_uuid();
  
  -- Programs
  v_prog_ads UUID := gen_random_uuid();
  v_prog_mou UUID := gen_random_uuid();
  v_prog_kualitatif UUID := gen_random_uuid();
  v_prog_legacy UUID := gen_random_uuid();
  
  -- Metrics
  v_metric_ads_spend UUID := gen_random_uuid();
  v_metric_ads_leads UUID := gen_random_uuid();
  v_metric_ads_rev   UUID := gen_random_uuid();
  
  v_metric_mou_users UUID := gen_random_uuid();
  v_metric_mou_close UUID := gen_random_uuid();
  
  -- Milestones
  v_ms_1 UUID := gen_random_uuid();
  v_ms_2 UUID := gen_random_uuid();
  v_ms_3 UUID := gen_random_uuid();
  
BEGIN
  -- 1. Ambil salah satu user admin/PIC yang ada (atau sembarang user)
  SELECT id INTO v_admin_id FROM auth.users LIMIT 1;
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Tidak ada user di auth.users. Buat setidaknya 1 user (login sekali).';
  END IF;

  -- ==========================================
  -- 2. CREATE PERIODS
  -- ==========================================
  INSERT INTO public.periods (id, month, year, working_days, is_active, is_locked)
  VALUES 
    (v_period_mar, 3, 2026, 20, false, true), -- Maret 2026 (Arsip & Terkunci)
    (v_period_apr, 4, 2026, 22, true, false)  -- April 2026 (Aktif)
  ON CONFLICT (month, year) DO NOTHING;
  
  -- Jika bentrok (sudah ada), ambil ID nya
  SELECT id INTO v_period_mar FROM public.periods WHERE month = 3 AND year = 2026;
  SELECT id INTO v_period_apr FROM public.periods WHERE month = 4 AND year = 2026;

  -- ==========================================
  -- 3. CREATE PROGRAMS
  -- ==========================================
  
  -- A. ADS PROGRAM (Custom Metrics)
  INSERT INTO public.programs (id, name, pic_name, pic_whatsapp, target_type, monthly_target_rp, monthly_target_user, is_active)
  VALUES (v_prog_ads, '[TEST] Meta Ads Mastery', 'Admin Dummy', '081234567890', 'quantitative', 50000000, 0, true)
  ON CONFLICT DO NOTHING;
  
  -- B. MOU PROGRAM
  INSERT INTO public.programs (id, name, pic_name, pic_whatsapp, target_type, monthly_target_rp, monthly_target_user, is_active)
  VALUES (v_prog_mou, '[TEST] MoU Universitas B', 'Admin Dummy', '081234567890', 'mou', 0, 50, true)
  ON CONFLICT DO NOTHING;

  -- C. KUALITATIF PROGRAM (Milestones Only)
  INSERT INTO public.programs (id, name, pic_name, pic_whatsapp, target_type, monthly_target_rp, monthly_target_user, is_active, qualitative_description)
  VALUES (v_prog_kualitatif, '[TEST] Perilisan App V2', 'Admin Dummy', '081234567890', 'qualitative', 0, 0, true, 'Menyelesaikan semua tahap rilis')
  ON CONFLICT DO NOTHING;

  -- D. LEGACY PROGRAM (Classic Rp/User)
  INSERT INTO public.programs (id, name, pic_name, pic_whatsapp, target_type, monthly_target_rp, monthly_target_user, is_active)
  VALUES (v_prog_legacy, '[TEST] Bootcamp Reguler', 'Admin Dummy', '081234567890', 'quantitative', 100000000, 20, true)
  ON CONFLICT DO NOTHING;

  -- Assign PIC
  INSERT INTO public.program_pics (program_id, profile_id)
  VALUES 
    (v_prog_ads, v_admin_id),
    (v_prog_mou, v_admin_id),
    (v_prog_kualitatif, v_admin_id),
    (v_prog_legacy, v_admin_id)
  ON CONFLICT DO NOTHING;

  -- ==========================================
  -- 4. CREATE METRIC DEFINITIONS & MILESTONES
  -- ==========================================
  
  -- Metrics for ADS
  INSERT INTO public.program_metric_definitions (id, program_id, metric_key, label, metric_group, data_type, input_type, is_primary, is_target_metric, display_order)
  VALUES 
    (v_metric_ads_spend, v_prog_ads, 'ads_spent', 'Budget Iklan', 'ad_spend', 'currency', 'manual', true, false, 1),
    (v_metric_ads_leads, v_prog_ads, 'leads', 'Leads Masuk', 'leads', 'integer', 'manual', true, false, 2),
    (v_metric_ads_rev,   v_prog_ads, 'revenue', 'Omzet', 'revenue', 'currency', 'manual', true, true, 3)
  ON CONFLICT DO NOTHING;

  -- Metrics for MOU
  INSERT INTO public.program_metric_definitions (id, program_id, metric_key, label, metric_group, data_type, input_type, is_primary, is_target_metric, display_order, monthly_target)
  VALUES 
    (v_metric_mou_users, v_prog_mou, 'user_count', 'Mahasiswa', 'user_acquisition', 'integer', 'manual', true, true, 1, 50),
    (v_metric_mou_close, v_prog_mou, 'closing', 'Kampus Closing', 'user_acquisition', 'integer', 'manual', false, false, 2, 2)
  ON CONFLICT DO NOTHING;

  -- Milestones for Kualitatif
  INSERT INTO public.program_milestones (id, program_id, title, description)
  VALUES 
    (v_ms_1, v_prog_kualitatif, 'Tahap 1: UI/UX Design', 'Selesai mockup figma'),
    (v_ms_2, v_prog_kualitatif, 'Tahap 2: API Integration', 'Selesai backend'),
    (v_ms_3, v_prog_kualitatif, 'Tahap 3: UAT', 'Testing bersama user')
  ON CONFLICT DO NOTHING;

  -- ==========================================
  -- 5. SEED DATA FOR PAST PERIOD (MARET)
  -- ==========================================
  
  -- Legacy Program Data (Maret)
  INSERT INTO public.daily_inputs (period_id, program_id, date, achievement_rp, achievement_user, created_by)
  VALUES 
    (v_period_mar, v_prog_legacy, '2026-03-05', 20000000, 5, v_admin_id),
    (v_period_mar, v_prog_legacy, '2026-03-15', 30000000, 10, v_admin_id)
  ON CONFLICT DO NOTHING;

  -- Ads Program Data (Maret)
  INSERT INTO public.daily_inputs (period_id, program_id, date, created_by) VALUES (v_period_mar, v_prog_ads, '2026-03-10', v_admin_id) ON CONFLICT DO NOTHING;
  
  INSERT INTO public.daily_metric_values (period_id, program_id, metric_definition_id, date, value, created_by)
  VALUES (v_period_mar, v_prog_ads, v_metric_ads_spend, '2026-03-10', 1500000, v_admin_id);
  
  -- Kualitatif Data (Maret) - Milestone 1 Selesai di bulan lalu
  INSERT INTO public.milestone_completions (milestone_id, period_id, is_completed, completed_at)
  VALUES (v_ms_1, v_period_mar, true, '2026-03-20')
  ON CONFLICT DO NOTHING;

  -- ==========================================
  -- 6. SEED DATA FOR CURRENT PERIOD (APRIL)
  -- ==========================================
  
  -- Legacy Program Data (April)
  INSERT INTO public.daily_inputs (period_id, program_id, date, achievement_rp, achievement_user, created_by)
  VALUES 
    (v_period_apr, v_prog_legacy, '2026-04-01', 5000000, 1, v_admin_id),
    (v_period_apr, v_prog_legacy, '2026-04-05', 10000000, 2, v_admin_id)
  ON CONFLICT DO NOTHING;

  -- Ads Program Data (April)
  INSERT INTO public.daily_inputs (period_id, program_id, date, created_by) VALUES (v_period_apr, v_prog_ads, '2026-04-02', v_admin_id) ON CONFLICT DO NOTHING;
  
  INSERT INTO public.daily_metric_values (period_id, program_id, metric_definition_id, date, value, created_by)
  VALUES (v_period_apr, v_prog_ads, v_metric_ads_spend, '2026-04-02', 500000, v_admin_id);
  
  INSERT INTO public.daily_metric_values (period_id, program_id, metric_definition_id, date, value, created_by)
  VALUES (v_period_apr, v_prog_ads, v_metric_ads_leads, '2026-04-02', 15, v_admin_id);

  INSERT INTO public.daily_metric_values (period_id, program_id, metric_definition_id, date, value, created_by)
  VALUES (v_period_apr, v_prog_ads, v_metric_ads_rev, '2026-04-02', 3500000, v_admin_id);

  -- Kualitatif Data (April) - Milestone 2
  INSERT INTO public.milestone_completions (milestone_id, period_id, is_completed, completed_at)
  VALUES (v_ms_2, v_period_apr, true, '2026-04-10')
  ON CONFLICT DO NOTHING;

END $$;

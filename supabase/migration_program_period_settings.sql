-- Migration: Add program_period_settings table for carry-over tracking
-- Jalankan di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.program_period_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  carry_over_from_period_id UUID REFERENCES public.periods(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, period_id)
);

-- Enable RLS
ALTER TABLE public.program_period_settings ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage, PICs to read their own
CREATE POLICY "Admin full access on program_period_settings"
  ON public.program_period_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "PIC read own program_period_settings"
  ON public.program_period_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.program_pics
      WHERE program_pics.program_id = program_period_settings.program_id
        AND program_pics.profile_id = auth.uid()
    )
  );

-- Rollback SQL (uncomment jika perlu di-rollback):
-- DROP TABLE IF EXISTS public.program_period_settings;

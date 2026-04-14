-- ============================================================
-- Migration 015: Fix PIC Dashboard Access
-- Granting SELECT access to joint tables required for dashboard aggregation
-- ============================================================

-- ─── program_pics ─────────────────────────────────────────────────────────
-- This table matches users to programs. PICs MUST be able to read their own
-- assignments to filter the dashboard data.

ALTER TABLE program_pics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can do anything on program_pics" ON program_pics;
CREATE POLICY "Admin can do anything on program_pics"
  ON program_pics
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "PIC can read own assignments" ON program_pics;
CREATE POLICY "PIC can read own assignments"
  ON program_pics
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());


-- ─── program_milestones ───────────────────────────────────────────────────
-- Required for qualitative progress calculation on dashboard.

ALTER TABLE program_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can do anything on program_milestones" ON program_milestones;
CREATE POLICY "Admin can do anything on program_milestones"
  ON program_milestones
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Authenticated can read active milestones" ON program_milestones;
CREATE POLICY "Authenticated can read active milestones"
  ON program_milestones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_milestones.program_id
      AND programs.is_active = true
    )
  );

-- ─── Verification ──────────────────────────────────────────────────────────
-- After this migration, the subqueries in 014 (Restricted Programs) will work
-- because the current user now has SELECT permission on program_pics.

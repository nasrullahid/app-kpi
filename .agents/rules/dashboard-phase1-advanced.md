---
trigger: manual
---

## Full Project Context — Dashboard Update (Phase 2)

You are continuing development of an internal business performance dashboard.
This is a solo-developer project using Next.js 14 (App Router), Supabase,
Tailwind CSS, shadcn/ui, deployed on Vercel.

---

## What Is Already Built (Phase 1 — DO NOT break these)

### Features

- Role-based auth: admin and PIC roles via Supabase Auth
- Programs CRUD with fixed targets: target_rp and target_user
- Periods management (monthly, auto working days)
- Daily input form per program
- Monthly dashboard with status indicators:
  ✅ TERCAPAI (≥100%), ⚠ MENUJU TARGET (50–99%), ❌ PERLU PERHATIAN (<50%)
- Daily cumulative dashboard
- Qualitative tracker (manual status: not_started / in_progress / completed)
- Multi-PIC per program via program_pics table
- Milestone system (program_milestones + milestone_completions) — persistent across periods
- TV Dashboard with trend charts, grading (A+/A/B/C), motivational messages
- Radial chart for user target visualization
- WhatsApp notifications via Fonnte API
- RLS enabled on all tables

### Existing Schema (simplified)

```sql
programs (id, name, pic_name, target_type, target_rp, target_user,
          qualitative_description, is_active, created_at)
periods (id, month, year, working_days, is_active)
daily_inputs (id, period_id, program_id, date, achievement_rp,
              achievement_user, qualitative_status, notes, created_by)
program_pics (id, program_id, user_id, role)
program_milestones (id, program_id, title, description, order_index)
milestone_completions (id, milestone_id, period_id, completed_at, completed_by)
users (id, name, email, role, whatsapp_number)
```

---

## Phase 2 — What To Build Now

### 2A. Department System

Add department classification to programs for grouping and filtering.

```sql
-- Migration
ALTER TABLE programs
ADD COLUMN department TEXT NOT NULL DEFAULT 'general';

-- Valid department values (enforce via app-level validation or CHECK constraint):
-- 'sales_marketing'  → Sales & Marketing
-- 'operations'       → Operasional
-- 'creative'         → Creative (content creator, graphic design, video)
-- 'web_it'           → Web & IT Dev
-- 'general_affair'   → General Affair
-- 'customer_service' → Customer Service
-- 'hr'               → HR
-- 'general'          → General (cross-department or uncategorized)
```

UI changes:

- Add department selector to program create/edit form
- Add department filter to all dashboard pages (dropdown, filters by department)
- Group programs by department in the program list page
- No separate department overview page — filter is sufficient

---

### 2B. Flexible Custom Metrics System

Replace the fixed rp/user target structure with a flexible metric definition system.
Programs can define any number of custom KPIs. The existing rp/user fields remain
as legacy columns but new programs use metric_definitions exclusively.

#### New Tables

```sql
-- Define what metrics each program tracks
CREATE TABLE program_metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  -- snake_case identifier, e.g: 'revenue', 'lead_masuk', 'budget_iklan', 'roas'

  label TEXT NOT NULL,
  -- Display name in Bahasa Indonesia, e.g: 'Lead Masuk', 'Budget Iklan + PPn'

  data_type TEXT NOT NULL CHECK (data_type IN (
    'integer',    -- whole numbers (leads, users, closing count)
    'currency',   -- Rp amounts (budget, omzet, fee)
    'percentage', -- 0-100 values shown as %
    'float',      -- decimal numbers (ROAS, CPP)
    'boolean'     -- yes/no (status pembayaran)
  )),

  input_type TEXT NOT NULL CHECK (input_type IN (
    'manual',      -- user types this value
    'calculated'   -- derived from formula, shown read-only
  )),

  formula TEXT,
  -- Only for calculated metrics. Uses metric_key tokens.
  -- Examples:
  --   ROAS:            'omzet / budget_iklan'
  --   Conversion Rate: 'closing / lead_masuk'
  --   CPP Real:        'budget_iklan / closing'
  -- Supported operators: / * + -
  -- Safe evaluation only — NO eval(). Use a whitelist formula parser.

  is_target_metric BOOLEAN DEFAULT false,
  -- If true, this metric has a monthly target and appears on dashboard progress cards

  monthly_target NUMERIC,
  -- Required if is_target_metric = true

  target_direction TEXT DEFAULT 'higher_is_better' CHECK (target_direction IN (
    'higher_is_better',  -- revenue, users, closing → want to exceed target
    'lower_is_better'    -- CPP, complaint count → want to stay below target
  )),

  unit_label TEXT,
  -- Display suffix: 'Rp', '%', 'leads', 'x', 'hari', etc.

  show_on_dashboard BOOLEAN DEFAULT true,
  -- Whether this metric appears on the main dashboard card

  show_on_tv BOOLEAN DEFAULT true,
  -- Whether this metric appears on the TV dashboard

  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(program_id, metric_key)
);

-- Daily input values for custom metrics
CREATE TABLE daily_metric_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES periods(id),
  program_id UUID NOT NULL REFERENCES programs(id),
  metric_definition_id UUID NOT NULL REFERENCES program_metric_definitions(id),
  date DATE NOT NULL,
  value NUMERIC,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period_id, program_id, metric_definition_id, date)
);
```

#### Backward Compatibility Migration

```sql
-- Seed metric_definitions from existing programs so nothing breaks
INSERT INTO program_metric_definitions
  (program_id, metric_key, label, data_type, input_type,
   is_target_metric, monthly_target, unit_label, display_order)
SELECT
  id,
  'revenue',
  'Pendapatan',
  'currency',
  'manual',
  true,
  target_rp,
  'Rp',
  1
FROM programs
WHERE target_rp IS NOT NULL AND target_rp > 0;

INSERT INTO program_metric_definitions
  (program_id, metric_key, label, data_type, input_type,
   is_target_metric, monthly_target, unit_label, display_order)
SELECT
  id,
  'user_count',
  'Jumlah User',
  'integer',
  'manual',
  true,
  target_user,
  'user',
  2
FROM programs
WHERE target_user IS NOT NULL AND target_user > 0;
```

#### Calculated Metrics Engine

Build a safe formula evaluator (no eval()):

- Input: formula string + object of { metric_key: value }
- Parse tokens: only allow metric_keys, numbers, and operators (+ - \* /)
- Return computed value or null if any required metric is missing/zero
- Handle division by zero gracefully (return null, display as "—")

```typescript
// Example interface
function evaluateFormula(
  formula: string,
  values: Record<string, number | null>,
): number | null;
```

#### Preset Templates (for faster program creation)

When creating a new program, offer optional metric templates:

```typescript
const METRIC_TEMPLATES = {
  advertising: {
    label: "Advertising (Advertiser & CS)",
    metrics: [
      {
        metric_key: "lead_masuk",
        label: "Lead Masuk",
        data_type: "integer",
        input_type: "manual",
        is_target_metric: false,
        unit_label: "leads",
        display_order: 1,
      },
      {
        metric_key: "budget_iklan",
        label: "Budget Iklan + PPn",
        data_type: "currency",
        input_type: "manual",
        is_target_metric: false,
        unit_label: "Rp",
        display_order: 2,
      },
      {
        metric_key: "closing",
        label: "Closing",
        data_type: "integer",
        input_type: "manual",
        is_target_metric: true,
        unit_label: "closing",
        display_order: 3,
      },
      {
        metric_key: "omzet",
        label: "Omzet",
        data_type: "currency",
        input_type: "manual",
        is_target_metric: true,
        unit_label: "Rp",
        display_order: 4,
      },
      {
        metric_key: "conversion_rate",
        label: "Conversion Rate",
        data_type: "percentage",
        input_type: "calculated",
        formula: "closing / lead_masuk",
        is_target_metric: false,
        unit_label: "%",
        display_order: 5,
      },
      {
        metric_key: "roas",
        label: "ROAS",
        data_type: "float",
        input_type: "calculated",
        formula: "omzet / budget_iklan",
        is_target_metric: false,
        unit_label: "x",
        display_order: 6,
      },
      {
        metric_key: "cpp_real",
        label: "CPP Real",
        data_type: "currency",
        input_type: "calculated",
        formula: "budget_iklan / closing",
        is_target_metric: false,
        target_direction: "lower_is_better",
        unit_label: "Rp",
        display_order: 7,
      },
    ],
  },
  sales_basic: {
    label: "Sales Dasar (Rp + User)",
    metrics: [
      {
        metric_key: "revenue",
        label: "Pendapatan",
        data_type: "currency",
        input_type: "manual",
        is_target_metric: true,
        unit_label: "Rp",
        display_order: 1,
      },
      {
        metric_key: "user_count",
        label: "Jumlah User",
        data_type: "integer",
        input_type: "manual",
        is_target_metric: true,
        unit_label: "user",
        display_order: 2,
      },
    ],
  },
  qualitative_only: {
    label: "Kualitatif (Milestone Only)",
    metrics: [], // no numeric metrics, milestones handle everything
  },
};
```

---

### 2C. Fee & Bonus Tracking System

Applicable to any program in any department that has performance-based compensation.

```sql
-- Fee rules per program (admin configures once)
CREATE TABLE program_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  role_label TEXT NOT NULL,
  -- e.g: 'Advertiser', 'CS', 'PIC', 'Closer', 'Setter'

  condition TEXT NOT NULL CHECK (condition IN ('tercapai', 'tidak_tercapai')),
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily fee records (auto-generated based on daily input + fee rules)
CREATE TABLE daily_fee_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES periods(id),
  program_id UUID NOT NULL REFERENCES programs(id),
  date DATE NOT NULL,
  role_label TEXT NOT NULL,
  pic_id UUID REFERENCES users(id),
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  payment_proof_url TEXT,           -- Supabase Storage URL
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period_id, program_id, date, role_label, pic_id)
);
```

Fee page (admin only):

- List unpaid fees grouped by period → program → role
- Bulk mark as paid with payment date input
- Upload payment proof to Supabase Storage
- Running balance summary per person
- Monthly fee recap table

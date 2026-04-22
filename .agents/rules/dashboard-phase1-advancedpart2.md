---
trigger: manual
---

### 2D. UI Component Changes

#### Dynamic Daily Input Form

Current: fixed fields (achievement_rp, achievement_user)
New: render fields dynamically from program_metric_definitions

- show manual fields as inputs (type based on data_type)
- show calculated fields as live read-only preview
- update calculated values on the fly as user types
- save to daily_metric_values table

#### Dynamic Dashboard Card

Current: always shows Rp progress + User progress
New: render progress bars only for metrics where is_target_metric = true

- each program card adapts to its own metrics
- handle 1, 2, 3, or more target metrics gracefully
- for lower_is_better metrics, invert the progress color logic

#### Program Form — Step 2: Define Metrics

After basic info (name, PIC, department), show metric builder:

Option A: Choose a template (advertising, sales_basic, qualitative_only)
Option B: Build custom — add/remove/reorder metric rows
Each row: metric_key (auto from label), label, data_type, input_type
If calculated: show formula input with autocomplete for existing metric_keys
If is_target_metric: show monthly_target input

---

## RLS Policies for New Tables

Follow the same pattern as existing tables:

```sql
-- program_metric_definitions: readable by all authenticated,
--   writable only by admin
-- daily_metric_values: readable by program's PIC team and admin,
--   writable by program's PIC team and admin
-- program_fee_rules: admin only
-- daily_fee_records: admin can see all, PIC can see their own
```

---

## Build Order

Execute strictly in this order, confirm each step before proceeding:

1. Database migration (2A department + 2B metrics tables + 2C fee tables + RLS)
2. Run backward compatibility seed for existing programs
3. Update TypeScript types (regenerate from Supabase)
4. Metric template presets + formula evaluator utility
5. Update program create/edit form (add department + metric builder step)
6. Update daily input form (dynamic fields)
7. Update dashboard cards (dynamic metrics)
8. Fee tracking page (admin)
9. Add department filter to all dashboard pages
10. Update TV dashboard to support custom metrics display

## Constraints

- Never break existing milestone, multi-PIC, grading, or TV dashboard features
- No eval() for formula evaluation — whitelist parser only
- All monetary values stored as NUMERIC in database, formatted client-side
- Language: Bahasa Indonesia for all UI labels
- Mobile responsive — daily input form will be used from phone

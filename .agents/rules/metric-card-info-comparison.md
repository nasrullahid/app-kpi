---
trigger: manual
---

You are a senior fullstack engineer. I need you to refactor and improve KPI dashboard metric logic and UI behavior.

## CONTEXT

This dashboard currently:

- Uses cumulative comparison vs 3 days ago (which is misleading)
- Has multiple metric cards (omzet, ads, ringkasan)
- Supports date range filtering

We want to fix the KPI logic so it reflects **actual performance**, not just accumulation.

---

## GOAL

Refactor ALL KPI metric calculations and card behaviors based on metric type:

1. Flow metrics → use 3-day average comparison
2. Ratio metrics → use rolling average (3–7 days)
3. Target/progress metrics → use prorata (expected progress)
4. Status metrics → no comparison

Also ensure all logic adapts correctly when date range filter is applied.

---

## STEP 1 — DEFINE METRIC TYPES

Create a clear classification system:

- FLOW metrics:
  - daily_revenue
  - daily_users
  - ads_spend
  - goals

- RATIO metrics:
  - roas
  - cpp

- TARGET metrics:
  - total_revenue
  - achievement_percentage
  - remaining_target

- STATUS metrics:
  - active_programs
  - milestone_done
  - target_achieved

---

## STEP 2 — IMPLEMENT NEW CALCULATION LOGIC

### 2.1 FLOW METRICS (3-DAY AVG COMPARISON)

If no date filter:

- last3 = avg(last 3 days)
- prev3 = avg(previous 3 days)
- change = (last3 - prev3) / prev3

If date filter applied:

- last3 = last 3 days within selected range
- prev3 = 3 days before last3 (still within range)

If total days < 6:

- disable comparison

---

### 2.2 RATIO METRICS (ROLLING AVG)

- Use rolling average (3-day default)
- Optionally support 7-day smoothing
- DO NOT compare cumulative values

---

### 2.3 TARGET / PROGRESS METRICS (PRORATA)

DO NOT use 3-day comparison.

Instead compute:

- total_actual = sum within selected range

- total_target = full period target (NOT reduced by filter)

- elapsed_days = days passed in period (or within filter)

- total_days = total working days in period

- expected_progress = elapsed_days / total_days

- actual_progress = total_actual / total_target

- status:
  - if actual < expected → "behind"
  - if equal → "on track"
  - if above → "ahead"

---

### 2.4 ADD REQUIRED DAILY RUN RATE

For remaining_target:

- remaining = target - actual

- remaining_days = total_days - elapsed_days

- required_per_day = remaining / remaining_days

Return this value for UI display.

---

### 2.5 STATUS METRICS

- Show only raw value
- NO comparison
- NO arrows

---

## STEP 3 — UI LOGIC RULES

### 3.1 Arrow Indicators

- Only show ↑ ↓ for:
  - flow metrics
  - ratio metrics

- Do NOT show arrows for:
  - total revenue
  - achievement %
  - remaining target
  - status metrics

---

### 3.2 LABELING

Replace all:
"vs 3 days ago"

With dynamic labels:

- Flow:
  "vs avg previous 3 days"

- Ratio:
  "rolling 3-day avg"

- Target:
  "vs expected progress"

---

### 3.3 COLOR RULES

- Green → above target / improving
- Red → below expected / declining
- Neutral (gray) → status metrics

---

### 3.4 DISABLE INVALID COMPARISON

If:

- data < required window (e.g. < 6 days)

Then:

- hide comparison section

---

## STEP 4 — DATE RANGE FILTER HANDLING

When date filter is applied:

- ALL calculations must use ONLY data inside the range
- EXCEPT total_target (still full period target)

Flow comparison:

- must be calculated within range

Target metrics:

- expected_progress must adapt to filtered days

---

## STEP 5 — CLEANUP OLD LOGIC

REMOVE:

- cumulative vs 3-days-ago comparison
- misleading upward arrows on totals

---

## STEP 6 — OPTIONAL IMPROVEMENT

Add new metric card:

"Required Daily Revenue"

Display:

- required_per_day
- compare with current daily avg

---

## OUTPUT

Refactor:

- calculation functions
- API/query logic (if needed)
- frontend card components

Ensure:

- consistent behavior across all dashboards
- no misleading KPI interpretation

---

## IMPORTANT

- Keep code clean and modular
- Separate logic per metric type
- Avoid duplication
- Add helper functions for:
  - get3DayAverage()
  - getRollingAverage()
  - getExpectedProgress()

---

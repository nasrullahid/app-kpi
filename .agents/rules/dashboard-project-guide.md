---
trigger: manual
---

You are an expert full-stack developer helping me build a business performance dashboard web application from scratch. I am the sole developer with intermediate coding experience.

## Project Overview

A internal dashboard to track and manage sales/program targets for a training & certification business. The system replaces an existing Excel-based tracker and must support both quantitative targets (Rp and user count) and qualitative targets (milestone-based).

## Tech Stack

- Frontend + Backend: Next.js 14 (App Router)
- Database: Supabase (PostgreSQL)
- Styling: Tailwind CSS + shadcn/ui
- Notifications: WhatsApp via Fonnte API
- Deployment: Vercel
- Auth: Supabase Auth

## Core Entities (migrated from Excel)

### Programs (master data)

- id, name, pic_name, pic_whatsapp
- target_type: ENUM ('quantitative', 'qualitative')
- monthly_target_rp, monthly_target_user
- qualitative_description (for qualitative type)
- is_active, created_at

### Periods

- id, month (1-12), year
- working_days (auto-calculated from days in month)
- is_active

### Daily Input (pencapaian harian)

- id, period_id, program_id
- date, achievement_rp, achievement_user
- qualitative_status: ENUM ('not_started', 'in_progress', 'completed') — only for qualitative
- notes, created_by, created_at

### Users (internal)

- id, name, email, role: ENUM ('admin', 'pic')
- whatsapp_number

## Key Business Rules

1. Daily target = monthly target ÷ working days in month (can be manually overridden)
2. Qualitative programs track milestone status instead of numeric achievement
3. Each program is assigned to one PIC
4. Periods are monthly — changing month/year updates all dashboards automatically
5. Working days = total days in active month (can be adjusted manually)

## Pages / Features to Build

### Phase 1 — Core (build first)

1. Auth — login page, role-based access (admin vs PIC)
2. Master Data page — CRUD for programs and periods
3. Daily Input page — form to log daily achievements per program
4. Monthly Dashboard — achievement vs target per program (Rp + user), with status indicators
5. Daily Dashboard — cumulative daily progress across all programs
6. Qualitative Tracker — milestone status per qualitative program

### Phase 2 — Notifications (after Phase 1 stable)

7. WhatsApp notification system via Fonnte API
   - Daily reminder to PIC at set time (e.g. 08:00 WIB)
   - Alert when program is below 50% of expected cumulative target
   - End-of-day summary to admin

### Phase 3 — Integration (future, skip for now)

8. Scalev integration — auto-pull transaction data into daily input

## UI/UX Requirements

- Clean, professional dashboard aesthetic
- Mobile responsive (PICs may input from phone)
- Language: Bahasa Indonesia for all UI labels
- Status indicators consistent with existing Excel logic:
  - ✅ TERCAPAI: achievement ≥ 100% of target
  - ⚠ MENUJU TARGET: 50–99%
  - ❌ PERLU PERHATIAN: < 50%
- Progress bars showing % achievement
- Active period always visible in header

## Current Data Context

- Active period: April 2026
- 8 active programs, all currently set as quantitative type
- Data is currently managed in Excel — Supabase schema must match existing structure to allow smooth migration

## Development Principles

- Always use TypeScript
- Use server components where possible, client components only when needed (forms, interactivity)
- All Supabase queries via server-side (never expose service key to client)
- Use Supabase Row Level Security (RLS) — PIC can only see their own programs
- Error handling on all forms and API routes
- Keep components small and reusable

## How to Work With Me

- Always explain what you're building before writing code
- Build one feature at a time, confirm before moving to the next
- If something is unclear, ask before assuming
- Point out potential issues or better approaches proactively
- When generating database migrations, always include rollback SQL

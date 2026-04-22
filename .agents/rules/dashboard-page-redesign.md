---
trigger: manual
---

## Feature: Metric Groups, Adaptive Dashboard & Department Sub-Dashboard

### Context

Sistem sudah memiliki:

- program_metric_definitions dengan field metric_key, label, data_type,
  input_type, formula, is_target_metric, monthly_target, target_direction,
  unit_label, display_order
- Preset metric templates (advertising, sales_basic, qualitative_only)
- Department field di tabel programs
- Daily metric values tersimpan di daily_metric_values
- Dashboard utama saat ini hardcode untuk Rp dan User

---

## Part 1: Tambah metric_group ke Schema

### Migration

```sql
ALTER TABLE program_metric_definitions
ADD COLUMN metric_group TEXT DEFAULT NULL;

-- Valid metric_group values (null = standalone, tidak diagregasi):
-- 'revenue'          → Total Pendapatan (currency, higher is better)
-- 'user_acquisition' → Total User/Peserta (integer, higher is better)
-- 'ad_spend'         → Total Biaya Akuisisi (currency, lower is better)
-- 'conversion'       → Rata-rata Konversi (percentage, higher is better)
-- 'efficiency'       → Efisiensi Biaya seperti ROAS (float, higher is better)
-- 'leads'            → Total Lead/Prospek (integer, higher is better)
```

### Update Template Presets

Tambahkan metric_group ke setiap metrik dalam template yang sudah ada.
Metrik yang ditambahkan manual oleh admin (custom) selalu metric_group = null.

```typescript
const METRIC_TEMPLATES = {
  advertising: {
    label: 'Advertising (Advertiser & CS)',
    metrics: [
      { metric_key: 'lead_masuk',       metric_group: 'leads',            ... },
      { metric_key: 'budget_iklan',     metric_group: 'ad_spend',         ... },
      { metric_key: 'closing',          metric_group: 'user_acquisition',  ... },
      { metric_key: 'omzet',            metric_group: 'revenue',          ... },
      { metric_key: 'conversion_rate',  metric_group: 'conversion',       ... },
      { metric_key: 'roas',             metric_group: 'efficiency',       ... },
      { metric_key: 'cpp_real',         metric_group: null,               ... },
      // cpp_real standalone — tidak diagregasi lintas program
    ]
  },
  sales_basic: {
    label: 'Sales Dasar (Rp + User)',
    metrics: [
      { metric_key: 'revenue',    metric_group: 'revenue',          ... },
      { metric_key: 'user_count', metric_group: 'user_acquisition', ... },
    ]
  },
  qualitative_only: {
    label: 'Kualitatif (Milestone Only)',
    metrics: []
  }
}
```

### Backward Compatibility

Update seed yang sudah ada untuk program lama:

```sql
UPDATE program_metric_definitions
SET metric_group = 'revenue'
WHERE metric_key = 'revenue';

UPDATE program_metric_definitions
SET metric_group = 'user_acquisition'
WHERE metric_key = 'user_count';
```

---

## Part 2: Redesign Dashboard Utama

### Tujuan

Dashboard utama menjadi overview universal yang berlaku untuk semua program
tanpa peduli metrik spesifiknya. Tidak ada lagi hardcode Rp atau User.

### Layout Baru

#### Row 1 — Universal KPI Cards (4 card)

Semua dihitung dari data aktual periode aktif:
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ HEALTH SCORE │ │ PROGRAM AKTIF │ │ TARGET TERCAPAI │ │ MILESTONE DONE │
│ │ │ │ │ │ │ │
│ 73.5% │ │ 8 program │ │ 3 / 8 │ │ 12 / 20 │
│ Baik │ │ 3 dept │ │ bulan ini │ │ semua periode │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘

Kalkulasi Health Score:

- Ambil semua program aktif periode ini
- Hitung % capaian per program berdasarkan is_target_metric = true
- Jika program kualitatif only → gunakan % milestone selesai
- Health Score = rata-rata % capaian semua program
- Label: Kritis (<40%), Perlu Perhatian (40-59%), Cukup (60-79%),
  Baik (80-99%), Excellent (≥100%)

#### Row 2 — Department Progress Bars

┌─────────────────────────────────────────────────────────────────────┐
│ Progres per Departemen │
│ │
│ Sales & Marketing ████████░░░░ 67% 4 program → Lihat Detail │
│ Operasional █████░░░░░░░ 45% 2 program → Lihat Detail │
│ Creative ██░░░░░░░░░░ 18% 2 program → Lihat Detail │
└─────────────────────────────────────────────────────────────────────┘

- Hanya tampilkan department yang memiliki minimal 1 program aktif
- % per department = rata-rata health score semua program di department itu
- Klik "Lihat Detail" → navigasi ke /dashboard/[department]
- Warna progress bar mengikuti threshold health score

#### Row 3 — Charts (2 kolom)

Kiri: Tren Health Score harian (line chart, 0-100%)

- X axis: tanggal 1-30/31
- Y axis: 0-100%
- Satu line per department, warna berbeda
- Tooltip: nama department + % saat hover

Kanan: Program Perlu Perhatian

- List program dengan health score < 50%
- Tampilkan: nama program, department badge, % capaian,
  tombol → ke detail program
- Jika semua program sehat → tampilkan pesan positif

#### Motivational Banner

Tetap ada seperti sekarang, tapi teks berdasarkan health score keseluruhan:

- < 40% : "TARGET JAUH TERTINGGAL — FOKUS DAN KEJAR SEKARANG! 💪"
- 40-59% : "MASIH ADA WAKTU — TINGKATKAN INTENSITAS! 🔥"
- 60-79% : "PROGRES BAGUS — JANGAN KENDUR! 🎯"
- 80-99% : "HAMPIR SAMPAI — SATU LANGKAH LAGI! 🚀"
- ≥ 100% : "TARGET TERCAPAI — LUAR BIASA! 🏆"

---

## Part 3: Dashboard per Department

Route: /dashboard/[department]
Contoh: /dashboard/sales_marketing

### Layout

#### Header

← Dashboard Utama Sales & Marketing April 2026 ▼
4 program aktif

#### Row 1 — Aggregated Metric Cards

Tampilkan card hanya untuk metric_group yang ada di department ini.
Card dirender dinamis — tidak hardcode.

```typescript
// Logic server-side:
// 1. Ambil semua program di department ini
// 2. Ambil semua metric_definitions dengan metric_group != null
// 3. Group by metric_group
// 4. Untuk setiap group: SUM nilai aktual bulan ini dari daily_metric_values
// 5. Bandingkan dengan SUM monthly_target dari metric_definitions
// 6. Render card per group

// Contoh hasil untuk Sales & Marketing:
// group 'revenue'          → Total Pendapatan: Rp 46jt / Rp 150jt (31%)
// group 'user_acquisition' → Total Closing: 99 / 228 (43%)
// group 'leads'            → Total Lead: 228 (no target)
// group 'ad_spend'         → Total Budget: Rp 11jt (informational)
// group 'conversion'       → Avg CR: 43% (weighted average, bukan rata-rata biasa)
// group 'efficiency'       → Avg ROAS: 4.1x (weighted average)
```

Aturan agregasi per group:

- revenue, ad_spend, leads, user_acquisition → SUM
- conversion, efficiency → weighted average
  (hitung ulang dari total raw values, bukan average of averages)
- Jika group tidak punya monthly_target → tampil sebagai informational
  card (tanpa progress bar, tanpa status warna)

#### Row 2 — Program Cards

Satu card per program di department ini.
Setiap card menampilkan:

- Nama program + PIC avatars
- Metrik yang is_target_metric = true dengan progress bar
- Metrik standalone (metric_group = null) ditampilkan sebagai
  secondary info tanpa progress bar
- Status badge (Tercapai / Menuju Target / Perlu Perhatian / Kritis)
- Tombol → ke detail program

Contoh card untuk program Advertising:
┌─────────────────────────────────────────────┐
│ Iklan Meta - Q2 2026 [ADV] [CS] │
│ Sales & Marketing │
│ │
│ Closing ████████░░ 78% 99/228 closing │
│ Omzet █████░░░░░ 46% Rp46jt/Rp100jt │
│ │
│ Lead: 228 │ ROAS: 4.1x │ CPP: Rp113rb │
│ (secondary info, no progress bar) │
│ ⚠ MENUJU TARGET │
└─────────────────────────────────────────────┘

Contoh card untuk program Kualitatif (milestone only):
┌─────────────────────────────────────────────┐
│ Kerjasama LPK [PIC] │
│ Operasional │
│ │
│ Milestone ████████░░ 60% 3/5 selesai │
│ │
│ ✓ Tanda tangan MOU │
│ ✓ Kick-off meeting │
│ ○ Launch program │
│ ⚠ MENUJU TARGET │
└─────────────────────────────────────────────┘

#### Row 3 — Department Charts (2 kolom)

Kiri: Tren akumulasi metric_group 'revenue' bulan ini (jika ada)
Fallback jika tidak ada revenue: tren health score department
Kanan: Bar chart perbandingan % capaian antar program di department ini

---

## Part 4: Aturan Rendering Card yang Perlu Perhatian

### Program dengan Metrik Campuran (template + custom)

Metrik dari template → punya metric_group → ikut agregasi department card
Metrik custom tambahan → metric_group = null → tampil sebagai secondary info

### Program dengan Semua Metrik Custom (tidak pakai template)

Semua metric_group = null → tidak ada card agregasi untuk program ini
Program tetap tampil di list program cards
Health score program dihitung dari is_target_metric = true
tanpa peduli metric_group

### Department dengan Program Metrik Campur-campur

Contoh: Sales & Marketing punya Iklan Meta (advertising template)
dan Affiliate (custom semua)

→ Card agregasi hanya dari program yang punya metric_group
→ Ada disclaimer kecil: "Agregasi dari 1/2 program
(1 program menggunakan metrik khusus)"
→ Program dengan metrik custom tetap tampil di program cards

### Tidak Ada Data Hari Ini

Card agregasi tetap tampil dengan nilai bulan berjalan
Tambahkan badge kecil "Belum ada input hari ini"
di pojok kanan atas department section

---

## Part 5: Navigation & Filter

### Filter Global (berlaku di semua halaman dashboard)

Simpan di URL params supaya bisa di-share/bookmark:

- period: ?period=2026-04 (default: periode aktif)
- department: ?dept=sales_marketing (default: all)

### Breadcrumb

Dashboard Utama → Sales & Marketing → Iklan Meta - Q2 2026

---

## Data Fetching Strategy

### Dashboard Utama

Single query yang efisien:

```typescript
// Fetch semua yang dibutuhkan dalam 1 round trip ke Supabase:
// 1. programs + metric_definitions (join)
// 2. daily_metric_values untuk periode aktif (aggregate by program)
// 3. milestone_completions untuk periode aktif (count by program)
// Cache dengan Next.js revalidate: 300 (5 menit)
```

### Dashboard Department

```typescript
// Filter by department, struktur query sama
// Tambahan: group metric values by metric_group untuk aggregated cards
```

---

## Yang Tidak Boleh Diubah

- Halaman Pencapaian Harian (pivot table yang baru dibangun)
- TV Dashboard
- Sistem milestone
- Notifikasi WhatsApp
- RLS policies

---

## Build Order

1. Migration tambah metric_group + update template presets
2. Backward compatibility update untuk program lama
3. Utility function: aggregateByMetricGroup(programs, metricValues)
4. Utility function: calculateDepartmentHealth(programs, metricValues)
5. Redesign dashboard utama (4 KPI cards + department bars + charts)
6. Halaman dashboard per department (/dashboard/[department])
7. Dynamic program cards (template + custom + kualitatif)
8. Filter & navigation (URL params + breadcrumb)
9. Verifikasi tidak ada regresi di halaman lain

---
trigger: manual
---

## Part 3: Redesign Dashboard Utama

Route: /dashboard

### Layout

#### Header Bar

#### Header Bar

Dashboard Kinerja Periode: April 2026 ▼
Pantau progres kinerja bisnis secara global.
[📊 Overview] [🎯 Target] [📺 Ads Performance] ← toggle tabs

---

### Tab 1: Overview (default)

#### Row 1 — 4 Universal KPI Cards

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ HEALTH SCORE │ │ PROGRAM AKTIF │ │ TARGET TERCAPAI │ │ MILESTONE │
│ │ │ │ │ │ │ │
│ 73.5% │ │ 8 program │ │ 3 / 8 │ │ 12 / 20 │
│ ● Baik │ │ 4 departemen │ │ bulan ini │ │ selesai │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘

Health Score label dan warna:

- < 40% : ● Kritis (merah)
- 40-59% : ● Perlu Perhatian (oranye)
- 60-79% : ● Cukup (kuning)
- 80-99% : ● Baik (hijau)
- ≥ 100% : ● Excellent (biru/gold)

#### Row 2 — Motivational Banner

Teks dinamis berdasarkan health score (seperti yang sudah ada).

#### Row 3 — Semua Program Cards

Filter bar di atas:
[🔍 Cari program...] [Dept: Semua ▼] [Status: Semua ▼] [Urutkan: Health Score ▼]

Program cards dalam grid (2 kolom desktop, 1 kolom mobile).
Setiap card menampilkan:

- Nama program + department badge + PIC avatars
- Progress bar PRIMARY metrics saja (Rp dan User)
- Program kualitatif: progress bar milestone %
- Secondary metrics ditampilkan sebagai chips kecil di bawah
  (informatif, tanpa progress bar)
- Health Score badge di pojok kanan atas
- Status badge di bawah (Tercapai / Menuju Target / Perlu Perhatian / Kritis)

┌─────────────────────────────────────────────────┐
│ Iklan Meta - Q2 2026 [Sales & Mktg] [A] [B] │
│ Health: 62% │
│ Omzet ████████░░ 46% Rp46jt / Rp100jt │
│ User ██████░░░░ 43% 99 / 228 closing │
│ │
│ [ROAS: 4.1x] [Lead: 228] [CPP: Rp113rb] │
│ ⚠ MENUJU TARGET │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ Kerjasama LPK [Operasional] [C] │
│ Health: 60% │
│ Milestone ████████░░ 60% 3 / 5 selesai │
│ ✓ Tanda tangan MOU │
│ ✓ Kick-off meeting │
│ ○ Launch program │
│ ⚠ MENUJU TARGET │
└─────────────────────────────────────────────────┘

#### Row 4 — Charts (2 kolom)

Kiri: Line chart — Tren Health Score harian (semua program digabung)
Kanan: Bar chart — % capaian per program (snapshot bulan ini,
urut dari tertinggi ke terendah)

---

### Tab 2: Target

Fokus ke primary metrics (Rp dan User) saja.

#### Row 1 — 4 Cards

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ TOTAL TARGET Rp │ │ TOTAL CAPAIAN Rp│ │ TOTAL TARGET │ │ TOTAL CAPAIAN │
│ │ │ │ │ USER │ │ USER │
│ Rp 460jt │ │ Rp 46jt (10%) │ │ 670 user │ │ 99 user (15%) │
│ Day pro-rata: │ │ Real/day: Rp Xjt│ │ Day pro-rata: X │ │ Real/day: X │
│ Rp 15.3jt │ │ │ │ │ │ │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
Hanya tampilkan program yang punya primary metrics (revenue dan/atau user_count).
Program kualitatif only tidak muncul di tab ini.

#### Row 2 — Charts

Kiri: Line chart — tren akumulasi Rp harian vs target kumulatif
Kanan: Bar chart — capaian Rp per program

---

### Tab 3: Ads Performance

Tampilkan hanya program yang memiliki minimal satu metrik dengan
metric_group = 'ad_spend' ATAU metric_key IN
('ads_spent', 'leads', 'roas', 'cpp', 'cpm', 'cpc',
'adds_to_cart', 'conversion_rate', 'cost_per_goal').

Auto-detect — tidak perlu flag tambahan di program.

#### Filter Bar

[Program: Semua Ads Program ▼] ← bisa pilih spesifik satu program
[Periode: April 2026 ▼]

Saat satu program dipilih → tampilan menjadi detail program tersebut.
Saat "Semua" → tampilan agregat semua ads program.

#### Mode Semua Ads Program

Row 1 — Aggregated Ads KPI Cards:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ TOTAL │ │ TOTAL GOALS │ │ AVG ROAS │ │ AVG CPP │
│ ADS SPENT │ │ │ │ │ │ │
│ Rp 11.2jt │ │ 99 closing │ │ 4.1x │ │ Rp 113rb │
│ bulan ini │ │ bulan ini │ │ weighted │ │ target:60rb │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Kalkulasi:

- Total Ads Spent = SUM semua ads_spent
- Total Goals = SUM semua user_count (program ads)
- Avg ROAS = total_revenue / total_ads_spent (weighted, bukan avg of avg)
- Avg CPP = total_ads_spent / total_goals (weighted)

Row 2 — Performance in Graph (mirip Scalev):
Compared: [Ads Spent ▼] With: [ROAS ▼]
┌─────────────────────────────────────────────────────────┐
│ Bar (Ads Spent harian) + Line overlay (ROAS harian) │
│ Dual Y-axis: kiri = Rp, kanan = multiplier │
│ X-axis: tanggal 1-30 │
│ Tooltip: tanggal, ads spent, ROAS, goals │
└─────────────────────────────────────────────────────────┘
Dropdown "Compared" options: Ads Spent, Goals, Leads, CPM, CPC
Dropdown "With" options: ROAS, CPP, Conversion Rate, Goals, Leads
Kombinasi bebas — render ulang chart saat dropdown berubah.

Row 3 — Per Program Ads Table:
Program │ Ads Spent │ Goals │ ROAS │ CPP │ CR │ Status
─────────────────┼─────────────┼───────┼───────┼──────────┼───────┼───────
Iklan Meta │ Rp 8jt │ 67 │ 4.5x │ Rp 119rb │ 41% │ ⚠
Iklan Google │ Rp 3.2jt │ 32 │ 3.2x │ Rp 100rb │ 38% │ ⚠
─────────────────┼─────────────┼───────┼───────┼──────────┼───────┼───────
TOTAL/AVG │ Rp 11.2jt │ 99 │ 4.1x │ Rp 113rb │ 43% │

Kolom ditampilkan dinamis — hanya kolom yang ada datanya.
Klik nama program → filter ke mode detail program tersebut.

#### Mode Detail Satu Program

Saat user pilih program spesifik dari dropdown:

Row 1 — Program KPI Cards (semua metrik ads program itu):
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ ADS SPENT│ │ GOALS │ │ ROAS │ │ CPP │ │ CR │ │ LEADS │
│ Rp 8jt │ │ 67 │ │ 4.5x │ │ Rp 119rb │ │ 41% │ │ 163 │
│ bulan ini│ │ closing │ │ │ │ vs 60rb↑ │ │ │ │ │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘

Card CPP: karena lower_is_better, tampilkan:

- Hijau jika CPP < target CPP
- Merah jika CPP > target CPP
- Panah ↑ (merah, buruk) atau ↓ (hijau, bagus)

Row 2 — Performance Graph (sama seperti mode semua, tapi data 1 program)

Row 3 — Daily Detail Table:
Tgl │ Leads │ Ads Spent │ Goals │ Omzet │ CR │ ROAS │ CPP
─────┼───────┼─────────────┼───────┼──────────┼───────┼───────┼────────
1 │ 21 │ Rp 971.950 │ 8 │ Rp 2.4jt │ 38% │ 2.47x │ 121rb
2 │ 9 │ Rp 1.119.711│ 3 │ Rp 900rb │ 33% │ 0.80x │ 373rb ←merah
3 │ 18 │ Rp 945.233 │ 11 │ Rp 3.3jt │ 61% │ 3.49x │ 86rb ←hijau

Warna ROAS: hijau jika > 1, merah jika < 1
Warna CPP: hijau jika < target, merah jika > target
Warna CR: hijau jika > rata-rata bulan, merah jika di bawah

Baris TOTAL/AVG di bawah tabel.
Kalkulasi sama dengan aturan weighted average sebelumnya.

---

## Part 4: Persiapan Integrasi Scalev (struktur saja, belum implementasi)

Pastikan metric_key berikut sudah terdefinisi dengan benar di template
advertising sehingga nanti saat integrasi Scalev hanya perlu
menambahkan data source, bukan mengubah struktur:

```typescript
// Mapping Scalev API → metric_key sistem kita
const SCALEV_METRIC_MAP = {
  ads_spent: "ads_spent", // Ads Spent
  goals: "user_count", // Goals = Closing
  cpm: "cpm", // CPM
  cpc_all: "cpc", // CPC (All)
  adds_to_cart: "adds_to_cart", // Adds to Cart
  cost_per_goal: "cpp", // Cost per Goal
  // roas dan conversion_rate tetap calculated, tidak dari Scalev
};
// Simpan mapping ini di constants/scalev.ts
// Belum perlu diimplementasi — hanya dokumentasi untuk nanti
```

---

## Part 5: Update dashboard-calculator.ts

Fungsi yang perlu ada atau diupdate:

```typescript
// 1. Health Score per program (rules dari Part 2)
calculateProgramHealthScore(program, metricValues, milestones): number

// 2. Global health score
calculateGlobalHealthScore(programs, metricValues, milestones): number

// 3. Ads aggregation (weighted)
aggregateAdsMetrics(programs, metricValues): {
  totalAdsSpent: number
  totalGoals: number
  avgRoas: number      // total_revenue / total_ads_spent
  avgCpp: number       // total_ads_spent / total_goals
  avgCr: number        // total_goals / total_leads
}

// 4. Daily ads series untuk chart
buildAdsDailySeries(
  programIds: string[],   // [] = semua ads programs
  metricX: string,        // metric_key untuk bar
  metricY: string,        // metric_key untuk line
  period: Period
): { date: string, x: number, y: number }[]

// 5. Detect apakah program adalah ads program
isAdsProgram(metricDefinitions: MetricDefinition[]): boolean
// true jika ada minimal 1 metrik dengan metric_group = 'ad_spend'
// atau metric_key IN ads metric keys list
```

---

## Build Order

1. Schema migration (tambah is_primary, update templates)
2. Update dashboard-calculator.ts (semua fungsi di Part 5)
3. Redesign dashboard utama — Tab Overview
4. Tab Target
5. Tab Ads Performance — mode semua program
6. Tab Ads Performance — mode detail satu program
7. Hapus route /dashboard/[department]
8. Update program cards di seluruh halaman
   (gunakan is_primary untuk progress bar)
9. Simpan constants/scalev.ts (mapping saja, belum implementasi)
10. Regression test: input harian, milestone, TV dashboard,
    notifikasi WhatsApp — pastikan tidak ada yang rusak

---

## Hal yang Harus Dikonfirmasi Sebelum Build

Sebelum memulai, tanyakan kepada user:

1. Apakah route /dashboard/[department] sudah ada dan perlu di-redirect,
   atau belum pernah dibuat?
2. Apakah dashboard-calculator.ts sudah ada atau perlu dibuat dari awal?
   Jawab dulu sebelum menulis kode apapun.

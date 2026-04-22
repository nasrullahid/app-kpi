---
trigger: manual
---

## Major Refactor: Simplified Program Metrics + Dashboard Redesign

### Context

Sistem saat ini menggunakan struktur department-based navigation dengan
agregasi metrik per department. Ini akan disederhanakan menjadi model
yang lebih flat dan intuitif.

Perubahan ini TIDAK mengubah:

- Tabel programs, periods, users
- Sistem milestone
- Sistem multi-PIC
- TV Dashboard (update terpisah nanti)
- Halaman input harian (pivot table)
- Notifikasi WhatsApp (skip dulu)
- RLS policies

---

## Part 1: Perubahan Schema

### 1A. Tambah is_primary ke metric_definitions

```sql
ALTER TABLE program_metric_definitions
ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

-- Primary metrics = Rp dan User (wajib universal, basis Health Score)
-- Secondary metrics = ROAS, Lead, CPP, dll (informatif, opsional)

-- Update existing data:
UPDATE program_metric_definitions
SET is_primary = true
WHERE metric_key IN ('revenue', 'user_count');
```

### 1B. Department menjadi label saja

Department tetap ada di tabel programs tapi HANYA digunakan sebagai:

- Badge label di program card
- Filter dropdown di dashboard
- TIDAK lagi digunakan untuk sub-navigation atau agregasi

Hapus route /dashboard/[department] — tidak diperlukan lagi.

### 1C. Update Metric Templates

Tambahkan is_primary dan perkuat metric_group assignment:

```typescript
const METRIC_TEMPLATES = {
  advertising: {
    label: "Advertising",
    metrics: [
      // Primary (wajib, basis health score)
      {
        metric_key: "revenue",
        label: "Omzet",
        data_type: "currency",
        input_type: "manual",
        is_primary: true,
        is_target_metric: true,
        metric_group: "revenue",
        unit_label: "Rp",
        display_order: 1,
      },
      {
        metric_key: "user_count",
        label: "Closing/User",
        data_type: "integer",
        input_type: "manual",
        is_primary: true,
        is_target_metric: true,
        metric_group: "user_acquisition",
        unit_label: "user",
        display_order: 2,
      },

      // Secondary (informatif, tidak wajib)
      {
        metric_key: "ads_spent",
        label: "Ads Spent",
        data_type: "currency",
        input_type: "manual",
        is_primary: false,
        is_target_metric: false,
        metric_group: "ad_spend",
        unit_label: "Rp",
        display_order: 3,
      },
      {
        metric_key: "leads",
        label: "Lead Masuk",
        data_type: "integer",
        input_type: "manual",
        is_primary: false,
        is_target_metric: false,
        metric_group: "leads",
        unit_label: "leads",
        display_order: 4,
      },
      {
        metric_key: "cpm",
        label: "CPM",
        data_type: "currency",
        input_type: "manual",
        is_primary: false,
        is_target_metric: false,
        metric_group: null,
        unit_label: "Rp",
        display_order: 5,
      },
      {
        metric_key: "cpc",
        label: "CPC (All)",
        data_type: "currency",
        input_type: "manual",
        is_primary: false,
        is_target_metric: false,
        metric_group: null,
        unit_label: "Rp",
        display_order: 6,
      },
      {
        metric_key: "adds_to_cart",
        label: "Adds to Cart",
        data_type: "integer",
        input_type: "manual",
        is_primary: false,
        is_target_metric: false,
        metric_group: null,
        unit_label: "",
        display_order: 7,
      },
      {
        metric_key: "roas",
        label: "ROAS",
        data_type: "float",
        input_type: "calculated",
        formula: "revenue / ads_spent",
        is_primary: false,
        is_target_metric: false,
        metric_group: "efficiency",
        unit_label: "x",
        display_order: 8,
      },
      {
        metric_key: "cpp",
        label: "Cost per Goal",
        data_type: "currency",
        input_type: "calculated",
        formula: "ads_spent / user_count",
        is_primary: false,
        is_target_metric: false,
        target_direction: "lower_is_better",
        metric_group: null,
        unit_label: "Rp",
        display_order: 9,
      },
      {
        metric_key: "conversion_rate",
        label: "Conversion Rate",
        data_type: "percentage",
        input_type: "calculated",
        formula: "user_count / leads",
        is_primary: false,
        is_target_metric: false,
        metric_group: "conversion",
        unit_label: "%",
        display_order: 10,
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
        is_primary: true,
        is_target_metric: true,
        metric_group: "revenue",
        unit_label: "Rp",
        display_order: 1,
      },
      {
        metric_key: "user_count",
        label: "Jumlah User",
        data_type: "integer",
        input_type: "manual",
        is_primary: true,
        is_target_metric: true,
        metric_group: "user_acquisition",
        unit_label: "user",
        display_order: 2,
      },
    ],
  },

  qualitative_only: {
    label: "Kualitatif (Milestone Only)",
    metrics: [],
    // Health Score dari % milestone selesai
  },
};
```

---

## Part 2: Health Score Calculation Rules

Aturan ini harus konsisten di semua tempat
(dashboard-calculator.ts, dashboard utama, TV dashboard):

```typescript
function calculateProgramHealthScore(program: Program): number {
  // Case 1: Program punya primary metrics (Rp dan/atau User)
  // → Health Score = rata-rata % capaian primary metrics
  // Contoh: Rp 46% + User 78% → Health Score = 62%
  // Case 2: Program kualitatif only (tidak ada primary metrics)
  // → Health Score = (milestone selesai / total milestone) * 100
  // Contoh: 3/5 milestone = 60%
  // Case 3: Program hybrid (punya primary metrics DAN milestones)
  // → Health Score = rata-rata primary metrics % saja
  // → Milestone ditampilkan terpisah sebagai informasi tambahan
  // Secondary metrics TIDAK pernah masuk perhitungan Health Score
}

// Global Health Score = rata-rata Health Score semua program aktif
// (kualitatif dan kuantitatif diperlakukan setara)
```

---
trigger: manual
---

## Feature: Redesign Halaman Pencapaian Harian — Hybrid View

### Context

Halaman pencapaian harian saat ini menampilkan semua program dalam satu tabel
dengan metric chips per baris. Ini perlu di-upgrade untuk mendukung program
dengan metrik yang berbeda-beda secara elegan.

Halaman ini sudah berjalan dengan data dari tabel:

- daily_metric_values (custom metrics per program)
- program_metric_definitions (definisi metrik per program)
- programs, periods, users (existing)

---

### Goal

Ubah halaman menjadi Hybrid View dengan 2 mode tampilan yang bisa di-toggle.

---

### Mode 1: Tampilan Ringkas (default)

Tampilan tabel seperti sekarang — semua program dalam satu list.
Tidak ada perubahan besar, hanya perbaikan minor:

- Metric chips hanya tampilkan metrik dengan is_target_metric = true
- Tambahkan tooltip on hover yang menampilkan semua metrik (termasuk
  calculated) untuk baris tersebut
- Tetap bisa filter by tanggal dan by program

---

### Mode 2: Tampilan Detail Per Program (pivot table)

#### Layout

[← Semua Program] [Iklan Meta - Q2 2026 ▼] [April 2026 ▼]
┌─────────────────────────────────────────────────────────────────┐
│ Tanggal │ Lead Masuk │ Budget Iklan │ Closing │ Omzet │ CR │ ROAS │
├─────────────────────────────────────────────────────────────────┤
│ 1 Apr │ 21 │ Rp 971.950 │ 8 │ Rp 2jt │ 38% │ 2.1x │
│ 2 Apr │ 9 │ Rp 1.119.711 │ 3 │ Rp 1jt │ 33% │ 0.9x │ ← merah
│ 3 Apr │ 18 │ Rp 945.233 │ 11 │ Rp 3jt │ 61% │ 3.2x │ ← hijau
│ ... │ │ │ │ │ │ │
├─────────────────────────────────────────────────────────────────┤
│ TOTAL │ 228 │ Rp 11.2jt │ 99 │ Rp 46jt│ 43% │ 4.1x │
│ RATA-RATA │ 19/hari │ Rp 936rb/hr │ 8.3/hr │ - │ - │ - │
└─────────────────────────────────────────────────────────────────┘

#### Aturan Kolom

- Kolom dirender dinamis dari program_metric_definitions milik program tersebut
- Urutan kolom mengikuti display_order
- Kolom manual: cell bisa diklik untuk edit inline (tanpa buka modal)
- Kolom calculated: tampil otomatis, background sedikit berbeda (abu muda),
  tidak bisa diedit, ada icon formula kecil saat di-hover
- Kolom boolean (misal: status_pembayaran): tampil sebagai toggle/checkbox

#### Warna & Status per Cell

Untuk metrik yang is_target_metric = true:

- Hitung target harian = monthly_target / working_days
- Jika nilai >= target harian → teks hijau
- Jika nilai 50-99% dari target harian → teks kuning/amber
- Jika nilai < 50% target harian → teks merah
- Jika belum diisi (null) → tampil "—" dengan warna abu

Untuk metrik calculated dengan target_direction = 'lower_is_better'
(contoh: CPP), balik logika warnanya.

#### Calculated Metrics

Computed client-side menggunakan evaluateFormula() utility yang sudah ada.
Jika salah satu operand null atau 0 → tampil "—" bukan error.

#### Inline Edit

Saat user klik cell manual yang kosong atau sudah ada nilainya:

- Cell berubah menjadi input field langsung di tempat (no modal)
- Tekan Enter atau blur → auto-save ke daily_metric_values via server action
- Tekan Escape → cancel tanpa save
- Setelah save, calculated metrics di baris yang sama langsung update
- Tampilkan loading spinner kecil di cell saat menyimpan
- Jika save gagal → kembalikan nilai lama + tampilkan toast error

#### Baris yang Belum Ada Data

Tampilkan semua hari dalam periode (1-30/31),
bukan hanya hari yang sudah ada datanya.
Hari yang belum ada data: semua cell tampil "—" dengan background
sedikit berbeda untuk membedakan dari hari yang memang bernilai 0.
Hari di masa depan (> hari ini): tampil dengan opacity lebih rendah,
cell tidak bisa diedit.

#### Baris Total & Rata-rata

- Total: SUM untuk integer dan currency, weighted average untuk percentage
  dan float (recalculate dari raw values, bukan average of averages)
- Rata-rata: total / jumlah hari yang sudah ada data (bukan total hari)
- Calculated metrics di baris total: dihitung ulang dari total raw values
  Contoh: ROAS total = total_omzet / total_budget (bukan rata-rata ROAS harian)

---

### Toggle UI

Letakkan di header halaman, sejajar dengan tombol "Catat Pencapaian":
[≡ Semua Program] [⊞ Detail Program] [+ Catat Pencapaian]

- Default: Semua Program
- Simpan preferensi toggle di localStorage agar tidak reset saat refresh
- Saat pindah ke Detail Program: otomatis pilih program pertama milik
  user yang sedang login (atau program pertama jika admin)

---

### Filter & Navigation

Mode Ringkas:

- Filter tanggal: date range picker (default: bulan aktif)
- Filter program: multi-select dropdown
- Filter PIC: dropdown (admin only)

Mode Detail:

- Dropdown pilih program (single select)
- Dropdown pilih periode (month/year) — default periode aktif
- Tombol navigasi bulan: ← April 2026 →

---

### Responsive / Mobile

Mode Ringkas: tampil normal seperti sekarang
Mode Detail (pivot table) di mobile:

- Tabel bisa di-scroll horizontal
- Kolom "Tanggal" di-freeze (sticky left)
- Minimum column width: 90px
- Font size sedikit lebih kecil di mobile (text-xs)

---

### Data Fetching

- Mode Ringkas: fetch seperti sekarang (tidak perlu diubah)
- Mode Detail: fetch semua daily_metric_values untuk
  program + period yang dipilih dalam satu query,
  join dengan program_metric_definitions untuk urutan kolom
- Gunakan React state untuk manage edited cells sebelum save
- Optimistic update: tampilkan nilai baru segera, rollback jika gagal

---

### Server Action untuk Inline Edit

```typescript
// Upsert single metric value
async function upsertMetricValue(params: {
  programId: string;
  periodId: string;
  metricDefinitionId: string;
  date: string; // format: YYYY-MM-DD
  value: number | null;
}): Promise<{ success: boolean; error?: string }>;
```

---

### Yang Tidak Perlu Diubah

- Tombol "Catat Pencapaian" dan modal/form input yang sudah ada
  tetap berjalan untuk Mode Ringkas
- Logic notifikasi WhatsApp tidak perlu diubah
- RLS policies tidak perlu diubah

---

### Build Order

1. Buat komponen PivotTable (presentational only, no data fetching)
2. Buat server action upsertMetricValue
3. Buat evaluateFormula utility jika belum ada
4. Integrasikan data fetching untuk mode Detail
5. Tambahkan toggle UI dan sambungkan kedua mode
6. Pastikan mode Ringkas tidak ada regresi

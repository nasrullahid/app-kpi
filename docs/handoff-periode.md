# Dokumen Serah Terima (Handoff): Sistem Manajemen Periode

Dokumen ini menjelaskan arsitektur, logika bisnis, dan kontrol teknis terkait sistem **Periode** yang merupakan jantung dari filter data dan perhitungan target di aplikasi Dashboard Kinerja Bisnis ini.

## 1. Konsep Dasar

Sistem periode digunakan untuk mengelompokkan data pencapaian (_daily inputs_) dan membandingkannya dengan target bulanan yang spesifik untuk waktu tersebut.

- **Entitas Database**: Tabel `periods`.
- **Primary Keys**: `id` (UUID).
- **Unique Constraint**: Gabungan `month` dan `year`.

## 2. Struktur Data Tabel `periods`

| Kolom          | Tipe Data      | Deskripsi                                                                                         |
| :------------- | :------------- | :------------------------------------------------------------------------------------------------ |
| `month`        | Integer (1-12) | Bulan periode (Januari = 1, Februari = 2, dst).                                                   |
| `year`         | Integer        | Tahun periode (e.g., 2026).                                                                       |
| `working_days` | Integer        | Jumlah hari kerja dalam sebulan. Digunakan sebagai pembagi target.                                |
| `is_active`    | Boolean        | Menandai periode mana yang datanya ditampilkan di Dashboard utama secara default.                 |
| `is_locked`    | Boolean        | Jika `true`, mematikan fungsi tulis (_Create/Update/Delete_) pada input harian untuk audit trail. |

## 3. Logika Bisnis Utama

### A. Periode Aktif (Active Period)

Hanya boleh ada **satu** periode yang memiliki status `is_active: true` dalam satu waktu.

- **Fungsi**: Seluruh dashboard (Ringkasan, Omzet, Ads, TV) secara default akan menarik data berdasarkan periode yang sedang aktif.
- **Switching**: Saat Admin mengaktifkan periode baru melalui menu Master Data, sistem akan menjalankan `revalidatePath('/', 'layout')` untuk memastikan seluruh UI memperbarui datanya secara global.

### B. Mekanisme Prorata (`prorationFactor`)

Aplikasi ini tidak membandingkan pencapaian hari ini dengan target bulanan secara mentah (karena akan selalu terlihat kecil di awal bulan). Sistem menggunakan faktor prorata:

- **Rumus**: `prorationFactor = (Hari Berjalan) / (Working Days)`
- **Contoh**: Jika target 100jt dan ini hari ke-10 dari 20 hari kerja, maka target ekspektasi saat ini adalah 50jt.
- **Smart Adjustment**: Jika data hari ini belum diinput, sistem secara otomatis hanya menghitung progres hingga hari kemarin (`today - 1`) agar status "Sehat/Kritis" tetap akurat dan adil.

### C. Mekanisme Penguncian (Locking)

Digunakan untuk finalisasi data di akhir bulan agar tidak bisa diubah lagi oleh PIC.

- **Enforcement**: Status `is_locked` diperiksa di sisi client (untuk menyembunyikan tombol aksi) dan di sisi server (_Server Actions_) sebagai validasi keamanan tambahan.

## 4. Alur Kerja Teknis (Data Fetching)

Dalam `src/lib/dashboard-service.ts`, fungsi `getUnifiedDashboardData` mengikuti urutan berikut:

1. Mencari periode aktif di database.
2. Mengambil semua Program yang berstatus aktif.
3. Mengambil `daily_inputs` dan `daily_metric_values` yang memiliki `period_id` sama dengan periode aktif.
4. Menghitung `prorationFactor` berdasarkan tanggal hari ini dan `working_days` periode tersebut.
5. Mengirimkan data ke `dashboard-calculator.ts` untuk diproses menjadi metrik visual.

## 5. Panduan Pengelolaan (Admin)

Admin dapat mengelola periode melalui menu **Master Data > Periode**:

1. **Tambah Periode**: Masukkan bulan, tahun, dan jumlah hari kerja yang disepakati.
2. **Aktifkan**: Klik tombol "Set Active" untuk memindahkan fokus seluruh dashboard ke bulan tersebut.
3. **Kunci/Buka**: Gunakan ikon gembok untuk mengunci data jika proses audit bulan tersebut sudah selesai.

## 6. FAQ (Tanya Jawab)

### Q: Jika ganti periode aktif, apakah data pencapaian akan _carry over_ atau _start fresh_?

A: **Start Fresh**. Semua data pencapaian (Omzet, Jumlah User, dan Misi Kualitatif) terikat pada periode tertentu. Saat Anda berpindah ke periode baru, dashboard akan mulai dari angka 0 agar Anda bisa memantau kinerja khusus untuk bulan tersebut tanpa tercampur data bulan sebelumnya.

### Q: Apakah saya harus membuat ulang Program/Project di periode baru?

A: **Tidak**. Program (Project) bersifat permanen dan akan terus terbawa (*Carry Over*) ke periode-periode selanjutnya selama statusnya "Aktif". Anda tidak perlu menginput ulang nama program, PIC, atau target master; sistem hanya akan mengosongkan "lembar kerja" pencapaian untuk bulan yang baru.

### Q: Apakah tugas/milestone yang sudah dicentang akan tetap tercentang di bulan depan?

A: **Tidak**. Status penyelesaian milestone akan di-_reset_ di setiap periode baru. Ini bertujuan agar PIC melakukan verifikasi ulang atau melaporkan progres milestone tersebut khusus untuk bulan yang sedang berjalan.

### Q: Apa yang terjadi pada data di periode lama?

A: Data tidak dihapus. Data tersebut tetap tersimpan aman di database. Anda tetap bisa melihat data tersebut dengan cara mengganti "Periode Aktif" kembali ke bulan tersebut melalui menu Master Data.

### Q: Bisakah saya mengubah jumlah hari kerja setelah bulan berjalan?

A: **Bisa**. Admin dapat mengubah `working_days` kapan saja melalui Master Data jika ada perubahan kalender kerja. Dashboard akan langsung menghitung ulang status "Sehat/Kritis" berdasarkan jumlah hari kerja yang baru secara otomatis (_Real-time_).

### Q: Mengapa angka "Target" saya di Dashboard berubah saat ganti hari?

A: Karena sistem menggunakan **Target Progresif (Pro-rata)**. Target yang Anda lihat adalah target yang seharusnya dicapai _hingga hari ini_. Besok, angka ini akan meningkat secara otomatis seiring berjalannya waktu hingga mencapai 100% target bulanan di hari kerja terakhir.

---

_Dokumen ini dibuat secara otomatis sebagai bagian dari dokumentasi teknis sistem._

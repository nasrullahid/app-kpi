---
trigger: manual
---

Redesign dashboard KPI yang sudah ada ini. Jangan ubah struktur atau logika data — hanya perbarui tampilan visualnya agar lebih profesional dan bersih.
Tema warna: Light mode penuh. Background halaman putih (#FFFFFF), kartu putih dengan border tipis 1px solid #E5E7EB. Tidak ada dark background, tidak ada gradient dekoratif.
Font: Ganti semua font menjadi Plus Jakarta Sans (import dari Google Fonts). Gunakan hanya weight 400, 500, dan 600.
Skala tipografi:

-10px + uppercase + letter-spacing: label kategori kecil
-12px: teks body, badge, info sekunder
-14px: navigasi sidebar, subtitle
-16px: judul halaman
-24–28px weight 600: nilai KPI utama

Sidebar: Background putih, border kanan 1px solid #E5E7EB. Navigasi dikelompokkan dengan label seksi uppercase kecil. Item aktif background #EEEDFE, teks #534AB7. Profil user di bagian bawah dengan avatar inisial bulat.
KPI Cards: Background putih, border 1px solid #E5E7EB, corner radius 12px. Tambahkan aksen garis vertikal 3px di sisi kiri tiap kartu — merah #E24B4A untuk kritis, biru #378ADD untuk info, hijau #639922 untuk baik. Badge status kecil berbentuk pill di bawah nilai.
Alert/notifikasi: Ganti banner merah besar menjadi alert bar tipis satu baris. Background #FCEBEB, border 1px solid #F7C1C1, teks #791F1F, ikon lingkaran merah kecil di kiri. Gunakan ALL CAPS.
Chart: Line chart diberi area fill dengan opacity 8–12% di bawah garis. Bar chart "Top Performers" menggunakan warna progresif dari ungu gelap ke ungu muda sesuai urutan ranking.
Aturan umum:

-Semua teks judul dan tombol: sentence case (bukan ALL CAPS atau Title Case)
-Tidak ada box shadow dekoratif — gunakan border saja
-Spacing konsisten: padding kartu 16px, gap antar elemen 12–16px
-Warna primer: #534AB7 (ungu). Warna teks utama: #111827. Warna teks sekunder/muted: #6B7280

sesuaikan juga dashboard lain kecuali tv, jangan ganti jenis chart yang ada
Pertahankan semua nama variabel, state, props, dan logika yang sudah ada. Hanya ubah CSS/styling-nya saja.

# 📸 PhotoFest

Aplikasi photobooth untuk PC (Windows, berbasis Electron). Ambil foto dari kamera, susun otomatis ke layout strip **5 × 15 cm**, cetak ke printer, buat GIF animasi transisi, dan simpan otomatis ke Google Drive.

## Memasang (sekali klik, tanpa download lain)

Komputer photobooth **tidak perlu Node.js atau apa pun**. Cukup file installer:

1. Dapatkan `PhotoFest-Setup.exe` (cara membuatnya di bawah).
2. Klik dua kali → terpasang otomatis → **shortcut PhotoFest muncul di Desktop** (dan Start Menu) → aplikasi langsung terbuka.
3. Seterusnya tinggal klik shortcut **PhotoFest** di Desktop.

### Cara mendapatkan PhotoFest-Setup.exe

**A. Di 1 komputer Windows (sekali saja)**: pasang [Node.js LTS](https://nodejs.org), lalu klik dua kali `Buat-Installer.bat`. Hasil: `dist\PhotoFest-Setup.exe`. Salin ke komputer photobooth mana pun.

**B. Tanpa pasang apa pun (GitHub)**: upload folder ini ke repo GitHub → tab *Actions* → *Build PhotoFest installer* → *Run workflow* → unduh `PhotoFest-Setup` dari bagian Artifacts.

Untuk mencoba tanpa membuat installer: `run.bat` (butuh Node.js).

## Fitur

| Fitur | Keterangan |
|---|---|
| Akun | Daftar/login. Tiap akun punya pengaturan, layout, galeri, dan koneksi Drive sendiri. Password disimpan sebagai hash (scrypt). |
| Mode foto | Pilih **3 foto** atau **2 foto**. Tiap mode punya daftar layout sendiri, dipilih langsung di layar booth. |
| Layout 5×15 cm | Editor visual: seret/ubah ukuran kotak foto, warna & gambar latar, frame PNG transparan, teks (`{event}`, `{date}`, `{time}`). Bisa membuat banyak layout, memilih yang aktif. |
| Kamera | Pilih kamera, resolusi (720p/1080p/4K), mirror. Kamera DSLR/mirrorless bisa dipakai lewat HDMI capture card atau aplikasi webcam utility dari pabrikan. |
| Hitung mundur | 1–10 detik, efek flash, jeda antar foto. Ulang satu foto saja atau semuanya. |
| Filter & efek (opsional) | Normal, Hitam Putih, Sepia, Hangat, Dingin, Cerah, Pudar, Vintage, plus vignette. |
| GIF animasi | Foto 1 → transisi → foto 2 (→ foto 3), loop. Transisi: fade, geser, sapu, zoom. |
| Printer | Pilih printer, cetak langsung (silent), jumlah salinan, cetak otomatis. Kertas 5×15 cm, atau 10×15 cm (4R) dengan 2 strip berdampingan. |
| Google Drive | Upload otomatis di latar belakang; antrian dicoba ulang kalau offline. |
| Galeri | Lihat, cetak ulang, upload ulang, buka folder, hapus. |

## Struktur folder

Di komputer (`Dokumen/PhotoFest/<username>/`, bisa diganti di Pengaturan) dan di Google Drive:

```
<Nama folder utama>/        ← diatur di Pengaturan ("Nama folder utama / nama acara")
├── animated/   → GIF transisi          (PF_xxx.gif)
├── original/   → foto asli belum diedit (PF_xxx_1.jpg, _2, _3)
└── print/      → foto siap cetak 5×15 cm (PF_xxx_print.jpg, 600×1800 px)
```

## Menghubungkan Google Drive (sekali saja)

1. Buka console.cloud.google.com → buat project baru.
2. APIs & Services → Library → aktifkan **Google Drive API**.
3. OAuth consent screen → External → isi nama app → tambahkan emailmu di *Test users*.
4. Credentials → Create credentials → OAuth client ID → jenis **Desktop app**.
5. Salin Client ID dan Client Secret ke PhotoFest → Pengaturan → Google Drive → **Hubungkan**.

Aplikasi memakai scope `drive.file`, jadi hanya bisa melihat folder/file yang ia buat sendiri.

## Tips printer

- Di Preferensi Cetak driver printer, pilih ukuran kertas yang sama dengan pengaturan di PhotoFest dan matikan "fit to page"/margin agar hasil pas.
- Printer photobooth umum (DNP, Mitsubishi, Canon SELPHY, HiTi): pakai kertas 4×6 inci (10×15 cm) dan pilih opsi **2 strip berdampingan**, lalu potong tengah.
- Gunakan "Cetak tes" di Pengaturan untuk mencoba.

## Tes

`npm test` menjalankan tes logika (akun, layout, penyimpanan sesi, upload Drive dengan server palsu).

## Struktur kode

```
main/        proses utama Electron: akun, settings, layout, sesi, drive, printing, IPC
src/js/      tampilan: render layout & filter, encoder GIF, kamera, layar-layar
src/css/     gaya
test/        tes
```

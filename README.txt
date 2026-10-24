DND Kinerja — prototipe web yang dapat dijalankan

MULAI
1. Pastikan Node.js tersedia pada komputer.
2. Klik dua kali "Mulai DND Kinerja.cmd".
3. Browser akan membuka http://127.0.0.1:8765/.
4. Untuk memasang sebagai aplikasi web, pilih tombol "Pasang" (jika didukung browser), atau menu browser > Instal aplikasi / Tambahkan ke layar utama.
5. Untuk menghentikan server, jalankan Stop-DND-Kinerja.ps1.

Fitur prototipe berjalan di browser: tugas/progres, KPI per pegawai, simulasi reward, pengajuan akun, dan pengaturan tampilan. Data demo disimpan di localStorage browser pada perangkat ini. Gunakan Mode Admin/User pada header untuk melihat perbedaan akses.

BATASAN
Ini belum menjadi layanan online multi-pengguna. Akun, persetujuan, reset kata sandi, dan sinkronisasi data belum menggunakan server autentikasi atau database bersama. Jangan masukkan kata sandi atau data personal nyata. Untuk penggunaan perusahaan, aplikasi perlu backend/API, database, HTTPS, autentikasi, serta kebijakan akses yang aman.

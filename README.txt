DND Kinerja — aplikasi HTML/CSS/JavaScript dengan sinkronisasi Supabase

Berkas aplikasi
- index.html: antarmuka aplikasi.
- cloud.js: autentikasi Supabase dan sinkronisasi data lintas browser.
- supabase-setup.sql: skema database, aturan akses, dan fungsi sinkronisasi.

Menjalankan lokal
Untuk mencoba versi lokal, buka index.html di browser modern. Mode sinkronisasi memerlukan internet dan konfigurasi Supabase pada cloud.js.

Menyiapkan Supabase dan GitHub Pages
1. Buka Supabase Dashboard untuk proyek yang URL-nya telah dipasang di cloud.js.
2. Masuk ke SQL Editor, buka berkas supabase-setup.sql, salin seluruh isinya, lalu jalankan. Ini membuat tabel, kebijakan keamanan, dan fungsi sinkronisasi.
3. Buka Authentication > URL Configuration. Setelah alamat GitHub Pages tersedia, set Site URL dan tambahkan alamat tersebut ke Redirect URLs agar tautan konfirmasi email dan reset password kembali ke aplikasi.
4. Buat repository GitHub, unggah semua berkas dari folder outputs langsung ke root repository (index.html, cloud.js, supabase-setup.sql, README.txt). Jangan mengunggah secret/service-role key.
5. Di Settings > Pages, pilih deploy dari branch utama dan folder root. Tunggu alamat GitHub Pages muncul.
6. Buka situs, pilih Daftar sekarang, lalu daftarkan akun administrator pertama dengan username dnd.admin, alamat email yang benar-benar dapat diakses, dan password baru. Akun harus memverifikasi email.
7. Setelah akun terdaftar, buka Supabase SQL Editor dan jalankan perintah berikut, ganti alamat contoh dengan email administrator:
   update public.dnd_members set role='admin', approved=true where lower(email)=lower('admin@organisasi.id');
8. Login memakai email dan password akun tersebut. Akun admin pertama akan menyalin data prototipe yang tersimpan di browser ini apabila database bersama masih kosong. Setelah itu data aplikasi tersimpan di Supabase.
9. Pegawai lain mendaftar melalui situs, memverifikasi email, lalu menunggu admin menyetujui akunnya. Setiap browser/perangkat menggunakan akun Supabase yang sama untuk melihat data organisasi yang tersinkron.

Keamanan akun
- Login menggunakan Supabase Auth dengan email dan password. Password tidak disimpan ke tabel aplikasi atau dibagikan lintas pengguna.
- Lupa password mengirim tautan pemulihan ke email. Username bukan kredensial login pada mode online; login menggunakan email.
- Key sb_publishable_... di cloud.js adalah publishable key untuk frontend. Jangan pernah menaruh secret key atau service-role key di file website.
- Aturan Row Level Security hanya mengizinkan akun disetujui membaca data bersama. Admin mengelola pengaturan organisasi dan akun; pengguna hanya dapat mengubah tugas yang ditugaskan kepada dirinya.
- Akun demo lokal lama (dnd.admin/admin123 dan akun demo) tidak menjadi kredensial Supabase. Buat akun admin daring dengan email nyata, lalu promosikan menggunakan langkah 7.

Catatan
Sinkronisasi aplikasi menggunakan penyimpanan bersama Supabase dan pemuatan ulang berkala. Untuk memastikan fitur email berjalan, proyek Supabase perlu mengaktifkan konfirmasi email dan konfigurasi URL yang benar. SQL harus dijalankan sekali di proyek sebelum login online dapat digunakan. Saya belum dapat menjalankan SQL di proyek Anda atau menerbitkan repository GitHub dari sini, jadi situs baru aktif setelah langkah setup tersebut dilakukan.

# Panduan Instalasi & Deploy solidtime

Dokumen ini untuk tim internal/DevOps. Semua jalan di Docker:
development lokal (`docker-compose.local.yml`) dan production
(`docker-compose.prod.yml`).

> Referensi di repo: `docker-compose.local.yml` + `.env.docker.local` (dev),
> `docker-compose.prod.yml` + `.env.prod.example` (prod),
> `docker-compose.yml` (opsi Sail/Traefik, tidak dipakai aliran ini),
> `docker/prod/Dockerfile`, `docker/local/8.3/Dockerfile`,
> `laravel.env` (acuan secret production).

## 1. Kebutuhan dasar

| Komponen | Versi / catatan |
|---|---|
| Docker Desktop (atau Engine + Compose v2) | Wajib jalan sebelum perintah apa pun; dev maupun prod |
| Postgres 15, PHP 8.3, Node 20 | Disediakan image (`postgres:15`, Sail `docker/local/8.3`, FrankenPHP `docker/prod`) — tidak perlu install di host |
| Gotenberg 8 | Ikut di kedua compose (export PDF). Tanpa ini fitur export gagal, aplikasi tetap jalan |
| Mailpit | Ikut di compose lokal (SMTP dev + UI). Prod pakai SMTP asli |

## 2. Development lokal via Docker (tanpa Traefik)

Seluruh stack dev jalan di Docker agar paritas dengan server: file
`docker-compose.local.yml` + env `.env.docker.local` (sudah disediakan di
repo; keduanya di-`.gitignore` untuk env-nya). Tidak butuh Traefik/Sail alias.

- `app` — image Sail (`docker/local/8.3/Dockerfile`, PHP 8.3 + Node 20),
  `artisan serve :80` → host `8000`, Vite HMR → host `5173`
- `pgsql` — Postgres 15, DB dibuat otomatis (`POSTGRES_*`), plus DB `testing`
  untuk test via script `docker/local/pgsql/create-testing-database.sql`
- `mailpit` — SMTP dev + UI `http://localhost:8025`
- `gotenberg` — export PDF

### 2.1 Jalan pertama kali

Semua perintah memakai `--env-file .env.docker.local` agar interpolasi
compose (DB_*, port, dsb.) selalu dari file itu — tidak tergantung file
`.env` lain di host.

```bash
# 1. Pastikan Docker jalan dan port 8000, 5173, 8025 bebas.

# 2. Build + jalankan semua service
docker compose --env-file .env.docker.local -f docker-compose.local.yml up -d --build

# 3. Install dependency DI DALAM container (vendor/ & node_modules memakai
#    volume anonim — tidak mengotori direktori host, jangan dicampur dengan
#    composer/npm di host)
docker compose --env-file .env.docker.local -f docker-compose.local.yml exec app composer install
docker compose --env-file .env.docker.local -f docker-compose.local.yml exec app npm install

# 3b. Restart app sekali (wajib di boot pertama: supervisord sempat FATAL
#     karena vendor/ masih kosong saat container pertama nyala)
docker compose --env-file .env.docker.local -f docker-compose.local.yml restart app

# 4. Migrasi + seed (user demo + Passport clients) + storage link
docker compose --env-file .env.docker.local -f docker-compose.local.yml exec app php artisan migrate --seed
docker compose --env-file .env.docker.local -f docker-compose.local.yml exec app php artisan storage:link

# Catatan: image Sail di-repo ini sudah dipatch `--no-reload` pada
# `SUPERVISOR_PHP_COMMAND` (`docker/local/8.3/Dockerfile:13`). Tanpa itu,
# `artisan serve` men-spawn child `php -S` dengan env yang dilucuti Laravel
# (hanya `$passthroughVariables` yang lolos) sehingga child baca `.env`
# hasil mount (host) alih-alih env container — gejalanya 500
# `SQLSTATE ... "127.0.0.1"`.
#
# 5. Vite HMR di dalam container (detached)
docker compose --env-file .env.docker.local -f docker-compose.local.yml exec -d app npm run dev
```

Buka `http://localhost:8000/login`. User seed: `test@example.com` /
`password` (juga `admin@example.com` / `password`).
Mailpit UI: `http://localhost:8025`.

### 2.2 Verifikasi

```bash
curl -s -o /dev/null -w "login:%{http_code}\n" http://localhost:8000/login   # harap 200
cat public/hot                                                              # harap http://localhost:5173
curl -s -o /dev/null -w "vite:%{http_code}\n" http://localhost:5173/@vite/client  # harap 200
```

### 2.3 Operasional harian

```bash
docker compose --env-file .env.docker.local -f docker-compose.local.yml up -d      # nyalakan
docker compose --env-file .env.docker.local -f docker-compose.local.yml logs -f app # lihat log backend
docker compose --env-file .env.docker.local -f docker-compose.local.yml down        # matikan
docker compose --env-file .env.docker.local -f docker-compose.local.yml down -v    # matikan + HAPUS data DB
```

Perintah artisan apa pun:
`docker compose --env-file .env.docker.local -f docker-compose.local.yml exec app php artisan <cmd>`.

### 2.4 Catatan `vite.config.js`

Blok `server` tiga mode:

- `VITE_HOST_NAME` di-set (Sail/Traefik): HMR via reverse proxy port 80.
- `VITE_DEV_HOST` di-set (docker lokal, `0.0.0.0` di `.env.docker.local`):
  Vite bind semua interface, browser HMR via `VITE_DEV_HMR_HOST=localhost`.
  Pastikan `public/hot` berisi `http://localhost:5173` saat dev berjalan.
- Keduanya unset (jalan tanpa Docker): HMR `127.0.0.1:5173`.

Jangan campur: kalau Vite jalan di host, kosongkan `VITE_DEV_HOST`;
kalau di container, pastikan terisi (sudah bawaan `.env.docker.local`).

## 3. Deploy production via Docker Compose (disarankan)

File: `docker-compose.prod.yml` + env `.env.prod` (contoh: `.env.prod.example`).
Stack compose: `app` (FrankenPHP + Octane, port 8000) + `scheduler` +
`worker` + `pgsql` (Postgres 15) + `gotenberg` (export PDF).

Prinsip yang dipegang compose ini (sesuai masukan DevOps):

- **DB_HOST = `pgsql`** (nama service compose, bukan `127.0.0.1`) — sudah
  dikunci di `environment:` tiap service app. Jangan override.
- **Database dibuat otomatis** oleh image `postgres:15` dari
  `POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` (yang diambil dari
  `DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD`). Tidak perlu
  `CREATE DATABASE` manual — cukup isi password kuat di `.env.prod`
  SEBELUM volume `pgdata` pertama kali dibuat.
- **Migrasi otomatis** saat boot via `AUTO_DB_MIGRATE=true` (`start-container`
  → `php artisan migrate --isolated --force`).

### 3.1 Deploy langkah per langkah

```bash
# 0. Di mesin build (atau CI): siapkan vendor + asset frontend.
#    WAJIB sebelum docker build — Dockerfile prod hanya menjalankan
#    `composer dump-autoload`, vendor/ dan public/build ikut dari build context
#    (keduanya TIDAK di-ignore di .dockerignore).
composer install --no-dev --optimize-autoloader
npm ci && npm run build

# 1. Siapkan env (JANGAN commit file ini)
cp .env.prod.example .env.prod
# lalu isi: DB_PASSWORD, APP_KEY, APP_URL, MAIL_*, PASSPORT_PRIVATE_KEY,
# PASSPORT_PUBLIC_KEY. DB_DATABASE/DB_USERNAME default solidtime/solidtime.

# 2. Build + jalan
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 3. Cek status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app

# 4. SATU KALI SAJA (database fresh): buat Passport personal-access client,
#    lalu tulis id/secret-nya ke .env.prod dan recreate service app.
docker compose -f docker-compose.prod.yml exec app \
  php artisan passport:client --personal --name=API
docker compose -f docker-compose.prod.yml up -d app
```

Update rilis berikutnya cukup:

```bash
npm ci && npm run build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

(Migrasi ikut jalan otomatis. Jangan jalankan seeder di prod —
`DatabaseSeeder` menghapus + mengisi data demo.)

### 3.2 Skala / custom

- Worker >1 replica: `docker compose -f docker-compose.prod.yml up -d --scale worker=2`.
- Scheduler wajib **tepat 1 replica**.
- Akses Postgres dari host (debug): uncomment `ports:` service `pgsql` +
  set `FORWARD_DB_PORT`, lalu `up -d pgsql`.
- `USER_ID`/`GROUP_ID` samakan dengan UID/GID pemilik volume di host agar
  tidak ada masalah permission `storage/`.

### 3.3 Verifikasi

- `GET http://<host>:8000/health` → 200 (`docker/prod/deployment/healthcheck`).
- `GET http://<host>:8000/login` → 200, asset di-load dari `public/build`.
- `docker compose ... exec pgsql psql -U solidtime -d solidtime -c '\dt'`
  → tabel hasil migrasi ada.

## 4. Deploy manual / VPS tanpa Docker

1. Install PHP 8.3 + ekstensi di tabel §1, PostgreSQL 15, Node 22, Supervisor,
   Caddy/Nginx (TLS).
2. `composer install --no-dev --optimize-autoloader`, `npm ci && npm run build`.
3. Salin `.env` production (acuan: `laravel.env` + `.env.production`).
   `APP_KEY` harus diisi (`php artisan key:generate --show` untuk generate).
4. `php artisan migrate --force`, `php artisan storage:link`,
   `php artisan optimize`.
5. Jalankan Octane (FrankenPHP) via Supervisor, contoh:
   `php artisan octane:start --server=frankenphp --host=127.0.0.1 --port=8000`,
   di-reverse-proxy oleh Caddy/Nginx dengan header `X-Forwarded-*` yang benar
   + `TRUSTED_PROXIES` terisi.
6. Queue worker via Supervisor:
   `php artisan queue:work database --sleep=3 --tries=3` (restart otomatis).
7. Scheduler via cron:
   `* * * * * php /var/www/artisan schedule:run --no-interaction`.
8. Permission: direktori `storage/` dan `bootstrap/cache/` writable oleh user
   PHP. Jangan jalankan sebagai root.
9. `APP_DEBUG=false`, `LOG_LEVEL` wajar (`warning`/`error`) untuk prod.

## 5. Checklist serah terima ke DevOps

- [ ] `.env.prod` final (DB_PASSWORD kuat, APP_KEY, APP_URL, SMTP, Passport
      keys) — simpan di vault, jangan commit. Lihat `.env.prod.example`.
- [ ] TLS di depan port 8000 + `APP_URL=https://...`,
      `APP_FORCE_HTTPS=true`, `TRUSTED_PROXIES`.
- [ ] Migrasi otomatis aktif (`AUTO_DB_MIGRATE=true`); JANGAN jalankan seeder
      di prod. Passport personal client dibuat sekali via
      `passport:client --personal` (§3.1 langkah 4).
- [ ] Volume `pgdata` (database) dan `app-storage` (`storage/`) persisten.
- [ ] Scheduler tepat 1 replica; worker sesuai beban.
- [ ] Backup Postgres terjadwal + uji restore.
- [ ] Log & monitoring (`/health`, `storage/logs/*`) terhubung ke observability.
- [ ] `npm run build` sudah dijalankan SEBELUM `docker build`
      (`public/build/manifest.json` ikut ke image).

## 6. Troubleshooting cepat

| Gejala | Kemungkinan penyebab |
|---|---|
| Redirect loop / asset `http` di prod | `APP_URL`/`APP_FORCE_HTTPS`/`TRUSTED_PROXIES` salah |
| `SQLSTATE` / app tidak bisa konek DB (prod) | `DB_HOST` harus `pgsql` (nama service), bukan `127.0.0.1`; pastikan service `pgsql` healthy (`ps` + `logs pgsql`) |
| Ganti `DB_PASSWORD` tapi login DB tetap gagal | Password postgres hanya dipakai saat volume `pgdata` pertama dibuat — setelah itu harus `ALTER USER` manual di dalam container pgsql |
| Compose error `DB_PASSWORD wajib diisi` | `.env.prod` belum diisi atau lupa `--env-file .env.prod` |
| Login 200 tapi halaman kosong (dev) | `public/hot` salah — Vite harus jalan di container via `exec -d app npm run dev` dengan `VITE_DEV_HOST` terisi (§2.4) |
| Export PDF gagal | `GOTENBERG_URL` tidak reachable — non-fatal untuk fitur lain |
| 419/401 API | `PASSPORT_*` tidak cocok dengan isi tabel `oauth_clients` — pakai key dari `.env.docker.local`/vault, jangan regenerate |
| Test gagal konek DB (dev) | `DB_TEST_*` di `.env.docker.local` belum benar — harus `DB_TEST_HOST=pgsql`, `DB_TEST_DATABASE=testing` (DB `testing` dibuat otomatis oleh init script pgsql) |

## 7. Referensi konfigurasi service (mail, database, dll.)

Sumber kebenaran: file compose + file env masing-masing. Tabel ini ringkasannya.

### 7.1 Lokal (`docker-compose.local.yml` + `.env.docker.local`)

| Service | Variabel | Nilai / catatan |
|---|---|---|
| `pgsql` | `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Diambil dari `DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD` (`solidtime`/`solidtime`/`randompassword`). DB + user dibuat otomatis saat volume `pgdata-local` pertama dibuat |
| `pgsql` | DB `testing` | Dibuat otomatis oleh init script `docker/local/pgsql/create-testing-database.sql`; dipakai koneksi `pgsql_test` (`DB_TEST_HOST=pgsql`, `DB_TEST_DATABASE=testing`) |
| `pgsql` | Port | Tidak di-publish ke host (hanya antar-service). Untuk debug: uncomment `ports:` + `FORWARD_DB_PORT` |
| `app` → DB | `DB_HOST=pgsql`, `DB_PORT=5432` | Nama service, bukan `127.0.0.1` |
| `mailpit` | SMTP `:1025` (antar-service), UI `http://localhost:8025` | Semua email dev nyangkut di sini, tidak terkirim keluar |
| `app` → mail | `MAIL_MAILER=smtp`, `MAIL_HOST=mailpit`, `MAIL_PORT=1025` | — |
| `gotenberg` | `GOTENBERG_URL=http://gotenberg:3000` | Export PDF; kalau mati hanya fitur export yang gagal |
| antrean/cache/sesi | `QUEUE_CONNECTION=sync`, `CACHE_DRIVER=file`, `SESSION_DRIVER=database` | Tanpa Redis/worker di lokal |

### 7.2 Production (`docker-compose.prod.yml` + `.env.prod`)

| Service | Variabel | Nilai / catatan |
|---|---|---|
| `pgsql` | `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Dari `DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD` di `.env.prod` (password kuat, isi sebelum volume `pgdata` pertama dibuat) |
| `app` → DB | `DB_HOST=pgsql` (dikunci di compose), `DB_SSL_MODE=prefer` | Jangan override ke IP/host lain |
| `app` → mail | `MAIL_MAILER=smtp` + `MAIL_HOST`/`MAIL_PORT`/`MAIL_USERNAME`/`MAIL_PASSWORD`/`MAIL_ENCRYPTION` | SMTP asli; `MAIL_FROM_ADDRESS` alamat resmi |
| `gotenberg` | `GOTENBERG_URL=http://gotenberg:3000` | Internal compose, tidak di-publish |
| antrean | `QUEUE_CONNECTION=database` + service `worker` (`WORKER_COMMAND` di `.env.prod`) | Scheduler tepat 1 replica, worker boleh >1 |
| sesi/cache/log | `SESSION_DRIVER=database`, `CACHE_DRIVER=file`, `LOG_CHANNEL=stderr_daily`, `LOG_LEVEL=warning` | Log via docker logs |
| file | `FILESYSTEM_DISK=local`, `PUBLIC_FILESYSTEM_DISK=local` | Data di volume `app-storage` — wajib persisten + backup |

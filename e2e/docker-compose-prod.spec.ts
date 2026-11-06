import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression test untuk laporan tim infra:
 * "kalau ada update, credential database balik lagi ke default,
 *  harusnya ngambil dari .env.prod".
 *
 * Akar masalah sebelumnya: service app/scheduler/worker punya
 * `environment: DB_*` dengan default `${DB_*:-solidtime}` yang MENIMPA
 * `env_file: .env.prod`, dan interpolasi hanya baca shell/--env-file
 * (bukan env_file:), sehingga update tanpa flag --env-file diam-diam
 * revert ke `solidtime`.
 *
 * Format yang dipakai sekarang (standar DevOps): kredensial dicerminkan
 * eksplisit tanpa default (`DB_DATABASE: ${DB_DATABASE}`, dst.) dan
 * service pgsql fail-fast (`${VAR:?...}`). Test ini mengunci format itu.
 */

const COMPOSE_PATH = join(process.cwd(), 'docker-compose.prod.yml');
const ENV_EXAMPLE_PATH = join(process.cwd(), '.env.prod.example');

function serviceBlock(compose: string, name: string): string {
    const start = compose.indexOf(`\n  ${name}:`);
    expect(start, `service ${name} harus ada di docker-compose.prod.yml`).toBeGreaterThanOrEqual(0);
    const rest = compose.slice(start);
    // Blok service berakhir di service berikutnya (indent 2 spasi) atau top-level key.
    const next = rest.slice(1).search(/\n  [a-zA-Z0-9_-]+:/);
    const volumesIdx = rest.indexOf('\nvolumes:');
    const networksIdx = rest.indexOf('\nnetworks:');
    let end = rest.length;
    for (const idx of [next === -1 ? -1 : next + 1, volumesIdx, networksIdx]) {
        if (idx > 0 && idx < end) end = idx;
    }
    return rest.slice(0, end);
}

for (const service of ['app', 'scheduler', 'worker']) {
    test(`${service}: kredensial DB dicerminkan eksplisit dari .env.prod`, () => {
        const compose = readFileSync(COMPOSE_PATH, 'utf-8');
        const block = serviceBlock(compose, service);

        // Wajib load .env.prod sebagai env_file (required agar gagal keras kalau hilang).
        expect(block).toContain('.env.prod');
        expect(block).toMatch(/required:\s*true/);

        // Format standar DevOps: cerminkan kredensial tanpa default samaran.
        // Tanpa `:-default` agar tidak bisa diam-diam revert ke `solidtime`.
        for (const [key, pattern] of [
            ['DB_DATABASE', /DB_DATABASE:\s*\$\{DB_DATABASE\}/],
            ['DB_USERNAME', /DB_USERNAME:\s*\$\{DB_USERNAME\}/],
            ['DB_PASSWORD', /DB_PASSWORD:\s*\$\{DB_PASSWORD\}/],
        ] as const) {
            expect(block, `${service} wajib mencerminkan ${key} dari --env-file`).toMatch(pattern);
        }
        expect(block).not.toContain('${DB_DATABASE:-');
        expect(block).not.toContain('${DB_USERNAME:-');

        // Selain kredensial, koneksi tetap dibaca dari .env.prod via env_file
        // (tidak di-override di sini).
        for (const key of ['DB_HOST:', 'DB_CONNECTION:', 'DB_PORT:', 'GOTENBERG_URL:']) {
            expect(
                block.split('\n').some((line) => line.trimStart().startsWith(key)),
                `${service} tidak boleh menimpa ${key} (baca dari .env.prod via env_file)`
            ).toBe(false);
        }
    });
}

test('pgsql: POSTGRES_* fail-fast dari .env.prod, tanpa default diam-diam', () => {
    const compose = readFileSync(COMPOSE_PATH, 'utf-8');
    const block = serviceBlock(compose, 'pgsql');

    expect(block).toContain('.env.prod');
    // Fail-fast: ${VAR:?pesan} — tanpa default `:-solidtime` yang bikin revert diam-diam.
    expect(block).toMatch(/POSTGRES_DB:\s*\$\{DB_DATABASE:\?/);
    expect(block).toMatch(/POSTGRES_USER:\s*\$\{DB_USERNAME:\?/);
    expect(block).toMatch(/POSTGRES_PASSWORD:\s*\$\{DB_PASSWORD:\?/);
    expect(block).not.toContain('${DB_DATABASE:-');
    expect(block).not.toContain('${DB_USERNAME:-');
});

test('pgsql: healthcheck pakai runtime env, bukan interpolasi compose', () => {
    const compose = readFileSync(COMPOSE_PATH, 'utf-8');
    const block = serviceBlock(compose, 'pgsql');

    // $$ = escape compose -> runtime env container (selalu konsisten dengan password aktual).
    expect(block).toContain('$${POSTGRES_USER}');
    expect(block).toContain('$${POSTGRES_DB}');
});

test('.env.prod.example: memuat koneksi DB lengkap (single source of truth)', () => {
    const example = readFileSync(ENV_EXAMPLE_PATH, 'utf-8');

    expect(example).toMatch(/^DB_CONNECTION=pgsql$/m);
    expect(example).toMatch(/^DB_HOST=pgsql$/m);
    expect(example).toMatch(/^DB_PORT=5432$/m);
    expect(example).toMatch(/^DB_DATABASE=/m);
    expect(example).toMatch(/^DB_USERNAME=/m);
    expect(example).toMatch(/^DB_PASSWORD=/m);
});

test('dokumentasi: perintah update wajib --env-file + catatan ALTER USER', () => {
    const compose = readFileSync(COMPOSE_PATH, 'utf-8');

    expect(compose).toContain('--env-file .env.prod');
    expect(compose).toMatch(/ALTER USER/i);
});

import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import checker from 'vite-plugin-checker';
import { collectModuleAssetsPaths, collectModulePlugins } from './vite-module-loader.js';

async function getConfig() {
    const paths = ['resources/js/app.ts', 'resources/css/app.css'];
    const modulePaths = await collectModuleAssetsPaths('extensions');
    const additionalPlugins = await collectModulePlugins('extensions');

    return defineConfig({
        base: './',
        build: {
            sourcemap: true, // Source map generation must be turned on
        },
        plugins: [
            laravel({
                input: [...paths, ...modulePaths],
                refresh: true,
            }),
            vue({
                template: {
                    transformAssetUrls: {
                        base: null,
                        includeAbsolute: false,
                    },
                },
            }),
            checker({
                // e.g. use TypeScript check
                typescript: true,
                vueTsc: true,
                lintCommand: 'eslint "./**/*.{ts,vue}"',
            }),
            ...additionalPlugins,
        ],
        server: {
            // Traefik/Sail mode (VITE_HOST_NAME set): HMR via reverse proxy on port 80.
            // Docker-local mode (VITE_DEV_HOST set, e.g. 0.0.0.0 in container):
            // bind all interfaces, browser reaches HMR via VITE_DEV_HMR_HOST.
            // Fully local mode (neither set): plain localhost HMR on the Vite port.
            host: process.env.VITE_DEV_HOST || (process.env.VITE_HOST_NAME ? true : '127.0.0.1'),
            hmr: process.env.VITE_HOST_NAME
                ? {
                        host: process.env.VITE_HOST_NAME,
                        clientPort: 80,
                    }
                : process.env.VITE_DEV_HMR_HOST
                    ? {
                            host: process.env.VITE_DEV_HMR_HOST,
                        }
                    : true,
        },
    });
}

export default getConfig();

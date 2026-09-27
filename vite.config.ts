import path from "path"
import fs from "node:fs"
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version?: string }

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version || '0.0.0'),
  },
  server: {
    allowedHosts: ['localhost', 'pulseiq.kompedia.in','app.kompedia.in','apis.kompedia.in'],
    port: 7145,
    strictPort: true,
  },
  preview: {
    port: 7145,
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      manifest: {
        name: 'Beacyn',
        short_name: 'Beacyn',
        description: 'Beacyn monitoring dashboard',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0c0c0e',
        icons: [
          {
            src: '/src/assets/app-logo/hexagon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/src/assets/app-logo/hexagon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        sourcemap: false,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Keep auth/API traffic online (no caching of sensitive responses).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            options: { cacheName: 'api-network-only' },
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 5,
            },
          },
        ],
        // Hash-based SPA: only the entry document needs fallback.
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/$/],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

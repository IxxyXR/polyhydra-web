import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_PATH ?? '/',
    // basic-ssl gives self-signed HTTPS so WebXR gets a secure context on LAN
    // devices (headsets); accept the one-time certificate warning on-device.
    // NO_HTTPS=true serves plain http (localhost tooling that can't click
    // through the self-signed-cert interstitial).
    plugins: [react(), tailwindcss(), ...(process.env.NO_HTTPS === 'true' ? [] : [basicSsl()])],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            react: ['react', 'react-dom'],
            ui: ['motion', 'lucide-react'],
          },
        },
      },
    },
  };
});

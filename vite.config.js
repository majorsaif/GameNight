import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 'production' | 'preview' | 'development' on Vercel, undefined locally
    __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV || '')
  },
  build: {
    rollupOptions: {
      output: {
        // Keep Firebase in its own long-cached chunk
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return undefined;
        }
      }
    },
    chunkSizeWarningLimit: 700
  },
  test: {
    include: ['src/**/*.test.js']
  }
});

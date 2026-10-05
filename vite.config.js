import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      output: {
        // 把不常變動的第三方套件拆成獨立檔案，改版後使用者不用重新下載
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'liff', test: /node_modules[\\/]@line[\\/]liff[\\/]/ },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@line/liff', 'tslib'],
  },
})
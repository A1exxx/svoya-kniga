import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Относительные пути к ассетам — чтобы работало на GitHub Pages в подпапке /<repo>/.
  base: './',
  plugins: [react()],
})

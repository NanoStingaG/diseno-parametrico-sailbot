import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base relativa para publicar en GitHub Pages bajo /<repositorio>/
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
})

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'react-vendor'
            if (id.includes('jspdf')) return 'pdf-vendor'
            if (id.includes('xlsx')) return 'excel-vendor'
            if (id.includes('leaflet')) return 'map-vendor'
          }
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})

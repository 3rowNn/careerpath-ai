import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // echarts (~540 kB) แยก chunk และโหลดเฉพาะหน้า Dashboard / Skill Gap
  build: { chunkSizeWarningLimit: 600 },
  server: {
    // เมื่อมี FastAPI รันที่ :8000 ให้ตั้ง VITE_API_URL=/api ใน .env.local แล้ว proxy จะส่งต่อให้
    proxy: { '/api': 'http://localhost:8000' },
  },
})

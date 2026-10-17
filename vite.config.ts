/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

/** vercel.json의 보안 헤더를 로컬 preview에도 적용해 배포 환경과 같은 조건으로 확인한다. */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const all = config.headers.find((h) => h.source === '/(.*)')
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // exceljs는 동적 import로 분리되지만 자체 번들이 커서 경고 기준을 조정한다.
    chunkSizeWarningLimit: 1200,
  },
  preview: {
    headers: productionHeaders(),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

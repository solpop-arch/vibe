import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: 5188,
    strictPort: true,
  },
  // Component tests opt into jsdom with `// @vitest-environment jsdom`;
  // pure-logic tests (outline.test.js) stay on node.
  test: {
    setupFiles: ['./src/test/setup.js'],
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
  },
})

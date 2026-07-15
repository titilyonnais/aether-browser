import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Injecte une Content-Security-Policy stricte dans l'index.html du renderer.
 * En développement, la politique est légèrement assouplie pour Vite (HMR,
 * preamble React Refresh) ; en production elle est verrouillée.
 */
function cspPlugin(): Plugin {
  return {
    name: 'aether-csp',
    transformIndexHtml(html, ctx) {
      const dev = ctx.server !== undefined
      const policy = [
        "default-src 'self'",
        `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: http: aether:",
        "font-src 'self' data:",
        `connect-src 'self'${dev ? ' ws://localhost:* http://localhost:*' : ''}`,
        "object-src 'none'",
        "base-uri 'self'"
      ].join('; ')
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss(), cspPlugin()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    }
  }
})

import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // `better-sqlite3` est un module natif (.node) — le forcer hors du
    // pool à threads de Vitest (`pool: 'forks'`) évite les soucis connus de
    // rechargement de binding natif entre workers threads.
    pool: 'forks'
  }
})

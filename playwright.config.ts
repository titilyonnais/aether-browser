/**
 * Config Playwright — UNIQUEMENT les tests e2e (`tests/e2e/`), lancés dans un
 * vrai processus Electron (`_electron`). Séparé de Vitest (`vitest.config.ts`,
 * `tests/*.test.ts`) : deux runners différents, deux dossiers différents,
 * jamais mélangés — voir `npm run test:e2e` (package.json), qui construit
 * l'app AVANT de lancer ces tests (`out/main/index.js` doit exister).
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Un vrai processus Electron par test (fenêtre, base SQLite, WebContentsView)
  // — plus lourd qu'un test unitaire, la parallélisation excessive ne ferait
  // que ralentir la machine sans accélérer la suite (peu de tests au total).
  workers: 1,
  timeout: 30_000,
  reporter: 'list'
})

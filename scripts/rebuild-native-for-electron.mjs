/**
 * Force le recompilage de `better-sqlite3` pour l'ABI d'Electron (jamais
 * celle de Node) — utilisé par `pretest:e2e` (package.json).
 *
 * Pourquoi PAS `electron-builder install-app-deps` (déjà utilisé par
 * `npm run rebuild`) : ce dernier maintient un cache et SAUTE le recompilage
 * réel s'il pense l'avoir déjà fait pour cette version d'Electron — même si
 * le binaire actuellement lié a été écrasé entre-temps par un `npm rebuild
 * better-sqlite3` ciblant Node (le `pretest` de `npm test`, exécuté juste
 * avant Vitest). Constaté en pratique : `npm test` puis `npm run test:e2e`
 * juste après laissait le module en ABI Node malgré un `npm run rebuild`
 * signalé « terminé » — l'app plantait alors silencieusement au lancement
 * (`NODE_MODULE_VERSION` incompatible), avec Playwright qui ne rapportait
 * qu'un vague timeout. `@electron/rebuild` avec `force: true` républie
 * inconditionnellement, sans jamais faire confiance à un cache.
 */
import { rebuild } from '@electron/rebuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const electronVersion = JSON.parse(readFileSync(new URL('../node_modules/electron/package.json', import.meta.url), 'utf8')).version

await rebuild({
  buildPath: rootDir,
  electronVersion,
  force: true,
  onlyModules: ['better-sqlite3']
})

console.log(`[rebuild-native-for-electron] better-sqlite3 recompilé pour Electron ${electronVersion}.`)

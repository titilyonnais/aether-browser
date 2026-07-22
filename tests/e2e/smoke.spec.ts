/**
 * Tests e2e smoke — vrai processus Electron (Playwright `_electron`), PAS de
 * mock, contrairement à `tests/*.test.ts` (Vitest, unitaires). Couvre le
 * strict minimum demandé : l'app démarre et affiche la coquille principale,
 * une page peut être ouverte depuis la Barre d'Intention, le mode Focus/Toile
 * bascule, un espace peut être créé.
 *
 * Chaque test lance sa PROPRE instance avec un `--user-data-dir` temporaire
 * (jamais le profil réel de l'utilisateur) et `AETHER_E2E=1`, qui saute
 * l'introduction pour atteindre directement la coquille principale (voir
 * `seedE2eDefaultsFromEnv`, main/settings.ts) — sans ça, chaque test devrait
 * en plus piloter l'onboarding avant même de commencer son propre scénario.
 *
 * Prérequis : `out/main/index.js` doit exister (`npm run build`) — le script
 * `test:e2e` (package.json) s'en charge automatiquement.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const MAIN_ENTRY = join(__dirname, '../../out/main/index.js')

let app: ElectronApplication
let window: Page
let userDataDir: string

test.beforeEach(async () => {
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(`${MAIN_ENTRY} introuvable — lancer "npm run build" avant les tests e2e (voir "npm run test:e2e").`)
  }
  userDataDir = mkdtempSync(join(tmpdir(), 'aether-e2e-'))
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AETHER_E2E: '1' }
  })
  window = await app.firstWindow()
  await window.waitForSelector('[data-testid="intention-pill"]', { timeout: 20_000 })
})

test.afterEach(async () => {
  await app?.close()
  rmSync(userDataDir, { recursive: true, force: true })
})

test('démarre, affiche la coquille principale et ouvre une page depuis la Barre d’Intention', async () => {
  const pill = window.locator('[data-testid="intention-pill"]')
  await expect(pill).toBeVisible()
  // Coquille principale réellement rendue, pas juste une fenêtre vide.
  await expect(window.locator('[data-testid="mode-focus"]')).toBeVisible()
  await expect(window.locator('[data-testid="new-space"]')).toBeVisible()

  await pill.click()
  const input = window.locator('[data-testid="intention-input"]')
  await expect(input).toBeVisible()
  await input.fill('https://example.com')
  await input.press('Enter')

  // La pilule affiche le domaine de la page active une fois ouverte — signe
  // que la Barre d'Intention a réellement classifié l'entrée et ouvert la page.
  await expect(pill).toContainText('example.com', { timeout: 15_000 })
})

test('bascule entre le mode Focus et le mode Toile', async () => {
  const canvasButton = window.locator('[data-testid="mode-canvas"]')
  const focusButton = window.locator('[data-testid="mode-focus"]')

  await canvasButton.click()
  await expect(canvasButton).toHaveClass(/text-glacier/)

  await focusButton.click()
  await expect(focusButton).toHaveClass(/text-glacier/)
})

test('crée un nouvel espace depuis la Constellation', async () => {
  const rows = window.locator('[data-testid="space-row"]')
  const before = await rows.count()

  await window.locator('[data-testid="new-space"]').click()

  await expect(rows).toHaveCount(before + 1, { timeout: 10_000 })
})

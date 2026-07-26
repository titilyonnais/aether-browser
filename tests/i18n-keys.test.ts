/**
 * Garde-fou i18n : toute clé référencée dans le code doit exister dans les
 * locales. Sans ce filet, supprimer une clé encore utilisée ne casse ni la
 * compilation ni les types — le défaut ne se voit qu'à l'exécution, sous la
 * forme d'une clé brute affichée à l'utilisateur (« settings.appearance.
 * useImageColor » en plein milieu des réglages, constaté en 0.67.0).
 *
 * Seuls les appels à clé LITTÉRALE sont vérifiables ici ; les clés construites
 * dynamiquement (`t(\`prefix.${x}\`)`) échappent forcément à l'analyse.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', 'src', 'renderer', 'src')
const LOCALES = join(ROOT, 'i18n', 'locales', 'fr')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function definedKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of readdirSync(LOCALES).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(LOCALES, file), 'utf8')
    for (const m of source.matchAll(/^\s*'([a-zA-Z0-9_.]+)':/gm)) keys.add(m[1])
  }
  return keys
}

/** Clés littérales référencées par `t('…')` / `tShell('…')`, avec leur fichier. */
function usedKeys(): Map<string, string> {
  const used = new Map<string, string>()
  for (const file of walk(ROOT)) {
    if (file.replace(/\\/g, '/').includes('/i18n/locales/')) continue
    const source = readFileSync(file, 'utf8')
    for (const pattern of [/\bt\(\s*'([a-zA-Z0-9_.]+)'/g, /tShell\(\s*'([a-zA-Z0-9_.]+)'/g]) {
      for (const m of source.matchAll(pattern)) {
        if (!used.has(m[1])) used.set(m[1], file.slice(ROOT.length + 1).replace(/\\/g, '/'))
      }
    }
  }
  return used
}

describe('traductions', () => {
  it('ne référence aucune clé absente des locales', () => {
    const defined = definedKeys()
    const missing = [...usedKeys()]
      .filter(([key]) => !defined.has(key))
      .map(([key, file]) => `${key} (${file})`)
    expect(missing).toEqual([])
  })

  it('trouve bien les clés (le test lui-même n’est pas vide)', () => {
    // Sans cette garde, une expression régulière cassée ferait passer le test
    // ci-dessus pour d'excellentes raisons — en ne trouvant plus rien du tout.
    expect(definedKeys().size).toBeGreaterThan(200)
    expect(usedKeys().size).toBeGreaterThan(200)
  })
})

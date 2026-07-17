/**
 * Journal local minimal (fichier texte, rotation simple) pour les échecs
 * actuellement avalés en silence (repli IA, chargement d'extension…) — sans
 * lui, ces échecs ne laissaient AUCUNE trace, rendant impossible de
 * comprendre après coup pourquoi telle fonctionnalité s'est dégradée
 * silencieusement. Volontairement local et synchrone (comme SQLite dans ce
 * projet) : pas de service distant, pas de télémétrie, pas d'opt-in à gérer —
 * juste un fichier dans userData/logs à joindre soi-même à un rapport de bug.
 */
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LOG_BYTES = 2 * 1024 * 1024

let logPath: string | null = null

function ensureLogPath(): string {
  if (logPath) return logPath
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  logPath = join(dir, 'aether.log')
  return logPath
}

/** Rotation à un seul cran (fichier courant → `.old`, écrasé) — suffisant
 * pour du débogage ponctuel, pas un historique long terme. */
function rotateIfNeeded(path: string): void {
  try {
    if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) {
      renameSync(path, `${path}.old`)
    }
  } catch {
    // Sans conséquence — on retentera à la prochaine écriture.
  }
}

function write(level: 'WARN' | 'ERROR', scope: string, message: string, err?: unknown): void {
  try {
    const path = ensureLogPath()
    rotateIfNeeded(path)
    const detail =
      err instanceof Error ? `${err.message}` : err !== undefined && err !== null ? String(err) : ''
    const line = `${new Date().toISOString()} [${level}] ${scope} — ${message}${detail ? ` :: ${detail}` : ''}\n`
    appendFileSync(path, line, 'utf8')
  } catch {
    // Le journal lui-même ne doit jamais faire planter l'appli.
  }
}

export const logger = {
  warn(scope: string, message: string, err?: unknown): void {
    write('WARN', scope, message, err)
  },
  error(scope: string, message: string, err?: unknown): void {
    write('ERROR', scope, message, err)
  }
}

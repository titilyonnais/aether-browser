/**
 * Drapeaux expérimentaux (la façade « chrome://flags » d'ÆTHER).
 *
 * Ils se traduisent en switches Chromium/Electron réels, qui DOIVENT être posés
 * avant `app.whenReady()`. Ils sont donc persistés dans un simple `flags.json`
 * (lisible synchroniquement au tout début, sans ouvrir la base) plutôt que dans
 * SQLite. Un changement exige un redémarrage — exactement comme chrome://flags.
 */
import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FLAG_DEFS } from '@shared/types'

export type FlagState = Record<string, boolean>

function flagsFile(): string {
  return join(app.getPath('userData'), 'flags.json')
}

function defaults(): FlagState {
  const out: FlagState = {}
  for (const f of FLAG_DEFS) out[f.id] = f.default
  return out
}

export function readFlags(): FlagState {
  const base = defaults()
  try {
    const raw = JSON.parse(readFileSync(flagsFile(), 'utf8')) as FlagState
    for (const f of FLAG_DEFS) {
      if (typeof raw[f.id] === 'boolean') base[f.id] = raw[f.id]
    }
  } catch {
    // Fichier absent au premier lancement — valeurs par défaut.
  }
  return base
}

export function writeFlags(next: FlagState): FlagState {
  const merged = { ...readFlags(), ...next }
  const clean: FlagState = {}
  for (const f of FLAG_DEFS) clean[f.id] = Boolean(merged[f.id])
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(flagsFile(), JSON.stringify(clean, null, 2), 'utf8')
  return clean
}

/** Traduit les drapeaux en switches. À appeler AVANT app.whenReady(). */
export function applyFlagsBeforeReady(): void {
  const f = readFlags()
  if (!f.hardwareAcceleration) app.disableHardwareAcceleration()
  if (f.experimentalWeb) app.commandLine.appendSwitch('enable-experimental-web-platform-features')
  if (f.forceDark) app.commandLine.appendSwitch('blink-settings', 'forceDarkModeEnabled=true')
  if (!f.smoothScrolling) app.commandLine.appendSwitch('disable-smooth-scrolling')
  if (f.overlayScrollbars) app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar')
}

/** Redémarre ÆTHER pour appliquer les drapeaux. */
export function relaunchApp(): void {
  app.relaunch()
  app.exit(0)
}

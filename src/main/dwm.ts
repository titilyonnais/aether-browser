/**
 * Neutralise la transition NATIVE que Windows applique par défaut à l'ouverture
 * et au redimensionnement d'une fenêtre transparente/sans cadre — le DWM et le
 * renderer Chromium se désynchronisent pendant cette transition, produisant
 * une bulle « translucide puis pop » plutôt qu'une apparition nette (confirmé
 * par analyse image par image d'un enregistrement fourni par l'utilisateur,
 * pour la bulle popover partagée). `thickFrame: false` (tenté avant) ne retire
 * QUE l'ombre/les animations liées à `WS_THICKFRAME` (redim./restauration),
 * jamais cette transition DWM — il n'existe aucune option Electron pour ça.
 * `koffi` (FFI pure JS, sans compilation native) appelle directement
 * `DwmSetWindowAttribute` avec `DWMWA_TRANSITIONS_FORCEDISABLED`, l'unique
 * levier qui cible vraiment le moteur de transition du DWM pour une fenêtre
 * précise.
 */
import type { BrowserWindow } from 'electron'
import koffi from 'koffi'

const DWMWA_TRANSITIONS_FORCEDISABLED = 3

let dwmSetWindowAttribute: ((hwnd: Buffer, attr: number, value: number[], size: number) => number) | null = null
try {
  const dwmapi = koffi.load('dwmapi.dll')
  dwmSetWindowAttribute = dwmapi.func(
    'long __stdcall DwmSetWindowAttribute(void *hwnd, int dwAttribute, int *pvAttribute, uint cbAttribute)'
  )
} catch {
  // dwmapi.dll indisponible (ne devrait jamais arriver sur Windows Vista+) —
  // dégradation silencieuse : l'animation native persiste, rien ne casse.
}

export function disableNativeWindowTransitions(win: BrowserWindow): void {
  if (!dwmSetWindowAttribute) return
  try {
    dwmSetWindowAttribute(win.getNativeWindowHandle(), DWMWA_TRANSITIONS_FORCEDISABLED, [1], 4)
  } catch {
    // Best effort — un échec ici ne doit jamais empêcher l'ouverture de la fenêtre.
  }
}

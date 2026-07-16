/**
 * Fondu natif (opacité) d'ouverture/fermeture, PARTAGÉ par toutes les fenêtres
 * popup de l'appli (bulles internes ET bulle de vraie extension) — même délai,
 * même animation partout.
 *
 * Piloté depuis le process PRINCIPAL (`setInterval` ici), jamais depuis un
 * `requestAnimationFrame` côté renderer : confirmé par la documentation et les
 * retours d'expérience Electron, `requestAnimationFrame` est fortement
 * throttlé pour une fenêtre masquée/non composée — ce qui rendait toute
 * tentative précédente de « attendre que ce soit peint AVANT d'afficher »
 * fondamentalement peu fiable, puisqu'une fenêtre invisible peut ne composer
 * AUCUN frame tant qu'elle n'est pas montrée (rien à afficher, rien à
 * composer) : aucun délai côté JS, aussi long soit-il, ne pouvait garantir
 * qu'un contenu était réellement peint avant `showInactive()`, d'où la bulle
 * translucide (l'ancien contenu de la fenêtre principale visible à travers)
 * qui persistait malgré plusieurs tentatives de correction du TIMING.
 *
 * Ce module contourne le problème plutôt que d'essayer de le résoudre : la
 * fenêtre est montrée à opacité 0 (ce qui FORCE Chromium à commencer à
 * composer, puisqu'elle est désormais visible), les tout premiers frames
 * potentiellement incomplets restent invisibles à l'œil (opacité proche de 0),
 * et au moment où l'opacité devient perceptible, Chromium a déjà eu plusieurs
 * frames pour peindre le contenu réel.
 */
import type { BrowserWindow } from 'electron'

/** Durée identique pour l'arrivée ET la fermeture de TOUTE bulle. */
const FADE_MS = 90
const STEP_MS = 1000 / 60

const timers = new WeakMap<BrowserWindow, ReturnType<typeof setInterval>>()

function stop(win: BrowserWindow): void {
  const timer = timers.get(win)
  if (timer) clearInterval(timer)
  timers.delete(win)
}

/** Affiche `win` en fondu — depuis son opacité courante si elle est déjà
 * visible (interrompt proprement un fondu de fermeture en cours), sinon
 * depuis 0. `win` doit déjà avoir ses bornes et son contenu final avant
 * l'appel : ce module ne touche qu'à la visibilité/opacité. */
export function fadeWindowIn(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  stop(win)
  const start = win.isVisible() ? win.getOpacity() : 0
  win.setOpacity(start)
  if (!win.isVisible()) win.showInactive()
  if (start >= 1) return
  const startedAt = Date.now()
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(timer)
      return
    }
    const t = Math.min(1, (Date.now() - startedAt) / FADE_MS)
    win.setOpacity(start + (1 - start) * t)
    if (t >= 1) {
      clearInterval(timer)
      timers.delete(win)
    }
  }, STEP_MS)
  timers.set(win, timer)
}

/** Referme `win` en fondu puis `hide()` une fois totalement transparente —
 * `onHidden` (facultatif) s'exécute à cet instant précis (ex. pour enchaîner
 * une vraie destruction de fenêtre plutôt qu'un simple masquage). */
export function fadeWindowOut(win: BrowserWindow, onHidden?: () => void): void {
  if (win.isDestroyed() || !win.isVisible()) {
    onHidden?.()
    return
  }
  stop(win)
  const start = win.getOpacity()
  const startedAt = Date.now()
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(timer)
      return
    }
    const t = Math.min(1, (Date.now() - startedAt) / FADE_MS)
    win.setOpacity(start * (1 - t))
    if (t >= 1) {
      clearInterval(timer)
      timers.delete(win)
      win.hide()
      win.setOpacity(1)
      onHidden?.()
    }
  }, STEP_MS)
  timers.set(win, timer)
}

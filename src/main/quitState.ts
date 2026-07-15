/**
 * Distingue un vrai « Quitter ÆTHER » (menu, `app.quit()` explicite) d'une
 * simple fermeture de fenêtre (bouton X / Alt+F4) — nécessaire pour le réglage
 * « minimiser au lieu de fermer » : sans ce drapeau, intercepter l'évènement
 * `close` de la fenêtre intercepterait AUSSI la fermeture déclenchée par
 * `app.quit()` lui-même, rendant le menu « Quitter » incapable de quitter.
 * Module à part (pas dans index.ts/ipc.ts) pour éviter un import circulaire
 * entre les deux.
 */
let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function isQuitting(): boolean {
  return quitting
}

/**
 * Presse-papiers de favoris — un unique slot process-wide (pas par fenêtre :
 * comme le presse-papiers OS, « couper » un favori dans une fenêtre puis
 * « coller » dans une autre doit marcher). « Couper » ne modifie rien tant
 * que « Coller » n'a pas été appelé (pas de disparition immédiate façon OS —
 * évite de perdre le favori si l'utilisateur change d'avis sans coller).
 */
import type { ProfileId } from '@shared/types'

interface FavoritesClipboardSlot {
  id: string
  mode: 'cut' | 'copy'
  profileId: ProfileId
}

let slot: FavoritesClipboardSlot | null = null

export function setFavoritesClipboard(id: string, mode: 'cut' | 'copy', profileId: ProfileId): void {
  slot = { id, mode, profileId }
}

/** Renvoie le slot courant, seulement s'il appartient à ce profil (coller un
 * favori d'un autre profil n'aurait aucun sens — pages/favoris ne sont
 * jamais partagés entre profils). */
export function getFavoritesClipboard(profileId: ProfileId): FavoritesClipboardSlot | null {
  return slot && slot.profileId === profileId ? slot : null
}

export function clearFavoritesClipboard(): void {
  slot = null
}

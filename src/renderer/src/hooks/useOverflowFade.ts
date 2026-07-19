/**
 * Détecte si un élément texte déborde RÉELLEMENT de sa boîte —
 * `.fade-truncate` (global.css) applique un dégradé de sortie à largeur FIXE
 * (16px) sur les 16 derniers pixels de la boîte, quel que soit son contenu.
 * Pour un texte COURT dont la boîte se limite à sa taille naturelle (aucun
 * dépassement réel), ces 16px représentent une fraction disproportionnée du
 * texte entier (ex. « cia.gov » ≈ 60px : 16px = ~27% du mot, le "v" final
 * disparaît dans le fondu) — visible comme un texte "coupé" malgré la place
 * disponible. Ce hook ne s'applique le dégradé QUE quand `scrollWidth` dépasse
 * réellement `clientWidth`, cas où le fondu joue son vrai rôle (signaler un
 * texte tronqué) plutôt que d'être un artefact cosmétique permanent.
 */
import { useEffect, useRef, useState } from 'react'

export function useOverflowFade<T extends HTMLElement>(deps: readonly unknown[] = []): {
  ref: React.RefObject<T | null>
  overflowing: boolean
} {
  const ref = useRef<T | null>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = (): void => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ref, overflowing }
}

/**
 * Icône d'extension avec repli automatique — une icône locale peut échouer à
 * charger (dossier déplacé, fichier manquant) sans que `iconUrl` soit null,
 * d'où un `onError` qui bascule sur le picto générique plutôt qu'une image cassée.
 */
import { Puzzle } from 'lucide-react'
import { useState } from 'react'

interface ExtensionIconProps {
  iconUrl: string | null
  size?: number
}

export function ExtensionIcon({ iconUrl, size = 12 }: ExtensionIconProps) {
  const [failed, setFailed] = useState(false)
  if (!iconUrl || failed) return <Puzzle size={size} strokeWidth={1.6} className="text-ink-faint" />
  return <img src={iconUrl} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
}

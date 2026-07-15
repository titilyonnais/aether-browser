/**
 * Estime la vitesse de téléchargement (Ko/s, moyenne mobile) de chaque
 * entrée active — Electron ne fournit pas cette valeur directement, seul
 * `receivedBytes` cumulé est poussé à chaque tick. Partagé entre l'icône de
 * la barre de titre et le panneau des téléchargements.
 */
import { useEffect, useRef } from 'react'
import type { DownloadEntry } from '@shared/types'

export function useDownloadSpeed(entries: DownloadEntry[]): Map<string, number> {
  const stateRef = useRef(new Map<string, { bytes: number; time: number; speed: number }>())
  const active = entries.filter((d) => d.state === 'progressing')

  useEffect(() => {
    const now = Date.now()
    for (const d of active) {
      const prev = stateRef.current.get(d.id)
      if (prev) {
        const dt = (now - prev.time) / 1000
        if (dt > 0.4) {
          const instant = Math.max(0, (d.receivedBytes - prev.bytes) / dt)
          const speed = prev.speed > 0 ? prev.speed * 0.6 + instant * 0.4 : instant
          stateRef.current.set(d.id, { bytes: d.receivedBytes, time: now, speed })
        }
      } else {
        stateRef.current.set(d.id, { bytes: d.receivedBytes, time: now, speed: 0 })
      }
    }
    for (const id of [...stateRef.current.keys()]) {
      if (!active.some((d) => d.id === id)) stateRef.current.delete(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  const snapshot = new Map<string, number>()
  for (const [id, v] of stateRef.current) snapshot.set(id, v.speed)
  return snapshot
}

/** Temps restant estimé (secondes), ou `null` si pas assez de données. */
export function remainingSeconds(entry: DownloadEntry, speed: number): number | null {
  if (entry.totalBytes <= 0 || speed <= 0) return null
  return (entry.totalBytes - entry.receivedBytes) / speed
}

/**
 * Contenu de la carte d'aperçu au survol d'un onglet (bande de pages) —
 * aperçu de la page, titre, domaine, son, mémoire utilisée. Rendu à
 * l'intérieur de la fenêtre popup native (voir PopoverRoot.tsx) : aucune
 * logique de positionnement ici, seulement le contenu.
 */
import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PageId, PageMeta } from '@shared/types'
import { translate, type Locale } from '@/i18n'
import { domainOf, previewUrl } from '@/lib/utils'

interface TabPreviewCardProps {
  pageId: PageId
  showPreview: boolean
  locale: string
}

function formatKB(kb: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (kb >= 1024) return t('focusCanvas.tabPreview.memoryMB', { size: (kb / 1024).toFixed(1) })
  return t('focusCanvas.tabPreview.memoryKB', { size: Math.round(kb) })
}

export function TabPreviewCard({ pageId, showPreview, locale }: TabPreviewCardProps) {
  const loc = locale as Locale
  const t = (key: string, vars?: Record<string, string | number>): string => translate(loc, key, vars)
  const [page, setPage] = useState<PageMeta | null | undefined>(undefined)
  /** undefined = en cours de mesure, null = indisponible (page en veille, hors
   * du cache LRU de vues vivantes — cf ViewManager, ≤6 pages ont un vrai
   * processus actif ; les autres sont de simples cartes avec aperçu figé). */
  const [memKB, setMemKB] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    void window.aether.pages.get(pageId).then(setPage)
    void window.aether.pages.getMemoryKB(pageId).then(setMemKB)
  }, [pageId])

  if (page === undefined) return null
  if (page === null) return null

  const preview = showPreview ? previewUrl(page.id, page.previewVersion) : null

  return (
    <div className="popover-surface w-52 overflow-hidden rounded-xl">
      {preview && <img src={preview} className="h-32 w-full object-cover object-top" alt="" />}
      <div className="p-2">
        <p className="truncate text-[11px] text-ink">{page.title || t('focusCanvas.tabPreview.untitled')}</p>
        <p className="truncate font-mono text-[9.5px] text-ink-faint">{domainOf(page.url)}</p>
        <div className="mt-1 flex items-center gap-1 text-[9.5px] text-ink-faint">
          {page.muted ? <VolumeX size={10} /> : <Volume2 size={10} className="opacity-40" />}
          <span>
            {memKB === undefined
              ? t('focusCanvas.tabPreview.measuring')
              : memKB === null
                ? t('focusCanvas.tabPreview.sleeping')
                : t('focusCanvas.tabPreview.memory', { size: formatKB(memKB, t) })}
          </span>
        </div>
      </div>
    </div>
  )
}

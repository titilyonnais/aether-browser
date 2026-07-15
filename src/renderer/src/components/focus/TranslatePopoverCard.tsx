/**
 * Contenu du popup natif « Traduire cette page » (voir TranslatePopoverButton
 * et PopoverRoot.tsx) — l'équivalent ÆTHER de la bulle native de Chrome/Brave
 * ancrée à l'icône de la barre d'adresse. Rendu dans la fenêtre popup, PAS
 * dans la page : c'est justement le point — l'utilisateur ne veut aucune
 * bannière insérée dans la page elle-même (voir ViewManager.translate côté
 * main, qui traduit lui-même le texte sans jamais injecter d'UI Google).
 */
import { Check, ChevronLeft, Languages, MoreVertical, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PageId } from '@shared/types'
import { translate, type Locale } from '@/i18n'
import { domainOf } from '@/lib/utils'

interface TranslatePopoverCardProps {
  pageId: PageId
  locale: string
}

/** Noms français des langues les plus courantes — assez pour l'affichage
 * « Langue détectée » et les listes de langues, pas une liste exhaustive. */
const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'français',
  en: 'anglais',
  es: 'espagnol',
  de: 'allemand',
  it: 'italien',
  pt: 'portugais',
  nl: 'néerlandais',
  ru: 'russe',
  ja: 'japonais',
  zh: 'chinois',
  ko: 'coréen',
  ar: 'arabe',
  pl: 'polonais',
  tr: 'turc',
  sv: 'suédois',
  uk: 'ukrainien'
}

const LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh', 'ko', 'ar', 'pl', 'tr', 'sv', 'uk']

type MenuPanel = 'none' | 'menu' | 'target-list' | 'source-list'

function closePopover(): void {
  window.aether.popover.hide()
}

export function TranslatePopoverCard({ pageId, locale }: TranslatePopoverCardProps) {
  const loc = locale as Locale
  const t = (key: string, vars?: Record<string, string | number>): string => translate(loc, key, vars)
  const [detected, setDetected] = useState<string | null>(null)
  const [sourceOverride, setSourceOverride] = useState<string | null>(null)
  const [targetLang, setTargetLang] = useState((navigator.language || 'fr').split('-')[0])
  const [translated, setTranslated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<MenuPanel>('none')
  const [domain, setDomain] = useState<string | null>(null)
  const [neverTranslateDomains, setNeverTranslateDomains] = useState<string[]>([])
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setTranslated(false)
    setSourceOverride(null)
    setPanel('none')
    void window.aether.pages.detectLanguage(pageId).then(setDetected)
    void window.aether.pages.get(pageId).then((page) => setDomain(page ? domainOf(page.url) : null))
    void window.aether.settings.get().then((s) => setNeverTranslateDomains(s.neverTranslateDomains))
  }, [pageId])

  useEffect(() => {
    if (panel === 'none') return
    const onDown = (e: PointerEvent): void => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (menuButtonRef.current?.contains(e.target as Node)) return
      setPanel('none')
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [panel])

  const sourceCode = sourceOverride ?? detected
  const sourceLabel = sourceCode ? LANGUAGE_NAMES[sourceCode] ?? sourceCode : t('focusCanvas.translate.unknownLanguage')
  const targetLabel = LANGUAGE_NAMES[targetLang] ?? targetLang

  const runTranslate = (lang = targetLang, source = sourceOverride ?? 'auto'): void => {
    setBusy(true)
    window.aether.pages.translate(pageId, lang, source)
    setTargetLang(lang)
    setTranslated(true)
    setBusy(false)
    setPanel('none')
  }

  const runRestore = (): void => {
    // Reste ouvert (comme Chrome/Brave) : l'utilisateur voit l'état repasser
    // à « Traduire » et peut retraduire immédiatement sans rouvrir le popup.
    window.aether.pages.untranslate(pageId)
    setTranslated(false)
    setBusy(false)
  }

  const pickTargetLang = (lang: string): void => runTranslate(lang, sourceOverride ?? 'auto')

  const pickSourceLang = (lang: string): void => {
    setSourceOverride(lang)
    runTranslate(targetLang, lang)
  }

  const neverTranslateThisSite = (): void => {
    if (!domain) return
    void window.aether.settings.set({
      neverTranslateDomains: Array.from(new Set([...neverTranslateDomains, domain]))
    })
    setPanel('none')
    closePopover()
  }

  return (
    <div className="popover-surface relative w-80 overflow-hidden rounded-xl p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <Languages size={14} strokeWidth={1.8} className="shrink-0 text-glacier" />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{t('focusCanvas.translate.title')}</p>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setPanel((p) => (p === 'none' ? 'menu' : 'none'))}
          className={
            'grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim' +
            (panel !== 'none' ? ' bg-white/[0.06] text-ink-dim' : '')
          }
        >
          <MoreVertical size={13} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={closePopover}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
        >
          <X size={13} strokeWidth={1.8} />
        </button>
      </div>

      <p className="mb-1 text-[11.5px] text-ink-faint">
        {t('focusCanvas.translate.detected', { language: sourceLabel })}
      </p>
      <p className="mb-3 text-[11.5px] text-ink-faint">
        {t('focusCanvas.translate.targetLabel')} <span className="text-ink-dim">{targetLabel}</span>
      </p>

      {translated ? (
        <button
          type="button"
          onClick={runRestore}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-[12px] text-ink-dim transition-colors hover:bg-white/[0.09] disabled:opacity-50"
        >
          {t('focusCanvas.translate.showOriginal')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => runTranslate()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-glacier/90 px-3 py-2 text-[12px] font-medium text-ink-onaccent transition-colors hover:bg-glacier disabled:opacity-50"
        >
          <Check size={13} strokeWidth={2} />
          {t('focusCanvas.translate.translateAction')}
        </button>
      )}

      {panel !== 'none' && (
        <div
          ref={menuRef}
          className="glass-strong absolute right-3 top-9 z-10 max-h-64 w-56 overflow-y-auto rounded-lg p-1 shadow-xl"
        >
          {panel === 'menu' && (
            <>
              <button
                type="button"
                onClick={() => setPanel('target-list')}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] text-ink-dim hover:bg-white/[0.06]"
              >
                {t('focusCanvas.translate.menuPickTarget')}
                <span className="text-ink-faint">›</span>
              </button>
              <button
                type="button"
                onClick={() => setPanel('source-list')}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] text-ink-dim hover:bg-white/[0.06]"
              >
                {t('focusCanvas.translate.menuFixSource')}
                <span className="text-ink-faint">›</span>
              </button>
              <div className="my-1 h-px bg-white/[0.06]" />
              <button
                type="button"
                onClick={neverTranslateThisSite}
                disabled={!domain}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12px] text-red-200 hover:bg-red-400/10 disabled:opacity-50"
              >
                {t('focusCanvas.translate.menuNeverTranslateSite')}
              </button>
            </>
          )}

          {(panel === 'target-list' || panel === 'source-list') && (
            <>
              <button
                type="button"
                onClick={() => setPanel('menu')}
                className="mb-1 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[11px] text-ink-faint hover:bg-white/[0.06]"
              >
                <ChevronLeft size={12} strokeWidth={2} />
                {t('focusCanvas.translate.menuBack')}
              </button>
              {LANGS.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => (panel === 'target-list' ? pickTargetLang(code) : pickSourceLang(code))}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] text-ink-dim hover:bg-white/[0.06]"
                >
                  {LANGUAGE_NAMES[code] ?? code}
                  {(panel === 'target-list' ? targetLang : sourceCode) === code && (
                    <Check size={12} strokeWidth={2.2} className="text-glacier" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

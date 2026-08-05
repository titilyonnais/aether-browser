/**
 * Gestionnaire de mots de passe — liste complète des identifiants
 * enregistrés (voir Réglages › Confidentialité pour l'aperçu résumé). Mot de
 * passe masqué par défaut : `passwords.reveal(id)` n'est appelé qu'au clic
 * explicite sur l'icône œil, jamais au chargement de la liste — voir le
 * commentaire de `passwordsRepo` (main/db/repositories.ts).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, KeyRound, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PasswordListItem } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { SearchBar, SearchToggle } from '@/components/ui/SearchField'
import { useT } from '@/i18n/useT'
import { domainOf } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

export function PasswordsOverlay() {
  const open = useUiStore((s) => s.overlay === 'passwords')
  return <AnimatePresence>{open && <PasswordsPanel />}</AnimatePresence>
}

function PasswordsPanel() {
  const t = useT()
  const [items, setItems] = useState<PasswordListItem[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const close = (): void => useUiStore.getState().closeOverlay()

  const load = (): void => {
    void window.aether.passwords.list().then(setItems)
  }

  useEffect(load, [])

  const removeItem = async (id: string): Promise<void> => {
    setItems((v) => v.filter((item) => item.id !== id))
    setRevealed((r) => {
      const next = { ...r }
      delete next[id]
      return next
    })
    await window.aether.passwords.remove(id)
  }

  const clearAll = async (): Promise<void> => {
    await window.aether.passwords.clear()
    setItems([])
    setRevealed({})
    setConfirmingClear(false)
  }

  const toggleReveal = (id: string): void => {
    if (revealed[id] !== undefined) {
      setRevealed((r) => {
        const next = { ...r }
        delete next[id]
        return next
      })
      return
    }
    void window.aether.passwords.reveal(id).then((password) => {
      if (password !== null) setRevealed((r) => ({ ...r, [id]: password }))
    })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.origin.toLowerCase().includes(q) || item.identifier.toLowerCase().includes(q))
  }, [items, query])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={close}
        className="fixed inset-0 z-40 bg-void/55 backdrop-blur-[7px]"
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[min(560px,88vh)] w-[min(620px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          if (confirmingClear) setConfirmingClear(false)
          else close()
        }}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
          <KeyRound size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.passwords.title')}</p>
          <div className="ml-auto flex items-center gap-1">
            <SearchToggle
              open={searchOpen}
              onToggle={() => setSearchOpen((v) => !v)}
              title={t('overlays.passwords.searchPlaceholder')}
            />
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                title={t('overlays.passwords.clearAllTitle')}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-red-400/10 hover:text-red-200"
              >
                <Trash2 size={14} strokeWidth={1.7} />
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
            >
              <X size={15} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        {confirmingClear && (
          <div className="flex shrink-0 items-center gap-2.5 border-b border-red-400/20 bg-red-400/[0.06] px-5 py-2.5">
            <p className="flex-1 text-[12px] text-ink-dim">{t('overlays.passwords.clearAllConfirm')}</p>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="rounded-lg px-2.5 py-1 text-[11.5px] text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
            >
              {t('overlays.passwords.clearAllCancel')}
            </button>
            <button
              type="button"
              onClick={() => void clearAll()}
              className="rounded-lg bg-red-400/15 px-2.5 py-1 text-[11.5px] text-red-200 transition-colors hover:bg-red-400/25"
            >
              {t('overlays.passwords.clearAllConfirmButton')}
            </button>
          </div>
        )}

        <SearchBar open={searchOpen} value={query} onChange={setQuery} placeholder={t('overlays.passwords.searchPlaceholder')} />

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">{t('overlays.passwords.emptyState')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">{t('overlays.passwords.noResults')}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
                >
                  <Favicon url={item.origin} faviconUrl={null} size={16} />
                  <span className="min-w-0 flex-1">
                    <span className="block fade-truncate text-[12.5px] text-ink-dim">{domainOf(item.origin)}</span>
                    <span className="block fade-truncate text-[11px] text-ink-faint">{item.identifier}</span>
                  </span>
                  <span className="w-32 shrink-0 truncate font-mono text-[11px] text-ink-faint">
                    {revealed[item.id] ?? '••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleReveal(item.id)}
                    title={revealed[item.id] !== undefined ? t('overlays.passwords.hideTitle') : t('overlays.passwords.revealTitle')}
                    className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
                  >
                    {revealed[item.id] !== undefined ? (
                      <EyeOff size={13} strokeWidth={1.8} />
                    ) : (
                      <Eye size={13} strokeWidth={1.8} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeItem(item.id)}
                    title={t('overlays.passwords.removeOneTitle')}
                    className="shrink-0 rounded-md p-1.5 text-ink-faint opacity-0 transition-colors hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100"
                  >
                    <X size={13} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}

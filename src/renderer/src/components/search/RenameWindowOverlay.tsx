/**
 * Nommer la fenêtre — modifie le titre OS (barre des tâches, Alt+Tab) sans
 * toucher au nom de l'espace ni d'un profil.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function RenameWindowOverlay() {
  const open = useUiStore((s) => s.overlay === 'rename-window')
  return <AnimatePresence>{open && <RenameWindowPanel />}</AnimatePresence>
}

function RenameWindowPanel() {
  const t = useT()
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = (): void => {
    window.aether.app.setTitle(name.trim() || 'ÆTHER')
    close()
  }

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
        className="glass-strong fixed left-1/2 top-1/2 z-50 w-[min(360px,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-5"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <p className="mb-3 font-display text-[15px] italic text-ink">{t('overlays.renameWindow.title')}</p>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder="ÆTHER"
          maxLength={80}
          className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-glacier/40"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[12px] text-ink-faint hover:text-ink-dim"
          >
            {t('overlays.renameWindow.cancel')}
          </button>
          <button
            type="button"
            onClick={commit}
            className="rounded-full border border-glacier/30 bg-glacier/[0.08] px-3.5 py-1.5 text-[12px] text-glacier hover:bg-glacier/[0.14]"
          >
            {t('overlays.renameWindow.confirm')}
          </button>
        </div>
      </motion.div>
    </>
  )
}

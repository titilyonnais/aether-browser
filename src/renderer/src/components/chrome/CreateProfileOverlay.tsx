/**
 * Vraie interface de création de profil (nom + avatar) — au lieu de l'ancien
 * chemin instantané (nom générique, icône/couleur auto-assignées). Choix
 * faits AVANT même que le profil n'existe (aucun `id` tant qu'on n'a pas
 * confirmé) : `createProfile` (lib/actions.ts) ne crée réellement le profil
 * qu'à la confirmation, avec ces choix déjà en main.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { ImageIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createProfile } from '@/lib/actions'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

const AVATAR_ICON_CHOICES = ['✦', '◆', '❋', '➶', '❖', '✺', '❂', '✧', '🦋', '🌙', '🔥', '🌊']
const AVATAR_COLOR_CHOICES = ['#a9c9ec', '#b3a4e6', '#8fe0c2', '#e6c78f', '#e6a4c4', '#9ab0c9']

export function CreateProfileOverlay() {
  const open = useUiStore((s) => s.overlay === 'create-profile')
  return <AnimatePresence>{open && <CreateProfilePanel />}</AnimatePresence>
}

function CreateProfilePanel() {
  const t = useT()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(AVATAR_ICON_CHOICES[0])
  const [color, setColor] = useState(AVATAR_COLOR_CHOICES[0])
  const [imagePath, setImagePath] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const chooseImage = async (): Promise<void> => {
    const filename = await window.aether.profiles.chooseAvatarImage()
    if (filename) setImagePath(filename)
  }

  const confirm = (): void => {
    void createProfile(
      name.trim() || t('settings.profiles.newProfileName'),
      imagePath ? { imagePath } : { icon, color }
    )
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
        className="glass-strong fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-5"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <p className="mb-3 font-display text-[15px] italic text-ink">{t('overlays.createProfile.title')}</p>

        <div className="mb-4 flex items-center gap-3">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full text-[22px]"
            style={{ background: imagePath ? undefined : color }}
          >
            {imagePath ? (
              <img
                src={`aether://avatars/${imagePath}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              icon
            )}
          </div>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            placeholder={t('overlays.createProfile.namePlaceholder')}
            maxLength={40}
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-glacier/40"
          />
        </div>

        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
          {t('overlays.createProfile.avatarLabel')}
        </p>
        <button
          type="button"
          onClick={() => void chooseImage()}
          className={cn(
            'mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors',
            imagePath ? 'border-glacier/40 bg-glacier/[0.08] text-ink' : 'border-white/[0.08] text-ink-faint hover:text-ink-dim'
          )}
        >
          <ImageIcon size={11} strokeWidth={1.7} />
          {t('overlays.createProfile.chooseImage')}
        </button>

        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {AVATAR_ICON_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => {
                setImagePath(null)
                setIcon(choice)
              }}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg border text-[14px] transition-colors',
                !imagePath && icon === choice
                  ? 'border-glacier/50 bg-glacier/[0.1]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]'
              )}
            >
              {choice}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AVATAR_COLOR_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              title={choice}
              onClick={() => {
                setImagePath(null)
                setColor(choice)
              }}
              className={cn(
                'h-6 w-6 rounded-full transition-transform hover:scale-110',
                !imagePath && color === choice ? 'ring-2 ring-offset-2 ring-offset-abyss' : ''
              )}
              style={{ background: choice }}
            />
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[12px] text-ink-faint hover:text-ink-dim"
          >
            {t('overlays.createProfile.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="rounded-full border border-glacier/30 bg-glacier/[0.08] px-3.5 py-1.5 text-[12px] text-glacier hover:bg-glacier/[0.14]"
          >
            {t('overlays.createProfile.confirm')}
          </button>
        </div>
      </motion.div>
    </>
  )
}

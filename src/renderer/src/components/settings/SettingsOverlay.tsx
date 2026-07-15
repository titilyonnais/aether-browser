/**
 * Paramètres — modal calme en treize sections, organisées comme
 * Chrome/Edge/Brave : Intelligence, Profils, Apparence, Navigation,
 * Recherche, Confidentialité & sécurité, Performance, Langues, Système,
 * Données, Extensions, Réinitialiser, À propos.
 */
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronLeft,
  Cloud,
  Compass,
  Database,
  ExternalLink,
  FolderOpen,
  Gauge,
  HardDrive,
  Image as ImageIcon,
  Info,
  KeyRound,
  Languages,
  MonitorCog,
  Palette,
  Pencil,
  Plus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  UserRound,
  Wand2,
  X
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { FlagState } from '@shared/ipc'
import { SEARCH_ENGINES } from '@shared/intent'
import { CHROME_URLS, FLAG_DEFS, SPELLCHECK_LANGUAGES } from '@shared/types'
import type {
  AccentId,
  ApiProviderKind,
  AppSettings,
  BrowsingDataKind,
  ClearDataRange,
  ExtensionInfo,
  Profile,
  SearchEngineId,
  ThemeMode,
  UpdateStatus
} from '@shared/types'
import { ExtensionIcon } from '@/components/ui/ExtensionIcon'
import { Kbd } from '@/components/ui/Kbd'
import { MiniSwitch } from '@/components/ui/MiniSwitch'
import { ProfileAvatar } from '@/components/ui/ProfileAvatar'
import { SearchBar, SearchToggle } from '@/components/ui/SearchField'
import { useT } from '@/i18n/useT'
import {
  clearProfileAvatar,
  createProfile,
  openUrl,
  removeProfile,
  renameProfile,
  setProfileAvatarIcon,
  setProfileAvatarImage,
  switchProfile
} from '@/lib/actions'
import { cn, formatBytes } from '@/lib/utils'
import { useMuseStore } from '@/stores/muse'
import { usePagesStore } from '@/stores/pages'
import { useProfilesStore } from '@/stores/profiles'
import { useSearchEnginesStore } from '@/stores/searchEngines'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

type Section =
  | 'ia'
  | 'profils'
  | 'apparence'
  | 'navigation'
  | 'recherche'
  | 'confidentialite'
  | 'performance'
  | 'langues'
  | 'systeme'
  | 'donnees'
  | 'extensions'
  | 'reinitialiser'
  | 'apropos'

const SECTIONS: readonly Section[] = [
  'ia',
  'profils',
  'apparence',
  'navigation',
  'recherche',
  'confidentialite',
  'performance',
  'langues',
  'systeme',
  'donnees',
  'extensions',
  'reinitialiser',
  'apropos'
]

export function SettingsOverlay() {
  const open = useUiStore((s) => s.overlay === 'settings')
  return <AnimatePresence>{open && <SettingsPanel />}</AnimatePresence>
}

function SettingsPanel() {
  const t = useT()
  const requested = useUiStore((s) => s.settingsSection)
  const pendingRelaunch = useUiStore((s) => s.pendingRelaunch)
  const initial = (SECTIONS as readonly string[]).includes(requested ?? '') ? (requested as Section) : 'ia'
  const [section, setSection] = useState<Section>(initial)
  const [navQuery, setNavQuery] = useState('')
  const [navSearchOpen, setNavSearchOpen] = useState(false)
  const close = (): void => useUiStore.getState().closeOverlay()

  // Bug corrigé : quand un bouton ré-ouvre les réglages sur une autre section
  // alors que le panneau est DÉJÀ affiché, `requested` change mais le state
  // local ne suivait pas (seul le montage initial le lisait). On le resynchronise.
  useEffect(() => {
    if (requested && (SECTIONS as readonly string[]).includes(requested)) {
      setSection(requested as Section)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested])

  const nav: { id: Section; label: string; icon: typeof Wand2; keywords: string }[] = [
    { id: 'ia', label: t('settings.nav.ia'), icon: Wand2, keywords: 'muse intelligence assistant clé api' },
    { id: 'profils', label: t('settings.nav.profils'), icon: UserRound, keywords: 'profils avatar navigation privée' },
    {
      id: 'apparence',
      label: t('settings.nav.apparence'),
      icon: Palette,
      keywords: 'thème sombre clair couleur accent zoom taille police interface'
    },
    {
      id: 'navigation',
      label: t('settings.nav.navigation'),
      icon: Compass,
      keywords: "page d'accueil téléchargements dossier barre de favoris"
    },
    { id: 'recherche', label: t('settings.nav.recherche'), icon: Search, keywords: 'moteur de recherche google raccourcis' },
    {
      id: 'confidentialite',
      label: t('settings.nav.confidentialite'),
      icon: Shield,
      keywords: 'mot de passe cookies permissions caméra micro localisation notifications'
    },
    { id: 'performance', label: t('settings.nav.performance'), icon: Gauge, keywords: 'accélération matérielle mémoire' },
    { id: 'langues', label: t('settings.nav.langues'), icon: Languages, keywords: 'correcteur orthographique traduction' },
    { id: 'systeme', label: t('settings.nav.systeme'), icon: MonitorCog, keywords: 'proxy démarrage fenêtre' },
    { id: 'donnees', label: t('settings.nav.donnees'), icon: Database, keywords: 'effacer supprimer historique cache' },
    { id: 'extensions', label: t('settings.nav.extensions'), icon: Puzzle, keywords: 'modules complémentaires' },
    { id: 'reinitialiser', label: t('settings.nav.reinitialiser'), icon: RotateCcw, keywords: 'défaut restaurer' },
    { id: 'apropos', label: t('settings.nav.apropos'), icon: Info, keywords: 'version aide mises à jour' }
  ]
  const navQueryNorm = navQuery.trim().toLowerCase()
  const visibleNav = navQueryNorm
    ? nav.filter((n) => (n.label + ' ' + n.keywords).toLowerCase().includes(navQueryNorm))
    : nav

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
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[min(600px,88vh)] w-[min(820px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <div className="flex min-h-0 flex-1">
          {/* Navigation */}
          <nav className="flex w-46 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/[0.06] p-3" style={{ width: 190 }}>
            <div className="flex items-center justify-between gap-1 px-3 pb-2 pt-1.5">
              <p className="font-display text-[15px] italic text-ink">{t('settings.title')}</p>
              <SearchToggle
                open={navSearchOpen}
                onToggle={() => setNavSearchOpen((v) => !v)}
                title={t('settings.nav.searchPlaceholder')}
              />
            </div>
            <SearchBar open={navSearchOpen} value={navQuery} onChange={setNavQuery} placeholder={t('settings.nav.searchPlaceholder')} />
            {visibleNav.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-ink-faint">{t('settings.nav.noResults')}</p>
            ) : (
              visibleNav.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors',
                    section === id
                      ? 'bg-white/[0.06] text-ink'
                      : 'text-ink-dim hover:bg-white/[0.03] hover:text-ink'
                  )}
                >
                  <Icon size={13} strokeWidth={1.7} />
                  {label}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={close}
              className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] text-ink-faint transition-colors hover:bg-white/[0.03] hover:text-ink-dim"
            >
              <X size={13} strokeWidth={1.7} />
              {t('settings.common.close')}
            </button>
          </nav>

          {/* Contenu */}
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {section === 'ia' && <AiSection />}
            {section === 'profils' && <ProfilesSection />}
            {section === 'apparence' && <AppearanceSection />}
            {section === 'navigation' && <NavigationSection />}
            {section === 'recherche' && <SearchSection />}
            {section === 'confidentialite' && <PrivacySection />}
            {section === 'performance' && <PerformanceSection />}
            {section === 'langues' && <LanguagesSection />}
            {section === 'systeme' && <SystemSection />}
            {section === 'donnees' && <DataSection />}
            {section === 'extensions' && <ExtensionsSection />}
            {section === 'reinitialiser' && <ResetSection />}
            {section === 'apropos' && <AboutSection />}
          </div>
        </div>

        {/* Bannière persistante : un drapeau moteur a changé quelque part. */}
        <AnimatePresence>
          {pendingRelaunch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex shrink-0 items-center justify-between gap-3 border-t border-glacier/20 bg-glacier/[0.06] px-5 py-2.5"
            >
              <span className="text-[11.5px] text-ink-dim">
                {t('settings.relaunchBanner.text')}
              </span>
              <button
                type="button"
                onClick={() => window.aether.app.relaunch()}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-glacier px-4 py-1.5 text-[11.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier/90"
              >
                <RefreshCw size={11} strokeWidth={2} />
                {t('settings.relaunchBanner.button')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}

// ─── Drapeaux moteur (partagés entre sections) ───────────────────────────────

function useEngineFlag(id: string): { value: boolean | null; set: (v: boolean) => void } {
  const [flags, setFlags] = useState<FlagState | null>(null)
  useEffect(() => {
    void window.aether.flags.get().then(setFlags)
  }, [])
  return {
    value: flags ? Boolean(flags[id]) : null,
    set: (v: boolean) => {
      setFlags((f) => (f ? { ...f, [id]: v } : f))
      void window.aether.flags.set(id, v)
      useUiStore.getState().markPendingRelaunch()
    }
  }
}

function EngineFlagToggle({ id }: { id: string }) {
  const def = FLAG_DEFS.find((f) => f.id === id)
  const { value, set } = useEngineFlag(id)
  if (!def || value === null) return null
  return (
    <Toggle
      label={def.label + (def.caution ? '  ⚠' : '')}
      hint={def.description}
      checked={value}
      onChange={set}
    />
  )
}

// ─── Section Intelligence ────────────────────────────────────────────────────

function AiSection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const aiStatus = useSettingsStore((s) => s.aiStatus)
  const patch = useSettingsStore((s) => s.patch)
  const refreshAi = useSettingsStore((s) => s.refreshAi)
  const [refreshing, setRefreshing] = useState(false)

  if (!settings) return null

  const providers: { id: AppSettings['aiProvider']; label: string; desc: string; icon: typeof Wand2 }[] = [
    { id: 'auto', label: t('settings.ai.providerAutoLabel'), desc: t('settings.ai.providerAutoDesc'), icon: Wand2 },
    { id: 'ollama', label: t('settings.ai.providerOllamaLabel'), desc: t('settings.ai.providerOllamaDesc'), icon: HardDrive },
    { id: 'anthropic', label: t('settings.ai.providerClaudeLabel'), desc: t('settings.ai.providerClaudeDesc'), icon: Cloud },
    { id: 'openai', label: t('settings.ai.providerOpenaiLabel'), desc: t('settings.ai.providerOpenaiDesc'), icon: Cloud },
    { id: 'xai', label: t('settings.ai.providerGrokLabel'), desc: t('settings.ai.providerGrokDesc'), icon: Cloud }
  ]

  const doRefresh = async (): Promise<void> => {
    setRefreshing(true)
    await refreshAi()
    setRefreshing(false)
  }

  return (
    <div className="space-y-7">
      <Block title={t('settings.ai.museProviderTitle')} hint={t('settings.ai.museProviderHint')}>
        <div className="grid grid-cols-2 gap-2">
          {providers.map(({ id, label, desc, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => void patch({ aiProvider: id })}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                settings.aiProvider === id
                  ? 'border-glacier/40 bg-glacier/[0.05]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
              )}
            >
              <Icon
                size={15}
                strokeWidth={1.6}
                className={settings.aiProvider === id ? 'mt-0.5 text-glacier' : 'mt-0.5 text-ink-faint'}
              />
              <span>
                <span className="block text-[12.5px] text-ink">{label}</span>
                <span className="block text-[10.5px] text-ink-faint">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Block>

      <Block
        title={t('settings.ai.ollamaTitle')}
        hint={t('settings.ai.ollamaHint')}
      >
        <div className="space-y-2.5">
          <Row label={t('settings.ai.addressLabel')}>
            <TextInput
              defaultValue={settings.ollamaBaseUrl}
              onCommit={(v) => void patch({ ollamaBaseUrl: v })}
              placeholder="http://127.0.0.1:11434"
              mono
            />
          </Row>
          <Row label={t('settings.ai.stateLabel')}>
            <span className="flex items-center gap-2 text-[12px]">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  aiStatus?.ollama.reachable ? 'animate-pulse-dot bg-emerald-300' : 'bg-ink-faint'
                )}
              />
              <span className={aiStatus?.ollama.reachable ? 'text-ink-dim' : 'text-ink-faint'}>
                {aiStatus?.ollama.reachable
                  ? t(
                      aiStatus.ollama.models.length > 1 ? 'settings.ai.reachablePlural' : 'settings.ai.reachable',
                      { count: aiStatus.ollama.models.length }
                    )
                  : t('settings.ai.unreachable')}
              </span>
              <button
                type="button"
                title={t('settings.ai.redetect')}
                onClick={() => void doRefresh()}
                className="grid h-6 w-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
              >
                <RefreshCw size={11} strokeWidth={1.8} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </span>
          </Row>
          <Row label={t('settings.ai.modelLabel')}>
            <SelectInput
              value={settings.ollamaModel}
              onChange={(v) => void patch({ ollamaModel: v })}
              options={[
                { value: '', label: t('settings.ai.autoFirstAvailable') },
                ...(aiStatus?.ollama.models ?? [])
                  .filter((m) => !m.includes('embed'))
                  .map((m) => ({ value: m, label: m }))
              ]}
            />
          </Row>
          <Row label={t('settings.ai.embeddingsLabel')}>
            <SelectInput
              value={settings.ollamaEmbedModel}
              onChange={(v) => void patch({ ollamaEmbedModel: v })}
              options={[
                { value: '', label: t('settings.ai.autoEmbedModel') },
                ...(aiStatus?.ollama.models ?? [])
                  .filter((m) => m.includes('embed'))
                  .map((m) => ({ value: m, label: m }))
              ]}
            />
          </Row>
        </div>
      </Block>

      <ApiKeyBlock
        provider="anthropic"
        title={t('settings.ai.claudeTitle')}
        hasKey={settings.hasAnthropicKey}
        model={settings.anthropicModel}
        onModel={(v) => void patch({ anthropicModel: v })}
        onKey={(v) => void patch({ anthropicKey: v })}
      />
      <ApiKeyBlock
        provider="openai"
        title={t('settings.ai.openaiTitle')}
        hasKey={settings.hasOpenaiKey}
        model={settings.openaiModel}
        onModel={(v) => void patch({ openaiModel: v })}
        onKey={(v) => void patch({ openaiKey: v })}
      />
      <ApiKeyBlock
        provider="xai"
        title={t('settings.ai.grokTitle')}
        hasKey={settings.hasXaiKey}
        model={settings.xaiModel}
        onModel={(v) => void patch({ xaiModel: v })}
        onKey={(v) => void patch({ xaiKey: v })}
      />

      <p className="flex items-start gap-2 text-[10.5px] leading-relaxed text-ink-faint">
        <Shield size={11} strokeWidth={1.7} className="mt-0.5 shrink-0" />
        {t('settings.ai.keysSecurityNote')}
      </p>
    </div>
  )
}

function ApiKeyBlock(props: {
  provider: ApiProviderKind
  title: string
  hasKey: boolean
  model: string
  onModel: (v: string) => void
  onKey: (v: string | null) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const save = (): void => {
    if (draft.trim()) {
      props.onKey(draft.trim())
      setDraft('')
    }
  }
  return (
    <Block
      title={
        <span className="flex items-center gap-2">
          {props.title}
          {props.hasKey && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-1.5 py-px text-[9px] text-emerald-200/80">
              <Check size={8} strokeWidth={2.5} /> {t('settings.ai.configuredBadge')}
            </span>
          )}
        </span>
      }
    >
      <div className="space-y-2.5">
        <Row label={t('settings.ai.apiKeyLabel')}>
          <span className="flex min-w-0 flex-1 gap-1.5">
            <span className="relative min-w-0 flex-1">
              <KeyRound
                size={11}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder={props.hasKey ? t('settings.ai.keyPlaceholderSaved') : 'sk-…'}
                className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 font-mono text-[11px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-glacier/40"
              />
            </span>
            {draft.trim() !== '' && (
              <button
                type="button"
                onClick={save}
                className="shrink-0 rounded-lg border border-glacier/30 bg-glacier/[0.08] px-3 text-[11px] text-glacier transition-colors hover:bg-glacier/[0.14]"
              >
                {t('settings.common.save')}
              </button>
            )}
            {props.hasKey && draft.trim() === '' && (
              <button
                type="button"
                onClick={() => props.onKey(null)}
                className="shrink-0 rounded-lg border border-white/[0.08] px-3 text-[11px] text-ink-faint transition-colors hover:border-red-300/30 hover:text-red-200"
              >
                {t('settings.common.erase')}
              </button>
            )}
          </span>
        </Row>
        <Row label={t('settings.ai.modelLabel')}>
          <TextInput defaultValue={props.model} onCommit={props.onModel} mono />
        </Row>
      </div>
    </Block>
  )
}

// ─── Section Profils ─────────────────────────────────────────────────────────

const AVATAR_ICON_CHOICES = ['✦', '◆', '❋', '➶', '❖', '✺', '❂', '✧', '🦋', '🌙', '🔥', '🌊']
const AVATAR_COLOR_CHOICES = ['#a9c9ec', '#b3a4e6', '#8fe0c2', '#e6c78f', '#e6a4c4', '#9ab0c9']

function ProfilesSection() {
  const t = useT()
  const profiles = useProfilesStore((s) => s.profiles)
  const activeId = useProfilesStore((s) => s.activeProfileId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [avatarEditId, setAvatarEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const commitRename = (p: Profile): void => {
    if (draft.trim() && draft.trim() !== p.name) void renameProfile(p.id, draft.trim())
    setEditingId(null)
  }

  return (
    <div className="space-y-7">
      <Block
        title={t('settings.profiles.title')}
        hint={t('settings.profiles.hint')}
      >
        <div className="space-y-1.5">
          {profiles.map((p) => (
            <div
              key={p.id}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                p.id === activeId
                  ? 'border-glacier/40 bg-glacier/[0.05]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
              )}
            >
              <button type="button" onClick={() => setAvatarEditId(avatarEditId === p.id ? null : p.id)}>
                <ProfileAvatar profile={p} size={32} />
              </button>

              {editingId === p.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(p)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => p.id !== activeId && void switchProfile(p.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-1.5 truncate text-[13px] text-ink">
                    {p.name}
                    {p.isPrivate && (
                      <span className="rounded border border-lavande/25 px-1 py-px text-[9px] text-lavande">
                        {t('settings.profiles.privateBadge')}
                      </span>
                    )}
                  </span>
                  <span className="block text-[10.5px] text-ink-faint">
                    {p.id === activeId ? t('settings.profiles.activeProfile') : t('settings.profiles.switchToProfile')}
                  </span>
                </button>
              )}

              {confirmId === p.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-[10.5px] text-ink-faint">{t('settings.profiles.confirmDeleteQuestion')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmId(null)
                      void removeProfile(p.id)
                    }}
                    className="rounded-md px-2 py-1 text-[11px] text-red-200/90 hover:bg-red-400/10"
                  >
                    {t('settings.common.yes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded-md px-2 py-1 text-[11px] text-ink-faint hover:bg-white/[0.05]"
                  >
                    {t('settings.common.no')}
                  </button>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title={t('settings.common.rename')}
                    onClick={() => {
                      setDraft(p.name)
                      setEditingId(p.id)
                    }}
                    className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-white/[0.06] hover:text-ink-dim"
                  >
                    <Pencil size={12} strokeWidth={1.7} />
                  </button>
                  {profiles.length > 1 && (
                    <button
                      type="button"
                      title={t('settings.profiles.deleteProfile')}
                      onClick={() => setConfirmId(p.id)}
                      className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-red-400/10 hover:text-red-200"
                    >
                      <Trash2 size={12} strokeWidth={1.7} />
                    </button>
                  )}
                </span>
              )}

              {avatarEditId === p.id && (
                <AvatarPicker profile={p} onClose={() => setAvatarEditId(null)} />
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void createProfile(t('settings.profiles.newProfileName'))}
          className="mt-2 flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
        >
          <Plus size={13} strokeWidth={1.8} />
          {t('settings.profiles.addProfile')}
        </button>
      </Block>

      <Block title={t('settings.profiles.accountsTitle')}>
        <p className="text-[12px] leading-relaxed text-ink-dim">
          {t('settings.profiles.syncPart1')} <span className="text-ink">Chrome Sync</span>
          {t('settings.profiles.syncPart2')}{' '}
          <span className="text-ink">{t('settings.profiles.syncWebPagesSpan')}</span>{' '}
          {t('settings.profiles.syncPart3')}
        </p>
      </Block>
    </div>
  )
}

function AvatarPicker({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const t = useT()
  return (
    <div className="glass-strong absolute left-0 top-full z-20 mt-1.5 w-72 rounded-xl p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint">{t('settings.profiles.avatarLabel')}</p>
      <div className="mb-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => {
            void clearProfileAvatar(profile.id)
          }}
          className={cn(
            'flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors',
            profile.avatarKind === 'none'
              ? 'border-glacier/40 bg-glacier/[0.08] text-ink'
              : 'border-white/[0.08] text-ink-faint hover:text-ink-dim'
          )}
        >
          {t('settings.profiles.avatarNone')}
        </button>
        <button
          type="button"
          onClick={() => {
            void setProfileAvatarImage(profile.id)
          }}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors',
            profile.avatarKind === 'image'
              ? 'border-glacier/40 bg-glacier/[0.08] text-ink'
              : 'border-white/[0.08] text-ink-faint hover:text-ink-dim'
          )}
        >
          <ImageIcon size={11} strokeWidth={1.7} />
          {t('settings.profiles.avatarImage')}
        </button>
      </div>

      <p className="mb-1.5 text-[10px] text-ink-faint">{t('settings.profiles.avatarOrIcon')}</p>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {AVATAR_ICON_CHOICES.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => void setProfileAvatarIcon(profile.id, icon, profile.avatarColor)}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg border text-[14px] transition-colors',
              profile.avatarKind === 'icon' && profile.avatarIcon === icon
                ? 'border-glacier/50 bg-glacier/[0.1]'
                : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]'
            )}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_COLOR_CHOICES.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => void setProfileAvatarIcon(profile.id, profile.avatarIcon || '✦', color)}
            className={cn(
              'h-6 w-6 rounded-full transition-transform hover:scale-110',
              profile.avatarColor === color ? 'ring-2 ring-offset-2 ring-offset-abyss' : ''
            )}
            style={{ background: color }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded-lg border border-white/[0.07] py-1.5 text-[11px] text-ink-faint transition-colors hover:text-ink-dim"
      >
        {t('settings.common.close')}
      </button>
    </div>
  )
}

// ─── Section Apparence ───────────────────────────────────────────────────────

const ACCENTS: { id: Exclude<AccentId, 'custom'>; labelKey: string; color: string }[] = [
  { id: 'glacier', labelKey: 'settings.appearance.accentGlacier', color: '#a9c9ec' },
  { id: 'lavande', labelKey: 'settings.appearance.accentLavande', color: '#b3a4e6' },
  { id: 'emeraude', labelKey: 'settings.appearance.accentEmeraude', color: '#8fe0c2' },
  { id: 'ambre', labelKey: 'settings.appearance.accentAmbre', color: '#e6c78f' },
  { id: 'rose', labelKey: 'settings.appearance.accentRose', color: '#e6a4c4' },
  { id: 'glacier', labelKey: 'settings.appearance.accentCorail', color: '#e69a7f' },
  { id: 'glacier', labelKey: 'settings.appearance.accentCiel', color: '#7fb8e6' },
  { id: 'glacier', labelKey: 'settings.appearance.accentSauge', color: '#a8c99a' }
] as const

const THEME_OPTIONS: { id: ThemeMode; labelKey: string }[] = [
  { id: 'dark', labelKey: 'settings.appearance.themeDark' },
  { id: 'light', labelKey: 'settings.appearance.themeLight' },
  { id: 'system', labelKey: 'settings.appearance.themeSystem' }
]

function AppearanceSection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  if (!settings) return null
  const zoomPct = Math.round(settings.defaultZoom * 100)
  const uiScalePct = Math.round(settings.uiScale * 100)

  return (
    <div className="space-y-7">
      <Block
        title={t('settings.appearance.uiTextSizeTitle')}
        hint={t('settings.appearance.uiTextSizeHint')}
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={85}
            max={130}
            step={5}
            value={uiScalePct}
            onChange={(e) => void patch({ uiScale: Number(e.target.value) / 100 })}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-glacier"
          />
          <span className="w-12 text-right font-mono text-[12px] tabular-nums text-ink-dim">{uiScalePct}%</span>
        </div>
      </Block>

      <Block title={t('settings.appearance.themeTitle')} hint={t('settings.appearance.themeHint')}>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => void patch({ theme: opt.id })}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                settings.theme === opt.id
                  ? 'border-glacier/40 bg-glacier/[0.05]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
              )}
            >
              <span
                className={cn(
                  'h-5 w-5 shrink-0 rounded-md ring-1',
                  opt.id === 'light' ? 'bg-[#f2f3f7] ring-black/10' : 'bg-void ring-white/10'
                )}
              />
              <span className="text-[12px] text-ink-dim">{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      </Block>

      <Block title={t('settings.appearance.accentTitle')} hint={t('settings.appearance.accentHint')}>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((a, i) => (
            <button
              key={`${a.labelKey}-${i}`}
              type="button"
              title={t(a.labelKey)}
              onClick={() => void patch({ accent: i < 5 ? a.id : 'custom', accentCustom: i < 5 ? '' : a.color })}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-full transition-transform hover:scale-105',
                (i < 5 ? settings.accent === a.id : settings.accent === 'custom' && settings.accentCustom === a.color)
                  ? 'ring-2 ring-offset-2 ring-offset-abyss'
                  : ''
              )}
              style={{ background: a.color, boxShadow: `0 0 14px ${a.color}55` }}
            >
              {(i < 5 ? settings.accent === a.id : settings.accent === 'custom' && settings.accentCustom === a.color) && (
                <Check size={13} strokeWidth={2.5} className="text-ink-onaccent" />
              )}
            </button>
          ))}
          <label
            title={t('settings.appearance.customColor')}
            className={cn(
              'relative grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-dashed transition-colors',
              settings.accent === 'custom' ? 'border-glacier/60' : 'border-white/20 hover:border-white/40'
            )}
          >
            <Palette size={14} strokeWidth={1.7} className="text-ink-faint" />
            <input
              type="color"
              value={settings.accentCustom || '#a9c9ec'}
              onChange={(e) => void patch({ accent: 'custom', accentCustom: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </Block>

      <Block title={t('settings.appearance.favoritesBarTitle')} hint={t('settings.appearance.favoritesBarHint')}>
        <div className="space-y-1">
          <Toggle
            label={t('settings.appearance.showFavoritesBar')}
            checked={settings.showFavoritesBar}
            onChange={(v) => void patch({ showFavoritesBar: v })}
          />
          <Toggle
            label={t('settings.appearance.groupFavoritesBySpace')}
            hint={t('settings.appearance.groupFavoritesBySpaceHint')}
            checked={settings.groupFavoritesBySpace}
            onChange={(v) => void patch({ groupFavoritesBySpace: v })}
          />
        </div>
      </Block>

      <Block title={t('settings.appearance.intentBarTitle')} hint={t('settings.appearance.intentBarHint')}>
        <div className="space-y-1">
          <Toggle
            label={t('settings.appearance.wideBar')}
            hint={t('settings.appearance.wideBarHint')}
            checked={settings.wideAddressBar}
            onChange={(v) => void patch({ wideAddressBar: v })}
          />
        </div>
      </Block>

      <Block
        title={t('settings.appearance.pageStripTitle')}
        hint={t('settings.appearance.pageStripHint')}
      >
        <Toggle
          label={t('settings.appearance.showPageStrip')}
          checked={settings.showPageStrip}
          onChange={(v) => void patch({ showPageStrip: v })}
        />
        <Toggle
          label={t('settings.appearance.tabHoverPreview')}
          hint={t('settings.appearance.tabHoverPreviewHint')}
          checked={settings.showTabHoverPreview}
          onChange={(v) => void patch({ showTabHoverPreview: v })}
        />
      </Block>

      <Block
        title={t('settings.appearance.panelsOnLaunchTitle')}
        hint={t('settings.appearance.panelsOnLaunchHint')}
      >
        <div className="space-y-2.5">
          <Toggle
            label={t('settings.appearance.showConstellationOnLaunch')}
            checked={settings.showConstellationOnLaunch}
            onChange={(v) => void patch({ showConstellationOnLaunch: v })}
          />
          <Toggle
            label={t('settings.appearance.showMuseOnLaunch')}
            checked={settings.showMuseOnLaunch}
            onChange={(v) => void patch({ showMuseOnLaunch: v })}
          />
        </div>
      </Block>

      <Block title={t('settings.appearance.defaultZoomTitle')} hint={t('settings.appearance.defaultZoomHint')}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={50}
            max={200}
            step={10}
            value={zoomPct}
            onChange={(e) => void patch({ defaultZoom: Number(e.target.value) / 100 })}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-glacier"
          />
          <span className="w-12 text-right font-mono text-[12px] tabular-nums text-ink-dim">{zoomPct}%</span>
        </div>
      </Block>

      <Block title={t('settings.appearance.renderingTitle')} hint={t('settings.appearance.renderingHint')}>
        <div className="space-y-1">
          <EngineFlagToggle id="forceDark" />
          <EngineFlagToggle id="smoothScrolling" />
          <EngineFlagToggle id="overlayScrollbars" />
        </div>
      </Block>
    </div>
  )
}

// ─── Section Navigation ──────────────────────────────────────────────────────

function NavigationSection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  if (!settings) return null

  const chooseDir = async (): Promise<void> => {
    const dir = await window.aether.settings.chooseDownloadDir()
    if (dir) void patch({ downloadDir: dir })
  }

  return (
    <div className="space-y-7">
      <Block title={t('settings.navigation.homepageTitle')} hint={t('settings.navigation.homepageHint')}>
        <TextInput
          defaultValue={settings.homepage}
          onCommit={(v) => void patch({ homepage: v })}
          placeholder={t('settings.navigation.homepagePlaceholder')}
          mono
        />
      </Block>

      <Block title={t('settings.navigation.newTabUrlTitle')} hint={t('settings.navigation.newTabUrlHint')}>
        <TextInput
          defaultValue={settings.newTabUrl}
          onCommit={(v) => void patch({ newTabUrl: v })}
          placeholder={t('settings.navigation.newTabUrlPlaceholder')}
          mono
        />
        <div className="mt-3 space-y-2.5">
          <Toggle
            label={t('settings.navigation.openNewTabOnLaunch')}
            hint={t('settings.navigation.openNewTabOnLaunchHint')}
            checked={settings.openNewTabOnLaunch}
            onChange={(v) => void patch({ openNewTabOnLaunch: v })}
          />
          <Toggle
            label={t('settings.navigation.restoreTabsOnLaunch')}
            hint={t('settings.navigation.restoreTabsOnLaunchHint')}
            checked={settings.restoreTabsOnLaunch}
            onChange={(v) => void patch({ restoreTabsOnLaunch: v })}
          />
        </div>
      </Block>

      <Block title={t('settings.navigation.downloadsTitle')}>
        <div className="space-y-2.5">
          <Toggle
            label={t('settings.navigation.askDownloadLocation')}
            hint={t('settings.navigation.askDownloadLocationHint')}
            checked={settings.askDownloadLocation}
            onChange={(v) => void patch({ askDownloadLocation: v })}
          />
          {!settings.askDownloadLocation && (
            <Row label={t('settings.navigation.folderLabel')}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-ink-dim">
                  {settings.downloadDir || t('settings.navigation.defaultDownloadsFolder')}
                </span>
                <button
                  type="button"
                  onClick={() => void chooseDir()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[11px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
                >
                  <FolderOpen size={12} strokeWidth={1.7} />
                  {t('settings.common.choose')}
                </button>
              </span>
            </Row>
          )}
          <button
            type="button"
            onClick={() => useUiStore.getState().openOverlay('downloads')}
            className="flex items-center gap-1.5 text-[11.5px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {t('settings.navigation.viewDownloads')}
          </button>
        </div>
      </Block>
    </div>
  )
}

// ─── Section Confidentialité & sécurité ──────────────────────────────────────

function PrivacySection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  if (!settings) return null

  return (
    <div className="space-y-7">
      <Block
        title={t('settings.privacy.permissionsTitle')}
        hint={t('settings.privacy.permissionsHint')}
      >
        <div className="space-y-1">
          <Toggle
            label={t('settings.privacy.cameraMic')}
            hint={t('settings.privacy.cameraMicHint')}
            checked={settings.allowMedia}
            onChange={(v) => void patch({ allowMedia: v })}
          />
          <Toggle
            label={t('settings.privacy.location')}
            hint={t('settings.privacy.locationHint')}
            checked={settings.allowGeolocation}
            onChange={(v) => void patch({ allowGeolocation: v })}
          />
          <Toggle
            label={t('settings.privacy.notifications')}
            hint={t('settings.privacy.notificationsHint')}
            checked={settings.allowNotifications}
            onChange={(v) => void patch({ allowNotifications: v })}
          />
        </div>
      </Block>

      <Block title={t('settings.privacy.securityTitle')}>
        <div className="space-y-1">
          <Toggle
            label={t('settings.privacy.doNotTrack')}
            hint={t('settings.privacy.doNotTrackHint')}
            checked={settings.doNotTrack}
            onChange={(v) => void patch({ doNotTrack: v })}
          />
          <Toggle
            label={t('settings.privacy.httpsOnly')}
            hint={t('settings.privacy.httpsOnlyHint')}
            checked={settings.httpsOnly}
            onChange={(v) => void patch({ httpsOnly: v })}
          />
        </div>
      </Block>

      <Block title={t('settings.privacy.passwordsTitle')}>
        <p className="text-[12px] leading-relaxed text-ink-dim">
          {t('settings.privacy.passwordsText')}
        </p>
      </Block>

      <Block title={t('settings.privacy.clearDataTitle')}>
        <button
          type="button"
          onClick={() => useUiStore.getState().openOverlay('settings', { section: 'donnees' })}
          className="rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
        >
          {t('settings.privacy.clearDataButton')}
        </button>
      </Block>
    </div>
  )
}

// ─── Section Performance ─────────────────────────────────────────────────────

function PerformanceSection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  if (!settings) return null

  return (
    <div className="space-y-7">
      <Block
        title={t('settings.performance.memorySaverTitle')}
        hint={t('settings.performance.memorySaverHint')}
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={2}
            max={12}
            step={1}
            value={settings.maxLivePages}
            onChange={(e) => void patch({ maxLivePages: Number(e.target.value) })}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-glacier"
          />
          <span className="w-20 text-right font-mono text-[12px] tabular-nums text-ink-dim">
            {t('settings.performance.pagesCount', { count: settings.maxLivePages })}
          </span>
        </div>
      </Block>

      <Block title={t('settings.performance.engineTitle')} hint={t('settings.performance.engineHint')}>
        <div className="space-y-1">
          <EngineFlagToggle id="hardwareAcceleration" />
          <EngineFlagToggle id="experimentalWeb" />
        </div>
      </Block>
    </div>
  )
}

// ─── Section Langues ─────────────────────────────────────────────────────────

function LanguagesSection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  if (!settings) return null

  const toggleLang = (code: string): void => {
    const next = settings.spellcheckLanguages.includes(code)
      ? settings.spellcheckLanguages.filter((l) => l !== code)
      : [...settings.spellcheckLanguages, code]
    void patch({ spellcheckLanguages: next })
  }

  return (
    <div className="space-y-7">
      <Block
        title={t('settings.languages.spellcheckTitle')}
        hint={t('settings.languages.spellcheckHint')}
      >
        <Toggle
          label={t('settings.languages.enableSpellcheck')}
          hint={settings.spellcheckLanguages.length === 0 ? t('settings.languages.spellcheckSystemBased') : undefined}
          checked={settings.spellcheck}
          onChange={(v) => void patch({ spellcheck: v })}
        />
      </Block>

      <Block
        title={t('settings.languages.spellcheckLanguagesTitle')}
        hint={t('settings.languages.spellcheckLanguagesHint')}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {SPELLCHECK_LANGUAGES.map(({ code, label }) => {
            const active = settings.spellcheckLanguages.includes(code)
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleLang(code)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-colors',
                  active
                    ? 'border-glacier/40 bg-glacier/[0.05] text-ink'
                    : 'border-white/[0.07] bg-white/[0.02] text-ink-dim hover:border-white/[0.14]'
                )}
              >
                <span
                  className={cn(
                    'grid h-4 w-4 shrink-0 place-items-center rounded border',
                    active ? 'border-glacier bg-glacier/20' : 'border-white/20'
                  )}
                >
                  {active && <Check size={10} strokeWidth={2.5} className="text-glacier" />}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      </Block>
    </div>
  )
}

// ─── Section Système ─────────────────────────────────────────────────────────

function SystemSection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  if (!settings) return null

  const proxyModes: { id: AppSettings['proxyMode']; label: string }[] = [
    { id: 'system', label: t('settings.system.proxySystem') },
    { id: 'direct', label: t('settings.system.proxyDirect') },
    { id: 'custom', label: t('settings.system.proxyCustom') }
  ]

  return (
    <div className="space-y-7">
      <Block title={t('settings.system.closeBehaviorTitle')} hint={t('settings.system.closeBehaviorHint')}>
        <Toggle
          label={t('settings.system.minimizeOnClose')}
          checked={settings.minimizeOnClose}
          onChange={(v) => void patch({ minimizeOnClose: v })}
        />
      </Block>

      <Block title={t('settings.system.defaultBrowserTitle')} hint={t('settings.system.defaultBrowserHint')}>
        <button
          type="button"
          onClick={() => window.aether.app.openExternal('ms-settings:defaultapps')}
          className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
        >
          <ExternalLink size={12} strokeWidth={1.7} />
          {t('settings.system.openDefaultApps')}
        </button>
      </Block>

      <Block title={t('settings.system.proxyTitle')} hint={t('settings.system.proxyHint')}>
        <div className="space-y-2.5">
          <SelectInput
            value={settings.proxyMode}
            onChange={(v) => void patch({ proxyMode: v as AppSettings['proxyMode'] })}
            options={proxyModes.map((m) => ({ value: m.id, label: m.label }))}
          />
          {settings.proxyMode === 'custom' && (
            <TextInput
              defaultValue={settings.proxyRules}
              onCommit={(v) => void patch({ proxyRules: v })}
              placeholder="http=127.0.0.1:8080;https=127.0.0.1:8080"
              mono
            />
          )}
        </div>
      </Block>
    </div>
  )
}

// ─── Section Réinitialiser ───────────────────────────────────────────────────

function ResetSection() {
  const t = useT()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  const doReset = async (): Promise<void> => {
    const next = await window.aether.settings.reset()
    useSettingsStore.setState({ settings: next })
    setConfirming(false)
    setDone(true)
    useUiStore.getState().toast(t('settings.reset.toast'))
  }

  return (
    <div className="space-y-7">
      <Block
        title={t('settings.reset.title')}
        hint={t('settings.reset.hint')}
      >
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[12px] text-ink-dim transition-colors hover:border-red-300/30 hover:text-red-200"
          >
            <RotateCcw size={12} strokeWidth={1.7} />
            {t('settings.reset.button')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-dim">{t('settings.reset.confirmQuestion')}</span>
            <button
              type="button"
              onClick={() => void doReset()}
              className="rounded-full border border-red-300/25 bg-red-400/[0.06] px-3.5 py-1.5 text-[12px] text-red-200/90 hover:bg-red-400/[0.12]"
            >
              {t('settings.reset.confirmYes')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[12px] text-ink-faint hover:text-ink-dim"
            >
              {t('settings.common.cancel')}
            </button>
          </div>
        )}
        {done && <p className="mt-3 text-[11px] text-emerald-200/80">{t('settings.reset.doneMessage')}</p>}
      </Block>
    </div>
  )
}

// ─── Section Recherche ───────────────────────────────────────────────────────

function SearchSection() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  const custom = useSearchEnginesStore((s) => s.custom)
  const ensureLoaded = useSearchEnginesStore((s) => s.ensureLoaded)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  if (!settings) return null

  const addEngine = async (): Promise<void> => {
    if (!url.includes('%s')) {
      setError(t('settings.search.errorMissingPercentS'))
      return
    }
    try {
      const engine = await window.aether.searchEngines.create(label, url)
      useSearchEnginesStore.getState().add(engine)
      void patch({ searchEngine: engine.id })
      setLabel('')
      setUrl('')
      setAdding(false)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.search.errorGeneric'))
    }
  }

  const removeEngine = async (id: string): Promise<void> => {
    useSearchEnginesStore.getState().removeLocal(id)
    await window.aether.searchEngines.remove(id)
    if (settings.searchEngine === id) void patch({ searchEngine: 'duckduckgo' })
  }

  return (
    <div className="space-y-7">
      <Block title={t('settings.search.engineTitle')} hint={t('settings.search.engineHint')}>
        <div className="space-y-1.5">
          {(Object.entries(SEARCH_ENGINES) as [SearchEngineId, { label: string }][]).map(
            ([id, def]) => (
              <button
                key={id}
                type="button"
                onClick={() => void patch({ searchEngine: id })}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                  settings.searchEngine === id
                    ? 'border-glacier/40 bg-glacier/[0.05]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
                )}
              >
                <RadioDot checked={settings.searchEngine === id} />
                <span className="text-[13px] text-ink">{def.label}</span>
                {id === 'duckduckgo' && (
                  <span className="ml-auto text-[10px] text-ink-faint">{t('settings.search.defaultRespectful')}</span>
                )}
              </button>
            )
          )}

          {custom.map((engine) => (
            <div
              key={engine.id}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                settings.searchEngine === engine.id
                  ? 'border-glacier/40 bg-glacier/[0.05]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
              )}
            >
              <button
                type="button"
                onClick={() => void patch({ searchEngine: engine.id })}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <RadioDot checked={settings.searchEngine === engine.id} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink">{engine.label}</span>
                  <span className="block truncate font-mono text-[10px] text-ink-faint">{engine.url}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void removeEngine(engine.id)}
                className="shrink-0 rounded-md p-1.5 text-ink-faint opacity-0 transition-opacity hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100"
              >
                <Trash2 size={12} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>
      </Block>

      <Block title={t('settings.search.addCustomTitle')} hint={t('settings.search.addCustomHint')}>
        {adding ? (
          <div className="space-y-2">
            <TextInput defaultValue={label} onCommit={setLabel} placeholder={t('settings.search.namePlaceholder')} />
            <TextInput
              defaultValue={url}
              onCommit={setUrl}
              placeholder={t('settings.search.urlPlaceholder')}
              mono
            />
            {error && <p className="text-[11px] text-red-300">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void addEngine()}
                className="rounded-full border border-glacier/30 bg-glacier/[0.08] px-3.5 py-1.5 text-[11.5px] text-glacier hover:bg-glacier/[0.14]"
              >
                {t('settings.common.add')}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[11.5px] text-ink-faint hover:text-ink-dim"
              >
                {t('settings.common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
          >
            <Plus size={13} strokeWidth={1.8} />
            {t('settings.search.newEngine')}
          </button>
        )}
      </Block>
    </div>
  )
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
        checked ? 'border-glacier' : 'border-white/20'
      )}
    >
      {checked && <span className="h-2 w-2 rounded-full bg-glacier" />}
    </span>
  )
}

// ─── Section Données ─────────────────────────────────────────────────────────

function DataSection() {
  const t = useT()
  const spaces = useSpacesStore((s) => s.spaces)
  const pages = usePagesStore((s) => s.pages)
  const notes = useMuseStore((s) => s.notes)
  const patch = useSettingsStore((s) => s.patch)

  return (
    <div className="space-y-7">
      <Block title={t('settings.data.memoryTitle')} hint={t('settings.data.memoryHint')}>
        <div className="grid grid-cols-3 gap-2">
          {[
            { n: spaces.length, label: t('settings.data.statSpaces') },
            { n: Object.keys(pages).length, label: t('settings.data.statPages') },
            { n: notes.length, label: t('settings.data.statNotes') }
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-center"
            >
              <p className="font-display text-[26px] leading-none text-ink">{stat.n}</p>
              <p className="mt-1.5 text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </Block>
      <Block title={t('settings.data.privacyTitle')}>
        <p className="text-[12px] leading-relaxed text-ink-dim">
          {t('settings.data.privacyText')}
        </p>
      </Block>
      <ClearDataBlock />
      <Block title={t('settings.data.introTitle')}>
        <button
          type="button"
          onClick={() => {
            void patch({ onboarded: false })
            useUiStore.getState().openOverlay('onboarding')
          }}
          className="rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
        >
          {t('settings.data.reviewIntro')}
        </button>
      </Block>
    </div>
  )
}

const RANGE_OPTIONS: { id: ClearDataRange; labelKey: string }[] = [
  { id: 'hour', labelKey: 'settings.data.rangeHour' },
  { id: 'day', labelKey: 'settings.data.rangeDay' },
  { id: 'week', labelKey: 'settings.data.rangeWeek' },
  { id: 'month', labelKey: 'settings.data.rangeMonth' },
  { id: 'all', labelKey: 'settings.data.rangeAll' }
]

/** Effacement des données de navigation — plage temporelle + catégories, façon Chrome. */
function ClearDataBlock() {
  const t = useT()
  const [range, setRange] = useState<ClearDataRange>('day')
  const [kinds, setKinds] = useState<Record<BrowsingDataKind, boolean>>({
    history: true,
    cookies: false,
    cache: true,
    downloads: false
  })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const rangeAware = range !== 'all'

  const items: { id: BrowsingDataKind; label: string; hint: string }[] = [
    {
      id: 'history',
      label: t('settings.data.historyLabel'),
      hint: t('settings.data.historyHint')
    },
    {
      id: 'cookies',
      label: t('settings.data.cookiesLabel'),
      hint: rangeAware ? t('settings.data.cookiesHintAll') : t('settings.data.cookiesHint')
    },
    {
      id: 'cache',
      label: t('settings.data.cacheLabel'),
      hint: rangeAware ? t('settings.data.cacheHintAll') : t('settings.data.cacheHint')
    },
    {
      id: 'downloads',
      label: t('settings.data.downloadsLabel'),
      hint: t('settings.data.downloadsHint')
    }
  ]
  const selected = (Object.keys(kinds) as BrowsingDataKind[]).filter((k) => kinds[k])

  const run = async (): Promise<void> => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    setDone(false)
    try {
      await window.aether.settings.clearBrowsingData(selected, range)
      setDone(true)
      useUiStore.getState().toast(t('settings.data.clearedToast'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Block
      title={t('settings.data.clearTitle')}
      hint={t('settings.data.clearHint')}
    >
      <Row label={t('settings.data.periodLabel')}>
        <SelectInput value={range} onChange={(v) => setRange(v as ClearDataRange)} options={RANGE_OPTIONS.map((r) => ({ value: r.id, label: t(r.labelKey) }))} />
      </Row>
      <div className="mt-3 space-y-1">
        {items.map((it) => (
          <Toggle
            key={it.id}
            label={it.label}
            hint={it.hint}
            checked={kinds[it.id]}
            onChange={(v) => setKinds((k) => ({ ...k, [it.id]: v }))}
          />
        ))}
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-faint">
        {t('settings.data.noAutofillNote')}
      </p>
      <button
        type="button"
        disabled={selected.length === 0 || busy}
        onClick={() => void run()}
        className={cn(
          'mt-3 flex items-center gap-2 rounded-full border px-4 py-1.5 text-[12px] transition-colors',
          selected.length === 0 || busy
            ? 'border-white/[0.06] text-ink-faint/50'
            : 'border-red-300/25 bg-red-400/[0.06] text-red-200/90 hover:bg-red-400/[0.12]'
        )}
      >
        <Trash2 size={12} strokeWidth={1.7} />
        {busy ? t('settings.data.clearing') : t('settings.data.clearNow')}
      </button>
      {done && <p className="mt-2 text-[11px] text-emerald-200/80">{t('settings.data.clearedMessage')}</p>}
    </Block>
  )
}

// ─── Section Extensions ──────────────────────────────────────────────────────

/** Vue détail d'une extension — pendant fonctionnel de la page `chrome://extensions/?id=…`
 * réelle, avec les seuls champs qu'ÆTHER peut honnêtement renseigner (pas d'« accès aux
 * sites » ni d'épinglage à la barre d'outils : aucune des deux n'a de vraie implémentation
 * sous-jacente ici, contrairement à Chrome). */
function ExtensionDetail({
  ext,
  onBack,
  onRemoved
}: {
  ext: ExtensionInfo
  onBack: () => void
  onRemoved: () => void
}) {
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-[12px] text-ink-faint transition-colors hover:text-ink-dim"
      >
        <ChevronLeft size={14} strokeWidth={2} />
        Toutes les extensions
      </button>

      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
          <ExtensionIcon iconUrl={ext.iconUrl} size={18} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{ext.name || 'Extension'}</p>
      </div>

      <DetailRow label="Description">{ext.description || '—'}</DetailRow>
      <DetailRow label="Version">{ext.version || '—'}</DetailRow>
      <DetailRow label="Taille">{formatBytes(ext.sizeBytes)}</DetailRow>
      {ext.permissions.length > 0 && (
        <DetailRow label="Autorisations">
          <ul className="list-disc space-y-0.5 pl-4">
            {ext.permissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </DetailRow>
      )}
      <DetailRow label="Source">
        {ext.source === 'webstore' ? 'Chrome Web Store' : 'Dossier local (mode développeur)'}
      </DetailRow>

      <div className="space-y-1 border-t border-white/[0.06] pt-3">
        {ext.optionsUrl && (
          <button
            type="button"
            onClick={() => {
              useUiStore.getState().closeOverlay()
              void openUrl(ext.optionsUrl as string)
            }}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-[12.5px] text-ink-dim transition-colors hover:bg-white/[0.02]"
          >
            Options de l&rsquo;extension
            <ExternalLink size={13} strokeWidth={1.7} className="text-ink-faint" />
          </button>
        )}
        {ext.storeUrl && (
          <button
            type="button"
            onClick={() => {
              useUiStore.getState().closeOverlay()
              void openUrl(ext.storeUrl as string)
            }}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-[12.5px] text-ink-dim transition-colors hover:bg-white/[0.02]"
          >
            Afficher sur le Chrome Web Store
            <ExternalLink size={13} strokeWidth={1.7} className="text-ink-faint" />
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await window.aether.extensions.remove(ext.id)
            onRemoved()
          }}
          className="flex w-full items-center rounded-lg px-1 py-2 text-left text-[12.5px] text-red-300 transition-colors hover:bg-red-400/10"
        >
          Supprimer l&rsquo;extension
        </button>
      </div>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0">
      <p className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-faint">{label}</p>
      <div className="text-[12.5px] text-ink-dim">{children}</div>
    </div>
  )
}

function ExtensionsSection() {
  const t = useT()
  const [list, setList] = useState<ExtensionInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setList(await window.aether.extensions.list())
  }

  useEffect(() => {
    void reload()
    return window.aether.extensions.onInstallResult((result) => {
      if (result.ok) {
        useUiStore.getState().toast(
          result.alreadyInstalled
            ? t('settings.extensions.alreadyInstalledToast', { name: result.name ?? '' })
            : t('settings.extensions.installedToast', { name: result.name ?? '' })
        )
        void reload()
      } else {
        useUiStore.getState().toast(t('settings.extensions.installFailedToast', { error: result.error ?? '' }))
      }
    })
  }, [])

  const loadUnpacked = async (): Promise<void> => {
    const folder = await window.aether.extensions.chooseFolder()
    if (!folder) return
    setBusy(true)
    const ext = await window.aether.extensions.addUnpacked(folder)
    setBusy(false)
    if (ext) {
      useUiStore.getState().toast(t('settings.extensions.loadedToast', { name: ext.name }))
      void reload()
    } else {
      useUiStore.getState().toast(t('settings.extensions.invalidFolder'))
    }
  }

  const detailExt = detailId ? (list?.find((e) => e.id === detailId) ?? null) : null

  if (detailExt) {
    return (
      <Block title={t('settings.nav.extensions')}>
        <ExtensionDetail
          ext={detailExt}
          onBack={() => setDetailId(null)}
          onRemoved={() => {
            setDetailId(null)
            void reload()
          }}
        />
      </Block>
    )
  }

  return (
    <div className="space-y-7">
      <Block
        title={t('settings.extensions.storeTitle')}
        hint={t('settings.extensions.storeHint')}
      >
        <p className="text-[12px] leading-relaxed text-ink-dim">{t('settings.extensions.storePart1')}</p>
        <button
          type="button"
          onClick={() => {
            useUiStore.getState().closeOverlay()
            void openUrl('https://chromewebstore.google.com/')
          }}
          className="mt-3 flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
        >
          <ExternalLink size={12} strokeWidth={1.7} />
          {t('settings.extensions.browseStore')}
        </button>
      </Block>

      <Block title={t('settings.extensions.loadedTitle')} hint={t('settings.extensions.loadedHint')}>
        {list === null ? (
          <p className="text-[11.5px] text-ink-faint">{t('settings.common.loading')}</p>
        ) : list.length === 0 ? (
          <p className="text-[11.5px] text-ink-faint">{t('settings.extensions.noneLoaded')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {list.map((ext) => (
              <div
                key={ext.id}
                className="flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
              >
                <div className="mb-2 flex items-start gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
                    <ExtensionIcon iconUrl={ext.iconUrl} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-ink">{ext.name || 'Extension'}</p>
                    <p className="line-clamp-2 text-[11px] leading-snug text-ink-faint">{ext.description}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => setDetailId(ext.id)}
                    className="rounded-full border border-white/[0.1] px-3 py-1 text-[11px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
                  >
                    Détails
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await window.aether.extensions.remove(ext.id)
                      void reload()
                    }}
                    className="rounded-full border border-white/[0.1] px-3 py-1 text-[11px] text-ink-dim transition-colors hover:border-red-400/40 hover:text-red-200"
                  >
                    Supprimer
                  </button>
                  <span className="ml-auto">
                    <MiniSwitch
                      checked={ext.enabled}
                      onChange={(v) => {
                        void window.aether.extensions.setEnabled(ext.id, v).then(() => reload())
                      }}
                    />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadUnpacked()}
          className="mt-3 flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink disabled:opacity-50"
        >
          <Plus size={13} strokeWidth={1.8} />
          {busy ? t('settings.common.loading') : t('settings.extensions.loadUnpacked')}
        </button>
      </Block>
    </div>
  )
}

// ─── Section À propos ────────────────────────────────────────────────────────

/** Bloc « Mises à jour » — pilote `electron-updater` côté main (main/updater.ts).
 * Vérification silencieuse au lancement + téléchargement auto en arrière-plan
 * (comme Chrome) ; ce bloc n'ajoute que la vérification MANUELLE et le
 * déclenchement explicite de l'installation (jamais automatique). */
function UpdatesBlock() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    void window.aether.updates.getStatus().then(setStatus)
    return window.aether.updates.onStatusChanged((s) => {
      setStatus(s)
      if (s.state === 'downloaded') {
        useUiStore.getState().toast(t('settings.about.updatesDownloaded', { version: s.version }))
      }
    })
  }, [t])

  const checking = status.state === 'checking'

  return (
    <Block title={t('settings.about.updatesTitle')}>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[12px] text-ink-dim">
          {status.state === 'idle' && ' '}
          {status.state === 'checking' && t('settings.about.updatesChecking')}
          {status.state === 'up-to-date' &&
            t('settings.about.updatesUpToDateAt', {
              time: new Date(status.checkedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            })}
          {status.state === 'available' && t('settings.about.updatesChecking')}
          {status.state === 'downloading' &&
            t('settings.about.updatesDownloading', { version: status.version, percent: status.percent })}
          {status.state === 'downloaded' && t('settings.about.updatesDownloaded', { version: status.version })}
          {status.state === 'error' && t('settings.about.updatesError', { message: status.message })}
          {status.state === 'dev-mode' && t('settings.about.updatesDevMode')}
        </p>
        {status.state === 'downloaded' ? (
          <button
            type="button"
            onClick={() => window.aether.updates.install()}
            className="flex shrink-0 items-center gap-2 rounded-full bg-glacier/90 px-4 py-1.5 text-[12px] font-medium text-ink-onaccent transition-colors hover:bg-glacier"
          >
            {t('settings.about.updatesRestartInstall')}
          </button>
        ) : (
          <button
            type="button"
            disabled={checking || status.state === 'downloading' || status.state === 'dev-mode'}
            onClick={() => window.aether.updates.check()}
            className="flex shrink-0 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw size={12} strokeWidth={1.8} className={checking ? 'animate-spin' : ''} />
            {t('settings.about.updatesCheck')}
          </button>
        )}
      </div>
      {status.state === 'downloading' && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-glacier/80 transition-[width] duration-300"
            style={{ width: `${status.percent}%` }}
          />
        </div>
      )}
      {settings && (
        <div className="mt-4 border-t border-white/[0.06] pt-3.5">
          <Toggle
            label={t('settings.about.autoCheckForUpdates')}
            hint={t('settings.about.autoCheckForUpdatesHint')}
            checked={settings.autoCheckForUpdates}
            onChange={(v) => void patch({ autoCheckForUpdates: v })}
          />
        </div>
      )}
    </Block>
  )
}

function AboutSection() {
  const t = useT()
  const versions = useSettingsStore((s) => s.versions)
  const shortcuts: [string, string][] = [
    ['Ctrl K', t('settings.about.shortcutIntentBar')],
    ['Ctrl E', t('settings.about.shortcutFocusCanvas')],
    ['Ctrl B', t('settings.about.shortcutConstellation')],
    ['Ctrl J', t('settings.about.shortcutMuse')],
    ['Ctrl W', t('settings.about.shortcutClosePage')],
    ['Ctrl R', t('settings.about.shortcutReload')],
    ['Alt ←/→', t('settings.about.shortcutHistory')],
    ['F1', t('settings.about.shortcutGuide')],
    ['Ctrl ,', t('settings.about.shortcutSettings')],
    [`Ctrl ${t('settings.about.keyShift')} N`, t('settings.about.shortcutPrivateBrowsing')],
    [t('settings.about.keyDoubleClickCanvas'), t('settings.about.shortcutNewCard')]
  ]
  const statusLabel: Record<(typeof CHROME_URLS)[number]['status'], string> = {
    aether: 'ÆTHER',
    engine: t('settings.about.statusEngine'),
    unavailable: t('settings.about.statusUnavailable')
  }
  const statusClass: Record<(typeof CHROME_URLS)[number]['status'], string> = {
    aether: 'border-glacier/25 text-glacier',
    engine: 'border-emerald-300/25 text-emerald-200/80',
    unavailable: 'border-white/[0.08] text-ink-faint'
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="select-none font-display text-[64px] leading-none text-ink">Æ</span>
        <p className="font-display text-[17px] italic text-ink-dim">{t('settings.about.tagline')}</p>
        <p className="text-[11px] text-ink">{t('settings.about.versionLabel', { version: versions?.app ?? '—' })}</p>
      </div>

      <UpdatesBlock />

      <Block title={t('settings.about.versionsTitle')}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px]">
          {[
            ['ÆTHER', versions?.app],
            ['Electron', versions?.electron],
            ['Chromium', versions?.chromium],
            ['Node', versions?.node],
            ['V8', versions?.v8]
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-ink-faint">{k}</span>
              <span className="truncate text-ink-dim">{v || '—'}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title={t('settings.about.shortcutsTitle')}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {shortcuts.map(([keys, label]) => (
            <div key={keys} className="flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-ink-dim">{label}</span>
              <Kbd>{keys}</Kbd>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title={t('settings.about.internalUrlsTitle')}
        hint={t('settings.about.internalUrlsHint')}
      >
        <div className="space-y-0.5">
          {CHROME_URLS.map((u) => (
            <button
              key={u.url}
              type="button"
              disabled={u.status === 'unavailable'}
              onClick={() => {
                if (u.status === 'unavailable') return
                useUiStore.getState().closeOverlay()
                void openUrl(u.url)
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                u.status === 'unavailable' ? 'cursor-default' : 'hover:bg-white/[0.04]'
              )}
            >
              <span className="w-52 shrink-0 truncate font-mono text-[11px] text-ink-dim">{u.url}</span>
              <span
                className={cn(
                  'shrink-0 rounded border px-1.5 py-px text-[9px] font-medium',
                  statusClass[u.status]
                )}
              >
                {statusLabel[u.status]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-faint">{u.note}</span>
            </button>
          ))}
        </div>
      </Block>
    </div>
  )
}

// ─── Primitives locales ──────────────────────────────────────────────────────

function Block({ title, hint, children }: { title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[13px] font-medium text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-faint">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-[11px] text-ink-faint">{label}</span>
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-white/[0.02]"
    >
      <span className="min-w-0 flex-1">
        {label && <span className="block text-[12.5px] text-ink-dim">{label}</span>}
        {hint && <span className="block text-[10.5px] text-ink-faint">{hint}</span>}
      </span>
      <span
        className={cn(
          'flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
          checked ? 'justify-end bg-glacier/80' : 'justify-start bg-toggle-track'
        )}
      >
        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white" />
      </span>
    </button>
  )
}

function TextInput({
  defaultValue,
  onCommit,
  placeholder,
  mono
}: {
  defaultValue: string
  onCommit: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  const [value, setValue] = useState(defaultValue)
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== defaultValue && onCommit(value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(
        'h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-glacier/40',
        mono ? 'font-mono text-[11px]' : 'text-[12px]'
      )}
    />
  )
}

function SelectInput({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full appearance-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] text-ink outline-none transition-colors focus:border-glacier/40 [&>option]:bg-abyss [&>option]:text-ink"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

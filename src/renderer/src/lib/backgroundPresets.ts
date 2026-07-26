/**
 * Thèmes d'ÆTHER — dégradés CSS purs (aucun asset image à empaqueter/
 * télécharger), choisis depuis Réglages › Apparence. Plusieurs lueurs
 * radiales superposées à une base quasi noire (jamais un aplat unique) pour
 * un rendu vivant façon nébuleuse/aurore plutôt qu'un simple dégradé plat.
 *
 * Un thème restyle TOUTE l'application, pas seulement la page d'accueil :
 * son dégradé sert de fond (page de nouvel onglet + chrome), sa couleur
 * `accent` repeint les éléments actifs, et ses `surfaces` reteintent
 * panneaux/barres/cartes (voir `applyTheme`, theme.ts). `scrim` (densité de
 * noir posée par-dessus pour la lisibilité) est calibré à la main ici : un
 * dégradé que nous concevons n'a pas besoin de l'analyse de contraste
 * automatique réservée aux images importées (voir `computeReadableScrim`,
 * dominantColor.ts).
 */
/** Surfaces de l'interface, de la plus sombre (fond général) à la plus claire
 * (élément surélevé) — mêmes rôles que les variables par défaut de
 * `global.css`, teintées à la couleur du thème. Toujours très sombres :
 * ÆTHER n'a qu'un mode sombre, un thème n'en change que la TEINTE. */
export interface ThemeSurfaces {
  void: string
  abyss: string
  mist: string
  veil: string
}

export interface BackgroundPreset {
  id: string
  label: string
  css: string
  /** Couleur d'accent appliquée à toute l'interface quand ce thème est choisi. */
  accent: string
  /** Opacité (0-1) du voile sombre posé sur le dégradé pour la lisibilité. */
  scrim: number
  /** Teinte des surfaces de TOUTE l'interface (panneaux, barres, cartes) —
   * c'est ce qui fait qu'un thème restyle le navigateur entier et pas
   * seulement les icônes. */
  surfaces: ThemeSurfaces
  /** Thème VIVANT : couches superposées au dégradé de base, animées en
   * continu. Chaque couche a son propre dégradé et sa propre animation
   * (classe définie dans global.css), animées uniquement en
   * `transform`/`opacity` — le compositeur GPU s'en charge seul, sans coût
   * de mise en page ni de repeinte. Absent = thème statique. */
  animated?: { css: string; className: string }[]
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'aurora',
    label: 'Aurore',
    accent: '#5de0ac',
    scrim: 0.3,
    surfaces: { void: '#05090a', abyss: '#081210', mist: '#0d1a16', veil: '#12231e' },
    css: [
      'radial-gradient(ellipse 70% 45% at 18% -8%, rgba(93, 224, 172, 0.32), transparent 62%)',
      'radial-gradient(ellipse 60% 50% at 85% 8%, rgba(139, 109, 230, 0.28), transparent 60%)',
      'radial-gradient(ellipse 80% 60% at 50% 115%, rgba(60, 120, 140, 0.22), transparent 65%)',
      'linear-gradient(175deg, #0a1410 0%, #0a0e14 45%, #060608 100%)'
    ].join(', ')
  },
  {
    id: 'nebula',
    label: 'Nébuleuse',
    accent: '#c14fd6',
    scrim: 0.32,
    surfaces: { void: '#08050c', abyss: '#0e0a16', mist: '#16101f', veil: '#1d1628' },
    css: [
      'radial-gradient(ellipse 65% 50% at 80% -10%, rgba(193, 79, 214, 0.3), transparent 60%)',
      'radial-gradient(ellipse 70% 55% at 5% 20%, rgba(74, 90, 224, 0.3), transparent 62%)',
      'radial-gradient(ellipse 55% 45% at 60% 100%, rgba(120, 70, 200, 0.2), transparent 60%)',
      'linear-gradient(160deg, #120a1c 0%, #0b0a16 50%, #060608 100%)'
    ].join(', ')
  },
  {
    id: 'ember',
    label: 'Braise',
    accent: '#e6883d',
    scrim: 0.32,
    surfaces: { void: '#0a0605', abyss: '#140b08', mist: '#1d120c', veil: '#261812' },
    css: [
      'radial-gradient(ellipse 70% 45% at 85% -5%, rgba(230, 136, 61, 0.32), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 10% 15%, rgba(193, 57, 79, 0.24), transparent 60%)',
      'radial-gradient(ellipse 75% 55% at 40% 115%, rgba(120, 50, 30, 0.24), transparent 65%)',
      'linear-gradient(170deg, #180e0a 0%, #12090a 50%, #060608 100%)'
    ].join(', ')
  },
  {
    id: 'abyss',
    label: 'Abysses',
    accent: '#2ec4d6',
    scrim: 0.28,
    surfaces: { void: '#04080a', abyss: '#071016', mist: '#0b1820', veil: '#10212b' },
    css: [
      'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(46, 196, 214, 0.24), transparent 60%)',
      'radial-gradient(ellipse 80% 60% at 15% 110%, rgba(20, 80, 110, 0.32), transparent 65%)',
      'radial-gradient(ellipse 60% 45% at 90% 80%, rgba(169, 201, 236, 0.14), transparent 60%)',
      'linear-gradient(180deg, #060a10 0%, #070c12 50%, #030405 100%)'
    ].join(', ')
  },
  {
    id: 'orchid',
    label: 'Orchidée',
    accent: '#d654c9',
    scrim: 0.32,
    surfaces: { void: '#0a050a', abyss: '#140a14', mist: '#1c101c', veil: '#251625' },
    css: [
      'radial-gradient(ellipse 65% 50% at 12% -8%, rgba(214, 84, 201, 0.28), transparent 60%)',
      'radial-gradient(ellipse 60% 55% at 90% 25%, rgba(109, 79, 214, 0.26), transparent 62%)',
      'radial-gradient(ellipse 70% 50% at 45% 115%, rgba(90, 40, 90, 0.24), transparent 65%)',
      'linear-gradient(165deg, #160a18 0%, #0e0a16 50%, #060608 100%)'
    ].join(', ')
  },
  {
    id: 'dusk',
    label: 'Crépuscule',
    accent: '#e67a63',
    scrim: 0.32,
    surfaces: { void: '#0a0607', abyss: '#140b0e', mist: '#1c1116', veil: '#25171e' },
    css: [
      'radial-gradient(ellipse 75% 45% at 50% -10%, rgba(230, 122, 99, 0.3), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 90% 30%, rgba(122, 79, 214, 0.26), transparent 60%)',
      'radial-gradient(ellipse 65% 50% at 10% 90%, rgba(214, 100, 140, 0.2), transparent 62%)',
      'linear-gradient(175deg, #180d10 0%, #0f0a16 50%, #060608 100%)'
    ].join(', ')
  },
  {
    id: 'meteor',
    label: 'Météore',
    accent: '#a9c9ec',
    scrim: 0.4,
    surfaces: { void: '#05070a', abyss: '#0a0e16', mist: '#10161f', veil: '#161e29' },
    css: [
      'radial-gradient(ellipse 30% 60% at 88% -5%, rgba(233, 240, 250, 0.35), transparent 55%)',
      'radial-gradient(ellipse 90% 70% at 65% 15%, rgba(169, 201, 236, 0.22), transparent 60%)',
      'radial-gradient(ellipse 70% 55% at 20% 105%, rgba(60, 90, 140, 0.22), transparent 62%)',
      'linear-gradient(155deg, #0a0e16 0%, #080b12 50%, #050608 100%)'
    ].join(', ')
  },
  {
    id: 'emerald',
    label: 'Émeraude',
    accent: '#2ecc8f',
    scrim: 0.3,
    surfaces: { void: '#050907', abyss: '#08120e', mist: '#0d1a14', veil: '#12231b' },
    css: [
      'radial-gradient(ellipse 65% 50% at 85% -8%, rgba(46, 204, 143, 0.3), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 10% 20%, rgba(230, 199, 143, 0.16), transparent 58%)',
      'radial-gradient(ellipse 75% 55% at 45% 115%, rgba(20, 90, 70, 0.28), transparent 65%)',
      'linear-gradient(170deg, #0a140f 0%, #0a1210 50%, #060808 100%)'
    ].join(', ')
  },

  // ─── Thèmes vivants ──────────────────────────────────────────────────────
  // Le dégradé de base reste ce qui garantit la lisibilité (c'est lui que
  // `scrim` couvre) ; les couches animées ne font qu'ajouter du mouvement
  // par-dessus, avec des opacités faibles pour ne jamais compromettre le
  // contraste calculé plus haut.

  {
    id: 'aurora-borealis',
    label: 'Aurore boréale',
    accent: '#6ee7c8',
    scrim: 0.34,
    surfaces: { void: '#040a0b', abyss: '#071413', mist: '#0b1d1a', veil: '#102723' },
    css: 'linear-gradient(178deg, #061210 0%, #050d12 48%, #04060a 100%)',
    animated: [
      {
        className: 'theme-drift',
        css: [
          'radial-gradient(ellipse 55% 32% at 30% 18%, rgba(110, 231, 200, 0.34), transparent 68%)',
          'radial-gradient(ellipse 48% 28% at 62% 26%, rgba(88, 190, 230, 0.26), transparent 66%)'
        ].join(', ')
      },
      {
        className: 'theme-pulse',
        css: 'radial-gradient(ellipse 62% 34% at 48% 12%, rgba(150, 120, 235, 0.24), transparent 70%)'
      }
    ]
  },
  {
    id: 'pulsar',
    label: 'Pulsar',
    accent: '#8ab4f8',
    scrim: 0.36,
    surfaces: { void: '#04060c', abyss: '#080c16', mist: '#0d1220', veil: '#131a2b' },
    css: 'radial-gradient(ellipse 120% 90% at 50% 50%, #0b1020 0%, #06080f 55%, #030409 100%)',
    animated: [
      {
        className: 'theme-pulse',
        css: 'radial-gradient(circle 34% at 50% 45%, rgba(138, 180, 248, 0.4), rgba(90, 120, 220, 0.12) 45%, transparent 70%)'
      },
      {
        className: 'theme-swirl',
        css: [
          'conic-gradient(from 0deg at 50% 45%, transparent 0deg, rgba(138, 180, 248, 0.14) 40deg, transparent 90deg,',
          'transparent 180deg, rgba(190, 150, 255, 0.12) 220deg, transparent 270deg)'
        ].join(' ')
      }
    ]
  },
  {
    id: 'prisma',
    label: 'Prisma',
    accent: '#e0a3ff',
    scrim: 0.4,
    surfaces: { void: '#07050c', abyss: '#0d0a16', mist: '#141020', veil: '#1c162b' },
    css: 'linear-gradient(165deg, #0d0916 0%, #090714 50%, #05040a 100%)',
    animated: [
      {
        className: 'theme-sweep',
        css: [
          'linear-gradient(102deg, transparent 34%, rgba(224, 163, 255, 0.3) 44%,',
          'rgba(120, 200, 255, 0.26) 52%, rgba(255, 190, 140, 0.22) 60%, transparent 70%)'
        ].join(' ')
      },
      {
        className: 'theme-drift',
        css: 'radial-gradient(ellipse 60% 40% at 30% 78%, rgba(150, 110, 240, 0.24), transparent 68%)'
      }
    ]
  },
  {
    id: 'tide',
    label: 'Marée',
    accent: '#4fd1c5',
    scrim: 0.34,
    surfaces: { void: '#04090c', abyss: '#071219', mist: '#0b1b24', veil: '#102530' },
    css: 'linear-gradient(180deg, #061119 0%, #040c13 55%, #02060a 100%)',
    animated: [
      {
        className: 'theme-drift',
        css: [
          'radial-gradient(ellipse 90% 30% at 50% 88%, rgba(79, 209, 197, 0.3), transparent 70%)',
          'radial-gradient(ellipse 70% 24% at 30% 96%, rgba(56, 150, 200, 0.26), transparent 68%)'
        ].join(', ')
      },
      {
        className: 'theme-pulse',
        css: 'radial-gradient(ellipse 80% 26% at 68% 92%, rgba(120, 230, 220, 0.2), transparent 66%)'
      }
    ]
  },
  {
    id: 'solstice',
    label: 'Solstice',
    accent: '#ffb35c',
    scrim: 0.42,
    surfaces: { void: '#0a0604', abyss: '#150c07', mist: '#1e130b', veil: '#281a10' },
    css: 'linear-gradient(190deg, #150c08 0%, #0d0806 52%, #050303 100%)',
    animated: [
      {
        className: 'theme-pulse',
        css: 'radial-gradient(circle 30% at 50% 108%, rgba(255, 179, 92, 0.42), rgba(220, 100, 60, 0.16) 50%, transparent 74%)'
      },
      {
        className: 'theme-drift',
        css: 'radial-gradient(ellipse 70% 34% at 22% 88%, rgba(230, 90, 70, 0.24), transparent 68%)'
      }
    ]
  }
]

export function backgroundPresetCss(id: string): string | null {
  return BACKGROUND_PRESETS.find((p) => p.id === id)?.css ?? null
}

export function backgroundPreset(id: string): BackgroundPreset | null {
  return BACKGROUND_PRESETS.find((p) => p.id === id) ?? null
}

/** Aperçu STATIQUE d'un thème pour les vignettes du sélecteur : couches
 * animées aplaties sur le dégradé de base. Sans cela, un thème vivant —
 * dont la base est volontairement très sombre, tout son caractère venant des
 * couches animées — apparaîtrait comme un carré presque noir dans les
 * réglages. En CSS, la PREMIÈRE valeur de `background-image` est celle du
 * dessus : les couches passent donc avant la base. */
export function themePreviewCss(preset: BackgroundPreset): string {
  if (!preset.animated?.length) return preset.css
  return [...preset.animated.map((layer) => layer.css), preset.css].join(', ')
}

/**
 * Fonds d'écran prédéfinis de la page de nouvel onglet — dégradés CSS purs
 * (aucun asset image à empaqueter/télécharger), sélectionnables depuis le
 * panneau « Personnaliser » de NewTabPage.tsx. Plusieurs lueurs radiales
 * superposées à une base quasi noire (jamais un aplat unique) pour un rendu
 * vivant façon nébuleuse/aurore plutôt qu'un simple dégradé plat.
 *
 * Chaque thème porte aussi sa propre couleur d'accent (`accent`, réappliquée
 * à TOUTE l'interface — boutons, surbrillances, `--color-glacier` — dès qu'il
 * est choisi, voir NewTabPage.tsx) et un voile de lisibilité calibré à la
 * main (`scrim`, densité de noir posée par-dessus pour garder le texte clair
 * lisible malgré les lueurs) : un dégradé conçu par nous n'a pas besoin de
 * l'analyse de luminance automatique réservée aux images importées (voir
 * `suggestScrimOpacity`, dominantColor.ts).
 */
export interface BackgroundPreset {
  id: string
  label: string
  css: string
  /** Couleur d'accent appliquée à toute l'interface quand ce thème est choisi. */
  accent: string
  /** Opacité (0-1) du voile sombre posé sur le dégradé pour la lisibilité. */
  scrim: number
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'aurora',
    label: 'Aurore',
    accent: '#5de0ac',
    scrim: 0.3,
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
    css: [
      'radial-gradient(ellipse 65% 50% at 85% -8%, rgba(46, 204, 143, 0.3), transparent 60%)',
      'radial-gradient(ellipse 60% 50% at 10% 20%, rgba(230, 199, 143, 0.16), transparent 58%)',
      'radial-gradient(ellipse 75% 55% at 45% 115%, rgba(20, 90, 70, 0.28), transparent 65%)',
      'linear-gradient(170deg, #0a140f 0%, #0a1210 50%, #060808 100%)'
    ].join(', ')
  }
]

export function backgroundPresetCss(id: string): string | null {
  return BACKGROUND_PRESETS.find((p) => p.id === id)?.css ?? null
}

export function backgroundPreset(id: string): BackgroundPreset | null {
  return BACKGROUND_PRESETS.find((p) => p.id === id) ?? null
}

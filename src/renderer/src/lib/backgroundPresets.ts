/**
 * Fonds d'écran prédéfinis — dégradés CSS purs (aucun asset image à
 * empaqueter/télécharger), sélectionnables depuis Réglages › Apparence et
 * appliqués dans App.tsx. Partagé entre les deux pour ne définir la liste
 * qu'à un seul endroit.
 */
export interface BackgroundPreset {
  id: string
  label: string
  css: string
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'aurora', label: 'Aurore', css: 'radial-gradient(circle at 20% 15%, #2b3350 0%, #0a0a10 65%)' },
  { id: 'ember', label: 'Braise', css: 'radial-gradient(circle at 80% 5%, #3a2a20 0%, #0a0a10 65%)' },
  { id: 'deep-sea', label: 'Abysses', css: 'radial-gradient(circle at 50% 100%, #10303a 0%, #0a0a10 65%)' },
  { id: 'orchid', label: 'Orchidée', css: 'radial-gradient(circle at 10% 90%, #35243f 0%, #0a0a10 65%)' },
  { id: 'forest', label: 'Forêt', css: 'radial-gradient(circle at 90% 90%, #1c3428 0%, #0a0a10 65%)' }
]

export function backgroundPresetCss(id: string): string | null {
  return BACKGROUND_PRESETS.find((p) => p.id === id)?.css ?? null
}

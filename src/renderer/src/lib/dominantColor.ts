/**
 * Analyse d'image côté renderer — couleur dominante (façon Windows : « Choisir
 * automatiquement une couleur d'accentuation à partir de l'image de fond ») et
 * luminance moyenne (pour calibrer AUTOMATIQUEMENT le voile de lisibilité posé
 * sur le fond de la page de nouvel onglet, voir `suggestScrimOpacity` —
 * NewTabPage.tsx ne pose plus une opacité fixe arbitraire, elle s'adapte à
 * l'image importée). Fonctionne UNIQUEMENT sur des `data:` URIs — une image
 * chargée depuis `aether://` (ou toute autre origine) pollue le canvas
 * (`getImageData` lève une `SecurityError`), alors qu'une `data:` URI est
 * toujours exemptée de cette règle par la spec HTML, quel que soit le
 * réglage CORS du protocole personnalisé.
 */

/** Sous-échantillonnage partagé : la couleur/luminance moyenne ne change pas
 * à 32×32, et c'est bien moins de pixels à parcourir qu'une image pleine
 * résolution. */
async function sampleImage(dataUrl: string): Promise<Uint8ClampedArray | null> {
  const image = new Image()
  image.src = dataUrl
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('image-load-failed'))
  })

  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, size, size)
  return ctx.getImageData(0, 0, size, size).data
}

export async function extractDominantColor(dataUrl: string): Promise<string | null> {
  const data = await sampleImage(dataUrl)
  if (!data) return null

  let r = 0
  let g = 0
  let b = 0
  let weight = 0
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255
    if (alpha === 0) continue
    const pr = data[i]
    const pg = data[i + 1]
    const pb = data[i + 2]
    // Pondère par la saturation : la couleur DOMINANTE d'une photo doit
    // ressortir davantage que ses zones grises/ternes (ciel gris, ombres),
    // sans quoi la moyenne brute retombe presque toujours sur un gris terne.
    const max = Math.max(pr, pg, pb)
    const min = Math.min(pr, pg, pb)
    const saturation = max === 0 ? 0 : (max - min) / max
    const w = alpha * (0.2 + saturation)
    r += pr * w
    g += pg * w
    b += pb * w
    weight += w
  }
  if (weight === 0) return null
  const toHex = (v: number): string => Math.round(Math.min(255, Math.max(0, v / weight))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Voile sombre à poser SUR une image importée pour que le texte clair de la
 * page de nouvel onglet (widgets, raccourcis, recherche) reste lisible quel
 * que soit son contenu — calibré sur la luminance perçue moyenne (poids
 * standard ITU-R BT.601, plus fidèle à la perception humaine qu'une simple
 * moyenne RVB) plutôt qu'une opacité fixe arbitraire : une photo déjà sombre
 * n'a besoin que d'un voile léger, une photo claire (ciel, neige, plage) en
 * réclame un bien plus soutenu pour ne pas noyer le texte. Bornée [0.22, 0.62]
 * — jamais totalement transparent (le texte resterait fragile sur une zone
 * claire locale même si la moyenne est sombre) ni assez opaque pour effacer
 * l'image choisie. */
export async function suggestScrimOpacity(dataUrl: string): Promise<number> {
  const data = await sampleImage(dataUrl)
  if (!data) return 0.32

  let luminance = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255
    if (alpha === 0) continue
    luminance += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
    count++
  }
  if (count === 0) return 0.32
  const avgLuminance = luminance / count
  return Math.min(0.62, Math.max(0.22, 0.2 + avgLuminance * 0.55))
}

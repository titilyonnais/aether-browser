/**
 * Extraction de couleur dominante depuis une image (façon Windows :
 * « Choisir automatiquement une couleur d'accentuation à partir de l'image
 * de fond »). Fonctionne UNIQUEMENT sur des `data:` URIs — une image chargée
 * depuis `aether://` (ou toute autre origine) pollue le canvas
 * (`getImageData` lève une `SecurityError`), alors qu'une `data:` URI est
 * toujours exemptée de cette règle par la spec HTML, quel que soit le
 * réglage CORS du protocole personnalisé.
 */
export async function extractDominantColor(dataUrl: string): Promise<string | null> {
  const image = new Image()
  image.src = dataUrl
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('image-load-failed'))
  })

  // Sous-échantillonnage : la couleur moyenne ne change pas à 32×32, et
  // c'est bien moins de pixels à parcourir qu'une image pleine résolution.
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, size, size)

  const { data } = ctx.getImageData(0, 0, size, size)
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

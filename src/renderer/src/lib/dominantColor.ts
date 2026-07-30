/**
 * Analyse d'image côté renderer — couleur dominante (façon Windows : « Choisir
 * automatiquement une couleur d'accentuation à partir de l'image de fond ») et
 * calcul du voile de lisibilité à poser sur un thème image, dimensionné pour
 * GARANTIR le contraste minimum WCAG AA du texte de l'interface (voir
 * `computeReadableScrim`) — jamais une opacité fixe arbitraire.
 * Fonctionne UNIQUEMENT sur des `data:` URIs — une image
 * chargée depuis `aether://` (ou toute autre origine) pollue le canvas
 * (`getImageData` lève une `SecurityError`), alors qu'une `data:` URI est
 * toujours exemptée de cette règle par la spec HTML, quel que soit le
 * réglage CORS du protocole personnalisé.
 */

/** Sous-échantillonnage partagé. 64×64 (et non 32×32) : le rééchantillonnage
 * MOYENNE les pixels voisins, donc plus la grille est grossière, plus les
 * zones claires LOCALES — celles qui mettent réellement le texte en difficulté —
 * se fondent dans leur voisinage sombre et disparaissent de l'analyse. 4096
 * échantillons restent négligeables à parcourir, et une fois seulement, à
 * l'import. */
async function sampleImage(dataUrl: string): Promise<Uint8ClampedArray | null> {
  const image = new Image()
  image.src = dataUrl
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('image-load-failed'))
  })

  const size = 64
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

/** Luminance relative WCAG d'une couleur sRGB 8 bits (0-1). */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c8: number): number => {
    const c = c8 / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Rapport de contraste WCAG entre deux luminances relatives (1 à 21). */
function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** Texte de référence du calcul : la couleur la PLUS SOMBRE employée par-dessus
 * un thème (`ON_BACKGROUND_TEXT.faint`, voir theme.ts). Viser le texte
 * principal seul ne suffirait pas — les tons secondaires, plus sombres,
 * passeraient sous le seuil alors même que le calcul se déclarerait satisfait.
 * En dimensionnant sur le pire des trois, TOUT le texte de la page est
 * garanti d'un coup. */
const REFERENCE_TEXT = { r: 0xcf, g: 0xcf, b: 0xdd }

/**
 * Seuil de lisibilité visé : 7:1, le niveau WCAG **AAA**, et non les 4.5:1 du
 * niveau AA.
 *
 * Ce choix vient d'une mesure, pas d'un excès de prudence. Sur une photo réelle
 * (mur clair, centile 97 à 0.852 de luminance), un voile calibré pour AA
 * donnait bien 4.7 à 5.3:1 dans chaque zone de la page — donc « conforme » — et
 * le texte restait pourtant illisible. La raison : le critère WCAG suppose un
 * fond UNI. Par-dessus une photo, chaque glyphe traverse des bords et des
 * motifs à haute fréquence dont le contraste LOCAL n'a rien à voir avec la
 * moyenne, et la petite taille des textes de la page (10 à 12 px) ne pardonne
 * rien. AAA fournit la marge que le calcul moyen ne peut pas voir.
 *
 * Cette marge se combine au flou appliqué aux images importées (voir
 * `NewTabPage`), qui s'attaque à l'autre moitié du problème : supprimer le
 * détail fin plutôt que compenser son contraste.
 */
const MIN_CONTRAST = 7

/** Centile de luminance qui pilote le calcul : on dimensionne le voile sur les
 * 3 % de pixels les plus CLAIRS de l'image.
 *
 * Une moyenne globale est trompeuse (une voiture sombre devant un mur clair
 * donne une moyenne basse alors que le texte posé sur le mur est illisible),
 * mais 90 % — la valeur précédente — l'était encore : le texte ne se pose pas
 * sur la luminance moyenne, il se pose là où il tombe, y compris sur le dixième
 * le plus clair de l'image. D'où un centile bien plus haut. Ce n'est toujours
 * pas le maximum absolu : un unique reflet spéculaire ne doit pas imposer un
 * voile quasi opaque à toute l'image. */
const BRIGHT_PERCENTILE = 0.97

/**
 * Opacité du voile noir à poser SUR une image importée pour GARANTIR que le
 * texte clair de la page reste lisible — pas une estimation empirique mais la
 * résolution directe du critère WCAG : on cherche la plus petite opacité pour
 * laquelle le contraste entre `REFERENCE_TEXT` et les zones claires de l'image
 * atteint `MIN_CONTRAST`. L'image reste ainsi aussi visible que la lisibilité
 * l'autorise, jamais assombrie plus que nécessaire — et jamais moins.
 *
 * Le mélange est calculé en sRGB (comme le fait le compositeur CSS pour un
 * `background: rgb(0 0 0 / α)` superposé), puis relinéarisé pour la luminance
 * WCAG — un raccourci qui multiplierait la luminance par `(1 - α)` se
 * tromperait d'un facteur gamma.
 */
export async function computeReadableScrim(dataUrl: string): Promise<number> {
  const data = await sampleImage(dataUrl)
  // Image illisible : voile prudent (une image qu'on ne peut pas analyser
  // peut être n'importe quoi, dont un fond blanc).
  if (!data) return 0.55

  const luminances: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    luminances.push(relativeLuminance(data[i], data[i + 1], data[i + 2]))
  }
  if (luminances.length === 0) return 0.55

  luminances.sort((a, b) => a - b)
  const reference = luminances[Math.min(luminances.length - 1, Math.floor(luminances.length * BRIGHT_PERCENTILE))]

  // Reconstitue une couleur grise de cette luminance pour rejouer le mélange
  // en sRGB : le voile s'applique aux canaux, pas à la luminance.
  const toSrgb8 = (linear: number): number => {
    const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, c * 255))
  }
  const base = toSrgb8(reference)
  const textLuminance = relativeLuminance(REFERENCE_TEXT.r, REFERENCE_TEXT.g, REFERENCE_TEXT.b)

  // Recherche dichotomique de l'opacité minimale suffisante. 12 itérations →
  // précision ~0.0002, largement au-delà du visible.
  let low = 0
  let high = 0.92
  if (contrastRatio(textLuminance, relativeLuminance(base * (1 - high), base * (1 - high), base * (1 - high))) < MIN_CONTRAST) {
    return high
  }
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2
    const dimmed = base * (1 - mid)
    if (contrastRatio(textLuminance, relativeLuminance(dimmed, dimmed, dimmed)) >= MIN_CONTRAST) high = mid
    else low = mid
  }
  // Arrondi VERS LE HAUT (jamais `Math.round`) : arrondir au centième le plus
  // proche pouvait redescendre juste SOUS le seuil (4.4989:1 mesuré) et
  // annuler la garantie que toute cette fonction existe pour tenir.
  return Math.min(0.92, Math.ceil(high * 100) / 100)
}

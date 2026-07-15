/**
 * Génère l'icône d'application ÆTHER à partir du logo (Æ serif blanc sur carré
 * bleu nuit) : rend le SVG en PNG haute résolution puis assemble un .ico
 * multi-tailles pour Windows. `build/icon.png` et `build/icon.ico` sont
 * consommés par electron-builder et la fenêtre.
 *
 *   node scripts/gen-icon.mjs
 */
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')
mkdirSync(buildDir, { recursive: true })

const serifWoff = join(
  root,
  'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff'
)

/** Le logo, en SVG vectoriel — net à toutes les tailles. */
const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161f33"/>
      <stop offset="0.55" stop-color="#0e1526"/>
      <stop offset="1" stop-color="#090e1b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.30" r="0.72">
      <stop offset="0" stop-color="#3a4e78" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#3a4e78" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#glow)"/>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#vignette)"/>
  <rect x="4" y="4" width="504" height="504" rx="108" fill="none"
        stroke="#aebfe0" stroke-opacity="0.14" stroke-width="2"/>
  <text x="256" y="366" text-anchor="middle"
        font-family="Instrument Serif, Georgia, 'Times New Roman', serif"
        font-size="330" fill="#eef2fb" letter-spacing="-6">&#198;</text>
</svg>`

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: {
      fontFiles: [serifWoff],
      loadSystemFonts: true,
      defaultFontFamily: 'Instrument Serif'
    }
  })
  return resvg.render().asPng()
}

// PNG principal (fenêtre / auto-génération electron-builder).
const png512 = renderPng(512)
writeFileSync(join(buildDir, 'icon.png'), png512)

// ICO multi-tailles pour l'exe et l'installeur Windows.
const sizes = [256, 128, 64, 48, 32, 16]
const pngs = sizes.map((s) => renderPng(s))
const ico = await pngToIco(pngs)
writeFileSync(join(buildDir, 'icon.ico'), ico)

console.log('✓ build/icon.png (512) + build/icon.ico (' + sizes.join(', ') + ')')

/**
 * Hook electron-builder `afterAllArtifactBuild` — écrit un `SHA256SUMS.txt` à
 * côté des artefacts produits (installeur NSIS, portable, blockmap…). Utile
 * tant qu'aucun certificat de signature de code n'est en place (voir README,
 * section « Signature ») : ça ne remplace pas une signature Authenticode,
 * mais ça donne aux utilisateurs un moyen de vérifier qu'un fichier
 * téléchargé n'a pas été altéré, en comparant contre la valeur publiée dans
 * la release GitHub.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/** @param {import('electron-builder').BuildResult} buildResult */
export default async function afterAllArtifactBuild(buildResult) {
  const lines = []
  for (const filePath of buildResult.artifactPaths) {
    const digest = await sha256(filePath)
    lines.push(`${digest}  ${basename(filePath)}`)
  }
  if (lines.length === 0) return []

  const sumsPath = join(buildResult.outDir, 'SHA256SUMS.txt')
  await writeFile(sumsPath, lines.join('\n') + '\n', 'utf8')
  console.log(`[write-checksums] ${lines.length} empreinte(s) écrite(s) dans ${sumsPath}`)
  return []
}

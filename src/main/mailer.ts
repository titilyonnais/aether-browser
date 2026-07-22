/**
 * Envoi du rapport de bug (« Signaler un problème ») par SMTP — nodemailer,
 * appelé UNIQUEMENT depuis ce process main. Les identifiants viennent de
 * `readSmtpConfig()` (settings.ts, chiffrés via safeStorage) et ne
 * traversent JAMAIS un canal IPC vers le renderer.
 */
import { app } from 'electron'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import nodemailer from 'nodemailer'
import { readSmtpConfig } from './settings'

/** Adresse de destination — publique (déjà visible dans l'ancien lien
 * `mailto:`), ce n'est pas un secret contrairement aux identifiants SMTP. */
const REPORT_TO_ADDRESS = 'titilyonnais.yt@gmail.com'

/** Gmail (et la plupart des relais SMTP) refusent au-delà de ~25 Mo — mieux
 * vaut un message d'erreur clair côté renderer qu'un échec SMTP opaque. */
const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Corps HTML soigné (façon ticket) + repli texte brut pour les clients qui
 * ne rendent pas le HTML. `includeMetadata` = false omet complètement le
 * bloc version/OS (case à cocher côté ReportProblemOverlay.tsx) — le rapport
 * reste alors composé du seul texte saisi par l'utilisateur. */
function buildEmail(subject: string, body: string, includeMetadata: boolean): { html: string; text: string } {
  const meta = includeMetadata
    ? [
        ['Version ÆTHER', app.getVersion()],
        ['Electron', process.versions.electron ?? '?'],
        ['Chromium', process.versions.chrome ?? '?'],
        ['OS', `${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim()]
      ]
    : []
  const metaHtml = meta.map(([k, v]) => `<tr><td style="color:#8a8f9c;padding:2px 12px 2px 0;">${k}</td><td style="color:#c9cdd6;">${escapeHtml(v)}</td></tr>`).join('')
  const metaText = meta.map(([k, v]) => `${k} : ${v}`).join('\n')

  const html = `
<div style="background:#0a0a10;padding:32px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#111118;border:1px solid #26262f;border-radius:16px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #26262f;">
      <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Rapport de bug ÆTHER</p>
      <h1 style="margin:6px 0 0;font-size:17px;color:#f2f3f7;font-weight:600;">${escapeHtml(subject)}</h1>
    </div>
    <div style="padding:20px 24px;">
      <p style="margin:0;white-space:pre-wrap;font-size:13.5px;line-height:1.6;color:#d7d9e0;">${escapeHtml(body) || '<em style="color:#6b7280;">(aucune description)</em>'}</p>
    </div>
    ${
      includeMetadata
        ? `<div style="padding:16px 24px;background:#0d0d13;border-top:1px solid #26262f;">
      <table style="font-size:11.5px;border-collapse:collapse;">${metaHtml}</table>
    </div>`
        : ''
    }
  </div>
</div>`.trim()

  const text = includeMetadata ? `${subject}\n\n${body}\n\n---\n${metaText}` : `${subject}\n\n${body}`
  return { html, text }
}

export async function sendBugReport(
  subject: string,
  body: string,
  attachmentPaths: string[] = [],
  includeMetadata = true
): Promise<{ ok: boolean; error?: string }> {
  const config = readSmtpConfig()
  if (!config) return { ok: false, error: 'smtp-not-configured' }

  let totalBytes = 0
  for (const path of attachmentPaths) {
    try {
      totalBytes += statSync(path).size
    } catch {
      return { ok: false, error: 'attachment-unreadable' }
    }
  }
  if (totalBytes > MAX_ATTACHMENTS_BYTES) return { ok: false, error: 'attachments-too-large' }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass }
    })
    const { html, text } = buildEmail(subject.slice(0, 200), body.slice(0, 10_000), includeMetadata)
    await transporter.sendMail({
      from: config.user,
      to: REPORT_TO_ADDRESS,
      subject: `[ÆTHER] ${subject.slice(0, 200)}`,
      text,
      html,
      attachments: attachmentPaths.map((path) => ({ filename: basename(path), path }))
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

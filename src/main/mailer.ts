/**
 * Envoi du rapport de bug (« Signaler un problème ») par SMTP — nodemailer,
 * appelé UNIQUEMENT depuis ce process main. Les identifiants viennent de
 * `readSmtpConfig()` (settings.ts, chiffrés via safeStorage) et ne
 * traversent JAMAIS un canal IPC vers le renderer.
 */
import nodemailer from 'nodemailer'
import { readSmtpConfig } from './settings'

/** Adresse de destination — publique (déjà visible dans l'ancien lien
 * `mailto:`), ce n'est pas un secret contrairement aux identifiants SMTP. */
const REPORT_TO_ADDRESS = 'titilyonnais.yt@gmail.com'

export async function sendBugReport(subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const config = readSmtpConfig()
  if (!config) return { ok: false, error: 'smtp-not-configured' }
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass }
    })
    await transporter.sendMail({
      from: config.user,
      to: REPORT_TO_ADDRESS,
      subject: `[ÆTHER] ${subject.slice(0, 200)}`,
      text: body.slice(0, 10_000)
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

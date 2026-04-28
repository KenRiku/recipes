/**
 * Resend wrapper with dev fallback.
 *
 * When RESEND_API_KEY is missing, every send() logs the payload to console
 * and returns successfully. Local dev / preview deploys / CI never send
 * real emails by default.
 */

import { Resend } from 'resend'

// CUSTOMIZE: your verified Resend domain.
const FROM_ADDRESS = 'MyApp <noreply@example.com>'

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * Resend rejections (4xx/5xx, network errors, unverified domain) must
 * never surface to the caller. The user signed up / triggered the action
 * successfully — a delayed email is a secondary concern.
 */
async function safeSend(
  resend: Resend,
  payload: { from: string; to: string; subject: string; html: string },
  logContext: string
): Promise<void> {
  try {
    await resend.emails.send(payload)
  } catch (err) {
    console.error(`[Email] ${logContext} send failed:`, err)
  }
}

/**
 * Escape user-supplied strings before interpolating into email HTML.
 * Prevents anyone with an adversarial display name from breaking layout
 * or injecting markup into recipient emails.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─────────────────────────────────────────────────────────────────────────
// Example templates — CUSTOMIZE: replace with your project's emails.
// ─────────────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  recipientName: string,
  dashboardUrl: string
): Promise<void> {
  const recipientNameSafe = escapeHtml(recipientName)
  const subject = 'Welcome to MyApp!'
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #1a3a3a; font-size: 24px;">Welcome, ${recipientNameSafe}!</h1>
      <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
        Thanks for joining MyApp.
      </p>
      <div style="margin: 32px 0;">
        <a href="${dashboardUrl}" style="background-color: #1a3a3a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Go to your dashboard &rarr;
        </a>
      </div>
    </div>
  `

  const resend = getResendClient()
  if (!resend) {
    console.log('[Email dev fallback] sendWelcomeEmail', { to, subject })
    return
  }
  await safeSend(resend, { from: FROM_ADDRESS, to, subject, html }, 'sendWelcomeEmail')
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  const subject = 'Reset your MyApp password'
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #1a3a3a; font-size: 24px;">Reset your password</h1>
      <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
        Click the button below to choose a new password. This link expires in 1 hour.
      </p>
      <div style="margin: 32px 0;">
        <a href="${resetUrl}" style="background-color: #1a3a3a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reset password &rarr;
        </a>
      </div>
      <p style="color: #a0aec0; font-size: 12px;">
        If you didn't request a reset, ignore this email.
      </p>
    </div>
  `

  const resend = getResendClient()
  if (!resend) {
    console.log('[Email dev fallback] sendPasswordResetEmail', { to, subject, resetUrl })
    return
  }
  await safeSend(resend, { from: FROM_ADDRESS, to, subject, html }, 'sendPasswordResetEmail')
}

/**
 * Dropbox Sign (formerly HelloSign) wrapper with dev fallback.
 *
 * When DROPBOX_SIGN_API_KEY is absent, `createSignatureRequest()` logs and
 * returns a fake `dev_sig_*` ID so the rest of the flow can continue
 * without erroring. Useful for local dev, CI, and preview deploys.
 *
 * Callers (your send-for-signature route, the webhook handler) must
 * tolerate fake `dev_sig_*` IDs — they should NOT assume a real webhook
 * will ever arrive for these.
 */

import crypto from 'crypto'
import {
  SignatureRequestApi,
  SignatureRequestSendRequest,
  SubSignatureRequestSigner,
  type RequestFile,
} from '@dropbox/sign'

export type EsignSigner = {
  email: string
  name: string
  /** Human-readable signer role. Used in dev-fallback logs. */
  role: string
}

export type CreateSignatureRequestOpts = {
  title: string
  subject: string
  message: string
  /** PDF bytes to be signed. */
  fileBytes: Buffer
  signers: EsignSigner[]
  /** Opaque metadata round-tripped through Dropbox Sign. */
  metadata?: Record<string, string>
}

export type CreateSignatureRequestResult = {
  signatureRequestId: string
  signingUrls?: Record<string, string>
  /** True when dev fallback was used. */
  devFallback?: boolean
}

function getSignatureRequestApi(): SignatureRequestApi | null {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY
  if (!apiKey) return null

  const api = new SignatureRequestApi()
  api.username = apiKey
  return api
}

export function isDevSignatureRequestId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('dev_sig_')
}

export async function createSignatureRequest(
  opts: CreateSignatureRequestOpts
): Promise<CreateSignatureRequestResult> {
  const api = getSignatureRequestApi()

  if (!api) {
    const fakeId = `dev_sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log('[E-sign dev fallback] createSignatureRequest', {
      signatureRequestId: fakeId,
      title: opts.title,
      signers: opts.signers.map(s => ({ name: s.name, email: s.email, role: s.role })),
    })
    return { signatureRequestId: fakeId, devFallback: true }
  }

  const signers: SubSignatureRequestSigner[] = opts.signers.map((s, i) => {
    const signer = new SubSignatureRequestSigner()
    signer.name = s.name
    signer.emailAddress = s.email
    signer.order = i
    return signer
  })

  const request = new SignatureRequestSendRequest()
  request.title = opts.title
  request.subject = opts.subject
  request.message = opts.message
  request.signers = signers

  const filename = `${opts.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'document'}.pdf`
  const detailedFile: RequestFile = {
    value: opts.fileBytes,
    options: { filename, contentType: 'application/pdf' },
  }
  request.files = [detailedFile]
  if (opts.metadata) request.metadata = opts.metadata

  // Test mode in non-production to avoid burning quota during dev.
  request.testMode = process.env.NODE_ENV !== 'production'

  const response = await api.signatureRequestSend(request)
  const sr = response.body.signatureRequest
  const signatureRequestId = sr?.signatureRequestId
  if (!signatureRequestId) {
    throw new Error('[E-sign] Dropbox Sign returned no signatureRequestId')
  }

  return { signatureRequestId }
}

export async function fetchSignedDocumentBytes(
  signatureRequestId: string
): Promise<Buffer | null> {
  if (isDevSignatureRequestId(signatureRequestId)) return null
  const api = getSignatureRequestApi()
  if (!api) return null
  const response = await api.signatureRequestFiles(signatureRequestId, 'pdf')
  return response.body as unknown as Buffer
}

export async function fetchSignedDocumentUrl(
  signatureRequestId: string
): Promise<string | null> {
  if (isDevSignatureRequestId(signatureRequestId)) return null
  const api = getSignatureRequestApi()
  if (!api) return null
  const response = await api.signatureRequestFilesAsFileUrl(signatureRequestId)
  return response.body.fileUrl ?? null
}

/**
 * Verifies Dropbox Sign HMAC. Returns true only on exact constant-time match.
 *
 * `event_hash` = HMAC-SHA256(event_time + event_type) using
 * DROPBOX_SIGN_WEBHOOK_SECRET (or DROPBOX_SIGN_API_KEY as fallback).
 */
export function verifyWebhookSignature(event: {
  eventTime?: string
  eventType?: string
  eventHash?: string
}): boolean {
  const secret =
    process.env.DROPBOX_SIGN_WEBHOOK_SECRET || process.env.DROPBOX_SIGN_API_KEY
  if (!secret) {
    console.warn('[E-sign] Webhook secret not configured; rejecting all webhooks.')
    return false
  }
  const { eventTime, eventType, eventHash } = event
  if (!eventTime || !eventType || !eventHash) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${eventTime}${eventType}`)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(eventHash, 'hex')
    )
  } catch {
    return false
  }
}

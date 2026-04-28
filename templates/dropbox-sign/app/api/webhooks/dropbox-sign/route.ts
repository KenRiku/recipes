export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyWebhookSignature, fetchSignedDocumentUrl } from '@/lib/esign'

/**
 * POST /api/webhooks/dropbox-sign
 *
 * Public endpoint. Dropbox Sign authenticates via HMAC of (event_time +
 * event_type), verified by `verifyWebhookSignature`.
 *
 * Dropbox Sign sends `multipart/form-data` with a `json` field. They
 * REQUIRE the response body to contain the literal `Hello API Event
 * Received` (HTTP 200, plain text). Any other response triggers
 * aggressive retries.
 *
 * Add this path to your auth middleware exclusion list.
 *
 * CUSTOMIZE: this template references `prisma.generatedDocument` with
 * fields `signatureRequestId`, `signingStatus`, `signedAt`,
 * `signedDocumentUrl`. Replace with your project's model — or strip the
 * DB writes if you only need the verified ack.
 */
export async function POST(req: NextRequest) {
  let payloadRaw: string | null = null

  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const jsonField = form.get('json')
      if (typeof jsonField === 'string') payloadRaw = jsonField
    } else {
      payloadRaw = await req.text()
    }
  } catch (err) {
    console.error('[dropbox-sign webhook] Failed to read body:', err)
    return helloAPIResponse()
  }

  if (!payloadRaw) {
    console.warn('[dropbox-sign webhook] Empty payload')
    return helloAPIResponse()
  }

  let parsed: DropboxSignCallbackPayload
  try {
    parsed = JSON.parse(payloadRaw) as DropboxSignCallbackPayload
  } catch (err) {
    console.error('[dropbox-sign webhook] Invalid JSON payload:', err)
    return helloAPIResponse()
  }

  const event = parsed.event
  if (!event) return helloAPIResponse()

  const signatureOk = verifyWebhookSignature({
    eventTime: event.event_time,
    eventType: event.event_type,
    eventHash: event.event_hash,
  })
  if (!signatureOk) {
    console.warn('[dropbox-sign webhook] HMAC verification failed for', event.event_type)
    return helloAPIResponse()
  }

  // Synthetic event Dropbox Sign fires when you register the webhook URL.
  if (event.event_type === 'callback_test') return helloAPIResponse()

  const signatureRequestId = parsed.signature_request?.signature_request_id
  if (!signatureRequestId) return helloAPIResponse()

  try {
    // CUSTOMIZE: replace `generatedDocument` with your actual model name.
    const doc = await prisma.generatedDocument.findUnique({
      where: { signatureRequestId },
    })
    if (!doc) return helloAPIResponse()

    switch (event.event_type) {
      case 'signature_request_all_signed': {
        let signedUrl: string | null = null
        try {
          signedUrl = await fetchSignedDocumentUrl(signatureRequestId)
        } catch (err) {
          console.error('[dropbox-sign webhook] fetchSignedDocumentUrl failed:', err)
        }
        await prisma.generatedDocument.update({
          where: { id: doc.id },
          data: {
            signingStatus: 'signed',
            signedAt: new Date(),
            signedDocumentUrl: signedUrl,
          },
        })
        break
      }
      case 'signature_request_declined': {
        await prisma.generatedDocument.update({
          where: { id: doc.id },
          data: { signingStatus: 'declined' },
        })
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[dropbox-sign webhook] Handler error:', err)
  }

  return helloAPIResponse()
}

function helloAPIResponse() {
  return new NextResponse('Hello API Event Received', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

type DropboxSignCallbackPayload = {
  event?: {
    event_time?: string
    event_type?: string
    event_hash?: string
  }
  signature_request?: {
    signature_request_id?: string
    is_complete?: boolean
    is_declined?: boolean
  }
}

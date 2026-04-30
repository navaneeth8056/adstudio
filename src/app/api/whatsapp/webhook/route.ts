import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// ── GET: Meta webhook verification ──────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('[whatsapp/webhook] Verified')
    return new Response(challenge ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// ── POST: Receive incoming messages / button taps ────────────────────────────
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: true }) }

  try {
    const entry    = (body?.entry as unknown[])?.[0] as Record<string, unknown>
    const changes  = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
    const value    = changes?.value as Record<string, unknown>
    const messages = (value?.messages as unknown[])?.[0] as Record<string, unknown>

    if (!messages) return NextResponse.json({ ok: true }) // status update, not a message

    const msgType = messages?.type as string
    if (msgType !== 'interactive') return NextResponse.json({ ok: true })

    const interactive  = messages?.interactive as Record<string, unknown>
    const buttonReply  = interactive?.button_reply as Record<string, string> | undefined

    if (!buttonReply?.id) return NextResponse.json({ ok: true })

    const payload = buttonReply.id // e.g. "approve_<postId>" or "reject_<postId>"
    const [action, ...rest] = payload.split('_')
    const postId = rest.join('_') // handles UUIDs with underscores

    if (!postId || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json({ ok: true })
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('posts')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', postId)

    if (error) console.error('[whatsapp/webhook] DB update error:', error)
    else console.log(`[whatsapp/webhook] Post ${postId} → ${newStatus}`)

  } catch (e) {
    console.error('[whatsapp/webhook] Parse error:', e)
  }

  // Always return 200 — Meta will retry if we don't
  return NextResponse.json({ ok: true })
}

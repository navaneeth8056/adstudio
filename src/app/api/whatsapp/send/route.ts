import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

function waEnv() {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set')
  return { token, phoneId }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await req.json()
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  // Fetch post + client (with phone)
  const { data: post, error: postErr } = await supabase
    .from('posts')
    .select('*, client:clients(id, name, phone)')
    .eq('id', postId)
    .eq('user_id', user.id)
    .single()

  if (postErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const client = post.client as { id: string; name: string; phone?: string } | null
  if (!client?.phone) {
    return NextResponse.json({ error: 'Client has no phone number. Add one on the Draft page.' }, { status: 400 })
  }

  const labels = post.labels as {
    property_name: string; location: string; hook: string; body: string; cta: string
  } | null

  if (!labels) return NextResponse.json({ error: 'Post has no ad labels' }, { status: 400 })

  const imageUrl = post.generated_image_url ?? post.base_photo_url
  if (!imageUrl) return NextResponse.json({ error: 'Post has no image' }, { status: 400 })

  // Normalise phone: strip spaces, dashes, parentheses; remove leading +
  const phone = client.phone.replace(/[\s\-().]/g, '').replace(/^\+/, '')

  const { token, phoneId } = waEnv()

  // Send WhatsApp template message
  const waRes = await fetch(
    `https://graph.facebook.com/v20.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'ad_approval_request',
          language: { code: 'en_US' },
          components: [
            // Header: image
            {
              type: 'header',
              parameters: [{ type: 'image', image: { link: imageUrl } }],
            },
            // Body variables: {{1}} property name, {{2}} hook, {{3}} body, {{4}} location
            {
              type: 'body',
              parameters: [
                { type: 'text', text: labels.property_name },
                { type: 'text', text: labels.hook },
                { type: 'text', text: labels.body },
                { type: 'text', text: labels.location },
              ],
            },
            // Button 0 → Approve payload
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: 0,
              parameters: [{ type: 'payload', payload: `approve_${postId}` }],
            },
            // Button 1 → Reject payload
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: 1,
              parameters: [{ type: 'payload', payload: `reject_${postId}` }],
            },
          ],
        },
      }),
    }
  )

  const waJson = await waRes.json()
  if (!waRes.ok) {
    console.error('[whatsapp/send] Meta API error:', waJson)
    return NextResponse.json(
      { error: waJson?.error?.message ?? 'WhatsApp API error', details: waJson },
      { status: 502 }
    )
  }

  // Update post status to pending_approval
  const svc = createServiceClient()
  await svc
    .from('posts')
    .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
    .eq('id', postId)

  return NextResponse.json({ success: true, waMessageId: waJson?.messages?.[0]?.id })
}

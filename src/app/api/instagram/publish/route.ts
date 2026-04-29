import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Post, Client } from '@/types'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await req.json()
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const { data: post } = await supabase
    .from('posts')
    .select('*, client:clients(*)')
    .eq('id', postId)
    .eq('user_id', user.id)
    .single() as { data: Post & { client: Client } }

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (!post.client?.instagram_page_id || !post.client?.instagram_token) {
    return NextResponse.json({ error: 'Instagram Page ID and token are required on the client profile' }, { status: 400 })
  }
  if (!post.generated_image_url) {
    return NextResponse.json({ error: 'Post must have a generated image before publishing' }, { status: 400 })
  }

  const pageId = post.client.instagram_page_id
  const token = post.client.instagram_token
  const imageUrl = post.generated_image_url
  const caption = `${post.caption ?? ''}\n\n${post.hashtags ?? ''}`.trim()

  // Step 1: Create media container
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
    }
  )
  const container = await containerRes.json()
  if (!container.id) {
    return NextResponse.json({ error: 'Failed to create media container', details: container }, { status: 500 })
  }

  // Step 2: Publish container
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    }
  )
  const published = await publishRes.json()
  if (!published.id) {
    return NextResponse.json({ error: 'Failed to publish post', details: published }, { status: 500 })
  }

  // Update post status
  await supabase
    .from('posts')
    .update({ status: 'published', instagram_post_id: published.id, updated_at: new Date().toISOString() })
    .eq('id', postId)

  return NextResponse.json({ instagram_post_id: published.id, success: true })
}

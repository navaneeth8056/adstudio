import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, CLAUDE_MODEL, estimateCost } from '@/lib/anthropic'
import { logCost } from '@/lib/cost-logger'
import type { Client, AurovilleEvent } from '@/types'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, postId, basePhotoUrl, customInstruction, selectedEvent, includeReviews } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single() as { data: Client }

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const reviewContext = includeReviews && client.review_summary
    ? `\nGuest Highlights: ${client.review_summary.highlights?.join(', ')}
Ad Angles: ${client.review_summary.ad_angles?.join(' | ')}
Top Quote: "${client.review_summary.top_quotes?.[0] ?? ''}"`
    : ''

  const eventContext = selectedEvent
    ? `\nFeatured Event: ${(selectedEvent as AurovilleEvent).title}
Date: ${(selectedEvent as AurovilleEvent).date}${(selectedEvent as AurovilleEvent).time ? ` at ${(selectedEvent as AurovilleEvent).time}` : ''}
Description: ${(selectedEvent as AurovilleEvent).description}`
    : ''

  const imageContent = basePhotoUrl
    ? [{ type: 'image' as const, source: { type: 'url' as const, url: basePhotoUrl } }]
    : []

  const anthropic = getAnthropicClient()
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Write an Instagram caption for this hospitality property.

Property: ${client.name}
Type: ${client.property_type}
Location: ${client.location}
Tone: ${client.tone}
Target Guests: ${client.target_guests}
USP: ${client.usp}
${client.amenities?.length ? `Amenities: ${client.amenities.join(', ')}` : ''}${reviewContext}${eventContext}
${customInstruction ? `\nSpecial Instructions: ${customInstruction}` : ''}
${client.custom_requirements ? `\nRequirements: ${client.custom_requirements}` : ''}

Write an engaging caption (100-150 words) that:
- Opens with a compelling hook
- Highlights what makes this experience special
- Matches the ${client.tone} tone
- Ends with a clear call-to-action
- Feels authentic, not corporate

Then provide 20-25 relevant hashtags on a new line.

Format:
[CAPTION]
caption text here

[HASHTAGS]
#hashtag1 #hashtag2 ...`,
          },
        ],
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('No text response')

  const captionMatch = content.text.match(/\[CAPTION\]\s*([\s\S]*?)\[HASHTAGS\]/i)
  const hashtagMatch = content.text.match(/\[HASHTAGS\]\s*([\s\S]*?)$/i)

  const caption = captionMatch?.[1]?.trim() ?? content.text.trim()
  const hashtags = hashtagMatch?.[1]?.trim() ?? ''

  const costUsd = estimateCost(message.usage.input_tokens, message.usage.output_tokens)

  // Update post record if provided
  if (postId) {
    await supabase.from('posts').update({ caption, hashtags }).eq('id', postId)
  }

  await logCost({ userId: user.id, clientId, postId, service: 'caption_generation', model: CLAUDE_MODEL, costUsd })

  return NextResponse.json({ caption, hashtags, cost_usd: costUsd })
}

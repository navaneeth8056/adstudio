import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, CLAUDE_MODEL, estimateCost } from '@/lib/anthropic'
import { getPlaceReviews, getPlaceDetails } from '@/lib/google-maps'
import { logCost } from '@/lib/cost-logger'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, placeId } = await req.json()
  if (!placeId) return NextResponse.json({ error: 'placeId is required' }, { status: 400 })

  try {
    const [reviews, place] = await Promise.all([
      getPlaceReviews(placeId),
      getPlaceDetails(placeId),
    ])

    if (!reviews.length) {
      return NextResponse.json({ error: 'No reviews found for this place' }, { status: 404 })
    }

    const reviewText = reviews
      .map((r, i) => `Review ${i + 1} (${r.rating}★): ${r.text}`)
      .join('\n\n')

    const anthropic = getAnthropicClient()
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are an expert hospitality marketing analyst. Analyze these Google Reviews for "${place.name}" and extract insights for Instagram ad creation.

REVIEWS:
${reviewText}

Respond with ONLY valid JSON in this exact structure:
{
  "highlights": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "top_quotes": ["quote1", "quote2", "quote3"],
  "ad_angles": ["angle1", "angle2", "angle3", "angle4"],
  "summary": "2-3 sentence marketing summary"
}`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    // Strip markdown fences if Claude wrapped the JSON
    let rawText = content.text.trim()
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) rawText = fenceMatch[1].trim()
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse JSON from Claude response')

    const parsed = JSON.parse(jsonMatch[0])
    const costUsd = estimateCost(message.usage.input_tokens, message.usage.output_tokens)

    const reviewSummary = {
      rating: place.rating ?? 0,
      review_count: place.totalRatings ?? reviews.length,
      ...parsed,
      cost_usd: costUsd,
      generated_at: new Date().toISOString(),
    }

    // Persist to client record
    if (clientId) {
      await supabase
        .from('clients')
        .update({ review_summary: reviewSummary })
        .eq('id', clientId)
        .eq('user_id', user.id)

      await logCost({
        userId: user.id,
        clientId,
        service: 'review_summary',
        model: CLAUDE_MODEL,
        costUsd,
      })
    }

    return NextResponse.json(reviewSummary)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

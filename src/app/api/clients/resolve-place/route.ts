import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePlaceFromUrl, getFullPlaceData } from '@/lib/google-maps'
import { getAnthropicClient, CLAUDE_MODEL, estimateCost } from '@/lib/anthropic'
import { logCost } from '@/lib/cost-logger'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { googleMapsUrl, googleSearchUrl, clientId } = await req.json()
  if (!googleMapsUrl) return NextResponse.json({ error: 'googleMapsUrl is required' }, { status: 400 })

  try {
    // Step 1: Resolve URL → basic place details + placeId
    const place = await resolvePlaceFromUrl(googleMapsUrl)

    // Step 2: Fetch full place data (reviews, website, amenity types, description)
    let fullData: Awaited<ReturnType<typeof getFullPlaceData>> | null = null
    if (place.placeId) {
      try {
        fullData = await getFullPlaceData(place.placeId)
      } catch (e) {
        console.warn('[resolve-place] Could not fetch full place data:', e)
      }
    }

    // Step 3: Optionally fetch the user-supplied reference URL (search result, website, etc.)
    let extraContext: string | null = null
    if (googleSearchUrl) {
      extraContext = await fetchPageText(googleSearchUrl)
    }

    // Step 4: One Claude call → profile + structured review summary
    const { profile, reviewSummary, usage } = await analyzeWithClaude(place, fullData, extraContext)

    const costUsd = estimateCost(usage.input_tokens, usage.output_tokens)

    // Build the final review_summary payload (only if we have something useful to show)
    const reviewCount = fullData?.reviews?.length ?? 0
    const hasReviewInsight =
      reviewCount > 0 ||
      (reviewSummary?.highlights?.length ?? 0) > 0 ||
      (reviewSummary?.top_quotes?.length ?? 0) > 0

    const finalReviewSummary = hasReviewInsight
      ? {
          rating: place.rating ?? 0,
          review_count: place.totalRatings ?? reviewCount,
          highlights: reviewSummary?.highlights ?? [],
          top_quotes: reviewSummary?.top_quotes ?? [],
          ad_angles: reviewSummary?.ad_angles ?? [],
          summary: reviewSummary?.summary ?? '',
          cost_usd: costUsd,
          generated_at: new Date().toISOString(),
        }
      : null

    // Log cost (best-effort, non-fatal)
    await logCost({
      userId: user.id,
      clientId: clientId ?? undefined,
      service: 'review_summary',
      model: CLAUDE_MODEL,
      costUsd,
      metadata: {
        place_id: place.placeId || null,
        had_search_url: Boolean(googleSearchUrl),
        review_count: reviewCount,
      },
    })

    return NextResponse.json({
      // Base place fields
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      totalRatings: place.totalRatings,
      propertyType: place.propertyType,
      website: fullData?.website,
      phone: fullData?.phone,
      // AI-enriched profile fields
      ...profile,
      // Structured review summary (or null if there was nothing to summarise)
      review_summary: finalReviewSummary,
    })
  } catch (err) {
    console.error('[resolve-place] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiProfile {
  tone: string
  target_guests: string
  amenities: string[]
  usp: string
  custom_requirements: string
}

interface AiReviewSummary {
  highlights: string[]
  top_quotes: string[]
  ad_angles: string[]
  summary: string
}

interface AnalysisResult {
  profile: AiProfile
  reviewSummary: AiReviewSummary
  usage: { input_tokens: number; output_tokens: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch a URL and reduce its HTML to plain readable text.
 * Strips scripts/styles/tags, collapses whitespace, truncates to a budget.
 * Returns null on failure (non-fatal).
 */
async function fetchPageText(url: string, maxChars = 12_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; AdStudio/1.0; +https://example.com/bot)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      // Cap the wait so a slow page can't stall the whole flow
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      console.warn('[resolve-place] reference URL returned', res.status)
      return null
    }
    const html = await res.text()

    const text = html
      // Drop big non-content blocks
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      // Strip remaining tags
      .replace(/<[^>]+>/g, ' ')
      // Decode the few entities that show up most often
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) return null
    return text.length > maxChars ? text.slice(0, maxChars) + '…' : text
  } catch (e) {
    console.warn('[resolve-place] Could not fetch reference URL:', e)
    return null
  }
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

async function analyzeWithClaude(
  place: Awaited<ReturnType<typeof resolvePlaceFromUrl>>,
  fullData: Awaited<ReturnType<typeof getFullPlaceData>> | null,
  extraContext: string | null,
): Promise<AnalysisResult> {
  const anthropic = getAnthropicClient()

  const reviewsText = fullData?.reviews?.length
    ? fullData.reviews
        .map((r, i) => `Review ${i + 1} (${r.rating}★): ${r.text}`)
        .join('\n\n')
    : 'No reviews available — infer from property name and location context.'

  const extraSection = extraContext
    ? `\n\nADDITIONAL CONTEXT (from user-supplied reference URL — could be a Google search result page, the property's own website, a listing, etc. Use whatever is relevant; ignore navigation/boilerplate):\n${extraContext}\n`
    : ''

  const prompt = `You are an expert hospitality marketing consultant. Analyze this property and create a detailed marketing profile AND a structured review summary in a single response.

PROPERTY INFORMATION:
- Name: ${place.name}
- Type: ${place.propertyType}
- Location: ${place.address}
- Rating: ${place.rating ?? 'N/A'} (${place.totalRatings ?? 0} reviews)
- Website: ${fullData?.website ?? 'N/A'}
- Price Level: ${fullData?.priceLevel ? '$'.repeat(fullData.priceLevel) : 'N/A'}
- Business Types: ${fullData?.types?.join(', ') ?? 'N/A'}
- Opening Hours: ${fullData?.openingHours?.join(', ') ?? 'N/A'}

GOOGLE REVIEWS:
${reviewsText}

EDITORIAL SUMMARY:
${fullData?.editorialSummary ?? 'Not available.'}${extraSection}

Based on everything above (plus your knowledge of similar properties in this region/type when data is limited), produce a comprehensive marketing profile and a structured review summary. Be specific and actionable. Avoid generic phrases. If the additional context contradicts or extends the Google data, prefer the most plausible synthesis.

Respond ONLY with valid JSON in this exact format:
{
  "profile": {
    "tone": "one of: warm and inviting | luxurious | spiritual | adventurous | eco-conscious | minimalist | boutique | romantic | family-friendly | wellness-focused",
    "target_guests": "specific description of ideal guests",
    "amenities": ["list", "of", "specific", "amenities"],
    "usp": "1-2 sentence unique selling proposition",
    "custom_requirements": "specific instructions for AI ad generation based on this property's character"
  },
  "review_summary": {
    "highlights": ["short tag 1", "short tag 2", "short tag 3", "short tag 4", "short tag 5"],
    "top_quotes": ["verbatim or lightly-trimmed quote 1", "quote 2", "quote 3"],
    "ad_angles": ["compelling ad angle 1", "ad angle 2", "ad angle 3", "ad angle 4"],
    "summary": "2-3 sentence marketing summary grounded in the reviews and context"
  }
}

If there are no reviews at all, still fill review_summary with sensible inferences from the property name, type, location, and any additional context — and keep top_quotes as an empty array rather than fabricating quotes.`

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('No response from Claude')

  let rawText = content.text.trim()
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) rawText = fenceMatch[1].trim()

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse Claude response')

  const parsed = JSON.parse(jsonMatch[0]) as {
    profile?: Partial<AiProfile>
    review_summary?: Partial<AiReviewSummary>
  }

  return {
    profile: {
      tone: parsed.profile?.tone ?? '',
      target_guests: parsed.profile?.target_guests ?? '',
      amenities: parsed.profile?.amenities ?? [],
      usp: parsed.profile?.usp ?? '',
      custom_requirements: parsed.profile?.custom_requirements ?? '',
    },
    reviewSummary: {
      highlights: parsed.review_summary?.highlights ?? [],
      top_quotes: parsed.review_summary?.top_quotes ?? [],
      ad_angles: parsed.review_summary?.ad_angles ?? [],
      summary: parsed.review_summary?.summary ?? '',
    },
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  }
}

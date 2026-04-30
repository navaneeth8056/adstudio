import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePlaceFromUrl, getFullPlaceData } from '@/lib/google-maps'
import { getAnthropicClient, CLAUDE_MODEL } from '@/lib/anthropic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { googleMapsUrl } = await req.json()
  if (!googleMapsUrl) return NextResponse.json({ error: 'googleMapsUrl is required' }, { status: 400 })

  try {
    // Step 1: Resolve URL → basic place details + placeId
    const place = await resolvePlaceFromUrl(googleMapsUrl)

    // Step 2: Fetch full place data (reviews, website, amenity types, description)
    // Only possible if Google Places API is enabled and we have a placeId
    let fullData: Awaited<ReturnType<typeof getFullPlaceData>> | null = null
    if (place.placeId) {
      try {
        fullData = await getFullPlaceData(place.placeId)
      } catch (e) {
        console.warn('[resolve-place] Could not fetch full place data:', e)
      }
    }

    // Step 3: Claude analyzes everything and fills in the business profile
    // Works even without Google reviews — Claude uses name, location, and property type
    const aiProfile = await analyzeWithClaude(place, fullData)

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
      // AI-enriched fields
      ...(aiProfile ?? {}),
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
  review_highlights: string[]
  ad_angles: string[]
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

async function analyzeWithClaude(
  place: Awaited<ReturnType<typeof resolvePlaceFromUrl>>,
  fullData: Awaited<ReturnType<typeof getFullPlaceData>> | null
): Promise<AiProfile> {
  const anthropic = getAnthropicClient()

  const reviewsText = fullData?.reviews?.length
    ? fullData.reviews
        .map((r, i) => `Review ${i + 1} (${r.rating}★): ${r.text}`)
        .join('\n\n')
    : 'No reviews available — infer from property name and location context.'

  const prompt = `You are an expert hospitality marketing consultant. Analyze this property and create a detailed marketing profile.

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
${fullData?.editorialSummary ?? 'Not available.'}

Based on the above information (and your knowledge of similar properties in this region/type if data is limited), create a comprehensive marketing profile. Be specific and actionable — use the property name, location, and type to make educated inferences where reviews are unavailable. Avoid generic phrases.

Respond ONLY with valid JSON in this exact format:
{
  "tone": "one of: warm and inviting | luxurious | spiritual | adventurous | eco-conscious | minimalist | boutique | romantic | family-friendly | wellness-focused",
  "target_guests": "specific description of ideal guests (e.g. 'Wellness seekers and yoga practitioners looking for a peaceful Auroville retreat')",
  "amenities": ["list", "of", "specific", "amenities", "mentioned", "in", "reviews", "or", "inferred", "from", "type"],
  "usp": "1-2 sentence unique selling proposition that differentiates this property from competitors",
  "custom_requirements": "specific instructions for AI ad generation based on this property's character (e.g. always highlight X, avoid Y, mention Z)",
  "review_highlights": ["key positive theme 1", "key positive theme 2", "key positive theme 3"],
  "ad_angles": ["compelling ad angle 1 based on reviews", "ad angle 2", "ad angle 3"]
}`

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('No response from Claude')

  let rawText = content.text.trim()
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) rawText = fenceMatch[1].trim()

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse Claude response')

  return JSON.parse(jsonMatch[0]) as AiProfile
}

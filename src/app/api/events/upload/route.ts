import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient } from '@/lib/anthropic'
import { geocodeAddress } from '@/lib/google-maps'
import { logCost } from '@/lib/cost-logger'
import pdfParse from 'pdf-parse'

// Use Haiku for structured extraction — fast, cheap, high rate limits
const EXTRACT_MODEL = 'claude-haiku-4-5-20251001'

// POST /api/events/upload
// 1. pdf-parse extracts raw text (no tokens used)
// 2. Claude Haiku structures it into events JSON (low token count)
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pdfBase64, replaceExisting } = await req.json()
  if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 required' }, { status: 400 })

  try {
    // ── Step 1: Extract raw text from PDF (zero API tokens) ──────────────────
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    let pdfText = ''
    try {
      const parsed = await pdfParse(pdfBuffer)
      pdfText = parsed.text
    } catch (e) {
      throw new Error(`PDF text extraction failed: ${String(e)}`)
    }

    if (!pdfText || pdfText.trim().length < 50) {
      throw new Error('Could not extract readable text from this PDF. It may be image-based — try a text-based PDF.')
    }

    // Trim to avoid hitting token limits — newsletters are rarely over 15k chars
    const trimmedText = pdfText.slice(0, 15000)

    // ── Step 2: Claude Haiku structures the text into events ─────────────────
    const anthropic = getAnthropicClient()

    const today = new Date().toISOString().split('T')[0] // e.g. 2026-04-27

    const message = await anthropic.messages.create({
      model: EXTRACT_MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `Extract all events from this community newsletter. Today is ${today}.

<newsletter_text>
${trimmedText}
</newsletter_text>

DATE RULES (critical):
- Today is ${today}. Use this to resolve all relative or partial dates.
- "Monday" or "Tuesday" → calculate the actual YYYY-MM-DD date of the nearest upcoming occurrence from today
- "April 27" or "27th" → combine with the current or next logical year to get YYYY-MM-DD
- "this week" / "next week" → use the specific day if mentioned, else the Monday of that week
- Date ranges (e.g. "Apr 27–May 3") → use the START date
- Recurring weekly events → use the next upcoming occurrence from today
- Only use null if there is truly NO date or time information at all
- NEVER default to 2026-01-01 — always derive the real date

OUTPUT RULES:
- Return ONLY a raw JSON array — no markdown, no code fences, no explanation
- Keep descriptions to 1 short sentence to save space
- guest_relevance: max 2 items

[{"title":"str","category":"yoga|wellness|culture|music|arts|workshop|market|spirituality|food|nature|festival|other","date":"YYYY-MM-DD or null","time":"HH:MM or null","location":"str","description":"str","guest_relevance":["str"]}]`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('No text response from Claude')

    const inputTokens  = message.usage.input_tokens
    const outputTokens = message.usage.output_tokens
    // Haiku pricing: $0.80/M input, $4/M output
    const costUsd = (inputTokens / 1_000_000) * 0.80 + (outputTokens / 1_000_000) * 4.0
    await logCost({ userId: user.id, service: 'event_extraction', model: EXTRACT_MODEL, costUsd })

    // ── Step 3: Parse JSON ────────────────────────────────────────────────────
    let rawText = content.text.trim()
    // Strip markdown fences if present
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) rawText = fenceMatch[1].trim()

    let rawEvents: Record<string, unknown>[] = []
    // Match the array — allow for truncated output (no closing bracket)
    const jsonMatch = rawText.match(/\[[\s\S]*/)
    if (!jsonMatch) {
      console.error('[events/upload] Claude raw response:', rawText.slice(0, 800))
      throw new Error('Claude did not return a valid JSON array.')
    }

    let jsonStr = jsonMatch[0]

    // First try parsing as-is
    try {
      // If it ends with `]` it's complete
      rawEvents = JSON.parse(jsonStr)
    } catch {
      // Output was likely truncated — salvage all complete event objects
      // Find the last complete `}` and close the array there
      const lastClose = jsonStr.lastIndexOf('},')
      if (lastClose !== -1) {
        jsonStr = jsonStr.slice(0, lastClose + 1) + ']'
      } else {
        // Try finding any complete closing brace
        const anyClose = jsonStr.lastIndexOf('}')
        if (anyClose !== -1) {
          jsonStr = jsonStr.slice(0, anyClose + 1) + ']'
        }
      }
      try {
        rawEvents = JSON.parse(jsonStr)
        console.log(`[events/upload] Recovered ${rawEvents.length} events from truncated JSON`)
      } catch (parseErr) {
        console.error('[events/upload] JSON parse error after repair attempt:', parseErr)
        console.error('[events/upload] JSON snippet around error:', jsonStr.slice(14000, 14300))
        throw new Error('Failed to parse events JSON from Claude response.')
      }
    }

    if (rawEvents.length === 0) {
      return NextResponse.json({ error: 'No events found in the PDF. Make sure it contains event listings.' }, { status: 422 })
    }

    // ── Step 4: Geocode locations ─────────────────────────────────────────────
    const enriched = await Promise.all(
      rawEvents.map(async (e) => {
        let lat: number | null = null
        let lng: number | null = null
        let geocode_source: string | null = null

        if (e.location && typeof e.location === 'string') {
          try {
            const coords = await geocodeAddress(`${e.location}, Auroville, Tamil Nadu, India`)
            if (coords) {
              lat = coords.lat
              lng = coords.lng
              geocode_source = 'google'
            }
          } catch { /* skip geocoding failures silently */ }
        }

        return {
          title:             String(e.title ?? ''),
          category:          String(e.category ?? 'other'),
          date:              e.date ? String(e.date) : null,
          time:              e.time ? String(e.time) : null,
          location:          String(e.location ?? ''),
          description:       String(e.description ?? ''),
          guest_relevance:   Array.isArray(e.guest_relevance) ? e.guest_relevance : [],
          lat,
          lng,
          coords_calibrated: false,
          geocode_source,
        }
      })
    )

    // ── Step 5: Save to DB ────────────────────────────────────────────────────
    if (replaceExisting) {
      await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }

    const { error: insertError } = await supabase.from('events').insert(enriched)
    if (insertError) throw new Error(insertError.message)

    return NextResponse.json({
      count:        enriched.length,
      cost_usd:     costUsd,
      chars_parsed: trimmedText.length,
    })

  } catch (err) {
    console.error('[events/upload] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

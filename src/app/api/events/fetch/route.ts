import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, CLAUDE_MODEL, estimateCost } from '@/lib/anthropic'
import { geocodeAddress } from '@/lib/google-maps'
import { logCost } from '@/lib/cost-logger'

const AUROVILLE_NEWS_URL = 'https://auroville.org/page/news-notes' // News & Notes PDF page

// GET — return cached events
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true })

  return NextResponse.json(data || [])
}

// DELETE — clear all events
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  return NextResponse.json({ success: true })
}

// POST — SSE stream: fetch PDF → extract events via Claude (legacy, kept for reference)
export async function POST(req: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const forceRefresh = body.forceRefresh === true

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  function send(event: string, data: unknown) {
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  }

  // Run async in background
  ;(async () => {
    try {
      const supabase = await createClient()

      if (!forceRefresh) {
        // Check if we have events from today
        const today = new Date().toISOString().split('T')[0]
        const { count } = await supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', today)

        if ((count ?? 0) > 0) {
          send('progress', { step: 'Using cached events', percent: 100 })
          send('done', { message: 'Using cached events' })
          await writer.close()
          return
        }
      }

      send('progress', { step: 'Fetching Auroville News & Notes…', percent: 10 })

      // Fetch PDF listing page to find latest PDF
      const pageHtml = await fetch(AUROVILLE_NEWS_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then((r) => r.text())

      // Try to find PDF link — handle absolute and relative URLs
      let pdfUrl: string | null = null
      const absoluteMatch = pageHtml.match(/href="(https?:\/\/[^"]+\.pdf)"/i)
      const relativeMatch = pageHtml.match(/href="(\/[^"]+\.pdf)"/i)
      if (absoluteMatch) {
        pdfUrl = absoluteMatch[1]
      } else if (relativeMatch) {
        pdfUrl = `https://auroville.org${relativeMatch[1]}`
      }

      // Log the page snippet to help debug if still failing
      if (!pdfUrl) {
        const snippet = pageHtml.slice(0, 2000)
        console.error('[events/fetch] PDF not found. Page snippet:', snippet)
        throw new Error('Could not find News & Notes PDF link on the page. Check server logs for page content.')
      }

      send('progress', { step: 'Downloading PDF…', percent: 20 })
      const pdfBuffer = await fetch(pdfUrl).then((r) => r.arrayBuffer())
      const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

      send('progress', { step: 'Extracting events with Claude…', percent: 40 })

      const anthropic = getAnthropicClient()
      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
              },
              {
                type: 'text',
                text: `Extract ALL events and activities from this Auroville News & Notes PDF. For each event, identify: title, date (YYYY-MM-DD), time, location within Auroville, description, category, and which type of guests would enjoy it.

Categories: yoga, wellness, culture, music, arts, workshop, market, spirituality, food, nature, festival, other

Respond with ONLY a JSON array:
[{
  "title": "string",
  "category": "yoga|wellness|culture|music|arts|workshop|market|spirituality|food|nature|festival|other",
  "date": "YYYY-MM-DD",
  "time": "HH:MM or null",
  "location": "place name in Auroville",
  "description": "2-3 sentences",
  "guest_relevance": ["type1", "type2"]
}]`,
              },
            ],
          },
        ],
      })

      const content = message.content[0]
      if (content.type !== 'text') throw new Error('No text response')

      const costUsd = estimateCost(message.usage.input_tokens, message.usage.output_tokens)
      await logCost({ userId: user.id, service: 'event_extraction', model: CLAUDE_MODEL, costUsd })

      send('progress', { step: 'Parsing events…', percent: 60 })

      let events: Record<string, unknown>[] = []
      try {
        const jsonMatch = content.text.match(/\[[\s\S]*\]/)
        events = jsonMatch ? JSON.parse(jsonMatch[0]) : []
      } catch {
        throw new Error('Failed to parse events JSON')
      }

      send('progress', { step: `Geocoding ${events.length} locations…`, percent: 70 })

      // Clear old events and insert fresh
      await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      const enriched = await Promise.all(
        events.map(async (e) => {
          let lat: number | null = null
          let lng: number | null = null
          let geocode_source: string | null = null

          try {
            const coords = await geocodeAddress(`${e.location}, Auroville, Tamil Nadu, India`)
            if (coords) {
              lat = coords.lat
              lng = coords.lng
              geocode_source = 'google'
            }
          } catch { /* skip geocoding failures */ }

          return {
            title: e.title,
            category: e.category,
            date: e.date,
            time: e.time || null,
            location: e.location,
            description: e.description,
            guest_relevance: e.guest_relevance || [],
            lat,
            lng,
            coords_calibrated: false,
            geocode_source,
          }
        })
      )

      send('progress', { step: 'Saving events…', percent: 90 })
      const { error } = await supabase.from('events').insert(enriched)
      if (error) throw error

      send('progress', { step: 'Done!', percent: 100 })
      send('done', { count: enriched.length, cost: costUsd })
    } catch (err) {
      send('error', { message: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

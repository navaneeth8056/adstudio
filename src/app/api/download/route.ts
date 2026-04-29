import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/download?url=<encoded>&filename=<encoded>
// Server-side proxy to bypass CORS on Supabase storage downloads
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  const filename = searchParams.get('filename') ?? 'image.jpg'

  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)

    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { autocompletePlaces } from '@/lib/google-maps'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')
  if (!q) return NextResponse.json([])

  try {
    const results = await autocompletePlaces(q + ' Auroville')
    return NextResponse.json(results)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

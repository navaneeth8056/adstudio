import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId, lat, lng, locationName } = await req.json()
  if (!eventId || !lat || !lng) {
    return NextResponse.json({ error: 'eventId, lat, lng required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('events')
    .update({ lat, lng, location_resolved: locationName, coords_calibrated: true, geocode_source: 'google' })
    .eq('id', eventId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

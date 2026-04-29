import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getPlacePhotos } from '@/lib/google-maps'
import type { Client } from '@/types'

// POST /api/photos/import-google
// Fetches up to 10 photos from Google Places and saves them to Supabase storage
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, maxPhotos = 10 } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // Fetch client to get google_place_id
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single() as { data: Client }

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.google_place_id) {
    return NextResponse.json({ error: 'This client has no Google Place ID. Use Auto-fill on the client profile first.' }, { status: 400 })
  }

  // Ensure a "Google Places" folder exists for this client
  let folderId: string | null = null
  const { data: existing } = await supabase
    .from('folders')
    .select('id')
    .eq('client_id', clientId)
    .eq('name', 'Google Places')
    .single()

  if (existing) {
    folderId = existing.id
  } else {
    const { data: newFolder } = await supabase
      .from('folders')
      .insert({ client_id: clientId, name: 'Google Places' })
      .select('id')
      .single()
    folderId = newFolder?.id ?? null
  }

  // Get photo URLs from Google Places API
  let photoUrls: string[] = []
  try {
    photoUrls = await getPlacePhotos(client.google_place_id, maxPhotos)
  } catch (e) {
    return NextResponse.json({ error: `Google Places API error: ${String(e)}` }, { status: 500 })
  }

  if (photoUrls.length === 0) {
    return NextResponse.json({ error: 'No photos found for this place on Google.' }, { status: 404 })
  }

  // Download each photo and upload to Supabase storage
  const service = createServiceClient()
  const imported: { url: string; filename: string }[] = []
  const failed: string[] = []

  for (let i = 0; i < photoUrls.length; i++) {
    const photoUrl = photoUrls[i]
    try {
      const res = await fetch(photoUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') ?? 'image/jpeg'
      const ext = contentType.includes('png') ? 'png' : 'jpg'
      const filename = `google-places-${i + 1}.${ext}`
      const storagePath = `${user.id}/${clientId}/google-${Date.now()}-${i + 1}.${ext}`

      const { error: uploadError } = await service.storage
        .from('property-photos')
        .upload(storagePath, buffer, { contentType, upsert: false })

      if (uploadError) throw new Error(uploadError.message)

      const { data: urlData } = service.storage.from('property-photos').getPublicUrl(storagePath)

      await supabase.from('photos').insert({
        client_id: clientId,
        folder_id: folderId,
        filename,
        public_url: urlData.publicUrl,
        size_bytes: buffer.byteLength,
      })

      imported.push({ url: urlData.publicUrl, filename })
    } catch (e) {
      console.warn(`[import-google] Failed to import photo ${i + 1}:`, e)
      failed.push(`Photo ${i + 1}`)
    }
  }

  return NextResponse.json({
    imported: imported.length,
    failed: failed.length,
    folderId,
    message: `Imported ${imported.length} photo${imported.length !== 1 ? 's' : ''} from Google Places.${failed.length > 0 ? ` ${failed.length} failed.` : ''}`,
  })
}

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// GET /api/photos?clientId=xxx
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const [{ data: folders }, { data: photos }] = await Promise.all([
    supabase.from('folders').select('*').eq('client_id', clientId),
    supabase.from('photos').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ folders: folders || [], photos: photos || [] })
}

// POST /api/photos — upload
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, folderId, filename, dataUrl } = await req.json()
  if (!clientId || !filename || !dataUrl) {
    return NextResponse.json({ error: 'clientId, filename, dataUrl required' }, { status: 400 })
  }

  // Convert base64 data URL to buffer
  const base64 = dataUrl.split(',')[1]
  const buffer = Buffer.from(base64, 'base64')
  const mimeMatch = dataUrl.match(/data:([^;]+);/)
  const contentType = mimeMatch?.[1] ?? 'image/jpeg'
  const ext = contentType.split('/')[1] || 'jpg'
  const path = `${user.id}/${clientId}/${Date.now()}-${filename.replace(/\s/g, '_')}.${ext}`

  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('property-photos')
    .upload(path, buffer, { contentType, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = service.storage.from('property-photos').getPublicUrl(path)

  const { data: photo, error: dbError } = await supabase
    .from('photos')
    .insert({
      client_id: clientId,
      folder_id: folderId || null,
      filename,
      public_url: urlData.publicUrl,
      size_bytes: buffer.byteLength,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(photo, { status: 201 })
}

// DELETE /api/photos?id=xxx
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('photos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

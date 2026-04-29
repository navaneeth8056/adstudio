import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getAnthropicClient, CLAUDE_MODEL, estimateCost } from '@/lib/anthropic'
import { generateImage, REPLICATE_COST_PER_IMAGE } from '@/lib/replicate'
import { logCost } from '@/lib/cost-logger'
import type { Client, AurovilleEvent, AdLabels } from '@/types'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, postId, basePhotoUrl, labels, selectedEvent } = await req.json()
  if (!clientId || !basePhotoUrl) {
    return NextResponse.json({ error: 'clientId and basePhotoUrl required' }, { status: 400 })
  }

  // Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single() as { data: Client }

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Build FLUX prompt using Claude
  const anthropic = getAnthropicClient()
  const promptMessage = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: basePhotoUrl },
          },
          {
            type: 'text',
            text: `You are an expert at writing FLUX image generation prompts for luxury hospitality Instagram ads.

Property: ${client.name}
Type: ${client.property_type}
Location: ${client.location}
Tone: ${client.tone}
USP: ${client.usp}
${selectedEvent ? `\nFeatured Event: ${(selectedEvent as AurovilleEvent).title} — ${(selectedEvent as AurovilleEvent).description}` : ''}
${client.custom_requirements ? `\nRequirements: ${client.custom_requirements}` : ''}

Based on this base photo, write a FLUX prompt that:
- Enhances the existing scene (don't replace it entirely)
- Adds warm, golden-hour lighting appropriate for Instagram
- Makes it look editorial and aspirational
- Matches the ${client.tone} tone
- Keeps it photorealistic

Output ONLY the prompt text, nothing else. Max 150 words.`,
          },
        ],
      },
    ],
  })

  const promptContent = promptMessage.content[0]
  if (promptContent.type !== 'text') throw new Error('No prompt generated')
  const fluxPrompt = promptContent.text.trim()

  const promptCost = estimateCost(promptMessage.usage.input_tokens, promptMessage.usage.output_tokens)

  // Generate image with Replicate
  const image = await generateImage(fluxPrompt)
  const totalCost = promptCost + REPLICATE_COST_PER_IMAGE

  // Download and store in Supabase
  const imageBuffer = await fetch(image.url).then((r) => r.arrayBuffer())
  const imagePath = `${user.id}/${clientId}/${Date.now()}-generated.jpg`
  const service = createServiceClient()

  await service.storage
    .from('generated-images')
    .upload(imagePath, imageBuffer, { contentType: 'image/jpeg' })

  const { data: urlData } = service.storage.from('generated-images').getPublicUrl(imagePath)
  const generatedUrl = urlData.publicUrl

  // Upsert post record
  const labelsData = labels as AdLabels | undefined
  const postPayload = {
    user_id: user.id,
    client_id: clientId,
    base_photo_url: basePhotoUrl,
    generated_image_url: generatedUrl,
    flux_prompt: fluxPrompt,
    labels: labelsData || {
      property_name: client.name,
      location: client.location,
      hook: 'Your escape awaits',
      body: 'Experience something truly special.',
      cta: 'Book Now · DM Us',
      stars: Math.round(client.review_summary?.rating ?? 4),
    },
    status: 'draft',
    api_cost_usd: totalCost,
  }

  let savedPostId = postId
  if (postId) {
    await supabase.from('posts').update(postPayload).eq('id', postId)
  } else {
    const { data } = await supabase.from('posts').insert(postPayload).select('id').single()
    savedPostId = data?.id
  }

  await logCost({
    userId: user.id,
    clientId,
    postId: savedPostId,
    service: 'image_generation',
    costUsd: totalCost,
  })

  return NextResponse.json({
    generated_url: generatedUrl,
    flux_prompt: fluxPrompt,
    post_id: savedPostId,
    cost_usd: totalCost,
  })
}

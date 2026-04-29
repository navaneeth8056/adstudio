const REPLICATE_API_URL = 'https://api.replicate.com/v1'

function key() {
  if (!process.env.REPLICATE_API_KEY) {
    throw new Error('REPLICATE_API_KEY environment variable is not set')
  }
  return process.env.REPLICATE_API_KEY
}

// FLUX 1.1 Pro on Replicate
export const REPLICATE_MODEL = 'black-forest-labs/flux-1.1-pro'
export const REPLICATE_COST_PER_IMAGE = 0.04

export interface ReplicateImageResult {
  url: string
}

/** Run a Replicate model and poll until completion */
export async function generateImage(prompt: string): Promise<ReplicateImageResult> {
  // Start prediction
  const createRes = await fetch(`${REPLICATE_API_URL}/models/${REPLICATE_MODEL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      Prefer: 'wait', // wait up to 60s for result in one request
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: '1:1',
        output_format: 'jpg',
        output_quality: 90,
        safety_tolerance: 2,
        prompt_upsampling: true,
      },
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.json()
    throw new Error(`Replicate error: ${err.detail ?? JSON.stringify(err)}`)
  }

  let prediction = await createRes.json()

  // If not done yet (Prefer: wait timed out), poll manually
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise((r) => setTimeout(r, 2000))
    const pollRes = await fetch(`${REPLICATE_API_URL}/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${key()}` },
    })
    prediction = await pollRes.json()
  }

  if (prediction.status === 'failed') {
    throw new Error(`Replicate prediction failed: ${prediction.error ?? 'unknown error'}`)
  }

  const output = prediction.output
  const url = Array.isArray(output) ? output[0] : output

  if (!url) throw new Error('No image URL returned from Replicate')
  return { url }
}

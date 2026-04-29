import * as fal from '@fal-ai/client'

let _configured = false

export function getFalClient() {
  if (!_configured) {
    if (!process.env.FAL_API_KEY) {
      throw new Error('FAL_API_KEY environment variable is not set')
    }
    fal.config({ credentials: process.env.FAL_API_KEY })
    _configured = true
  }
  return fal
}

export const FAL_MODEL = 'fal-ai/flux-pro/v1.1'
export const FAL_COST_PER_IMAGE = 0.05

export interface FalImageResult {
  url: string
  width: number
  height: number
}

export async function generateImage(prompt: string): Promise<FalImageResult> {
  const client = getFalClient()

  const result = await client.run(FAL_MODEL, {
    input: {
      prompt,
      image_size: 'square_hd',
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
    },
  }) as { images: FalImageResult[] }

  const image = result.images?.[0]
  if (!image?.url) throw new Error('No image returned from fal.ai')
  return image
}

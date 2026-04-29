import Anthropic from '@anthropic-ai/sdk'

// Singleton — re-used across API calls in the same process
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

export const CLAUDE_MODEL = 'claude-opus-4-6'

/** Estimate cost in USD from token counts (Claude Opus 4 pricing) */
export function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 15
  const outputCost = (outputTokens / 1_000_000) * 75
  return inputCost + outputCost
}

import { createServiceClient } from './supabase/server'
import type { CostService } from '@/types'

export interface LogCostParams {
  userId: string
  service: CostService
  costUsd: number
  clientId?: string
  postId?: string
  model?: string
  metadata?: Record<string, unknown>
}

/** Log an API cost to the api_costs table */
export async function logCost(params: LogCostParams): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('api_costs').insert({
      user_id: params.userId,
      client_id: params.clientId ?? null,
      post_id: params.postId ?? null,
      service: params.service,
      model: params.model ?? null,
      cost_usd: params.costUsd,
      metadata: params.metadata ?? null,
    })
  } catch (err) {
    // Non-fatal — don't break the main flow
    console.error('[cost-logger] Failed to log cost:', err)
  }
}

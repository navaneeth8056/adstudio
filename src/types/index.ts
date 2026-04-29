// ─── Client ──────────────────────────────────────────────────────────────────

export interface Client {
  id: string
  user_id: string
  name: string
  property_type: string
  location: string
  google_maps_url?: string
  google_place_id?: string
  lat?: number
  lng?: number
  event_radius: number
  tone: string
  target_guests: string
  amenities: string[]
  usp: string
  custom_requirements?: string
  instagram_handle?: string
  instagram_page_id?: string
  instagram_token?: string
  review_summary?: ReviewSummary
  created_at: string
  updated_at: string
}

export interface ReviewSummary {
  rating: number
  review_count: number
  highlights: string[]
  top_quotes: string[]
  ad_angles: string[]
  summary: string
  cost_usd?: number
  generated_at?: string
}

export type ClientInput = Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>

// ─── Photo ───────────────────────────────────────────────────────────────────

export interface Folder {
  id: string
  client_id: string
  name: string
  created_at: string
}

export interface Photo {
  id: string
  client_id: string
  folder_id?: string
  filename: string
  public_url: string
  size_bytes?: number
  created_at: string
}

// ─── Event ───────────────────────────────────────────────────────────────────

export type EventCategory =
  | 'yoga'
  | 'wellness'
  | 'culture'
  | 'music'
  | 'arts'
  | 'workshop'
  | 'market'
  | 'spirituality'
  | 'food'
  | 'nature'
  | 'festival'
  | 'other'

export interface AurovilleEvent {
  id: string
  title: string
  category: EventCategory
  date: string
  time?: string
  location: string
  location_resolved?: string
  lat?: number
  lng?: number
  description: string
  guest_relevance: string[]
  coords_calibrated: boolean
  geocode_source?: 'nominatim' | 'google'
  created_at: string
  // computed client-side
  distances?: Record<string, number>
}

// ─── Post ────────────────────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'approved' | 'published'

export interface AdLabels {
  property_name: string
  location: string
  hook: string
  body: string
  cta: string
  stars: number
}

export interface Post {
  id: string
  user_id: string
  client_id: string
  base_photo_url: string
  generated_image_url?: string
  caption?: string
  hashtags?: string
  status: PostStatus
  api_cost_usd: number
  flux_prompt?: string
  labels?: AdLabels
  instagram_post_id?: string
  created_at: string
  updated_at: string
  // joined
  client?: Pick<Client, 'id' | 'name' | 'instagram_handle'>
}

// ─── Cost Tracking ───────────────────────────────────────────────────────────

export type CostService =
  | 'image_generation'
  | 'caption_generation'
  | 'review_summary'
  | 'event_extraction'
  | 'google_maps'
  | 'other'

export interface ApiCost {
  id: string
  user_id: string
  client_id?: string
  post_id?: string
  service: CostService
  model?: string
  cost_usd: number
  metadata?: Record<string, unknown>
  created_at: string
}

// ─── Admin / Analytics ───────────────────────────────────────────────────────

export interface CostSummary {
  session: number
  today: number
  month: number
  all_time: number
}

export interface CostByService {
  service: CostService
  total: number
  count: number
}

export interface CostByClient {
  client_id: string
  client_name: string
  total_cost: number
  total_posts: number
  published_posts: number
  draft_posts: number
  approved_posts: number
  cost_per_post: number
  cost_per_published: number
}

export interface DailyCost {
  date: string
  total: number
}

export interface PostStats {
  total: number
  draft: number
  approved: number
  published: number
  avg_cost: number
}

export interface AdminDashboard {
  summary: CostSummary
  by_service: CostByService[]
  by_client: CostByClient[]
  daily: DailyCost[]
  post_stats: PostStats
  recent: (ApiCost & { client_name?: string })[]
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  details?: string
}

export interface GenerateImageResponse {
  generated_url: string
  flux_prompt: string
  post_id: string
  cost_usd: number
}

export interface GenerateCaptionResponse {
  caption: string
  hashtags: string
  cost_usd: number
}

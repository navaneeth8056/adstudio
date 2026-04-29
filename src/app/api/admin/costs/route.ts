import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: allCosts }, { data: clients }, { data: posts }] = await Promise.all([
    supabase.from('api_costs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').eq('user_id', user.id),
    supabase.from('posts').select('id, client_id, status, api_cost_usd').eq('user_id', user.id),
  ])

  const costs = allCosts ?? []
  const clientMap = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name]))

  const sum = (arr: { cost_usd: number }[]) => arr.reduce((a, c) => a + c.cost_usd, 0)

  // Summary
  const summary = {
    today: sum(costs.filter((c) => c.created_at >= todayStart)),
    month: sum(costs.filter((c) => c.created_at >= monthStart)),
    all_time: sum(costs),
    session: 0, // computed client-side
  }

  // By service
  const serviceGroups = costs.reduce((acc, c) => {
    const key = c.service
    if (!acc[key]) acc[key] = { service: key, total: 0, count: 0 }
    acc[key].total += c.cost_usd
    acc[key].count += 1
    return acc
  }, {} as Record<string, { service: string; total: number; count: number }>)
  const by_service = (Object.values(serviceGroups) as { service: string; total: number; count: number }[]).sort((a, b) => b.total - a.total)

  // By client
  const clientGroups = costs.reduce((acc, c) => {
    if (!c.client_id) return acc
    if (!acc[c.client_id]) acc[c.client_id] = { client_id: c.client_id, client_name: clientMap[c.client_id] ?? 'Unknown', total_cost: 0 }
    acc[c.client_id].total_cost += c.cost_usd
    return acc
  }, {} as Record<string, { client_id: string; client_name: string; total_cost: number }>)

  const by_client = (Object.values(clientGroups) as { client_id: string; client_name: string; total_cost: number }[]).map((g) => {
    const clientPosts = (posts ?? []).filter((p) => p.client_id === g.client_id)
    const published_posts = clientPosts.filter((p) => p.status === 'published').length
    return {
      ...g,
      total_posts: clientPosts.length,
      published_posts,
      draft_posts: clientPosts.filter((p) => p.status === 'draft').length,
      approved_posts: clientPosts.filter((p) => p.status === 'approved').length,
      cost_per_post: clientPosts.length ? g.total_cost / clientPosts.length : 0,
      cost_per_published: published_posts ? g.total_cost / published_posts : 0,
    }
  }).sort((a, b) => b.total_cost - a.total_cost)

  // Daily (last 30 days)
  const dailyMap: Record<string, number> = {}
  costs.filter((c) => c.created_at >= thirtyDaysAgo).forEach((c) => {
    const day = c.created_at.split('T')[0]
    dailyMap[day] = (dailyMap[day] ?? 0) + c.cost_usd
  })
  const daily = Object.entries(dailyMap).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date))

  // Post stats
  const allPosts = posts ?? []
  const post_stats = {
    total: allPosts.length,
    draft: allPosts.filter((p) => p.status === 'draft').length,
    approved: allPosts.filter((p) => p.status === 'approved').length,
    published: allPosts.filter((p) => p.status === 'published').length,
    avg_cost: allPosts.length ? allPosts.reduce((a, p) => a + p.api_cost_usd, 0) / allPosts.length : 0,
  }

  // Recent (last 30)
  const recent = costs.slice(0, 30).map((c) => ({
    ...c,
    client_name: c.client_id ? clientMap[c.client_id] : undefined,
  }))

  return NextResponse.json({ summary, by_service, by_client, daily, post_stats, recent })
}

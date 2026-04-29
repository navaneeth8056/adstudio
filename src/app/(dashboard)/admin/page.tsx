'use client'

import { useState, useEffect } from 'react'
import type { AdminDashboard, CostByClient } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/cn'

const SERVICE_COLORS: Record<string, string> = {
  image_generation: 'bg-blue',
  caption_generation: 'bg-green',
  review_summary: 'bg-gold',
  event_extraction: 'bg-teal',
  google_maps: 'bg-red',
  other: 'bg-muted',
}

const SERVICE_LABELS: Record<string, string> = {
  image_generation: 'Image Generation',
  caption_generation: 'Caption Generation',
  review_summary: 'Review Summary',
  event_extraction: 'Event Extraction',
  google_maps: 'Google Maps',
  other: 'Other',
}

export default function AdminPage() {
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/costs')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
  }, [])

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Spinner className="text-muted" /></div>
  }

  if (!data) return null

  const maxServiceCost = Math.max(...(data.by_service.map((s) => s.total)), 0.001)
  const maxDailyCost = Math.max(...(data.daily.map((d) => d.total)), 0.001)

  function EfficiencyBadge({ client }: { client: CostByClient }) {
    const cpp = client.cost_per_published
    if (cpp === 0) return <span className="text-muted text-[10px]">—</span>
    if (cpp < 0.10) return <span className="badge bg-green/10 text-green text-[10px]">✓ efficient</span>
    if (cpp > 0.20) return <span className="badge bg-red/10 text-red text-[10px]">⚠ costly</span>
    return <span className="badge bg-gold/10 text-gold text-[10px]">ok</span>
  }

  return (
    <div className="overflow-y-auto h-full p-6 space-y-6">
      <h2 className="text-sm font-medium">Admin Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Spend', value: `$${data.summary.all_time.toFixed(4)}`, sub: `$${data.summary.today.toFixed(4)} today` },
          { label: 'This Month', value: `$${data.summary.month.toFixed(4)}`, sub: '' },
          { label: 'Total Posts', value: String(data.post_stats.total), sub: `${data.post_stats.published} published` },
          { label: 'Avg Cost/Post', value: `$${data.post_stats.avg_cost.toFixed(4)}`, sub: '' },
        ].map((kpi) => (
          <div key={kpi.label} className="card">
            <p className="text-xs text-muted mb-1">{kpi.label}</p>
            <p className="text-xl font-mono text-gold">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-muted mt-1">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Cost by Service */}
        <div className="card space-y-3">
          <h3 className="text-xs font-medium text-muted">Cost by Service</h3>
          {data.by_service.map((s) => (
            <div key={s.service}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text">{SERVICE_LABELS[s.service] ?? s.service}</span>
                <span className="text-muted font-mono">${s.total.toFixed(4)} ({s.count}×)</span>
              </div>
              <div className="h-1.5 bg-s3 rounded">
                <div
                  className={cn('h-full rounded', SERVICE_COLORS[s.service] ?? 'bg-muted')}
                  style={{ width: `${(s.total / maxServiceCost) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Daily Spend */}
        <div className="card space-y-3">
          <h3 className="text-xs font-medium text-muted">Daily Spend (last 30 days)</h3>
          {data.daily.length === 0 ? (
            <p className="text-xs text-muted">No spend data yet</p>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {data.daily.slice(-20).map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className="w-full bg-gold/50 hover:bg-gold transition-colors rounded-t"
                    style={{ height: `${(d.total / maxDailyCost) * 80}px` }}
                  />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-s3 text-xs text-text px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.date}: ${d.total.toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Post Stats */}
      <div className="card">
        <h3 className="text-xs font-medium text-muted mb-3">Post Pipeline</h3>
        <div className="flex gap-6">
          {[
            { label: 'Draft', val: data.post_stats.draft, color: 'text-muted' },
            { label: 'Approved', val: data.post_stats.approved, color: 'text-gold' },
            { label: 'Published', val: data.post_stats.published, color: 'text-green' },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <p className={cn('text-2xl font-mono', color)}>{val}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cost by Client */}
      {data.by_client.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-medium text-muted mb-3">Cost by Client</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left pb-2">Client</th>
                <th className="text-right pb-2">Posts</th>
                <th className="text-right pb-2">Published</th>
                <th className="text-right pb-2">Total Cost</th>
                <th className="text-right pb-2">Cost/Post</th>
                <th className="text-right pb-2">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.by_client.map((c) => (
                <tr key={c.client_id}>
                  <td className="py-2 text-text">{c.client_name}</td>
                  <td className="py-2 text-right text-muted">{c.total_posts}</td>
                  <td className="py-2 text-right text-green">{c.published_posts}</td>
                  <td className="py-2 text-right font-mono text-gold">${c.total_cost.toFixed(4)}</td>
                  <td className="py-2 text-right font-mono text-muted">${c.cost_per_post.toFixed(4)}</td>
                  <td className="py-2 text-right"><EfficiencyBadge client={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent API Calls */}
      {data.recent.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-medium text-muted mb-3">Recent API Calls</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left pb-2">Time</th>
                <th className="text-left pb-2">Client</th>
                <th className="text-left pb-2">Service</th>
                <th className="text-right pb-2">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 text-muted">
                    {new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-1.5 text-muted">{r.client_name ?? '—'}</td>
                  <td className="py-1.5">
                    <span className={cn('badge', SERVICE_COLORS[r.service] ? `bg-${SERVICE_COLORS[r.service].replace('bg-', '')}/10` : 'bg-s3', 'text-text text-[10px]')}>
                      {SERVICE_LABELS[r.service] ?? r.service}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-gold">${r.cost_usd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

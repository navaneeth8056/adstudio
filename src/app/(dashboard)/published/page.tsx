'use client'

import { useState, useEffect } from 'react'
import type { Post, AdLabels } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/cn'
import Image from 'next/image'

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-green/10 text-green',
  approved:  'bg-gold/10 text-gold',
  draft:     'bg-s3 text-muted',
}

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="text-gold text-[11px] tracking-tight">
      {'★'.repeat(Math.max(0, Math.min(5, stars)))}{'☆'.repeat(Math.max(0, 5 - Math.min(5, stars)))}
    </span>
  )
}

async function downloadImageWithOverlay(
  imageUrl: string,
  labels: AdLabels | undefined,
  filename: string
) {
  const SIZE = 1080
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  // Load image via proxy to avoid CORS
  const proxyUrl = `/api/download?url=${encodeURIComponent(imageUrl)}&filename=img.jpg`
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = proxyUrl
  })

  // Draw base image
  ctx.drawImage(img, 0, 0, SIZE, SIZE)

  if (labels) {
    const pad    = 52
    const BOTTOM = SIZE - 60   // bottom anchor
    const GAP    = 20          // gap between rows

    // ── 1. Pre-measure all text with final fonts ────────────────────────
    const HOOK_FS = 56, HOOK_LH = 72
    const BODY_FS = 31, BODY_LH = 44
    const NAME_FS = 26, NAME_LH = 34
    const CTA_FS  = 30, CTA_H   = 56

    ctx.font = `bold ${HOOK_FS}px system-ui, sans-serif`
    const hookLines = wrapText(ctx, labels.hook, SIZE - pad * 2)

    ctx.font = `${BODY_FS}px system-ui, sans-serif`
    const bodyLines = wrapText(ctx, labels.body, SIZE - pad * 2).slice(0, 2)

    ctx.font = `bold ${CTA_FS}px system-ui, sans-serif`
    const ctaW = ctx.measureText(labels.cta).width + 50
    const ctaH = CTA_H

    // ── 2. Calculate baselines bottom-up ───────────────────────────────
    // Each "baseline" is where ctx.fillText y sits (bottom of text glyph)

    // Row D (bottom): CTA pill + location  — pill top at BOTTOM - ctaH
    const ctaTop      = BOTTOM - ctaH
    const ctaBaseline = ctaTop + ctaH - 10   // text baseline inside pill

    // Row C: body — last body line baseline just above CTA row
    const bodyLastBase  = ctaTop - GAP
    const bodyFirstBase = bodyLastBase - (bodyLines.length - 1) * BODY_LH

    // Row B: hook — last hook line just above first body line
    const hookLastBase  = bodyFirstBase - BODY_LH - GAP
    const hookFirstBase = hookLastBase - (hookLines.length - 1) * HOOK_LH

    // Row A: property name + stars — just above hook
    const nameBase = hookFirstBase - HOOK_LH - GAP

    // ── 3. Gradient — from just above name row to bottom ───────────────
    const gradTop = nameBase - NAME_LH - 40
    const grad = ctx.createLinearGradient(0, gradTop, 0, SIZE)
    grad.addColorStop(0,    'rgba(0,0,0,0)')
    grad.addColorStop(0.15, 'rgba(0,0,0,0.45)')
    grad.addColorStop(1,    'rgba(0,0,0,0.86)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, SIZE, SIZE)

    // ── 4. Draw: Row A — Property name + stars ─────────────────────────
    ctx.font = `600 ${NAME_FS}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.letterSpacing = '3px'
    ctx.fillText(labels.property_name.toUpperCase(), pad, nameBase)
    ctx.letterSpacing = '0px'

    const stars = '★'.repeat(Math.min(5, labels.stars)) + '☆'.repeat(Math.max(0, 5 - labels.stars))
    ctx.font = `${NAME_FS}px system-ui, sans-serif`
    ctx.fillStyle = '#F5C842'
    ctx.textAlign = 'right'
    ctx.fillText(stars, SIZE - pad, nameBase)
    ctx.textAlign = 'left'

    // ── 5. Draw: Row B — Hook ──────────────────────────────────────────
    ctx.font = `bold ${HOOK_FS}px system-ui, sans-serif`
    ctx.fillStyle = '#ffffff'
    hookLines.forEach((line, i) => {
      ctx.fillText(line, pad, hookFirstBase + i * HOOK_LH)
    })

    // ── 6. Draw: Row C — Body ──────────────────────────────────────────
    ctx.font = `${BODY_FS}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    bodyLines.forEach((line, i) => {
      ctx.fillText(line, pad, bodyFirstBase + i * BODY_LH)
    })

    // ── 7. Draw: Row D — CTA pill + location ───────────────────────────
    const LOC_FS = 27
    const LOC_LH = 38
    const ctaX   = SIZE - pad - ctaW

    // Wrap location text to max 2 lines, each fitting left of CTA
    ctx.font = `${LOC_FS}px system-ui, sans-serif`
    const maxLocW  = ctaX - pad - 24
    const locLines = wrapText(ctx, labels.location, maxLocW).slice(0, 2)

    // CTA pill — vertically centred in the row height
    const rowDHeight = Math.max(ctaH, locLines.length * LOC_LH)
    const ctaTopAdj  = ctaTop + (rowDHeight - ctaH) / 2

    ctx.fillStyle = 'rgba(210,168,42,0.95)'
    roundRect(ctx, ctaX, ctaTopAdj, ctaW, ctaH, 12)
    ctx.fillStyle = '#150f02'
    ctx.font = `bold ${CTA_FS}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(labels.cta, ctaX + ctaW / 2, ctaTopAdj + ctaH - 14)
    ctx.textAlign = 'left'

    // Location lines — vertically centred in row
    ctx.font = `${LOC_FS}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    const locStartY = ctaTop + (rowDHeight - locLines.length * LOC_LH) / 2 + LOC_LH
    locLines.forEach((line, i) => {
      ctx.fillText(line, pad, locStartY + i * LOC_LH)
    })
  }

  // Download
  canvas.toBlob((blob) => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }, 'image/jpeg', 0.93)
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

export default function WaitingListPage() {
  const [posts, setPosts]                   = useState<Post[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [downloadingId, setDownloadingId]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/posts/list')
      .then((r) => r.json())
      .then((d) => { setPosts(d || []); setLoading(false) })
  }, [])

  // Unique clients from posts
  const clients = Array.from(
    new Map(
      posts
        .filter((p) => p.client)
        .map((p) => [p.client_id, (p.client as { id: string; name: string }).name])
    ).entries()
  )

  const filtered = selectedClient === 'all'
    ? posts
    : posts.filter((p) => p.client_id === selectedClient)

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Waiting List</h2>
        <span className="text-xs text-muted">{filtered.length} post{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Client filter tabs ───────────────────────────────────────────── */}
      {clients.length > 1 && (
        <div className="border-b border-border px-4 flex gap-1 overflow-x-auto py-2">
          <button
            onClick={() => setSelectedClient('all')}
            className={cn(
              'px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors',
              selectedClient === 'all' ? 'bg-gold/20 text-gold' : 'text-muted hover:text-text hover:bg-s3'
            )}
          >
            All clients
          </button>
          {clients.map(([id, name]) => (
            <button
              key={id}
              onClick={() => setSelectedClient(id)}
              className={cn(
                'px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors',
                selectedClient === id ? 'bg-gold/20 text-gold' : 'text-muted hover:text-text hover:bg-s3'
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center pt-12"><Spinner className="text-muted" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="◉" title="No posts yet" description="Generate and approve posts in Post Studio" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
            {filtered.map((post) => {
              const labels = post.labels as AdLabels | undefined
              const imgUrl = post.generated_image_url ?? post.base_photo_url
              const clientName = post.client ? (post.client as { name: string }).name : ''
              const isExpanded = expandedId === post.id
              const dateStr = new Date(post.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })

              return (
                <div
                  key={post.id}
                  className="rounded-lg border border-border bg-s2 overflow-hidden hover:border-gold/30 transition-colors flex flex-col"
                >
                  {/* ── Image with ad overlay ──────────────────────────── */}
                  <div className="relative aspect-square bg-s3">
                    {imgUrl ? (
                      <Image src={imgUrl} alt="Ad" fill className="object-cover" sizes="300px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted text-xs">No image</div>
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Top-left: status badge */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className={cn('badge text-[10px]', STATUS_STYLES[post.status] ?? 'bg-s3 text-muted')}>
                        {post.status}
                      </span>
                    </div>

                    {/* Top-right: cost */}
                    <div className="absolute top-2.5 right-2.5">
                      <span className="text-[10px] text-white/60 font-mono bg-black/40 px-1.5 py-0.5 rounded">
                        ${post.api_cost_usd.toFixed(4)}
                      </span>
                    </div>

                    {/* Bottom overlay: ad copy */}
                    {labels && (
                      <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-white/70 font-medium tracking-wide uppercase">
                            {labels.property_name}
                          </p>
                          <StarRating stars={labels.stars} />
                        </div>
                        <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                          {labels.hook}
                        </p>
                        <p className="text-[11px] text-white/80 leading-snug line-clamp-2">
                          {labels.body}
                        </p>
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[10px] text-white/60">{labels.location}</span>
                          <span className="text-[10px] bg-gold/90 text-bg px-2 py-0.5 rounded font-medium">
                            {labels.cta}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Card footer ───────────────────────────────────────── */}
                  <div className="p-3 space-y-2 flex-1 flex flex-col">
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span className="font-medium text-text truncate">{clientName}</span>
                      <span>{dateStr}</span>
                    </div>

                    {post.instagram_post_id && (
                      <p className="text-[10px] text-green">✓ Posted to Instagram</p>
                    )}

                    {/* Caption toggle */}
                    {post.caption && (
                      <div>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : post.id)}
                          className="text-[10px] text-muted hover:text-text transition-colors"
                        >
                          {isExpanded ? '▲ Hide caption' : '▼ Show caption'}
                        </button>
                        {isExpanded && (
                          <p className="mt-1.5 text-[11px] text-text leading-relaxed whitespace-pre-wrap">
                            {post.caption}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Hashtags */}
                    {isExpanded && post.hashtags && (
                      <p className="text-[10px] text-gold/70 leading-relaxed">{post.hashtags}</p>
                    )}

                    {/* Download button */}
                    {imgUrl && (
                      <div className="mt-auto pt-2">
                        <button
                          disabled={downloadingId === post.id}
                          onClick={async () => {
                            setDownloadingId(post.id)
                            try {
                              await downloadImageWithOverlay(
                                imgUrl,
                                labels,
                                `${clientName.replace(/\s+/g, '-')}-${post.id.slice(0, 8)}.jpg`
                              )
                            } finally {
                              setDownloadingId(null)
                            }
                          }}
                          className="w-full btn-ghost text-xs py-1.5 flex items-center justify-center gap-1.5"
                        >
                          {downloadingId === post.id
                            ? <><Spinner className="mr-1" />Compositing…</>
                            : '↓ Download with Text'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

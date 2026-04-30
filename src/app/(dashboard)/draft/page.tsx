'use client'

import { useState, useEffect } from 'react'
import type { Post, AdLabels } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/cn'
import Image from 'next/image'

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Draft',             cls: 'bg-s3 text-muted' },
  pending_approval: { label: 'Sent for Approval', cls: 'bg-blue/10 text-blue-400' },
  approved:         { label: 'Approved ✓',         cls: 'bg-green/10 text-green' },
  rejected:         { label: 'Rejected ✗',         cls: 'bg-red/10 text-red' },
  published:        { label: 'Published',           cls: 'bg-gold/10 text-gold' },
}

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="text-gold text-[11px] tracking-tight">
      {'★'.repeat(Math.max(0, Math.min(5, stars)))}
      {'☆'.repeat(Math.max(0, 5 - Math.min(5, stars)))}
    </span>
  )
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word }
    else { line = test }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
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

async function downloadWithOverlay(
  imageUrl: string,
  labels: AdLabels | undefined,
  filename: string
) {
  const SIZE = 1080
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = `/api/download?url=${encodeURIComponent(imageUrl)}&filename=img.jpg`
  })
  ctx.drawImage(img, 0, 0, SIZE, SIZE)

  if (labels) {
    const pad = 52, BOTTOM = SIZE - 60, GAP = 20
    const HOOK_FS = 56, HOOK_LH = 72
    const BODY_FS = 31, BODY_LH = 44
    const NAME_FS = 26
    const CTA_FS = 30, CTA_H = 56

    ctx.font = `bold ${HOOK_FS}px system-ui, sans-serif`
    const hookLines = wrapText(ctx, labels.hook, SIZE - pad * 2)
    ctx.font = `${BODY_FS}px system-ui, sans-serif`
    const bodyLines = wrapText(ctx, labels.body, SIZE - pad * 2).slice(0, 2)
    ctx.font = `bold ${CTA_FS}px system-ui, sans-serif`
    const ctaW = ctx.measureText(labels.cta).width + 50

    const ctaTop      = BOTTOM - CTA_H
    const bodyLastBase  = ctaTop - GAP
    const bodyFirstBase = bodyLastBase - (bodyLines.length - 1) * BODY_LH
    const hookLastBase  = bodyFirstBase - BODY_LH - GAP
    const hookFirstBase = hookLastBase - (hookLines.length - 1) * HOOK_LH
    const nameBase      = hookFirstBase - HOOK_LH - GAP

    const grad = ctx.createLinearGradient(0, nameBase - NAME_FS - 40, 0, SIZE)
    grad.addColorStop(0,    'rgba(0,0,0,0)')
    grad.addColorStop(0.15, 'rgba(0,0,0,0.45)')
    grad.addColorStop(1,    'rgba(0,0,0,0.86)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, SIZE, SIZE)

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

    ctx.font = `bold ${HOOK_FS}px system-ui, sans-serif`
    ctx.fillStyle = '#ffffff'
    hookLines.forEach((l, i) => ctx.fillText(l, pad, hookFirstBase + i * HOOK_LH))

    ctx.font = `${BODY_FS}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    bodyLines.forEach((l, i) => ctx.fillText(l, pad, bodyFirstBase + i * BODY_LH))

    const LOC_FS = 27, LOC_LH = 38
    const ctaX = SIZE - pad - ctaW
    ctx.font = `${LOC_FS}px system-ui, sans-serif`
    const locLines = wrapText(ctx, labels.location, ctaX - pad - 24).slice(0, 2)
    const rowDH = Math.max(CTA_H, locLines.length * LOC_LH)
    const ctaTopAdj = ctaTop + (rowDH - CTA_H) / 2

    ctx.fillStyle = 'rgba(210,168,42,0.95)'
    roundRect(ctx, ctaX, ctaTopAdj, ctaW, CTA_H, 12)
    ctx.fillStyle = '#150f02'
    ctx.font = `bold ${CTA_FS}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(labels.cta, ctaX + ctaW / 2, ctaTopAdj + CTA_H - 14)
    ctx.textAlign = 'left'

    ctx.font = `${LOC_FS}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    const locStartY = ctaTop + (rowDH - locLines.length * LOC_LH) / 2 + LOC_LH
    locLines.forEach((l, i) => ctx.fillText(l, pad, locStartY + i * LOC_LH))
  }

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

// ── Edit labels panel ─────────────────────────────────────────────────────────

interface EditPanelProps {
  labels: AdLabels
  caption: string
  onSave: (l: AdLabels, c: string) => Promise<void>
  onCancel: () => void
}

function EditPanel({ labels, caption: initCaption, onSave, onCancel }: EditPanelProps) {
  const [form, setForm]       = useState<AdLabels>({ ...labels })
  const [caption, setCaption] = useState(initCaption)
  const [saving, setSaving]   = useState(false)

  const set = (k: keyof AdLabels, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }))

  const FIELDS: { key: keyof AdLabels; label: string; rows?: number }[] = [
    { key: 'property_name', label: 'Property name' },
    { key: 'hook',          label: 'Hook',   rows: 2 },
    { key: 'body',          label: 'Body',   rows: 2 },
    { key: 'location',      label: 'Location' },
    { key: 'cta',           label: 'CTA button' },
  ]

  return (
    <div className="pt-3 mt-2 border-t border-border space-y-2">
      <p className="text-[10px] text-muted font-medium uppercase tracking-wider">Edit ad copy</p>

      {FIELDS.map(({ key, label, rows }) => (
        <div key={key}>
          <label className="text-[10px] text-muted block mb-0.5">{label}</label>
          {rows ? (
            <textarea
              rows={rows}
              className="input text-xs py-1 w-full resize-none"
              value={form[key] as string}
              onChange={(e) => set(key, e.target.value)}
            />
          ) : (
            <input
              className="input text-xs py-1 w-full"
              value={form[key] as string}
              onChange={(e) => set(key, e.target.value)}
            />
          )}
        </div>
      ))}

      <div>
        <label className="text-[10px] text-muted block mb-0.5">Stars (1–5)</label>
        <input
          type="number" min={1} max={5}
          className="input text-xs py-1 w-20"
          value={form.stars}
          onChange={(e) => set('stars', Number(e.target.value))}
        />
      </div>

      <div>
        <label className="text-[10px] text-muted block mb-0.5">Caption</label>
        <textarea
          rows={3}
          className="input text-xs py-1 w-full resize-none"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={async () => { setSaving(true); try { await onSave(form, caption) } finally { setSaving(false) } }}
          disabled={saving}
          className="btn-primary text-xs py-1.5 flex-1 flex items-center justify-center gap-1"
        >
          {saving ? <><Spinner className="mr-1" />Saving…</> : '✓ Save changes'}
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
      </div>
    </div>
  )
}

// ── Phone inline editor ───────────────────────────────────────────────────────

interface PhoneEditorProps {
  clientId: string
  initialPhone: string
  onSaved: (phone: string) => void
}

function PhoneEditor({ clientId, initialPhone, onSaved }: PhoneEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(initialPhone)
  const [saving, setSaving]   = useState(false)

  // Fetch phone from DB on first render (may not be in the posts/list join)
  useEffect(() => {
    if (initialPhone) return // already have it
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.phone) setValue(d.phone) })
      .catch(() => null)
  }, [clientId, initialPhone])

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: value }),
      })
      onSaved(value)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-muted">📱</span>
        <span className={value ? 'text-text' : 'text-muted italic'}>
          {value || 'No phone — add to send via WhatsApp'}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-muted hover:text-gold transition-colors ml-0.5"
        >
          ✎
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted">📱</span>
      <input
        autoFocus
        className="input text-xs py-0.5 flex-1"
        placeholder="+91 98765 43210"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') { setValue(initialPhone); setEditing(false) }
        }}
      />
      <button
        onClick={save}
        disabled={saving}
        className="btn-primary text-[10px] py-0.5 px-2"
      >
        {saving ? '…' : 'Save'}
      </button>
      <button
        onClick={() => { setValue(initialPhone); setEditing(false) }}
        className="text-muted hover:text-text text-[10px]"
      >
        ✕
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const [posts, setPosts]                   = useState<Post[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [downloadingId, setDownloadingId]   = useState<string | null>(null)
  const [sendingId, setSendingId]           = useState<string | null>(null)
  const [sendErrors, setSendErrors]         = useState<Record<string, string>>({})
  const [phoneMap, setPhoneMap]             = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/posts/list')
      .then((r) => r.json())
      .then((d: unknown) => { setPosts(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  const clients = Array.from(
    new Map(
      posts
        .filter((p) => p.client)
        .map((p) => [p.client_id, (p.client as { name: string }).name])
    ).entries()
  )

  const filtered = selectedClient === 'all'
    ? posts
    : posts.filter((p) => p.client_id === selectedClient)

  async function handleSaveEdit(postId: string, labels: AdLabels, caption: string) {
    const res = await fetch('/api/posts/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, labels, caption }),
    })
    if (!res.ok) throw new Error('Failed to save')
    const updated = await res.json()
    setPosts((ps) => ps.map((p) => p.id === postId ? { ...p, ...updated } : p))
    setEditingId(null)
  }

  async function handleSendApproval(postId: string) {
    setSendingId(postId)
    setSendErrors((e) => { const n = { ...e }; delete n[postId]; return n })
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      setPosts((ps) =>
        ps.map((p) => p.id === postId ? { ...p, status: 'pending_approval' } : p)
      )
    } catch (e) {
      setSendErrors((err) => ({ ...err, [postId]: String(e) }))
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Draft</h2>
        <span className="text-xs text-muted">
          {filtered.length} post{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Client filter tabs ───────────────────────────────────────────── */}
      {clients.length > 1 && (
        <div className="border-b border-border px-4 flex gap-1 overflow-x-auto py-2">
          <button
            onClick={() => setSelectedClient('all')}
            className={cn(
              'px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors',
              selectedClient === 'all'
                ? 'bg-gold/20 text-gold'
                : 'text-muted hover:text-text hover:bg-s3'
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
                selectedClient === id
                  ? 'bg-gold/20 text-gold'
                  : 'text-muted hover:text-text hover:bg-s3'
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
          <div className="flex justify-center pt-12">
            <Spinner className="text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="◉"
            title="No posts yet"
            description="Generate posts in Post Studio — they'll appear here as drafts"
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
            {filtered.map((post) => {
              const labels     = post.labels as AdLabels | undefined
              const imgUrl     = post.generated_image_url ?? post.base_photo_url
              const clientData = post.client as { id: string; name: string } | undefined
              const clientName = clientData?.name ?? ''
              const phone      = phoneMap[post.client_id] ?? ''
              const isExpanded = expandedId  === post.id
              const isEditing  = editingId   === post.id
              const isSending  = sendingId   === post.id
              const statusCfg  = STATUS_CFG[post.status] ?? STATUS_CFG.draft
              const canSend    = post.status === 'draft' || post.status === 'rejected'
              const dateStr    = new Date(post.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })

              return (
                <div
                  key={post.id}
                  className={cn(
                    'rounded-lg border bg-s2 overflow-hidden transition-colors flex flex-col',
                    post.status === 'rejected'
                      ? 'border-red/30'
                      : 'border-border hover:border-gold/30'
                  )}
                >
                  {/* ── Image ─────────────────────────────────────────── */}
                  <div className="relative aspect-square bg-s3">
                    {imgUrl ? (
                      <Image
                        src={imgUrl}
                        alt="Ad"
                        fill
                        className="object-cover"
                        sizes="300px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                        No image
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Status badge */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className={cn('badge text-[10px]', statusCfg.cls)}>
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Cost */}
                    <div className="absolute top-2.5 right-2.5">
                      <span className="text-[10px] text-white/60 font-mono bg-black/40 px-1.5 py-0.5 rounded">
                        ${post.api_cost_usd.toFixed(4)}
                      </span>
                    </div>

                    {/* Ad copy overlay */}
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

                  {/* ── Card footer ──────────────────────────────────── */}
                  <div className="p-3 space-y-2 flex-1 flex flex-col">

                    {/* Client + date */}
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span className="font-medium text-text truncate">{clientName}</span>
                      <span>{dateStr}</span>
                    </div>

                    {/* Phone editor */}
                    {clientData && (
                      <PhoneEditor
                        clientId={clientData.id}
                        initialPhone={phone}
                        onSaved={(p) =>
                          setPhoneMap((m) => ({ ...m, [post.client_id]: p }))
                        }
                      />
                    )}

                    {/* Caption toggle */}
                    {post.caption && !isEditing && (
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
                    {isExpanded && !isEditing && post.hashtags && (
                      <p className="text-[10px] text-gold/70 leading-relaxed">
                        {post.hashtags}
                      </p>
                    )}

                    {/* Edit panel */}
                    {isEditing && labels && (
                      <EditPanel
                        labels={labels}
                        caption={post.caption ?? ''}
                        onSave={(l, c) => handleSaveEdit(post.id, l, c)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}

                    {/* Send error */}
                    {sendErrors[post.id] && (
                      <p className="text-[10px] text-red bg-red/10 px-2 py-1 rounded">
                        {sendErrors[post.id]}
                      </p>
                    )}

                    {/* ── Action buttons ───────────────────────────── */}
                    <div className="mt-auto pt-2 space-y-1.5">

                      {/* Send for Approval */}
                      {canSend && (
                        <button
                          disabled={isSending || !phone}
                          onClick={() => handleSendApproval(post.id)}
                          title={!phone ? 'Add a phone number above first' : ''}
                          className={cn(
                            'w-full text-xs py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors border',
                            phone
                              ? 'bg-green/10 text-green hover:bg-green/20 border-green/30'
                              : 'bg-s3 text-muted cursor-not-allowed border-border'
                          )}
                        >
                          {isSending
                            ? <><Spinner className="mr-1" />Sending…</>
                            : '📲 Send for Approval'}
                        </button>
                      )}

                      {/* Pending banner */}
                      {post.status === 'pending_approval' && (
                        <div className="w-full text-[10px] text-center text-muted bg-s3 border border-border rounded py-1.5">
                          ⏳ Awaiting client response on WhatsApp
                        </div>
                      )}

                      {/* Edit + Download row */}
                      <div className="flex gap-1.5">
                        {labels && (
                          <button
                            onClick={() => {
                              setEditingId(isEditing ? null : post.id)
                              setExpandedId(null)
                            }}
                            className={cn(
                              'flex-1 btn-ghost text-xs py-1.5',
                              isEditing && 'text-gold'
                            )}
                          >
                            {isEditing ? '✕ Cancel' : '✎ Edit'}
                          </button>
                        )}
                        {imgUrl && (
                          <button
                            disabled={downloadingId === post.id}
                            onClick={async () => {
                              setDownloadingId(post.id)
                              try {
                                await downloadWithOverlay(
                                  imgUrl,
                                  labels,
                                  `${clientName.replace(/\s+/g, '-')}-${post.id.slice(0, 8)}.jpg`
                                )
                              } finally {
                                setDownloadingId(null)
                              }
                            }}
                            className="flex-1 btn-ghost text-xs py-1.5 flex items-center justify-center gap-1"
                          >
                            {downloadingId === post.id
                              ? <><Spinner className="mr-1" />…</>
                              : '↓ Download'}
                          </button>
                        )}
                      </div>
                    </div>
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

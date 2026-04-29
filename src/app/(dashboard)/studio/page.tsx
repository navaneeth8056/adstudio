'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Client, Photo, AurovilleEvent, AdLabels, PostStatus } from '@/types'
import { AdPreview } from '@/components/studio/ad-preview'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/cn'
import Image from 'next/image'
import { distanceKm } from '@/lib/google-maps'

const DEFAULT_LABELS = (client: Client): AdLabels => ({
  property_name: client.name,
  location: client.location,
  hook: 'Your escape awaits',
  body: 'Experience something truly special in the heart of Auroville.',
  cta: 'Book Now · DM Us',
  stars: Math.round(client.review_summary?.rating ?? 4),
})

export default function StudioPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [events, setEvents] = useState<AurovilleEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<AurovilleEvent | null>(null)
  const [labels, setLabels] = useState<AdLabels | null>(null)
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [fluxPrompt, setFluxPrompt] = useState('')
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [postId, setPostId] = useState<string | null>(null)
  const [status, setStatus] = useState<PostStatus>('draft')

  const [includeReviews, setIncludeReviews] = useState(true)
  const [includeAmenities, setIncludeAmenities] = useState(true)
  const [includeEvents, setIncludeEvents] = useState(false)
  const [customInstruction, setCustomInstruction] = useState('')

  const [generatingImage, setGeneratingImage] = useState(false)
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [approving, setApproving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [sessionCost, setSessionCost] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then((r) => r.json()),
      fetch('/api/events/fetch').then((r) => r.json()),
    ]).then(([cls, evts]) => {
      setClients(cls || [])
      setEvents(evts || [])
    })
  }, [])

  const loadPhotos = useCallback(async (clientId: string) => {
    const res = await fetch(`/api/photos?clientId=${clientId}`)
    const data = await res.json()
    setPhotos(data.photos || [])
  }, [])

  useEffect(() => {
    if (selectedClient) {
      loadPhotos(selectedClient.id)
      setLabels(DEFAULT_LABELS(selectedClient))
      setSelectedPhoto(null)
      setGeneratedUrl('')
      setCaption('')
      setHashtags('')
      setPostId(null)
      setStatus('draft')
    }
  }, [selectedClient, loadPhotos])

  const nearbyEvents = selectedClient?.lat && selectedClient?.lng
    ? events
        .filter((e) => e.lat && e.lng)
        .map((e) => ({ ...e, distance: distanceKm(selectedClient.lat!, selectedClient.lng!, e.lat!, e.lng!) }))
        .filter((e) => e.distance <= (selectedClient.event_radius ?? 5))
        .sort((a, b) => a.distance - b.distance)
    : []

  async function generateImage() {
    if (!selectedClient || !selectedPhoto) return
    setGeneratingImage(true)
    setError('')
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          postId,
          basePhotoUrl: selectedPhoto.public_url,
          labels,
          selectedEvent: includeEvents ? selectedEvent : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGeneratedUrl(data.generated_url)
      setFluxPrompt(data.flux_prompt)
      setPostId(data.post_id)
      setSessionCost((c) => c + data.cost_usd)
    } catch (e) {
      setError(String(e))
    } finally {
      setGeneratingImage(false)
    }
  }

  async function generateCaption() {
    if (!selectedClient) return
    setGeneratingCaption(true)
    setError('')
    try {
      const res = await fetch('/api/generate/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          postId,
          basePhotoUrl: selectedPhoto?.public_url,
          customInstruction,
          selectedEvent: includeEvents ? selectedEvent : null,
          includeReviews,
          includeAmenities,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCaption(data.caption)
      setHashtags(data.hashtags)
      setSessionCost((c) => c + data.cost_usd)
    } catch (e) {
      setError(String(e))
    } finally {
      setGeneratingCaption(false)
    }
  }

  async function approvePost() {
    if (!postId) return
    setApproving(true)
    await fetch('/api/posts/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    })
    setStatus('approved')
    setApproving(false)
  }

  async function publishPost() {
    if (!postId) return
    setPublishing(true)
    setError('')
    try {
      const res = await fetch('/api/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus('published')
    } catch (e) {
      setError(String(e))
    } finally {
      setPublishing(false)
    }
  }

  const statusColor = status === 'published' ? 'text-green' : status === 'approved' ? 'text-gold' : 'text-muted'

  return (
    <div className="grid grid-cols-[280px_1fr] h-full">
      {/* Left config panel */}
      <div className="border-r border-border overflow-y-auto p-4 space-y-5">
        {/* Cost */}
        <div className="flex justify-between text-xs">
          <span className="text-muted">Session cost</span>
          <span className="text-gold font-mono">${sessionCost.toFixed(4)}</span>
        </div>

        {/* Client */}
        <div>
          <label className="label">Client</label>
          <select
            className="input"
            value={selectedClient?.id || ''}
            onChange={(e) => setSelectedClient(clients.find((c) => c.id === e.target.value) || null)}
          >
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Photo picker */}
        {selectedClient && (
          <div>
            <label className="label">Base Photo</label>
            {photos.length === 0 ? (
              <p className="text-xs text-muted">No photos. Upload some in Photo Repo first.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPhoto(p)}
                    className={cn(
                      'relative aspect-square rounded overflow-hidden border-2 transition-colors',
                      selectedPhoto?.id === p.id ? 'border-gold' : 'border-transparent hover:border-border'
                    )}
                  >
                    <Image src={p.public_url} alt={p.filename} fill className="object-cover" sizes="80px" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inclusions */}
        {selectedClient && (
          <div className="space-y-2">
            <label className="label">Include in Generation</label>
            {[
              { label: 'Google Review Summary', key: 'includeReviews', val: includeReviews, set: setIncludeReviews },
              { label: 'Amenities & USP', key: 'includeAmenities', val: includeAmenities, set: setIncludeAmenities },
              { label: 'Nearby Events', key: 'includeEvents', val: includeEvents, set: setIncludeEvents },
            ].map(({ label, key, val, set }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="accent-gold" />
                <span className="text-xs text-muted">{label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Event picker */}
        {includeEvents && nearbyEvents.length > 0 && (
          <div>
            <label className="label">Nearby Event</label>
            <select
              className="input text-xs"
              value={selectedEvent?.id || ''}
              onChange={(e) => setSelectedEvent(nearbyEvents.find((ev) => ev.id === e.target.value) || null)}
            >
              <option value="">None</option>
              {nearbyEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {e.distance?.toFixed(1)}km
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Custom instruction */}
        {selectedClient && (
          <div>
            <label className="label">Custom Instruction</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="e.g. Mention the monsoon season special offer…"
            />
          </div>
        )}
      </div>

      {/* Right output panel */}
      <div className="overflow-y-auto p-6">
        {!selectedClient ? (
          <EmptyState icon="✦" title="Select a client to get started" />
        ) : (
          <div className="max-w-2xl space-y-6">
            {error && (
              <div className="text-xs text-red bg-red/10 border border-red/20 px-3 py-2">{error}</div>
            )}

            {/* Photo grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Base photo */}
              <div>
                <p className="label mb-2">Original</p>
                {selectedPhoto ? (
                  <div className="relative aspect-square rounded overflow-hidden border border-border">
                    <Image src={selectedPhoto.public_url} alt="Base" fill className="object-cover" sizes="300px" />
                  </div>
                ) : (
                  <div className="aspect-square border border-dashed border-border rounded flex items-center justify-center text-xs text-muted">
                    No photo selected
                  </div>
                )}
              </div>

              {/* Generated / Ad Preview */}
              <div>
                <p className="label mb-2">
                  Ad Preview
                  {status !== 'draft' && (
                    <span className={cn('ml-2 badge bg-s3', statusColor)}>{status}</span>
                  )}
                </p>
                {generatedUrl && labels ? (
                  <AdPreview imageUrl={generatedUrl} labels={labels} onLabelsChange={setLabels} />
                ) : (
                  <div className="aspect-square border border-dashed border-border rounded flex items-center justify-center text-xs text-muted">
                    {generatingImage ? <Spinner className="text-gold" /> : 'Generate image first'}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={generateImage}
                disabled={!selectedPhoto || generatingImage}
                className="btn-primary"
              >
                {generatingImage ? <><Spinner className="mr-1.5" />Generating…</> : generatedUrl ? '↺ Regenerate' : '✦ Generate Image'}
              </button>
              <button
                onClick={generateCaption}
                disabled={generatingCaption}
                className="btn-ghost"
              >
                {generatingCaption ? <><Spinner className="mr-1.5" />Writing…</> : '✎ Generate Caption'}
              </button>
              {postId && status === 'draft' && (
                <button onClick={approvePost} disabled={approving} className="btn-ghost">
                  {approving ? <Spinner /> : '✓ Approve'}
                </button>
              )}
              {postId && status === 'approved' && (
                <button onClick={publishPost} disabled={publishing} className="btn-ghost text-green border-green">
                  {publishing ? <><Spinner className="mr-1.5" />Publishing…</> : '↑ Publish to Instagram'}
                </button>
              )}
            </div>

            {/* Caption */}
            {(caption || generatingCaption) && (
              <div className="space-y-2">
                <label className="label">Caption</label>
                <textarea
                  className="input resize-none"
                  rows={6}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={generatingCaption ? 'Writing caption…' : ''}
                />
                {hashtags && (
                  <p className="text-xs text-muted leading-relaxed">{hashtags}</p>
                )}
              </div>
            )}

            {/* FLUX prompt */}
            {fluxPrompt && (
              <details className="text-xs">
                <summary className="text-muted cursor-pointer hover:text-text">FLUX Prompt Used</summary>
                <p className="mt-2 text-muted bg-s2 p-3 leading-relaxed font-mono">{fluxPrompt}</p>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

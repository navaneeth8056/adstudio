'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { AurovilleEvent, Client, EventCategory } from '@/types'
import { distanceKm } from '@/lib/google-maps'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/cn'

const CATEGORIES: { id: EventCategory; label: string; color: string }[] = [
  { id: 'yoga',         label: 'Yoga',         color: 'text-teal' },
  { id: 'wellness',     label: 'Wellness',      color: 'text-green' },
  { id: 'culture',      label: 'Culture',       color: 'text-blue' },
  { id: 'music',        label: 'Music',         color: 'text-gold' },
  { id: 'arts',         label: 'Arts',          color: 'text-red' },
  { id: 'workshop',     label: 'Workshop',      color: 'text-blue' },
  { id: 'market',       label: 'Market',        color: 'text-gold' },
  { id: 'spirituality', label: 'Spirituality',  color: 'text-teal' },
  { id: 'food',         label: 'Food',          color: 'text-green' },
  { id: 'nature',       label: 'Nature',        color: 'text-green' },
  { id: 'festival',     label: 'Festival',      color: 'text-gold' },
  { id: 'other',        label: 'Other',         color: 'text-muted' },
]

const RADIUS_OPTIONS = [1, 2, 3, 5, 10, 15]

export default function EventsPage() {
  const [events, setEvents]                     = useState<AurovilleEvent[]>([])
  const [clients, setClients]                   = useState<Client[]>([])
  const [selectedClient, setSelectedClient]     = useState<Client | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'all'>('all')
  const [radius, setRadius]                     = useState(5)
  const [loading, setLoading]                   = useState(true)
  const [uploading, setUploading]               = useState(false)
  const [uploadStep, setUploadStep]             = useState('')
  const [uploadError, setUploadError]           = useState('')
  const [replaceExisting, setReplaceExisting]   = useState(true)
  const [calibratingId, setCalibratingId]       = useState<string | null>(null)
  const [placeSearch, setPlaceSearch]           = useState('')
  const [placeResults, setPlaceResults]         = useState<{ placeId: string; description: string; mainText: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/events/fetch').then((r) => r.json()),
      fetch('/api/clients').then((r) => r.json()),
    ]).then(([evts, cls]) => {
      setEvents(evts || [])
      setClients(cls || [])
      setLoading(false)
    })
  }, [])

  async function handlePdfUpload(file: File) {
    if (!file || file.type !== 'application/pdf') {
      setUploadError('Please select a valid PDF file.')
      return
    }

    setUploading(true)
    setUploadError('')
    setUploadStep('Reading PDF…')

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = (e) => resolve((e.target?.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      setUploadStep('Extracting events with Claude AI…')

      const res = await fetch('/api/events/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, replaceExisting }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setUploadStep(`✓ Extracted ${data.count} events`)
      // Reload events from DB
      const fresh = await fetch('/api/events/fetch').then((r) => r.json())
      setEvents(fresh || [])
    } catch (e) {
      setUploadError(String(e))
      setUploadStep('')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const loadEvents = useCallback(async () => {
    const data = await fetch('/api/events/fetch').then((r) => r.json())
    setEvents(data || [])
  }, [])

  async function searchPlaces(q: string) {
    if (q.length < 2) { setPlaceResults([]); return }
    const res = await fetch(`/api/events/places-search?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setPlaceResults(data || [])
  }

  async function calibrateEvent(eventId: string, placeId: string, description: string) {
    const res = await fetch('/api/clients/resolve-place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleMapsUrl: `https://maps.google.com/?cid=${placeId}` }),
    })
    const data = await res.json()

    await fetch('/api/events/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, lat: data.lat, lng: data.lng, locationName: description }),
    })

    setEvents((evts) => evts.map((e) => e.id === eventId
      ? { ...e, lat: data.lat, lng: data.lng, location_resolved: description, coords_calibrated: true }
      : e
    ))
    setCalibratingId(null)
    setPlaceSearch('')
    setPlaceResults([])
  }

  async function clearEvents() {
    if (!confirm('Clear all events from the database?')) return
    await fetch('/api/events/fetch', { method: 'DELETE' }).catch(() => null)
    await loadEvents()
  }

  // Compute distances from selected client
  const enrichedEvents = events.map((e) => {
    if (!selectedClient?.lat || !selectedClient?.lng || !e.lat || !e.lng) return e
    const dist = distanceKm(selectedClient.lat, selectedClient.lng, e.lat, e.lng)
    return { ...e, distances: { [selectedClient.id]: dist } }
  })

  const filtered = enrichedEvents.filter((e) => {
    if (selectedCategory !== 'all' && e.category !== selectedCategory) return false
    if (selectedClient && e.distances) {
      const d = e.distances[selectedClient.id]
      if (d !== undefined && d > radius) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="border-b border-border p-3 flex flex-wrap items-center gap-3">

        {/* PDF Upload */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f) }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary text-xs"
          >
            {uploading ? <><Spinner className="mr-1" />{uploadStep || 'Processing…'}</> : '↑ Upload Events PDF'}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="accent-gold"
            />
            Replace existing
          </label>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Client proximity filter */}
        <select
          className="input w-44 text-xs py-1"
          value={selectedClient?.id || ''}
          onChange={(e) => setSelectedClient(clients.find((c) => c.id === e.target.value) || null)}
        >
          <option value="">Filter by client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {selectedClient && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted">Radius:</span>
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={cn('px-2 py-0.5 text-xs rounded border', radius === r ? 'border-gold text-gold' : 'border-border text-muted hover:border-text')}
              >
                {r}km
              </button>
            ))}
          </div>
        )}

        <div className="h-4 w-px bg-border" />

        {/* Category filter */}
        <select
          className="input w-44 text-xs py-1"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as EventCategory | 'all')}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>

        {events.length > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <button onClick={clearEvents} className="btn-ghost text-xs text-red/70 hover:text-red">
              Clear All
            </button>
          </>
        )}
      </div>

      {/* ── Status / error bar ──────────────────────────────────────────── */}
      {(uploadStep || uploadError) && (
        <div className={cn(
          'px-4 py-2 text-xs border-b border-border flex items-center justify-between',
          uploadError ? 'text-red bg-red/10' : 'text-green bg-green/10'
        )}>
          <span>{uploadError || uploadStep}</span>
          <button onClick={() => { setUploadStep(''); setUploadError('') }} className="opacity-50 hover:opacity-100 ml-3">×</button>
        </div>
      )}

      {/* ── Events list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex justify-center pt-12"><Spinner className="text-muted" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="◎"
            title={events.length === 0 ? 'No events yet' : 'No events match filters'}
            description={events.length === 0
              ? 'Upload the weekly News & Notes PDF to extract events'
              : 'Try adjusting the radius or category filters'}
          />
        ) : (
          filtered.map((event) => {
            const cat = CATEGORIES.find((c) => c.id === event.category)
            const dist = selectedClient ? event.distances?.[selectedClient.id] : undefined
            const isCalibrating = calibratingId === event.id

            return (
              <div key={event.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-text">{event.title}</h3>
                      <span className={cn('badge bg-s3', cat?.color ?? 'text-muted')}>
                        {event.category}
                      </span>
                      {event.coords_calibrated && (
                        <span className="badge bg-green/10 text-green text-[10px]">✓ calibrated</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
                      {event.date && <span>{event.date}{event.time ? ` · ${event.time}` : ''}</span>}
                      <span>📍 {event.location_resolved || event.location}</span>
                      {dist !== undefined && (
                        <span className={cn(dist <= 2 ? 'text-green' : dist <= radius ? 'text-gold' : 'text-muted')}>
                          {dist.toFixed(1)} km away
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setCalibratingId(isCalibrating ? null : event.id); setPlaceSearch(''); setPlaceResults([]) }}
                    className="btn-ghost text-xs shrink-0"
                  >
                    {isCalibrating ? 'Cancel' : '📍 Calibrate'}
                  </button>
                </div>

                <p className="text-xs text-muted leading-relaxed">{event.description}</p>

                {event.guest_relevance?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {event.guest_relevance.map((g, i) => (
                      <span key={i} className="badge bg-s3 text-muted text-[10px]">{g}</span>
                    ))}
                  </div>
                )}

                {isCalibrating && (
                  <div className="pt-2 border-t border-border space-y-2">
                    <p className="text-xs text-muted">Search for the exact location on Google Maps to pin it accurately:</p>
                    <input
                      className="input text-xs"
                      placeholder="Type location name to search…"
                      value={placeSearch}
                      onChange={(e) => { setPlaceSearch(e.target.value); searchPlaces(e.target.value) }}
                    />
                    {placeResults.map((p) => (
                      <button
                        key={p.placeId}
                        onClick={() => calibrateEvent(event.id, p.placeId, p.description)}
                        className="w-full text-left text-xs px-3 py-2 bg-s3 hover:bg-border rounded"
                      >
                        <div className="text-text">{p.mainText}</div>
                        <div className="text-muted text-[10px]">{p.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="border-t border-border px-4 py-2 text-xs text-muted">
        {filtered.length} event{filtered.length !== 1 ? 's' : ''} shown
        {events.length !== filtered.length && ` (${events.length} total)`}
      </div>
    </div>
  )
}

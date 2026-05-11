'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Client, ReviewSummary } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/cn'

const BLANK_CLIENT: Partial<Client> = {
  name: '',
  property_type: 'Hotel',
  location: '',
  tone: 'warm and inviting',
  target_guests: 'Travellers seeking authentic experiences',
  amenities: [],
  usp: '',
  event_radius: 5,
}

const PROPERTY_TYPES = ['Hotel', 'Resort', 'Guesthouse', 'Villa', 'Restaurant', 'Spa', 'Other']
const TONES = ['warm and inviting', 'luxurious', 'spiritual', 'adventurous', 'eco-conscious', 'minimalist']

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selected, setSelected] = useState<Client | null>(null)
  const [form, setForm] = useState<Partial<Client>>(BLANK_CLIENT)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resolvingPlace, setResolvingPlace] = useState(false)
  const [resolveStep, setResolveStep] = useState('')
  const [error, setError] = useState('')
  const [amenityInput, setAmenityInput] = useState('')

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/clients')
    const data = await res.json()
    setClients(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  function startNew() {
    setSelected(null)
    setForm(BLANK_CLIENT)
    setIsNew(true)
    setError('')
  }

  function selectClient(c: Client) {
    setSelected(c)
    setForm(c)
    setIsNew(false)
    setError('')
  }

  async function resolvePlace() {
    if (!form.google_maps_url) return
    setResolvingPlace(true)
    setResolveStep('Fetching place details…')
    setError('')
    try {
      // Step messages that walk through what's happening on the server
      const t1 = setTimeout(
        () => setResolveStep(form.google_search_url ? 'Reading reference URL…' : 'Pulling Google reviews…'),
        1500,
      )
      const t2 = setTimeout(() => setResolveStep('Analysing with Claude AI…'), 3000)

      const res = await fetch('/api/clients/resolve-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleMapsUrl: form.google_maps_url,
          googleSearchUrl: form.google_search_url || undefined,
          clientId: selected?.id,
        }),
      })
      clearTimeout(t1)
      clearTimeout(t2)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setResolveStep('Applying profile…')

      setForm((f) => ({
        ...f,
        // Basic place data
        name:             data.name             || f.name,
        location:         data.address          || f.location,
        google_place_id:  data.placeId          || f.google_place_id,
        lat:              data.lat              ?? f.lat,
        lng:              data.lng              ?? f.lng,
        property_type:    data.propertyType     || f.property_type,
        // AI-enriched fields
        tone:             data.tone             || f.tone,
        target_guests:    data.target_guests    || f.target_guests,
        amenities:        data.amenities?.length ? data.amenities : (f.amenities ?? []),
        usp:              data.usp              || f.usp,
        custom_requirements: data.custom_requirements || f.custom_requirements,
        // Review summary (may be null if there was nothing to summarise — keep existing in that case)
        review_summary:   data.review_summary   || f.review_summary,
      }))
    } catch (e) {
      setError(String(e))
    } finally {
      setResolvingPlace(false)
    }
  }

  async function saveClient() {
    setSaving(true)
    setError('')
    try {
      const url = isNew ? '/api/clients' : `/api/clients/${selected!.id}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchClients()
      setSelected(data)
      setIsNew(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteClient() {
    if (!selected || !confirm(`Delete "${selected.name}"? This cannot be undone.`)) return
    await fetch(`/api/clients/${selected.id}`, { method: 'DELETE' })
    setSelected(null)
    setForm(BLANK_CLIENT)
    setIsNew(false)
    fetchClients()
  }

  function addAmenity() {
    const val = amenityInput.trim()
    if (!val) return
    setForm((f) => ({ ...f, amenities: [...(f.amenities || []), val] }))
    setAmenityInput('')
  }

  function removeAmenity(i: number) {
    setForm((f) => ({ ...f, amenities: f.amenities?.filter((_, idx) => idx !== i) }))
  }

  const showForm = isNew || selected !== null

  return (
    <div className="grid grid-cols-[240px_1fr] h-full">
      {/* Client List */}
      <div className="border-r border-border flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border">
          <button onClick={startNew} className="btn-primary w-full justify-center">
            + New Client
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex justify-center pt-8"><Spinner className="text-muted" /></div>
          ) : clients.length === 0 ? (
            <EmptyState title="No clients yet" description="Create your first client above" />
          ) : (
            clients.map((c) => (
              <button
                key={c.id}
                onClick={() => selectClient(c)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors',
                  selected?.id === c.id ? 'bg-s3 text-text' : 'text-muted hover:text-text hover:bg-s3'
                )}
              >
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs opacity-70 truncate">{c.location}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail / Edit Panel */}
      {!showForm ? (
        <EmptyState icon="◈" title="Select a client or create one" />
      ) : (
        <div className="overflow-y-auto p-6">
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text">
                {isNew ? 'New Client' : 'Edit Client'}
              </h2>
              {!isNew && (
                <button onClick={deleteClient} className="btn-danger text-xs">
                  Delete
                </button>
              )}
            </div>

            {error && (
              <div className="text-xs text-red bg-red/10 border border-red/20 px-3 py-2">
                {error}
              </div>
            )}

            {/* Auto-fill from Google Maps + optional reference URL */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">Auto-fill from Google</p>
                <p className="text-[10px] text-muted opacity-70">Maps URL + reviews + optional reference URL → one Claude analysis</p>
              </div>

              <input
                className="input"
                placeholder="Paste Google Maps URL…"
                value={form.google_maps_url || ''}
                onChange={(e) => setForm((f) => ({ ...f, google_maps_url: e.target.value }))}
              />

              <input
                className="input"
                placeholder="Optional: Google search result, listing, or website URL…"
                value={form.google_search_url || ''}
                onChange={(e) => setForm((f) => ({ ...f, google_search_url: e.target.value }))}
              />

              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted opacity-70">
                  Reviews are pulled and summarised in the same step.
                </p>
                <button
                  onClick={resolvePlace}
                  disabled={resolvingPlace || !form.google_maps_url}
                  className="btn-ghost shrink-0"
                >
                  {resolvingPlace ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <Spinner />
                      {resolveStep || 'Working…'}
                    </span>
                  ) : 'Auto-fill'}
                </button>
              </div>

              {form.google_place_id && (
                <p className="text-xs text-green">✓ Place resolved: {form.google_place_id}</p>
              )}
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Property Name *</label>
                <input className="input" value={form.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="The Serene Guesthouse" />
              </div>
              <div>
                <label className="label">Property Type</label>
                <select className="input" value={form.property_type || 'Hotel'} onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))}>
                  {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Event Radius (km)</label>
                <input type="number" className="input" min={1} max={50} value={form.event_radius || 5} onChange={(e) => setForm((f) => ({ ...f, event_radius: +e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Location / Address</label>
                <input className="input" value={form.location || ''} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Auroville, Tamil Nadu" />
              </div>
              <div>
                <label className="label">Tone of Voice</label>
                <select className="input" value={form.tone || 'warm and inviting'} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}>
                  {TONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Target Guests</label>
                <input className="input" value={form.target_guests || ''} onChange={(e) => setForm((f) => ({ ...f, target_guests: e.target.value }))} placeholder="Spiritual seekers, digital nomads…" />
              </div>
              <div className="col-span-2">
                <label className="label">Unique Selling Point</label>
                <input className="input" value={form.usp || ''} onChange={(e) => setForm((f) => ({ ...f, usp: e.target.value }))} placeholder="Organic farm-to-table, forest setting…" />
              </div>
              <div className="col-span-2">
                <label className="label">Custom Requirements for AI</label>
                <textarea className="input resize-none" rows={3} value={form.custom_requirements || ''} onChange={(e) => setForm((f) => ({ ...f, custom_requirements: e.target.value }))} placeholder="Always mention eco-friendly practices, avoid showing prices…" />
              </div>
            </div>

            {/* Amenities */}
            <div>
              <label className="label">Amenities</label>
              <div className="flex gap-2 mb-2">
                <input className="input flex-1" value={amenityInput} onChange={(e) => setAmenityInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAmenity()} placeholder="e.g. Pool, Yoga, Organic Food…" />
                <button onClick={addAmenity} className="btn-ghost shrink-0">Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(form.amenities || []).map((a, i) => (
                  <span key={i} className="badge bg-s3 text-muted gap-1">
                    {a}
                    <button onClick={() => removeAmenity(i)} className="hover:text-red ml-0.5">×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Instagram */}
            <div className="card space-y-3">
              <p className="text-xs text-muted">Instagram Publishing</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Instagram Handle</label>
                  <input className="input" value={form.instagram_handle || ''} onChange={(e) => setForm((f) => ({ ...f, instagram_handle: e.target.value }))} placeholder="@yourhandle" />
                </div>
                <div>
                  <label className="label">Page ID</label>
                  <input className="input" value={form.instagram_page_id || ''} onChange={(e) => setForm((f) => ({ ...f, instagram_page_id: e.target.value }))} placeholder="123456789" />
                </div>
                <div className="col-span-2">
                  <label className="label">Long-lived Access Token</label>
                  <input type="password" className="input" value={form.instagram_token || ''} onChange={(e) => setForm((f) => ({ ...f, instagram_token: e.target.value }))} placeholder="EAAG…" />
                </div>
              </div>
            </div>

            {/* Review Summary — populated by Auto-fill */}
            {form.review_summary && (
              <div className="card space-y-3">
                <p className="text-xs text-muted">Google Review Intelligence</p>
                <ReviewSummaryDisplay summary={form.review_summary as ReviewSummary} />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={saveClient} disabled={saving || !form.name} className="btn-primary">
                {saving ? <><Spinner className="mr-1.5" />Saving…</> : isNew ? 'Create Client' : 'Save Changes'}
              </button>
              <button onClick={() => { setSelected(null); setIsNew(false) }} className="btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewSummaryDisplay({ summary }: { summary: ReviewSummary }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="text-gold">★ {summary.rating}</span>
        <span>{summary.review_count} reviews</span>
        {summary.cost_usd && <span className="ml-auto">${summary.cost_usd.toFixed(4)}</span>}
      </div>
      {summary.highlights?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.highlights.map((h, i) => (
            <span key={i} className="badge bg-gold/10 text-gold">{h}</span>
          ))}
        </div>
      )}
      {summary.top_quotes?.length > 0 && (
        <div className="space-y-1">
          {summary.top_quotes.map((q, i) => (
            <blockquote key={i} className="text-xs text-muted italic border-l-2 border-gold/30 pl-2">"{q}"</blockquote>
          ))}
        </div>
      )}
      {summary.ad_angles?.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-1">Ad Angles</p>
          <ul className="space-y-0.5">
            {summary.ad_angles.map((a, i) => (
              <li key={i} className="text-xs text-text flex gap-1.5"><span className="text-gold">→</span>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.summary && (
        <p className="text-xs text-muted leading-relaxed">{summary.summary}</p>
      )}
    </div>
  )
}

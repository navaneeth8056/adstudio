const MAPS_BASE = 'https://maps.googleapis.com/maps/api'

function key() {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set')
  }
  return process.env.GOOGLE_MAPS_API_KEY
}

// ─── Place Resolution ─────────────────────────────────────────────────────────

export interface PlaceDetails {
  placeId: string
  name: string
  address: string
  lat: number
  lng: number
  rating?: number
  totalRatings?: number
  propertyType?: string
}

/**
 * Resolve a Google Maps URL to place details.
 * Strategy:
 *  1. Parse name + coords directly from URL (no API call needed)
 *  2. Try to enrich via Geocoding API for a proper place_id
 *  3. If Google API unavailable, return parsed data with a synthetic id
 */
export async function resolvePlaceFromUrl(mapsUrl: string): Promise<PlaceDetails> {
  let finalUrl = mapsUrl

  // Follow short URL redirects
  if (mapsUrl.includes('maps.app.goo.gl') || mapsUrl.includes('goo.gl')) {
    try {
      const res = await fetch(mapsUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      finalUrl = res.url
    } catch {
      finalUrl = mapsUrl
    }
  }

  // ── Step 1: Parse directly from URL (no API) ──────────────────────────────

  // Extract place name from /place/Name+Here/ segment
  let parsedName = ''
  const nameMatch = finalUrl.match(/\/place\/([^/@?]+)/)
  if (nameMatch) {
    parsedName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '))
  }

  // Extract coordinates from @lat,lng
  let parsedLat: number | null = null
  let parsedLng: number | null = null
  const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (coordMatch) {
    parsedLat = parseFloat(coordMatch[1])
    parsedLng = parseFloat(coordMatch[2])
  }

  // If we couldn't parse anything at all, fail early
  if (!parsedName && parsedLat === null) {
    throw new Error('Could not parse place name or coordinates from URL')
  }

  // ── Step 2: Try to enrich via Google API ─────────────────────────────────

  try {
    let placeId: string | undefined

    // Try reverse geocode from coordinates first
    if (parsedLat !== null && parsedLng !== null) {
      placeId = await reverseGeocodePlaceId(parsedLat, parsedLng)
    }

    // Fall back to text search using parsed name
    if (!placeId && parsedName) {
      placeId = await searchPlaceId(parsedName)
    }

    if (placeId) {
      return getPlaceDetails(placeId)
    }
  } catch (apiErr) {
    console.warn('[google-maps] API enrichment failed, using parsed URL data:', apiErr)
  }

  // ── Step 3: Return parsed URL data as fallback (no place_id needed) ───────

  if (parsedLat === null || parsedLng === null) {
    throw new Error('Could not get coordinates. Please ensure your Google Maps API key is set correctly.')
  }

  return {
    placeId: '',
    name: parsedName || 'Unknown Property',
    address: `${parsedLat.toFixed(6)}, ${parsedLng.toFixed(6)}`,
    lat: parsedLat,
    lng: parsedLng,
    propertyType: 'Hotel',
  }
}

export async function reverseGeocodePlaceId(lat: number, lng: number): Promise<string> {
  const url = `${MAPS_BASE}/geocode/json?latlng=${lat},${lng}&key=${key()}`
  const data = await fetch(url).then((r) => r.json())
  if (data.error_message) throw new Error(data.error_message)
  return data.results?.[0]?.place_id
}

export async function searchPlaceId(query: string): Promise<string> {
  const url = `${MAPS_BASE}/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${key()}`
  const data = await fetch(url).then((r) => r.json())
  if (data.error_message) throw new Error(data.error_message)
  return data.candidates?.[0]?.place_id
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const fields = 'place_id,name,formatted_address,geometry,rating,user_ratings_total,types'
  const url = `${MAPS_BASE}/place/details/json?place_id=${placeId}&fields=${fields}&key=${key()}`
  const data = await fetch(url).then((r) => r.json())
  if (data.error_message) throw new Error(data.error_message)
  const r = data.result

  const types: string[] = r.types || []
  const propertyType = types.includes('lodging')
    ? 'Hotel'
    : types.includes('restaurant')
    ? 'Restaurant'
    : types.includes('spa')
    ? 'Spa'
    : 'Property'

  return {
    placeId: r.place_id,
    name: r.name,
    address: r.formatted_address,
    lat: r.geometry?.location?.lat,
    lng: r.geometry?.location?.lng,
    rating: r.rating,
    totalRatings: r.user_ratings_total,
    propertyType,
  }
}

// ─── Full Place Data (for AI enrichment) ─────────────────────────────────────

export interface FullPlaceData {
  reviews: { text: string; rating: number; time: number }[]
  website?: string
  phone?: string
  priceLevel?: number
  types?: string[]
  openingHours?: string[]
  editorialSummary?: string
}

export async function getFullPlaceData(placeId: string): Promise<FullPlaceData> {
  const fields = [
    'reviews',
    'website',
    'formatted_phone_number',
    'price_level',
    'types',
    'opening_hours',
    'editorial_summary',
  ].join(',')

  const url = `${MAPS_BASE}/place/details/json?place_id=${placeId}&fields=${fields}&key=${key()}`
  const data = await fetch(url).then((r) => r.json())

  if (data.error_message) throw new Error(data.error_message)

  const r = data.result ?? {}

  return {
    reviews: (r.reviews ?? []).map((rv: { text: string; rating: number; time: number }) => ({
      text: rv.text,
      rating: rv.rating,
      time: rv.time,
    })),
    website: r.website,
    phone: r.formatted_phone_number,
    priceLevel: r.price_level,
    types: r.types,
    openingHours: r.opening_hours?.weekday_text,
    editorialSummary: r.editorial_summary?.overview,
  }
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface PlaceReview {
  text: string
  rating: number
  time: number
}

export async function getPlaceReviews(placeId: string): Promise<PlaceReview[]> {
  const url = `${MAPS_BASE}/place/details/json?place_id=${placeId}&fields=reviews&key=${key()}`
  const data = await fetch(url).then((r) => r.json())
  return (data.result?.reviews || []).map((r: PlaceReview) => ({
    text: r.text,
    rating: r.rating,
    time: r.time,
  }))
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export async function getPlacePhotos(placeId: string, maxPhotos = 10): Promise<string[]> {
  const url = `${MAPS_BASE}/place/details/json?place_id=${placeId}&fields=photos&key=${key()}`
  const data = await fetch(url).then((r) => r.json())
  const photos: { photo_reference: string }[] = data.result?.photos || []

  return photos.slice(0, maxPhotos).map(
    (p) =>
      `${MAPS_BASE}/place/photo?maxwidth=1200&photo_reference=${p.photo_reference}&key=${key()}`
  )
}

// ─── Places Autocomplete ──────────────────────────────────────────────────────

export interface PlaceAutocomplete {
  placeId: string
  description: string
  mainText: string
}

export async function autocompletePlaces(query: string): Promise<PlaceAutocomplete[]> {
  const url = `${MAPS_BASE}/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${key()}`
  const data = await fetch(url).then((r) => r.json())
  return (data.predictions || []).map((p: { place_id: string; description: string; structured_formatting: { main_text: string } }) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text,
  }))
}

// ─── Geocode ──────────────────────────────────────────────────────────────────

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${MAPS_BASE}/geocode/json?address=${encodeURIComponent(address)}&key=${key()}`
  const data = await fetch(url).then((r) => r.json())
  const loc = data.results?.[0]?.geometry?.location
  return loc ? { lat: loc.lat, lng: loc.lng } : null
}

// ─── Utils ────────────────────────────────────────────────────────────────────

/** Haversine distance in km */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

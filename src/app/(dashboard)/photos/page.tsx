'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Client, Photo, Folder } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/cn'
import Image from 'next/image'

export default function PhotosPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importingGoogle, setImportingGoogle] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => { setClients(d || []); setLoadingClients(false) })
  }, [])

  const loadPhotos = useCallback(async (clientId: string) => {
    setLoadingPhotos(true)
    const res = await fetch(`/api/photos?clientId=${clientId}`)
    const data = await res.json()
    setFolders(data.folders || [])
    setPhotos(data.photos || [])
    setLoadingPhotos(false)
  }, [])

  useEffect(() => {
    if (selectedClient) loadPhotos(selectedClient.id)
  }, [selectedClient, loadPhotos])

  async function handleUpload(files: FileList | null) {
    if (!files || !selectedClient) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.readAsDataURL(file)
      })
      await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          folderId: selectedFolder?.id,
          filename: file.name,
          dataUrl,
        }),
      })
    }

    await loadPhotos(selectedClient.id)
    setUploading(false)
  }

  async function importFromGoogle() {
    if (!selectedClient) return
    setImportingGoogle(true)
    setImportMsg('')
    try {
      const res = await fetch('/api/photos/import-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient.id, maxPhotos: 10 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportMsg(data.message)
      await loadPhotos(selectedClient.id)
    } catch (e) {
      setImportMsg(String(e))
    } finally {
      setImportingGoogle(false)
    }
  }

  async function deletePhoto(id: string) {
    if (!confirm('Delete this photo?')) return
    await fetch(`/api/photos?id=${id}`, { method: 'DELETE' })
    setPhotos((p) => p.filter((ph) => ph.id !== id))
  }

  const visiblePhotos = selectedFolder
    ? photos.filter((p) => p.folder_id === selectedFolder.id)
    : photos

  return (
    <div className="grid grid-cols-[200px_160px_1fr] h-full">
      {/* Client column */}
      <div className="border-r border-border flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border">
          <p className="text-xs text-muted">Clients</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingClients ? (
            <div className="flex justify-center pt-8"><Spinner className="text-muted" /></div>
          ) : clients.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedClient(c); setSelectedFolder(null) }}
              className={cn(
                'w-full text-left px-3 py-2 rounded text-xs transition-colors',
                selectedClient?.id === c.id ? 'bg-s3 text-text' : 'text-muted hover:text-text hover:bg-s3'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Folder column */}
      <div className="border-r border-border flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border">
          <p className="text-xs text-muted">Folders</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {selectedClient && (
            <button
              onClick={() => setSelectedFolder(null)}
              className={cn(
                'w-full text-left px-3 py-2 rounded text-xs transition-colors',
                !selectedFolder ? 'bg-s3 text-text' : 'text-muted hover:text-text hover:bg-s3'
              )}
            >
              All Photos
            </button>
          )}
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFolder(f)}
              className={cn(
                'w-full text-left px-3 py-2 rounded text-xs transition-colors',
                selectedFolder?.id === f.id ? 'bg-s3 text-text' : 'text-muted hover:text-text hover:bg-s3'
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      {/* Photo grid */}
      <div className="flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <p className="text-xs text-muted">
            {selectedClient
              ? `${visiblePhotos.length} photo${visiblePhotos.length !== 1 ? 's' : ''}${selectedFolder ? ` in ${selectedFolder.name}` : ''}`
              : 'Select a client'}
          </p>
          {selectedClient && (
            <div className="flex items-center gap-2">
              {selectedClient.google_place_id && (
                <button
                  onClick={importFromGoogle}
                  disabled={importingGoogle || uploading}
                  className="btn-ghost text-xs"
                  title="Import photos directly from this property's Google Maps listing"
                >
                  {importingGoogle ? <><Spinner className="mr-1" />Importing…</> : '⊕ Import from Google'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || importingGoogle}
                className="btn-primary text-xs"
              >
                {uploading ? <><Spinner className="mr-1" />Uploading…</> : '+ Upload Photos'}
              </button>
            </div>
          )}
        </div>

        {importMsg && (
          <div className={cn(
            'px-4 py-2 text-xs border-b border-border',
            importMsg.toLowerCase().includes('error') || importMsg.toLowerCase().includes('failed') || importMsg.startsWith('Error')
              ? 'text-red bg-red/10'
              : 'text-green bg-green/10'
          )}>
            {importMsg}
            <button onClick={() => setImportMsg('')} className="ml-2 opacity-50 hover:opacity-100">×</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedClient ? (
            <EmptyState icon="⊞" title="Select a client to view photos" />
          ) : loadingPhotos ? (
            <div className="flex justify-center pt-12"><Spinner className="text-muted" /></div>
          ) : visiblePhotos.length === 0 ? (
            <EmptyState icon="⊞" title="No photos yet" description="Upload photos to get started" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {visiblePhotos.map((photo) => (
                <div key={photo.id} className="group relative aspect-square bg-s2 rounded overflow-hidden border border-border hover:border-gold/50 transition-colors">
                  <Image
                    src={photo.public_url}
                    alt={photo.filename}
                    fill
                    className="object-cover"
                    sizes="140px"
                  />
                  <div className="absolute inset-0 bg-bg/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <p className="text-[10px] text-text text-center truncate w-full">{photo.filename}</p>
                    <button
                      onClick={() => deletePhoto(photo.id)}
                      className="text-[10px] text-red hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

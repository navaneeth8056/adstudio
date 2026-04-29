'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { AdLabels } from '@/types'

interface AdPreviewProps {
  imageUrl: string
  labels: AdLabels
  onLabelsChange: (labels: AdLabels) => void
}

export function AdPreview({ imageUrl, labels, onLabelsChange }: AdPreviewProps) {
  const [editingField, setEditingField] = useState<keyof AdLabels | null>(null)

  function update(field: keyof AdLabels, value: string | number) {
    onLabelsChange({ ...labels, [field]: value })
    setEditingField(null)
  }

  function EditableText({
    field,
    className,
    multiline = false,
  }: {
    field: keyof AdLabels
    className: string
    multiline?: boolean
  }) {
    const value = labels[field]
    const isEditing = editingField === field

    if (isEditing) {
      if (multiline) {
        return (
          <textarea
            autoFocus
            defaultValue={String(value)}
            className="bg-black/50 text-white text-xs p-1 w-full resize-none outline-none border border-white/30"
            rows={3}
            onBlur={(e) => update(field, e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && update(field, e.currentTarget.value)}
          />
        )
      }
      return (
        <input
          autoFocus
          type="text"
          defaultValue={String(value)}
          className="bg-black/50 text-white text-xs p-0.5 w-full outline-none border-b border-white/50"
          onBlur={(e) => update(field, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') update(field, e.currentTarget.value) }}
        />
      )
    }

    return (
      <span
        className={`${className} cursor-pointer hover:opacity-80 transition-opacity`}
        onClick={() => setEditingField(field)}
        title="Click to edit"
      >
        {value}
      </span>
    )
  }

  return (
    <div className="relative w-full aspect-square bg-black overflow-hidden rounded group">
      <Image src={imageUrl} alt="Ad preview" fill className="object-cover" sizes="500px" />

      {/* Top overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
        <EditableText
          field="property_name"
          className="block text-white font-serif text-lg leading-tight drop-shadow"
        />
        <EditableText
          field="location"
          className="block text-white/70 text-xs mt-0.5 drop-shadow"
        />
      </div>

      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        {/* Stars */}
        <div className="flex items-center gap-0.5 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={`text-sm cursor-pointer ${i < labels.stars ? 'text-gold' : 'text-white/30'}`}
              onClick={() => update('stars', i + 1)}
            >
              ★
            </span>
          ))}
        </div>

        {/* Hook */}
        <EditableText
          field="hook"
          className="block text-white font-serif italic text-xl leading-tight mb-1 drop-shadow"
        />

        {/* Body */}
        <EditableText
          field="body"
          className="block text-white/80 text-xs leading-relaxed mb-3 drop-shadow"
          multiline
        />

        {/* CTA */}
        <div className="inline-block bg-gold px-3 py-1 text-xs font-medium text-bg cursor-pointer hover:bg-gold-hover transition-colors"
          onClick={() => setEditingField('cta')}
        >
          {editingField === 'cta' ? (
            <input
              autoFocus
              type="text"
              defaultValue={labels.cta}
              className="bg-transparent outline-none text-bg w-32"
              onBlur={(e) => update('cta', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') update('cta', e.currentTarget.value) }}
            />
          ) : labels.cta}
        </div>
      </div>

      {/* Edit hint */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/40 text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        Click text to edit
      </div>
    </div>
  )
}

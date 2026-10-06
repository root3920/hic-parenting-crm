'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Loader2, Send, X, Image as ImageIcon } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  crm_dashboard: 'CRM / Dashboard',
  gohighlevel: 'GoHighLevel',
  zapier_automatizaciones: 'Zapier / Automatizaciones',
  email: 'Email',
  acceso_contrasenas: 'Acceso / Contraseñas',
  zoom_llamadas: 'Zoom / Llamadas',
  hotmart_pagos: 'Hotmart / Pagos',
  equipo_hardware: 'Equipo / Hardware',
  otro: 'Otro',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS)
const PRIORITIES = Object.keys(PRIORITY_LABELS)

export { CATEGORY_LABELS, PRIORITY_LABELS, CATEGORIES, PRIORITIES }

interface TicketFormProps {
  /** 'dashboard' = authenticated user in dashboard, 'public' = public form */
  mode: 'dashboard' | 'public'
  /** Called after a successful submit. Receives ticket_number for public mode. */
  onSuccess: (ticketNumber?: number) => void
  /** Optional class for the form wrapper */
  className?: string
}

export function TicketForm({ mode, onSuccess, className }: TicketFormProps) {
  // Public-only fields
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [honeypot, setHoneypot] = useState('')

  // Common fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('medium')
  const [pageUrl, setPageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isPublic = mode === 'public'
  const uploadEndpoint = isPublic ? '/api/it-tickets/public/upload' : '/api/it-tickets/upload'
  const submitEndpoint = isPublic ? '/api/it-tickets/public' : '/api/it-tickets'

  function reset() {
    setContactName(''); setContactEmail(''); setContactPhone(''); setHoneypot('')
    setTitle(''); setCategory(''); setPriority('medium')
    setPageUrl(''); setDescription(''); setFiles([])
    setSubmitting(false); setUploading(false)
  }

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(uploadEndpoint, { method: 'POST', body: fd })
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? 'Error subiendo archivo')
      return null
    }
    const data = await res.json()
    return data.path
  }

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Public validations
    if (isPublic) {
      if (!contactName || contactName.length < 2) { toast.error('Ingresa tu nombre (mínimo 2 caracteres)'); return }
      if (!contactEmail || !validateEmail(contactEmail)) { toast.error('Ingresa un email válido'); return }
    }

    if (!title || title.length < 3) { toast.error('El título debe tener al menos 3 caracteres'); return }
    if (!description || description.length < 10) { toast.error('La descripción debe tener al menos 10 caracteres'); return }
    if (!category) { toast.error('Selecciona una categoría'); return }

    setSubmitting(true)

    // Upload pending files
    const paths: string[] = []
    if (files.length > 0) {
      setUploading(true)
      for (const file of files) {
        if (paths.length >= 3) break
        const path = await uploadFile(file)
        if (path) paths.push(path)
      }
      setUploading(false)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      title, description, category, priority,
      page_url: pageUrl || undefined,
      attachment_urls: paths,
    }

    if (isPublic) {
      body.contact_name = contactName
      body.contact_email = contactEmail
      body.contact_phone = contactPhone || undefined
      body.website = honeypot // honeypot field
    }

    const res = await fetch(submitEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? 'Error creando ticket')
      setSubmitting(false)
      return
    }

    const data = await res.json()
    reset()

    if (isPublic) {
      onSuccess(data.ticket_number)
    } else {
      toast.success('Ticket creado correctamente')
      onSuccess()
    }
  }

  function handleFiles(newFiles: FileList | File[]) {
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    const valid = Array.from(newFiles).filter(f => {
      if (!allowed.includes(f.type)) { toast.error(`${f.name}: tipo no permitido`); return false }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name}: excede 5 MB`); return false }
      return true
    })
    setFiles(prev => [...prev, ...valid].slice(0, 3))
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const images: File[] = []
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) images.push(file)
      }
    }
    if (images.length > 0) {
      e.preventDefault()
      handleFiles(images)
    }
  }

  const inputClass = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/40'

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)} onPaste={handlePaste}>
      {/* Public-only contact fields */}
      {isPublic && (
        <>
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Tu nombre *</label>
            <input
              value={contactName} onChange={e => setContactName(e.target.value)}
              maxLength={80}
              className={inputClass}
              placeholder="Nombre completo"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Tu email *</label>
              <input
                type="email"
                value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                className={inputClass}
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                Teléfono / WhatsApp <span className="text-zinc-400 font-normal">(opcional)</span>
              </label>
              <input
                value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                maxLength={30}
                className={inputClass}
                placeholder="+1 555 123 4567"
              />
            </div>
          </div>
          {/* Honeypot — hidden from humans */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
            />
          </div>
        </>
      )}

      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Título *</label>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          maxLength={120}
          className={inputClass}
          placeholder="Describe brevemente el problema"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Categoría *</label>
          <select
            value={category} onChange={e => setCategory(e.target.value)}
            className={inputClass}
          >
            <option value="">Seleccionar...</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Prioridad</label>
          <select
            value={priority} onChange={e => setPriority(e.target.value)}
            className={inputClass}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}{p === 'urgent' ? ' (no puedo trabajar)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
          ¿Dónde ocurrió? <span className="text-zinc-400 font-normal">(opcional)</span>
        </label>
        <input
          value={pageUrl} onChange={e => setPageUrl(e.target.value)}
          maxLength={300}
          className={inputClass}
          placeholder="URL o nombre de la herramienta"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Descripción *</label>
        <textarea
          value={description} onChange={e => setDescription(e.target.value)}
          rows={4}
          maxLength={4000}
          className={cn(inputClass, 'resize-none')}
          placeholder="¿Qué intentabas hacer? ¿Qué pasó? ¿Desde cuándo ocurre?"
        />
        <p className="text-[10px] text-zinc-400 mt-0.5 text-right">{description.length}/4000</p>
      </div>

      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
          Captura de pantalla <span className="text-zinc-400 font-normal">(máx 3, pegar con Ctrl+V)</span>
        </label>
        <div
          className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-[#ffbd59]/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files) }}
        >
          <ImageIcon className="h-5 w-5 mx-auto text-zinc-400 mb-1" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Arrastra imágenes aquí o haz clic para seleccionar
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files) }}
          />
        </div>
        {files.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {files.map((f, i) => (
              <div key={i} className="relative group">
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="h-16 w-16 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#ffbd59] text-[#1a1a2e] hover:bg-[#ffbd59]/90 disabled:opacity-50 transition-colors"
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" />{uploading ? 'Subiendo imágenes...' : 'Enviando...'}</>
        ) : (
          <><Send className="h-4 w-4" />Enviar ticket</>
        )}
      </button>
    </form>
  )
}

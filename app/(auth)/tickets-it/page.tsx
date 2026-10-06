'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useProfile } from '@/hooks/useProfile'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  LifeBuoy, Plus, Clock, CheckCircle, AlertTriangle, Loader2, Send,
  ChevronLeft, ChevronRight, Search, X, Image as ImageIcon, Paperclip,
  ArrowRight, MessageSquare, FileText, Zap,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

// ── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string
  ticket_number: number
  title: string
  description: string
  category: string
  priority: string
  status: string
  page_url: string | null
  attachment_urls: string[]
  requester_id: string
  requester_name: string | null
  requester_email: string | null
  requester_role: string | null
  admin_notes: string | null
  created_at: string
  started_at: string | null
  resolved_at: string | null
  closed_at: string | null
  updated_at: string
  signed_attachment_urls?: string[]
}

interface TicketEvent {
  id: string
  ticket_id: string
  event_type: string
  from_value: string | null
  to_value: string | null
  comment: string | null
  actor_id: string | null
  actor_name: string | null
  actor_role: string | null
  created_at: string
}

// ── Constants ────────────────────────────────────────────────────────────────

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

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS)
const PRIORITIES = Object.keys(PRIORITY_LABELS)

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    closed: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', styles[status] ?? styles.pending)}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    low: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    medium: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', styles[priority] ?? styles.medium)}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  )
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

function formatFullDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return '' }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days}d`
  const months = Math.floor(days / 30)
  return `hace ${months} mes${months > 1 ? 'es' : ''}`
}

function ticketNumber(n: number): string {
  return `#${String(n).padStart(4, '0')}`
}

// ── New Ticket Dialog ────────────────────────────────────────────────────────

function NewTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('medium')
  const [pageUrl, setPageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setTitle(''); setCategory(''); setPriority('medium')
    setPageUrl(''); setDescription(''); setFiles([])
    setUploadedPaths([]); setSubmitting(false); setUploading(false)
  }

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/it-tickets/upload', { method: 'POST', body: fd })
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? 'Error subiendo archivo')
      return null
    }
    const data = await res.json()
    return data.path
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || title.length < 3) { toast.error('El título debe tener al menos 3 caracteres'); return }
    if (!description || description.length < 10) { toast.error('La descripción debe tener al menos 10 caracteres'); return }
    if (!category) { toast.error('Selecciona una categoría'); return }

    setSubmitting(true)

    // Upload pending files
    const paths = [...uploadedPaths]
    if (files.length > 0) {
      setUploading(true)
      for (const file of files) {
        if (paths.length >= 3) break
        const path = await uploadFile(file)
        if (path) paths.push(path)
      }
      setUploading(false)
    }

    const res = await fetch('/api/it-tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description, category, priority,
        page_url: pageUrl || undefined,
        attachment_urls: paths,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? 'Error creando ticket')
      setSubmitting(false)
      return
    }

    toast.success('Ticket creado correctamente')
    reset()
    onCreated()
    onOpenChange(false)
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Nuevo Ticket IT</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2" onPaste={handlePaste}>
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Título *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              maxLength={120}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/40"
              placeholder="Describe brevemente el problema"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Categoría *</label>
              <select
                value={category} onChange={e => setCategory(e.target.value)}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Seleccionar...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Prioridad</label>
              <select
                value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
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
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/40"
              placeholder="URL o nombre de la herramienta"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Descripción *</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/40 resize-none"
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
      </DialogContent>
    </Dialog>
  )
}

// ── Ticket Detail Dialog ─────────────────────────────────────────────────────

function TicketDetail({
  ticketId,
  isAdmin,
  onClose,
  onUpdated,
}: {
  ticketId: string
  isAdmin: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/it-tickets/${ticketId}`)
    if (!res.ok) { toast.error('Error cargando ticket'); onClose(); return }
    const data = await res.json()
    setTicket(data.ticket)
    setEvents(data.events)
    setAdminNotes(data.ticket.admin_notes ?? '')
    setLoading(false)
  }, [ticketId, onClose])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  async function handleStatusChange(newStatus: string) {
    if (!ticket) return
    if (newStatus === 'closed' && !confirm('¿Cerrar este ticket?')) return
    setSaving(true)
    const res = await fetch(`/api/it-tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) { toast.error('Error actualizando status'); setSaving(false); return }
    toast.success(`Ticket ${STATUS_LABELS[newStatus]?.toLowerCase()}`)
    setSaving(false)
    fetchDetail()
    onUpdated()
  }

  async function handlePriorityChange(newPriority: string) {
    if (!ticket) return
    setSaving(true)
    const res = await fetch(`/api/it-tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: newPriority }),
    })
    if (!res.ok) { toast.error('Error actualizando prioridad'); setSaving(false); return }
    toast.success('Prioridad actualizada')
    setSaving(false)
    fetchDetail()
    onUpdated()
  }

  async function handleSaveNotes() {
    if (!ticket) return
    setSaving(true)
    const res = await fetch(`/api/it-tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_notes: adminNotes }),
    })
    if (!res.ok) { toast.error('Error guardando nota'); setSaving(false); return }
    toast.success('Nota guardada')
    setSaving(false)
    fetchDetail()
    onUpdated()
  }

  async function handleComment() {
    if (!comment.trim()) return
    setSendingComment(true)
    const res = await fetch(`/api/it-tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: comment.trim() }),
    })
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? 'Error enviando comentario')
      setSendingComment(false)
      return
    }
    setComment('')
    setSendingComment(false)
    fetchDetail()
  }

  if (loading) {
    return (
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      </DialogContent>
    )
  }

  if (!ticket) return null

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
      <DialogHeader>
        <DialogTitle className="text-base flex items-center gap-2 flex-wrap">
          <span className="text-zinc-400 font-mono">{ticketNumber(ticket.ticket_number)}</span>
          {ticket.title}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        {/* Status & Priority */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="text-xs text-zinc-400">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
        </div>

        {/* Info rows */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="text-zinc-400">Solicitante</div>
          <div className="text-zinc-700 dark:text-zinc-300">{ticket.requester_name} ({ticket.requester_role})</div>
          <div className="text-zinc-400">Fecha de solicitud</div>
          <div className="text-zinc-700 dark:text-zinc-300" title={formatFullDateTime(ticket.created_at)}>{formatDateTime(ticket.created_at)}</div>
          {ticket.resolved_at && <>
            <div className="text-zinc-400">Fecha de resolución</div>
            <div className="text-zinc-700 dark:text-zinc-300" title={formatFullDateTime(ticket.resolved_at)}>{formatDateTime(ticket.resolved_at)}</div>
          </>}
          {ticket.page_url && <>
            <div className="text-zinc-400">Ubicación</div>
            <div className="text-zinc-700 dark:text-zinc-300 break-all">{ticket.page_url}</div>
          </>}
        </div>

        {/* Description */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Descripción</p>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
            {ticket.description}
          </p>
        </div>

        {/* Attachments */}
        {ticket.signed_attachment_urls && ticket.signed_attachment_urls.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Adjuntos</p>
            <div className="flex gap-2 flex-wrap">
              {ticket.signed_attachment_urls.map((url, i) => (
                url && (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Adjunto ${i + 1}`} className="h-24 w-24 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700 hover:opacity-80 transition-opacity" />
                  </a>
                )
              ))}
            </div>
          </div>
        )}

        {/* Admin notes (visible for both roles) */}
        {(ticket.admin_notes || isAdmin) && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Nota de resolución</p>
            {isAdmin ? (
              <div className="space-y-2">
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/40 resize-none"
                  placeholder="Solución o explicación para el solicitante..."
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={saving || adminNotes === (ticket.admin_notes ?? '')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#ffbd59] text-[#1a1a2e] font-medium hover:bg-[#ffbd59]/90 disabled:opacity-50 transition-colors"
                >
                  Guardar nota
                </button>
              </div>
            ) : (
              <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                {ticket.admin_notes}
              </p>
            )}
          </div>
        )}

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <select
              value={ticket.status}
              onChange={e => handleStatusChange(e.target.value)}
              disabled={saving}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="pending">Pendiente</option>
              <option value="in_progress">En curso</option>
              <option value="resolved">Resuelto</option>
              <option value="closed">Cerrado</option>
            </select>
            <select
              value={ticket.priority}
              onChange={e => handlePriorityChange(e.target.value)}
              disabled={saving}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
            {ticket.status !== 'resolved' && (
              <button
                onClick={() => handleStatusChange('resolved')}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Marcar resuelto
              </button>
            )}
            {ticket.status !== 'closed' && (
              <button
                onClick={() => handleStatusChange('closed')}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-zinc-600 text-white font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                Cerrar ticket
              </button>
            )}
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Historial</p>
          <div className="space-y-3">
            {events.map(ev => (
              <div key={ev.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center shrink-0',
                    ev.event_type === 'comment' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    ev.event_type === 'created' ? 'bg-green-100 dark:bg-green-900/30' :
                    'bg-zinc-100 dark:bg-zinc-800'
                  )}>
                    {ev.event_type === 'comment' ? <MessageSquare className="h-3 w-3 text-blue-600 dark:text-blue-400" /> :
                     ev.event_type === 'created' ? <Plus className="h-3 w-3 text-green-600 dark:text-green-400" /> :
                     ev.event_type === 'status_changed' ? <ArrowRight className="h-3 w-3 text-zinc-500" /> :
                     ev.event_type === 'priority_changed' ? <Zap className="h-3 w-3 text-orange-500" /> :
                     <FileText className="h-3 w-3 text-zinc-500" />}
                  </div>
                  <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                </div>
                <div className="pb-3 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{ev.actor_name ?? 'Sistema'}</span>
                    <span className="text-[10px] text-zinc-400" title={formatFullDateTime(ev.created_at)}>{timeAgo(ev.created_at)}</span>
                  </div>
                  {ev.event_type === 'comment' && (
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 whitespace-pre-wrap">{ev.comment}</p>
                  )}
                  {ev.event_type === 'created' && (
                    <p className="text-xs text-zinc-500">Ticket creado</p>
                  )}
                  {ev.event_type === 'status_changed' && (
                    <p className="text-xs text-zinc-500">
                      Status: {STATUS_LABELS[ev.from_value ?? ''] ?? ev.from_value} → {STATUS_LABELS[ev.to_value ?? ''] ?? ev.to_value}
                    </p>
                  )}
                  {ev.event_type === 'priority_changed' && (
                    <p className="text-xs text-zinc-500">
                      Prioridad: {PRIORITY_LABELS[ev.from_value ?? ''] ?? ev.from_value} → {PRIORITY_LABELS[ev.to_value ?? ''] ?? ev.to_value}
                    </p>
                  )}
                  {ev.event_type === 'notes_updated' && (
                    <p className="text-xs text-zinc-500">Nota de resolución actualizada</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comment box */}
        {(ticket.status !== 'closed' || isAdmin) && (
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment() } }}
              placeholder="Escribe un comentario..."
              className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/40"
            />
            <button
              onClick={handleComment}
              disabled={sendingComment || !comment.trim()}
              className="px-3 py-2 rounded-lg bg-[#ffbd59] text-[#1a1a2e] font-medium hover:bg-[#ffbd59]/90 disabled:opacity-50 transition-colors"
            >
              {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </DialogContent>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function TicketsITPage() {
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Dialogs
  const [newTicketOpen, setNewTicketOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'open') params.set('status', statusFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    if (categoryFilter) params.set('category', categoryFilter)
    if (debouncedSearch) params.set('q', debouncedSearch)
    params.set('page', String(page))

    const res = await fetch(`/api/it-tickets?${params}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()

    let list: Ticket[] = data.tickets ?? []

    // Client-side filter for "open" (pending + in_progress)
    if (statusFilter === 'open') {
      list = list.filter(t => t.status === 'pending' || t.status === 'in_progress')
    }

    // Sort: for admin default, prioritize by urgency then age
    if (isAdmin && (statusFilter === 'open' || statusFilter === 'all')) {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
      list.sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 2
        const pb = priorityOrder[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
    }

    setTickets(list)
    setTotal(data.total ?? list.length)
    setLoading(false)
  }, [statusFilter, priorityFilter, categoryFilter, debouncedSearch, page, isAdmin])

  useEffect(() => { if (!profileLoading) fetchTickets() }, [fetchTickets, profileLoading])
  useEffect(() => { setPage(0) }, [statusFilter, priorityFilter, categoryFilter, debouncedSearch])

  // Admin KPIs
  const kpis = useMemo(() => {
    if (!isAdmin) return null
    const pending = tickets.filter(t => t.status === 'pending').length
    const inProgress = tickets.filter(t => t.status === 'in_progress').length
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
    const recentResolved = tickets.filter(t => t.status === 'resolved' && t.resolved_at && new Date(t.resolved_at).getTime() > thirtyDaysAgo).length
    const urgentOpen = tickets.filter(t => t.priority === 'urgent' && (t.status === 'pending' || t.status === 'in_progress')).length

    // Average resolution time
    const resolved = tickets.filter(t => t.resolved_at)
    let avgHours = 0
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, t) => sum + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0)
      avgHours = totalMs / resolved.length / (1000 * 60 * 60)
    }
    const avgResolution = avgHours < 1 ? `${Math.round(avgHours * 60)}m` : avgHours < 24 ? `${Math.round(avgHours)}h` : `${(avgHours / 24).toFixed(1)}d`

    return { pending, inProgress, recentResolved, urgentOpen, avgResolution }
  }, [tickets, isAdmin])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (profileLoading) {
    return (
      <PageTransition>
        <div className="max-w-7xl mx-auto">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
          </div>
        </div>
      </PageTransition>
    )
  }

  const statusTabs = isAdmin
    ? [
        { value: 'open', label: 'Abiertos' },
        { value: 'all', label: 'Todos' },
        { value: 'pending', label: 'Pendiente' },
        { value: 'in_progress', label: 'En curso' },
        { value: 'resolved', label: 'Resuelto' },
        { value: 'closed', label: 'Cerrado' },
      ]
    : [
        { value: 'all', label: 'Todos' },
        { value: 'pending', label: 'Pendiente' },
        { value: 'in_progress', label: 'En curso' },
        { value: 'resolved', label: 'Resuelto' },
        { value: 'closed', label: 'Cerrado' },
      ]

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Tickets IT" description="Reporta y da seguimiento a problemas técnicos">
          <button
            onClick={() => setNewTicketOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#ffbd59] text-[#1a1a2e] hover:bg-[#ffbd59]/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Nuevo ticket
          </button>
        </PageHeader>

        {/* Admin KPIs */}
        {isAdmin && kpis && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{kpis.pending}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Pendientes</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{kpis.inProgress}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">En curso</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{kpis.recentResolved}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Resueltos (30d)</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <LifeBuoy className="h-4 w-4 text-[#ffbd59]" />
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{kpis.avgResolution}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Tiempo promedio</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <p className={cn('text-2xl font-bold', kpis.urgentOpen > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100')}>{kpis.urgentOpen}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Urgentes abiertos</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
            {statusTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium transition-colors',
                  statusFilter === tab.value
                    ? 'bg-[#ffbd59] text-[#1a1a2e]'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Todas las prioridades</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Todas las categorías</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </>
          )}

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, # o descripción..."
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md pl-7 pr-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-56"
            />
          </div>
        </div>

        {/* Tickets table / list */}
        <Card className="mb-8">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              {isAdmin ? 'Todos los tickets' : 'Mis tickets'}
            </CardTitle>
            <span className="text-xs text-zinc-400">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3 py-4">
                {[...Array(5)].map((_, i) => <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />)}
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-16 text-center">
                <LifeBuoy className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay tickets{statusFilter !== 'all' ? ` con estado "${statusTabs.find(t => t.value === statusFilter)?.label}"` : ''}</p>
                <button
                  onClick={() => setNewTicketOpen(true)}
                  className="mt-3 text-xs text-[#ffbd59] hover:underline font-medium"
                >
                  Crear nuevo ticket
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400">#</th>
                        <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400">Título</th>
                        {isAdmin && <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Solicitante</th>}
                        <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400">Categoría</th>
                        <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400">Prioridad</th>
                        <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400">Status</th>
                        <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Solicitud</th>
                        <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Resolución</th>
                        {isAdmin && <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400">Antigüedad</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map(t => {
                        const isUrgentOpen = t.priority === 'urgent' && (t.status === 'pending' || t.status === 'in_progress')
                        const isOldUnattended = t.status === 'pending' && (Date.now() - new Date(t.created_at).getTime()) > 3 * 24 * 60 * 60 * 1000

                        return (
                          <tr
                            key={t.id}
                            onClick={() => setDetailId(t.id)}
                            className={cn(
                              'border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer',
                              (isUrgentOpen || isOldUnattended) && 'bg-red-50/50 dark:bg-red-900/5'
                            )}
                          >
                            <td className="py-2.5 px-3 font-mono text-zinc-400 whitespace-nowrap">
                              {(isUrgentOpen || isOldUnattended) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />}
                              {ticketNumber(t.ticket_number)}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200 max-w-[250px] truncate">
                              {t.title}
                              {t.attachment_urls?.length > 0 && <Paperclip className="inline h-3 w-3 text-zinc-400 ml-1" />}
                            </td>
                            {isAdmin && (
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="text-zinc-700 dark:text-zinc-300">{t.requester_name}</div>
                                <div className="text-[10px] text-zinc-400">{t.requester_role}</div>
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{CATEGORY_LABELS[t.category] ?? t.category}</td>
                            <td className="py-2.5 px-3"><PriorityBadge priority={t.priority} /></td>
                            <td className="py-2.5 px-3"><StatusBadge status={t.status} /></td>
                            <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap" title={formatFullDateTime(t.created_at)}>
                              {formatDateTime(t.created_at)}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap" title={formatFullDateTime(t.resolved_at)}>
                              {t.resolved_at ? formatDateTime(t.resolved_at) : '—'}
                            </td>
                            {isAdmin && (
                              <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap" title={formatFullDateTime(t.created_at)}>
                                {timeAgo(t.created_at)}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-400">
                      Página {page + 1} de {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New ticket dialog */}
      <NewTicketDialog
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        onCreated={fetchTickets}
      />

      {/* Ticket detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null) }}>
        {detailId && (
          <TicketDetail
            ticketId={detailId}
            isAdmin={isAdmin}
            onClose={() => setDetailId(null)}
            onUpdated={fetchTickets}
          />
        )}
      </Dialog>
    </PageTransition>
  )
}

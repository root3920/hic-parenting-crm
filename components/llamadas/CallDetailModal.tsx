'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Call } from '@/types'
import { Video, Mail, Phone, Calendar, User, Tag, ExternalLink, ClipboardCheck, ChevronDown, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatFullDateInTimezone } from '@/lib/timezones'
import { useUserTimezone } from '@/hooks/useUserTimezone'

const CALL_STATUS_STYLES: Record<string, string> = {
  'Showed Up': 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'No Show':   'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const NEXT_STEP_STYLES: Record<string, string> = {
  'Follow Up':   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Cancelled':   'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Rescheduled': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const STATUS_STYLES: Record<string, string> = {
  'Scheduled':  'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Showed Up':  'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Cancelled':  'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'No show':    'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Rescheduled':'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const CALL_TYPE_STYLES: Record<string, string> = {
  'Qualified':    'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Disqualified': 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Onboarding':   'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Interview':    'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const STATUS_OPTIONS = ['Scheduled', 'Showed Up', 'Rescheduled', 'Cancelled', 'No show'] as const

const STATUS_DOT: Record<string, string> = {
  'Scheduled':   'bg-blue-500',
  'Showed Up':   'bg-green-500',
  'Rescheduled': 'bg-purple-500',
  'Cancelled':   'bg-red-500',
  'No show':     'bg-amber-500',
}

function formatReportedAt(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('')
}

interface Props {
  call: Call | null
  onClose: () => void
  onStatusChange?: (callId: string, newStatus: string) => void
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
        <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">{value}</p>
      </div>
    </div>
  )
}

export function CallDetailModal({ call, onClose, onStatusChange }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { timezone } = useUserTimezone()

  const [localStatus, setLocalStatus] = useState(call?.status ?? '')
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Reset local state whenever the modal opens for a different call
  useEffect(() => {
    if (call) {
      setLocalStatus(call.status)
      setPendingStatus(null)
      setDropdownOpen(false)
    }
  }, [call?.id])

  if (!call) return null

  const isFuture = new Date(call.start_date) > new Date()

  async function handleConfirmStatus() {
    if (!pendingStatus || !call) return
    setUpdating(true)
    const { error } = await supabase.from('calls').update({ status: pendingStatus }).eq('id', call.id)
    setUpdating(false)
    if (error) {
      toast.error('Error al actualizar el estado')
      return
    }
    setLocalStatus(pendingStatus)
    setPendingStatus(null)
    onStatusChange?.(call.id, pendingStatus)
    toast.success(`Estado actualizado a ${pendingStatus}`)
  }

  return (
    <Dialog open={!!call} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-300">
              {initials(call.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">{call.full_name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[localStatus] ?? 'bg-zinc-100 text-zinc-600')}>
                  {localStatus}
                </span>
                {call.call_type && (
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', CALL_TYPE_STYLES[call.call_type] ?? 'bg-zinc-100 text-zinc-600')}>
                    {call.call_type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">

          {/* ── Status editor ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">Cambiar estado:</span>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(o => !o)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-transparent hover:border-current/20 transition-colors',
                    STATUS_STYLES[localStatus] ?? 'bg-zinc-100 text-zinc-600'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[localStatus] ?? 'bg-zinc-400')} />
                  {localStatus}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 w-44 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1">
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => { setPendingStatus(s); setDropdownOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <span className={cn('h-2 w-2 rounded-full flex-shrink-0', STATUS_DOT[s])} />
                          {s}
                          {s === localStatus && <Check className="h-3 w-3 ml-auto text-zinc-400" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {pendingStatus && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  ¿Cambiar a <strong className="text-zinc-800 dark:text-zinc-200">{pendingStatus}</strong>?
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setPendingStatus(null)}
                    className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmStatus}
                    disabled={updating}
                    className="text-xs px-2 py-1 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-80 disabled:opacity-50 transition-opacity flex items-center gap-1"
                  >
                    {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Date/Time */}
          <div className={cn('px-3 py-2 rounded-lg text-sm font-medium', isFuture ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400')}>
            📅 {formatFullDateInTimezone(call.start_date, timezone)}
          </div>

          {/* Meeting link — prominent */}
          {call.meeting_url && (
            <a
              href={call.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
            >
              <Video className="h-4 w-4" />
              Unirse a llamada
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          )}

          {/* Contact info */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-3">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={Mail} label="Email" value={call.email} />
              <InfoRow icon={Phone} label="Teléfono" value={call.phone} />
            </div>
          </div>

          {/* Call details */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-3">Detalles</p>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={User} label="Closer" value={call.closer_name} />
              <InfoRow icon={User} label="Setter" value={call.setter_name} />
              <InfoRow icon={Calendar} label="Calendario" value={call.calendar} />
              <InfoRow icon={Tag} label="Tipo de actividad" value={call.activity_type} />
            </div>
          </div>

          {/* UTM */}
          {(call.utm_source || call.utm_campaign) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-3">Origen</p>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow icon={Tag} label="UTM Source" value={call.utm_source} />
                <InfoRow icon={Tag} label="UTM Medium" value={call.utm_medium} />
                <InfoRow icon={Tag} label="UTM Campaign" value={call.utm_campaign} />
              </div>
            </div>
          )}

          {/* Notes */}
          {call.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Notas</p>
              <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2.5 max-h-40 overflow-y-auto">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono">{call.notes}</p>
              </div>
            </div>
          )}

          {/* Objections */}
          {call.objections && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Objeciones</p>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5">
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed whitespace-pre-wrap">{call.objections}</p>
              </div>
            </div>
          )}

          {/* Closer report */}
          {call.call_summary && (
            <div className="border-l-4 border-l-teal-400 pl-3">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck className="h-4 w-4 text-teal-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Reporte del closer</p>
              </div>
              <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg px-3 py-2.5 mb-2.5">
                <p className="text-xs text-teal-800 dark:text-teal-300 leading-relaxed whitespace-pre-wrap">{call.call_summary}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {call.call_status && (
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', CALL_STATUS_STYLES[call.call_status] ?? 'bg-zinc-100 text-zinc-600')}>
                    Estado reportado: {call.call_status}
                  </span>
                )}
                {call.next_step && (
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', NEXT_STEP_STYLES[call.next_step] ?? 'bg-zinc-100 text-zinc-600')}>
                    Siguiente paso: {call.next_step}
                  </span>
                )}
              </div>
              {call.reported_by && call.reported_at && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
                  Reportado por <span className="font-medium text-zinc-600 dark:text-zinc-300">{call.reported_by}</span> · {formatReportedAt(call.reported_at)}
                </p>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="text-xs text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            Creado: {new Date(call.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

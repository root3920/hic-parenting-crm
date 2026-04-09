'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Call } from '@/types'
import { Video, Mail, Phone, Calendar, User, Tag, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

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

function formatFullDate(dateStr: string) {
  const d = new Date(dateStr)
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'pm' : 'am'
  return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]} · ${h}:${m}${ampm}`
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('')
}

interface Props {
  call: Call | null
  onClose: () => void
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

export function CallDetailModal({ call, onClose }: Props) {
  if (!call) return null

  const isFuture = new Date(call.start_date) > new Date()

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
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[call.status] ?? 'bg-zinc-100 text-zinc-600')}>
                  {call.status}
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
          {/* Date/Time */}
          <div className={cn('px-3 py-2 rounded-lg text-sm font-medium', isFuture ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400')}>
            📅 {formatFullDate(call.start_date)}
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

          {/* Footer */}
          <div className="text-xs text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            Creado: {new Date(call.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

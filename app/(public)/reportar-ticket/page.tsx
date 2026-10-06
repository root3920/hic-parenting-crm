'use client'

import { useState } from 'react'
import { TicketForm } from '@/components/tickets/TicketForm'
import { CheckCircle, RotateCcw } from 'lucide-react'
import { Toaster } from 'sonner'

export default function ReportarTicketPage() {
  const [submitted, setSubmitted] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<number | null>(null)

  function handleSuccess(num?: number) {
    setTicketNumber(num ?? null)
    setSubmitted(true)
  }

  function handleReset() {
    setSubmitted(false)
    setTicketNumber(null)
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div className="text-center mb-8">
        <img
          src="/hic-logo.svg"
          alt="HIC Parenting"
          className="h-12 w-auto mx-auto mb-4"
        />
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Reportar un problema técnico
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
          Cuéntanos qué pasó y lo revisaremos lo antes posible
        </p>
      </div>

      <div className="w-full max-w-[560px]">
        {submitted ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              Recibimos tu reporte
            </h2>
            {ticketNumber != null && ticketNumber > 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                Número de ticket: <span className="font-mono font-bold text-[#ffbd59]">#{String(ticketNumber).padStart(4, '0')}</span>
              </p>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Nuestro equipo lo revisará y trabajará en una solución.
            </p>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#ffbd59] text-[#1a1a2e] hover:bg-[#ffbd59]/90 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Enviar otro reporte
            </button>
          </div>
        ) : (
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <TicketForm mode="public" onSuccess={handleSuccess} />
          </div>
        )}
      </div>

      <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-8">
        HIC Parenting &middot; Soporte técnico
      </p>
    </div>
  )
}

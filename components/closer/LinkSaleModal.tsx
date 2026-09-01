'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Link2, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface CallForLink {
  id: string
  full_name: string
  email: string | null
  start_date: string
  closer_name: string | null
}

interface TransactionOption {
  id: string
  date: string
  offer_title: string
  cost: number
  buyer_name: string
  buyer_email: string
  currency: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  call: CallForLink
  closerName: string
  onLinked: () => void
}

export function LinkSaleModal({ open, onOpenChange, call, closerName, onLinked }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [search, setSearch] = useState('')
  const [transactions, setTransactions] = useState<TransactionOption[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [selectedTx, setSelectedTx] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedTx(null)
    loadTransactions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function loadTransactions() {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('id, date, offer_title, cost, buyer_name, buyer_email, currency')
      .in('status', ['completed', 'recovered'])
      .order('date', { ascending: false })
      .limit(200)
    setTransactions(data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return transactions
    const q = search.trim().toLowerCase()
    return transactions.filter((tx) =>
      tx.buyer_name.toLowerCase().includes(q) ||
      tx.buyer_email.toLowerCase().includes(q) ||
      tx.offer_title.toLowerCase().includes(q) ||
      String(tx.cost).includes(q) ||
      tx.date.includes(q)
    )
  }, [transactions, search])

  async function handleLink() {
    if (!selectedTx) return
    setLinking(true)
    try {
      const res = await fetch('/api/team/closer/link-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: call.id,
          transaction_id: selectedTx,
          linked_by: closerName,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Error linking sale')
        return
      }
      toast.success('Sale linked successfully')
      onLinked()
      onOpenChange(false)
    } catch {
      toast.error('Error linking sale')
    } finally {
      setLinking(false)
    }
  }

  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Link Sale to Call</DialogTitle>
        </DialogHeader>

        {/* Call info */}
        <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 mb-4">
          <p className="text-xs text-zinc-500 mb-1">Call</p>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {call.full_name} {call.email && <span className="text-zinc-400">({call.email})</span>}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {formatDate(call.start_date)} · {call.closer_name}
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, amount, or date..."
            className={cn(inputCls, 'pl-9')}
          />
        </div>

        {/* Transactions list */}
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-sm text-zinc-400">Loading transactions...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-400">No transactions found</div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => setSelectedTx(tx.id === selectedTx ? null : tx.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    selectedTx === tx.id
                      ? 'bg-[#ffbd59]/10 border-l-2 border-l-[#ffbd59]'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-l-2 border-l-transparent'
                  )}
                >
                  <div className={cn(
                    'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                    selectedTx === tx.id
                      ? 'border-[#ffbd59] bg-[#ffbd59]'
                      : 'border-zinc-300 dark:border-zinc-600'
                  )}>
                    {selectedTx === tx.id && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {tx.buyer_name}
                      </span>
                      <span className="text-xs text-zinc-400 truncate">{tx.buyer_email}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500 truncate">{tx.offer_title}</span>
                      <span className="text-xs text-zinc-400">{formatDate(tx.date)}</span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-green-600 dark:text-green-400 flex-shrink-0">
                    ${tx.cost.toLocaleString()} {tx.currency}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-3">
          <p className="text-xs text-zinc-400">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleLink}
              disabled={!selectedTx || linking}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-[#ffbd59] hover:bg-[#e5a94f] text-[#1a1a2e] font-semibold transition-colors disabled:opacity-60"
            >
              <Link2 className="h-3.5 w-3.5" />
              {linking ? 'Linking...' : 'Link Sale'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

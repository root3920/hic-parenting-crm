'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, RefreshCw, Inbox, MessageSquare, Check, X, Pencil,
  Send, Bot, User, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  message_text: string
  message_type?: 'text' | 'image' | 'audio' | 'video' | 'file' | 'other'
  attachment_url?: string | null
  sent_at: string
}

interface Conversation {
  id: string
  ig_user_id: string
  ig_username: string
  name: string | null
  status: string
  ig_profile_pic_url: string | null
}

interface ReviewItem {
  id: string
  conversation_id: string
  trigger_message_id: string
  draft_response: string
  ai_assessment: string
  ai_reasoning: string
  status: string
  final_response: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  conversation: Conversation | null
  trigger_message: { id: string; message_text: string; sent_at: string } | null
  messages: Message[]
}

// ── Assessment config ─────────────────────────────────────────────────────────

const ASSESSMENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  qualified: { label: 'Qualified', color: '#22C55E', bg: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  disqualified: { label: 'Disqualified', color: '#EF4444', bg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  gathering_info: { label: 'Gathering Info', color: '#3B82F6', bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  not_seeking_help: { label: 'Not Seeking Help', color: '#6B7280', bg: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400' },
}

const STATUS_TABS = [
  { key: 'pending', label: 'Pending Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'edited_and_approved', label: 'Edited' },
  { key: 'rejected', label: 'Rejected' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function InstagramReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/instagram/review-queue?status=${statusFilter}`)
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setItems(json.items ?? [])
      }
    } catch {
      toast.error('Failed to load review queue')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  async function handleAction(item: ReviewItem, action: 'approve' | 'edit_and_approve' | 'reject') {
    setActionInProgress(item.id)
    try {
      const body: Record<string, string> = { id: item.id, action }
      if (action === 'edit_and_approve') {
        body.final_response = editText
      }

      const res = await fetch('/api/instagram/review-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error, { duration: 8000 })
      } else {
        toast.success(
          action === 'reject' ? 'Draft rejected'
            : `Message sent to @${item.conversation?.ig_username || 'user'} via Instagram`,
        )
        setItems((prev) => prev.filter((i) => i.id !== item.id))
        setEditingId(null)
      }
    } catch {
      toast.error('Action failed')
    } finally {
      setActionInProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Instagram DM Review
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            AI-drafted replies awaiting human review
          </p>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setExpandedId(null); setEditingId(null) }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
              statusFilter === tab.key
                ? 'bg-white dark:bg-zinc-900 shadow-sm text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Inbox className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">No items in "{STATUS_TABS.find((t) => t.key === statusFilter)?.label}"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const assessment = ASSESSMENT_CONFIG[item.ai_assessment]
            const isExpanded = expandedId === item.id
            const isEditing = editingId === item.id
            const isActioning = actionInProgress === item.id
            const displayName = item.conversation?.name || item.conversation?.ig_username || 'Unknown'

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
              >
                {/* Card header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  {item.conversation?.ig_profile_pic_url ? (
                    <img
                      src={item.conversation.ig_profile_pic_url}
                      alt={displayName}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        @{item.conversation?.ig_username || '?'}
                      </p>
                      {assessment && (
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold', assessment.bg)}>
                          {assessment.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {item.trigger_message?.message_text || 'No trigger message'}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {formatDate(item.created_at)}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800">
                    {/* Conversation history */}
                    <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-800/30">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                        <MessageSquare className="h-3 w-3 inline mr-1" />
                        Conversation History
                      </p>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {item.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              'flex gap-2',
                              msg.direction === 'outbound' ? 'justify-end' : 'justify-start',
                            )}
                          >
                            <div
                              className={cn(
                                'max-w-[80%] rounded-2xl px-3 py-2 text-xs',
                                msg.direction === 'inbound'
                                  ? 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-tl-sm'
                                  : 'bg-[#ffbd59] text-[#1a1a2e] rounded-tr-sm',
                              )}
                            >
                              {msg.message_type === 'image' && msg.attachment_url ? (
                                <img
                                  src={msg.attachment_url}
                                  alt="Imagen enviada"
                                  className="max-w-full rounded-lg max-h-48 object-cover"
                                  loading="lazy"
                                />
                              ) : msg.message_type === 'audio' && msg.attachment_url ? (
                                <audio controls className="max-w-full" preload="none">
                                  <source src={msg.attachment_url} />
                                </audio>
                              ) : msg.message_type === 'video' && msg.attachment_url ? (
                                <video controls className="max-w-full rounded-lg max-h-48" preload="none">
                                  <source src={msg.attachment_url} />
                                </video>
                              ) : msg.message_type && msg.message_type !== 'text' && msg.attachment_url ? (
                                <a
                                  href={msg.attachment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline text-blue-500"
                                >
                                  {msg.message_text}
                                </a>
                              ) : (
                                <p className="whitespace-pre-wrap">{msg.message_text}</p>
                              )}
                              <p className={cn(
                                'text-[10px] mt-1',
                                msg.direction === 'inbound' ? 'text-zinc-400' : 'text-[#1a1a2e]/60',
                              )}>
                                {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI assessment + reasoning */}
                    <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-indigo-50/50 dark:bg-indigo-900/10">
                      <div className="flex items-start gap-2">
                        <Bot className="h-3.5 w-3.5 text-indigo-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                            AI Assessment: {assessment?.label || item.ai_assessment}
                          </p>
                          <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mt-0.5">
                            {item.ai_reasoning}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Draft response */}
                    <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                        <Send className="h-3 w-3 inline mr-1" />
                        {statusFilter === 'pending' ? 'Draft Response' : 'Response'}
                      </p>

                      {isEditing ? (
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={4}
                          className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59] resize-y"
                        />
                      ) : (
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-4 py-3">
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                            {item.final_response || item.draft_response}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions (only for pending items) */}
                    {statusFilter === 'pending' && (
                      <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleAction(item, 'edit_and_approve')}
                              disabled={isActioning || !editText.trim()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              <Send className="h-3 w-3" />
                              {isActioning ? 'Sending…' : 'Send Edited'}
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditText('') }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleAction(item, 'approve')}
                              disabled={isActioning}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              <Send className="h-3 w-3" />
                              {isActioning ? 'Sending…' : 'Approve & Send'}
                            </button>
                            <button
                              onClick={() => { setEditingId(item.id); setEditText(item.draft_response) }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit & Send
                            </button>
                            <button
                              onClick={() => handleAction(item, 'reject')}
                              disabled={isActioning}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            >
                              <X className="h-3 w-3" />
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Review info (for reviewed items) */}
                    {item.reviewed_by && (
                      <div className="px-5 py-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2 text-xs text-zinc-400">
                        <User className="h-3 w-3" />
                        Reviewed by {item.reviewed_by}
                        {item.reviewed_at && ` · ${formatDate(item.reviewed_at)}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

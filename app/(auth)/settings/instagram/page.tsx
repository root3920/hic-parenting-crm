'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, Loader2, Trash2, CheckCircle, AlertCircle, Plus, FlaskConical, Download, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { PageTransition } from '@/components/motion/PageTransition'

interface ConnectedAccount {
  id: string
  ig_user_id: string
  ig_username: string
  ig_profile_pic_url: string | null
  ig_name: string | null
  token_type: string
  connected_at: string
}

export const dynamic = 'force-dynamic'

export default function InstagramSettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    }>
      <InstagramSettingsContent />
    </Suspense>
  )
}

function InstagramSettingsContent() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [seedUsername, setSeedUsername] = useState('')
  const [seedMessage, setSeedMessage] = useState('')
  const [seeding, setSeeding] = useState(false)

  // Send Test Message state
  const [testRecipientId, setTestRecipientId] = useState('')
  const [testMessageText, setTestMessageText] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testSendResult, setTestSendResult] = useState<{ ok?: boolean; error?: string; details?: Record<string, unknown> } | null>(null)

  // Real conversation import state
  interface RealConversation {
    ig_conversation_id: string
    participant_id: string | null
    participant_name: string | null
    updated_time: string
    already_imported: boolean
    messages: Array<{
      id: string
      text: string
      from_id: string
      from_name: string | null
      is_from_us: boolean
      created_time: string
    }>
  }
  const [realConvos, setRealConvos] = useState<RealConversation[]>([])
  const [fetchingConvos, setFetchingConvos] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<{ message: string; code?: number; subcode?: number; type?: string } | null>(null)

  // Show toast for OAuth result from redirect
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === 'true') {
      toast.success('Instagram account connected successfully!')
    } else if (error) {
      const messages: Record<string, string> = {
        no_code: 'Authorization code was not received from Meta.',
        invalid_state: 'Security check failed. Please try again.',
        missing_config: 'Instagram app credentials are not configured.',
        token_exchange_failed: 'Failed to exchange authorization code for a token.',
        no_ig_account: 'No Instagram Business Account found linked to this Facebook account.',
        db_error: 'Failed to save the connected account.',
        unexpected: 'An unexpected error occurred.',
      }
      toast.error(messages[error] || `Connection failed: ${error}`)
    }
  }, [searchParams])

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/instagram/connected-accounts')
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setAccounts(json.accounts ?? [])
      }
    } catch {
      toast.error('Failed to load connected accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  async function handleDisconnect(id: string) {
    setDisconnecting(id)
    try {
      const res = await fetch('/api/instagram/connected-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success('Account disconnected')
        setAccounts((prev) => prev.filter((a) => a.id !== id))
      }
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Settings
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Instagram Connection
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Connect your Instagram Business account for DM automation
              </p>
            </div>
          </div>
        </div>

        {/* Connected accounts */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5"
                >
                  <div className="flex items-center gap-4">
                    {/* Profile picture */}
                    {account.ig_profile_pic_url ? (
                      <img
                        src={account.ig_profile_pic_url}
                        alt={account.ig_username}
                        className="w-14 h-14 rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-700"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg font-bold">
                        {account.ig_username.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Account info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                          Connected as @{account.ig_username}
                        </p>
                      </div>
                      {account.ig_name && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {account.ig_name}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
                        <span>ID: {account.ig_user_id}</span>
                        <span>Connected {formatDate(account.connected_at)}</span>
                        <span className={cn(
                          'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                          account.token_type.includes('long_lived')
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                        )}>
                          {account.token_type.includes('long_lived') ? 'Long-lived page token' : 'Page token (needs refresh)'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/instagram/debug-token')
                            const json = await res.json()
                            if (json.error) {
                              toast.error(json.error)
                            } else {
                              const td = json.token_debug
                              const scopes = td?.scopes?.join(', ') || 'none'
                              const valid = td?.is_valid ? 'Valid' : 'INVALID'
                              const expires = td?.expires_at ? (td.expires_at === 0 ? 'Never' : new Date(td.expires_at * 1000).toLocaleString()) : 'Unknown'
                              const type = td?.type || 'unknown'
                              toast(`Token: ${valid} | Type: ${type} | Expires: ${expires} | Scopes: ${scopes}`, { duration: 15000 })
                            }
                          } catch { toast.error('Debug failed') }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Debug Token
                      </button>
                      <button
                        onClick={() => handleDisconnect(account.id)}
                        disabled={disconnecting === account.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        {disconnecting === account.id ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Connect button */}
              <a
                href="/api/instagram/oauth/connect"
                className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-purple-400 dark:hover:border-purple-600 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                {accounts.length > 0 ? (
                  <>
                    <Plus className="h-4 w-4" />
                    Connect another Instagram account
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-5 w-5" />
                    Connect Instagram Account
                  </>
                )}
              </a>

              {/* Info box */}
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 rounded-xl px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-semibold mb-1">Requirements</p>
                    <ul className="space-y-0.5 text-blue-600 dark:text-blue-400">
                      <li>Instagram Professional account (Business or Creator)</li>
                      <li>Facebook Page connected to the Instagram account</li>
                      <li>Admin access to the Facebook Page</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Import real conversations */}
              {accounts.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-blue-500" />
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Import Real Conversations
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        setFetchingConvos(true)
                        setFetchError(null)
                        try {
                          const res = await fetch('/api/instagram/fetch-conversations')
                          const json = await res.json()
                          if (json.error) {
                            setFetchError({
                              message: json.error,
                              code: json.ig_error_code,
                              subcode: json.ig_error_subcode,
                              type: json.ig_error_type,
                            })
                          } else {
                            setRealConvos(json.conversations ?? [])
                            if (!json.conversations?.length) {
                              toast('No conversations found — DM your connected account from another IG account first')
                            }
                          }
                        } catch {
                          setFetchError({ message: 'Network error — failed to reach server' })
                        } finally {
                          setFetchingConvos(false)
                        }
                      }}
                      disabled={fetchingConvos}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={cn('h-3 w-3', fetchingConvos && 'animate-spin')} />
                      {fetchingConvos ? 'Fetching…' : 'Fetch from Instagram'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                    Fetch real DM conversations from your connected Instagram account and import them into the review queue.
                  </p>

                  {fetchError && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3 mb-3">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                        {fetchError.message}
                      </p>
                      {(fetchError.code || fetchError.type) && (
                        <p className="text-xs text-red-500 dark:text-red-400 font-mono">
                          {fetchError.type && `Type: ${fetchError.type}`}
                          {fetchError.code && ` · Code: ${fetchError.code}`}
                          {fetchError.subcode && ` · Subcode: ${fetchError.subcode}`}
                        </p>
                      )}
                    </div>
                  )}

                  {realConvos.length > 0 && (
                    <div className="space-y-2">
                      {realConvos.map((conv) => (
                        <div
                          key={conv.ig_conversation_id}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {conv.participant_name || conv.participant_id || 'Unknown'}
                              </p>
                              {conv.already_imported && (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                  Already imported
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              ID: {conv.participant_id} · {conv.messages.length} messages · Updated {formatDate(conv.updated_time)}
                            </p>
                            {conv.messages.length > 0 && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 truncate">
                                Latest: &quot;{conv.messages[0]?.text?.slice(0, 80)}{(conv.messages[0]?.text?.length ?? 0) > 80 ? '…' : ''}&quot;
                              </p>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              setImportingId(conv.ig_conversation_id)
                              try {
                                const res = await fetch('/api/instagram/fetch-conversations', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    ig_conversation_id: conv.ig_conversation_id,
                                    participant_id: conv.participant_id,
                                    participant_name: conv.participant_name,
                                  }),
                                })
                                const json = await res.json()
                                if (json.error) {
                                  toast.error(json.error)
                                } else {
                                  toast.success(`Imported ${json.messages_inserted} messages — check Instagram DM Review`)
                                  setRealConvos((prev) =>
                                    prev.map((c) =>
                                      c.ig_conversation_id === conv.ig_conversation_id
                                        ? { ...c, already_imported: true }
                                        : c
                                    )
                                  )
                                }
                              } catch {
                                toast.error('Import failed')
                              } finally {
                                setImportingId(null)
                              }
                            }}
                            disabled={importingId === conv.ig_conversation_id || !conv.participant_id}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-opacity disabled:opacity-50"
                            style={{ backgroundColor: '#ffbd59' }}
                          >
                            <Download className="h-3 w-3" />
                            {importingId === conv.ig_conversation_id ? 'Importing…' : 'Import'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Send Test Message — App Review demo tool */}
              {accounts.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border-2 border-purple-200 dark:border-purple-800 p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Send className="h-4 w-4 text-purple-500" />
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Send Test Message
                    </p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                      App Review
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                    Send a real Instagram DM directly via the Graph API. Use a recipient ID from the conversations list above or from Meta&apos;s API Explorer.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Recipient ID (Instagram-scoped user ID)
                      </label>
                      <input
                        type="text"
                        value={testRecipientId}
                        onChange={(e) => setTestRecipientId(e.target.value)}
                        placeholder="e.g. 17841400123456789"
                        className="w-full text-sm font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Message Text
                      </label>
                      <textarea
                        value={testMessageText}
                        onChange={(e) => setTestMessageText(e.target.value)}
                        placeholder="Hi! This is a test message from our app."
                        rows={2}
                        className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 resize-none"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!testRecipientId.trim() || !testMessageText.trim()) {
                          setTestSendResult({ error: 'Both fields are required' })
                          return
                        }
                        setSendingTest(true)
                        setTestSendResult(null)
                        try {
                          const res = await fetch('/api/instagram/send-test-message', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              recipient_id: testRecipientId.trim(),
                              message_text: testMessageText.trim(),
                            }),
                          })
                          const json = await res.json()
                          if (json.error) {
                            setTestSendResult({
                              error: json.error,
                              details: {
                                code: json.ig_error_code,
                                subcode: json.ig_error_subcode,
                                type: json.ig_error_type,
                                fbtrace_id: json.ig_error_fbtrace,
                              },
                            })
                          } else {
                            setTestSendResult({ ok: true })
                            setTestMessageText('')
                          }
                        } catch {
                          setTestSendResult({ error: 'Network error — failed to reach server' })
                        } finally {
                          setSendingTest(false)
                        }
                      }}
                      disabled={sendingTest}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white bg-purple-600 hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      {sendingTest ? 'Sending…' : 'Send Message'}
                    </button>

                    {/* Result display */}
                    {testSendResult && (
                      <div className={cn(
                        'rounded-lg border p-3 mt-2',
                        testSendResult.ok
                          ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                          : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10',
                      )}>
                        {testSendResult.ok ? (
                          <p className="text-sm font-medium text-green-700 dark:text-green-300">
                            Message sent successfully!
                          </p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                              {testSendResult.error}
                            </p>
                            {testSendResult.details && Object.values(testSendResult.details).some(Boolean) && (
                              <p className="text-xs text-red-500 dark:text-red-400 font-mono break-all">
                                {testSendResult.details.type && `Type: ${testSendResult.details.type}`}
                                {testSendResult.details.code && ` · Code: ${testSendResult.details.code}`}
                                {testSendResult.details.subcode && ` · Subcode: ${testSendResult.details.subcode}`}
                                {testSendResult.details.fbtrace_id && ` · Trace: ${testSendResult.details.fbtrace_id}`}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Test data seeder */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FlaskConical className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Test Data Seeder
                  </p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    Dev only
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  Insert a test conversation with a sample inbound message and AI-generated review entry for demo purposes.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Instagram Username
                    </label>
                    <input
                      type="text"
                      value={seedUsername}
                      onChange={(e) => setSeedUsername(e.target.value)}
                      placeholder="test_parent_jane"
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Inbound Message
                    </label>
                    <textarea
                      value={seedMessage}
                      onChange={(e) => setSeedMessage(e.target.value)}
                      placeholder="Hi! I've been struggling with my 3 year old's tantrums and I don't know what to do anymore 😩"
                      rows={3}
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59] resize-none"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      if (!seedUsername.trim() || !seedMessage.trim()) {
                        toast.error('Username and message are required')
                        return
                      }
                      setSeeding(true)
                      try {
                        const res = await fetch('/api/instagram/test-seed', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            ig_username: seedUsername.trim(),
                            messages: [{ direction: 'inbound', text: seedMessage.trim() }],
                          }),
                        })
                        const json = await res.json()
                        if (json.error) {
                          toast.error(json.error)
                        } else {
                          toast.success('Test conversation created — check the Instagram DM Review page')
                          setSeedUsername('')
                          setSeedMessage('')
                        }
                      } catch {
                        toast.error('Failed to seed test data')
                      } finally {
                        setSeeding(false)
                      }
                    }}
                    disabled={seeding}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white transition-opacity disabled:opacity-50"
                    style={{ backgroundColor: '#ffbd59' }}
                  >
                    <FlaskConical className="h-3 w-3" />
                    {seeding ? 'Creating…' : 'Create Test Conversation'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  )
}

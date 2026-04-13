'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { toast } from 'sonner'
import { Plus, X, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Role = 'admin' | 'closer' | 'setter'

interface Profile {
  id: string
  full_name: string
  role: Role
  closer_name: string | null
  setter_name: string | null
  created_at: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin:  'Admin',
  closer: 'Closer',
  setter: 'Setter',
}

const ROLE_COLORS: Record<Role, string> = {
  admin:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  closer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  setter: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

const CLOSER_NAMES = ['Marcela HIC Parenting', 'Cali Luna']
const SETTER_NAMES = ['Valentina Llano', 'Marcela Collier']

interface FormState {
  email: string
  full_name: string
  role: Role
  closer_name: string
  setter_name: string
}

const emptyForm: FormState = {
  email: '',
  full_name: '',
  role: 'closer',
  closer_name: '',
  setter_name: '',
}

export default function ProfilesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function fetchProfiles() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast.error(`Error loading profiles: ${error.message}`)
    setProfiles(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchProfiles() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email || !form.full_name || !form.role) {
      toast.error('Email, name, and role are required')
      return
    }
    if (form.role === 'closer' && !form.closer_name) {
      toast.error('Select the closer name')
      return
    }
    if (form.role === 'setter' && !form.setter_name) {
      toast.error('Select the setter name')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:       form.email.trim(),
        full_name:   form.full_name.trim(),
        role:        form.role,
        closer_name: form.role === 'closer' ? form.closer_name : null,
        setter_name: form.role === 'setter' ? form.setter_name : null,
      }),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      toast.error(data.error ?? 'Error sending invitation')
      return
    }

    toast.success(`Invitation sent to ${form.email}`)
    setModalOpen(false)
    setForm(emptyForm)
    fetchProfiles()
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Team Profiles" description="Manage access and roles for team members">
          <button
            onClick={() => { setForm(emptyForm); setModalOpen(true) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#185FA5' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add member
          </button>
        </PageHeader>

        {/* Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {loading ? (
            <div className="space-y-0">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 last:border-0" />
              ))}
            </div>
          ) : profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
              <UserPlus className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No profiles yet</p>
              <p className="text-xs mt-1">Add your first team member</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                    {['Name', 'Role', 'Closer name', 'Setter name', 'Created'].map((h) => (
                      <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">{p.full_name}</td>
                      <td className="py-3 px-4">
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', ROLE_COLORS[p.role])}>
                          {ROLE_LABELS[p.role]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400 text-xs">{p.closer_name ?? '—'}</td>
                      <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400 text-xs">{p.setter_name ?? '—'}</td>
                      <td className="py-3 px-4 text-zinc-400 text-xs whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invite modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md p-6 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Add member</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Full name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => set('full_name', e.target.value)}
                  placeholder="E.g.: Valentina Llano"
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="email@example.com"
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => set('role', e.target.value as Role)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  <option value="admin">Admin</option>
                  <option value="closer">Closer</option>
                  <option value="setter">Setter</option>
                </select>
              </div>

              {form.role === 'closer' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Closer name <span className="text-zinc-400">(must match the name in the calls table)</span>
                  </label>
                  <select
                    value={form.closer_name}
                    onChange={(e) => set('closer_name', e.target.value)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    required
                  >
                    <option value="">Select...</option>
                    {CLOSER_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}

              {form.role === 'setter' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Setter name <span className="text-zinc-400">(must match the name in the reports)</span>
                  </label>
                  <select
                    value={form.setter_name}
                    onChange={(e) => set('setter_name', e.target.value)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    required
                  >
                    <option value="">Select...</option>
                    {SETTER_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs rounded-lg text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: '#185FA5' }}
                >
                  {submitting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageTransition>
  )
}

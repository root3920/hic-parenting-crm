'use client'

import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Loader2, Check, Plus, X, UserPlus } from 'lucide-react'
import { PageTransition } from '@/components/motion/PageTransition'
import { US_TIMEZONES } from '@/lib/timezones'
import { useUserTimezone } from '@/hooks/useUserTimezone'
import { useProfile } from '@/hooks/useProfile'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ─── Password form ────────────────────────────────────────────────────────────

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Minimum 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type PasswordForm = z.infer<typeof passwordSchema>

// ─── Team management types ────────────────────────────────────────────────────

type Role = 'admin' | 'closer' | 'setter'

interface TeamProfile {
  id: string
  full_name: string
  role: Role
  closer_name: string | null
  setter_name: string | null
  created_at: string
}

interface InviteForm {
  email: string
  full_name: string
  role: Role
  closer_name: string
  setter_name: string
}

const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', closer: 'Closer', setter: 'Setter' }
const ROLE_COLORS: Record<Role, string> = {
  admin:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  closer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  setter: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}
const CLOSER_NAMES = ['Marcela HIC Parenting', 'Cali Luna']
const SETTER_NAMES = ['Valentina Llano', 'Marcela Collier']
const emptyInviteForm: InviteForm = { email: '', full_name: '', role: 'closer', closer_name: '', setter_name: '' }

// ─── Settings page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const { timezone, loading: tzLoading, updateTimezone } = useUserTimezone()
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'

  // Team management state
  const [teamProfiles, setTeamProfiles] = useState<TeamProfile[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm)
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    void supabase.auth.getUser().then((r: { data: { user: { email?: string } | null } }) => {
      setEmail(r.data.user?.email ?? '')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTeamProfiles() {
    setTeamLoading(true)
    const res = await fetch('/api/profiles')
    const data = await res.json()
    if (data.error) toast.error(`Error: ${data.error}`)
    else setTeamProfiles(data.profiles ?? [])
    setTeamLoading(false)
  }

  useEffect(() => {
    if (isAdmin) fetchTeamProfiles()
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  async function onChangePassword(data: PasswordForm) {
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Password updated successfully')
      reset()
    }
    setLoading(false)
  }

  function setInvite<K extends keyof InviteForm>(key: K, value: InviteForm[K]) {
    setInviteForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteForm.email || !inviteForm.full_name || !inviteForm.role) {
      toast.error('Email, nombre y rol son requeridos')
      return
    }
    if (inviteForm.role === 'closer' && !inviteForm.closer_name) {
      toast.error('Selecciona el nombre del closer')
      return
    }
    if (inviteForm.role === 'setter' && !inviteForm.setter_name) {
      toast.error('Selecciona el nombre del setter')
      return
    }

    setInviting(true)
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:       inviteForm.email.trim(),
        full_name:   inviteForm.full_name.trim(),
        role:        inviteForm.role,
        closer_name: inviteForm.role === 'closer' ? inviteForm.closer_name : null,
        setter_name: inviteForm.role === 'setter' ? inviteForm.setter_name : null,
      }),
    })
    const data = await res.json()
    setInviting(false)

    if (!res.ok) {
      toast.error(data.error ?? 'Error al enviar invitación')
      return
    }

    toast.success(`Invitación enviada a ${inviteForm.email}`)
    setModalOpen(false)
    setInviteForm(emptyInviteForm)
    fetchTeamProfiles()
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Settings" description="Manage your account preferences" />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Email
              </label>
              <Input value={email} disabled className="text-sm" />
              <p className="text-xs text-zinc-400">
                Email cannot be changed. Contact support if needed.
              </p>
            </div>
          </CardContent>
        </Card>

        <Separator className="mb-6" />

        {/* Timezone */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Zona horaria</CardTitle>
            <CardDescription>
              Todas las llamadas y fechas se mostrarán en esta zona horaria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tzLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {US_TIMEZONES.map((tz) => (
                    <button
                      key={tz.value}
                      onClick={async () => {
                        await updateTimezone(tz.value)
                        toast.success(`Zona horaria actualizada a ${tz.abbr}`)
                      }}
                      className={cn(
                        'relative p-4 rounded-xl border-2 text-left transition-all',
                        timezone === tz.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                      )}
                    >
                      {timezone === tz.value && (
                        <Check className="absolute top-3 right-3 h-3.5 w-3.5 text-blue-500" />
                      )}
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{tz.abbr}</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{tz.label}</div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{tz.offset}</div>
                    </button>
                  ))}
                </div>
                {timezone && (
                  <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                    Hora actual en <strong className="text-zinc-700 dark:text-zinc-300">{timezone}</strong>:{' '}
                    <strong className="text-zinc-700 dark:text-zinc-300">
                      {new Date().toLocaleString('en-US', {
                        timeZone: timezone,
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </strong>
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Team management — admin only */}
        {isAdmin && (
          <>
            <Separator className="mb-6" />

            <Card className="mb-6">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="text-sm font-semibold">Gestión de equipo</CardTitle>
                  <CardDescription className="mt-1">Invita y administra los accesos del equipo</CardDescription>
                </div>
                <button
                  onClick={() => { setInviteForm(emptyInviteForm); setModalOpen(true) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shrink-0"
                  style={{ backgroundColor: '#185FA5' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar miembro
                </button>
              </CardHeader>
              <CardContent className="p-0">
                {teamLoading ? (
                  <div className="space-y-0">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-12 animate-pulse bg-zinc-100 dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700" />
                    ))}
                  </div>
                ) : teamProfiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                    <UserPlus className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm font-medium">No hay perfiles aún</p>
                    <p className="text-xs mt-0.5">Agrega el primer miembro del equipo</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                          {['Nombre', 'Rol', 'Closer / Setter name', 'Creado'].map((h) => (
                            <th key={h} className="text-left py-2.5 px-4 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamProfiles.map((p) => (
                          <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                            <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">{p.full_name}</td>
                            <td className="py-3 px-4">
                              <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', ROLE_COLORS[p.role])}>
                                {ROLE_LABELS[p.role]}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                              {p.closer_name ?? p.setter_name ?? '—'}
                            </td>
                            <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                              {new Date(p.created_at).toLocaleDateString('es-CO', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Separator className="mb-6" />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Change Password</CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  New Password
                </label>
                <Input
                  {...register('password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Confirm Password
                </label>
                <Input
                  {...register('confirm')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                {errors.confirm && (
                  <p className="text-xs text-red-500">{errors.confirm.message}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>
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
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Agregar miembro</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={(e) => setInvite('full_name', e.target.value)}
                  placeholder="Ej: Valentina Llano"
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInvite('email', e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Rol</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInvite('role', e.target.value as Role)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  <option value="admin">Admin</option>
                  <option value="closer">Closer</option>
                  <option value="setter">Setter</option>
                </select>
              </div>

              {inviteForm.role === 'closer' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Closer name <span className="text-zinc-400 font-normal">(debe coincidir con el nombre en llamadas)</span>
                  </label>
                  <select
                    value={inviteForm.closer_name}
                    onChange={(e) => setInvite('closer_name', e.target.value)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {CLOSER_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}

              {inviteForm.role === 'setter' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Setter name <span className="text-zinc-400 font-normal">(debe coincidir con el nombre en reportes)</span>
                  </label>
                  <select
                    value={inviteForm.setter_name}
                    onChange={(e) => setInvite('setter_name', e.target.value)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    required
                  >
                    <option value="">Seleccionar...</option>
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
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 text-xs rounded-lg text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: '#185FA5' }}
                >
                  {inviting ? 'Enviando...' : 'Enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageTransition>
  )
}

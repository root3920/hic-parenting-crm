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
import { Loader2, Check } from 'lucide-react'
import { PageTransition } from '@/components/motion/PageTransition'
import { US_TIMEZONES } from '@/lib/timezones'
import { useUserTimezone } from '@/hooks/useUserTimezone'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

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

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const { timezone, loading: tzLoading, updateTimezone } = useUserTimezone()

  useEffect(() => {
    void supabase.auth.getUser().then((r: { data: { user: { email?: string } | null } }) => {
      setEmail(r.data.user?.email ?? '')
    })
  }, [])

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
    </PageTransition>
  )
}

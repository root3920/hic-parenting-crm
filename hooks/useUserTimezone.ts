'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { DEFAULT_TIMEZONE } from '@/lib/timezones'

export function useUserTimezone() {
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .single()

      if (data?.timezone) setTimezone(data.timezone)
      setLoading(false)
    }
    load()
  }, [])

  async function updateTimezone(newTimezone: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('user_preferences')
      .upsert(
        { user_id: user.id, timezone: newTimezone, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    setTimezone(newTimezone)
  }

  return { timezone, loading, updateTimezone }
}

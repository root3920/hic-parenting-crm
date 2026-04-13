'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

export type UserRole = 'admin' | 'closer' | 'setter'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  closer_name: string | null
  setter_name: string | null
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(data ?? null)
      setLoading(false)
    }
    load()
  }, [supabase])

  return { profile, loading }
}

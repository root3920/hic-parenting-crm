import { useCallback, useEffect, useState } from 'react'

export interface TeamMember {
  id: string
  name: string
  email: string | null
  role: 'closer' | 'setter' | 'csm_spc' | 'csm_ht'
  active: boolean
  created_at: string
}

// In-memory cache shared across hook instances
const cache: Record<string, { data: TeamMember[]; ts: number }> = {}
const CACHE_TTL = 60_000 // 1 minute

export function useTeamMembers(role?: 'closer' | 'setter' | 'csm_spc' | 'csm_ht', activeOnly = true) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [rev, setRev] = useState(0)

  const fetchMembers = useCallback(() => {
    const key = `${role ?? 'all'}-${activeOnly}`
    const cached = cache[key]
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setMembers(cached.data)
      setLoading(false)
      return
    }

    setLoading(true)
    const params = new URLSearchParams()
    if (role) params.set('role', role)
    if (activeOnly) params.set('active', 'true')

    fetch(`/api/team-members?${params}`)
      .then(r => r.json())
      .then((data: TeamMember[]) => {
        if (Array.isArray(data)) {
          cache[key] = { data, ts: Date.now() }
          setMembers(data)
        }
      })
      .finally(() => setLoading(false))
  }, [role, activeOnly, rev]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const names = members.map(m => m.name)

  const refetch = useCallback(() => {
    // Clear all cache entries and bump revision to trigger re-fetch
    for (const key in cache) delete cache[key]
    setRev(r => r + 1)
  }, [])

  return { members, names, loading, refetch }
}

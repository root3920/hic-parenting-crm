'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Search, ShieldAlert, CheckCircle2, GraduationCap } from 'lucide-react'
import { useProfile } from '@/hooks/useProfile'
import { formatDate } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface StudentBasic {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  status: string
  graduated_at: string | null
}

interface RiskRecord {
  id: string
  student_id: string
  flagged_by: string
  status: 'at_risk' | 'recovered' | 'lost'
  flagged_at: string
  recovered_at: string | null
  notes: string | null
  student: { first_name: string; last_name: string | null } | null
}

interface OutreachRecord {
  id: string
  student_id: string
  family_manifesto_sent: boolean
  testimonial_requested: boolean
  nurturing_conversation_had: boolean
  referred_to_grad_program: boolean
  continuation_opportunity_identified: boolean
}

type OutreachField = typeof OUTREACH_FIELDS[number]['key']

const OUTREACH_FIELDS = [
  { key: 'family_manifesto_sent' as const, label: 'Family Manifesto' },
  { key: 'testimonial_requested' as const, label: 'Testimonial' },
  { key: 'nurturing_conversation_had' as const, label: 'Nurturing Convo' },
  { key: 'referred_to_grad_program' as const, label: 'Grad Program' },
  { key: 'continuation_opportunity_identified' as const, label: 'Continuation Opp.' },
]

const inputCls =
  'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'

// ── Component ────────────────────────────────────────────────────────────────

export function StudentRiskOutreach() {
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()

  const [students, setStudents] = useState<StudentBasic[]>([])
  const [riskRecords, setRiskRecords] = useState<RiskRecord[]>([])
  const [outreachRecords, setOutreachRecords] = useState<OutreachRecord[]>([])
  const [search, setSearch] = useState('')
  const [riskNotes, setRiskNotes] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [studentsRes, riskRes, outreachRes] = await Promise.all([
      supabase
        .from('pwu_students')
        .select('id, first_name, last_name, email, status, graduated_at')
        .in('status', ['active', 'graduated'])
        .order('first_name'),
      supabase
        .from('student_risk_tracking')
        .select('*, student:pwu_students(first_name, last_name)')
        .eq('status', 'at_risk')
        .order('flagged_at', { ascending: false }),
      supabase.from('student_graduation_outreach').select('*'),
    ])
    if (studentsRes.data) setStudents(studentsRes.data)
    if (riskRes.data) setRiskRecords(riskRes.data as RiskRecord[])
    if (outreachRes.data) setOutreachRecords(outreachRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // Derived
  const activeStudents = useMemo(() => students.filter((s) => s.status === 'active'), [students])
  const graduatedStudents = useMemo(() => students.filter((s) => s.status === 'graduated'), [students])
  const atRiskStudentIds = useMemo(() => new Set(riskRecords.map((r) => r.student_id)), [riskRecords])

  const filteredActive = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return activeStudents.filter((s) =>
      `${s.first_name} ${s.last_name ?? ''}`.toLowerCase().includes(q)
      || (s.email ?? '').toLowerCase().includes(q)
    )
  }, [activeStudents, search])

  // ── Actions ──

  async function flagAtRisk(studentId: string) {
    const { error } = await supabase.from('student_risk_tracking').insert({
      student_id: studentId,
      flagged_by: profile?.full_name ?? 'Unknown',
      status: 'at_risk',
      notes: riskNotes || null,
    })
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Student flagged as at-risk')
    setRiskNotes('')
    setSearch('')
    fetchData()
  }

  async function markRecovered(recordId: string) {
    const { error } = await supabase
      .from('student_risk_tracking')
      .update({ status: 'recovered', recovered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', recordId)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Student marked as recovered')
    fetchData()
  }

  async function toggleOutreach(studentId: string, field: OutreachField, value: boolean) {
    const existing = outreachRecords.find((r) => r.student_id === studentId)
    if (existing) {
      const { error } = await supabase
        .from('student_graduation_outreach')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) { toast.error(`Failed: ${error.message}`); return }
      setOutreachRecords((prev) =>
        prev.map((r) => (r.id === existing.id ? { ...r, [field]: value } : r))
      )
    } else {
      const { data, error } = await supabase
        .from('student_graduation_outreach')
        .insert({ student_id: studentId, [field]: value })
        .select()
        .single()
      if (error) { toast.error(`Failed: ${error.message}`); return }
      setOutreachRecords((prev) => [...prev, data as OutreachRecord])
    }
  }

  function getOutreach(studentId: string): OutreachRecord | undefined {
    return outreachRecords.find((r) => r.student_id === studentId)
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ── At-Risk Tracking ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">At-Risk Tracking</h2>
          <span className="text-xs text-zinc-400">({riskRecords.length} currently at risk)</span>
        </div>

        {/* Search + Flag */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search active students to flag as at-risk..."
              className={cn(inputCls, 'pl-9')}
            />
          </div>

          {search.trim() && (
            <>
              <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded-lg">
                {filteredActive.length === 0 ? (
                  <p className="text-xs text-zinc-400 p-3">No students found</p>
                ) : (
                  filteredActive.map((s) => {
                    const isAtRisk = atRiskStudentIds.has(s.id)
                    return (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <div>
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {s.first_name} {s.last_name ?? ''}
                          </p>
                          {s.email && <p className="text-xs text-zinc-400">{s.email}</p>}
                        </div>
                        {isAtRisk ? (
                          <span className="text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full">
                            Already at risk
                          </span>
                        ) : (
                          <button
                            onClick={() => flagAtRisk(s.id)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Flag At-Risk
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {filteredActive.some((s) => !atRiskStudentIds.has(s.id)) && (
                <textarea
                  value={riskNotes}
                  onChange={(e) => setRiskNotes(e.target.value)}
                  placeholder="Notes (optional) — will attach to the next student you flag"
                  rows={2}
                  className={cn(inputCls, 'resize-none mt-3')}
                />
              )}
            </>
          )}
        </div>

        {/* Currently at-risk list */}
        {riskRecords.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Currently At Risk
              </p>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {riskRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {r.student?.first_name} {r.student?.last_name ?? ''}
                    </p>
                    <p className="text-xs text-zinc-400">
                      Flagged {formatDate(r.flagged_at)} by {r.flagged_by}
                      {r.notes && <span className="text-zinc-300 dark:text-zinc-600"> — {r.notes}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => markRecovered(r.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Mark Recovered
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Graduation Outreach ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="h-4 w-4 text-purple-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Graduation Outreach</h2>
          <span className="text-xs text-zinc-400">({graduatedStudents.length} graduates)</span>
        </div>

        {graduatedStudents.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
            <p className="text-xs text-zinc-400">No graduated students found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                      Student
                    </th>
                    {OUTREACH_FIELDS.map((f) => (
                      <th
                        key={f.key}
                        className="px-2 py-3 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap"
                      >
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {graduatedStudents.map((s) => {
                    const outreach = getOutreach(s.id)
                    return (
                      <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {s.first_name} {s.last_name ?? ''}
                          </p>
                          {s.graduated_at && (
                            <p className="text-[10px] text-zinc-400">Graduated {formatDate(s.graduated_at)}</p>
                          )}
                        </td>
                        {OUTREACH_FIELDS.map((f) => (
                          <td key={f.key} className="px-2 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={outreach?.[f.key] ?? false}
                              onChange={(e) => toggleOutreach(s.id, f.key, e.target.checked)}
                              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-[#ffbd59] focus:ring-[#ffbd59]/30 cursor-pointer"
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

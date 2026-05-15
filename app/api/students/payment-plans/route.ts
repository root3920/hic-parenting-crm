import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function verifyAuth() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  return user ?? null
}

export async function GET() {
  const user = await verifyAuth()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()

  // 1. Fetch all payment plans joined with student info
  const { data: plans, error: plansError } = await supabase
    .from('student_payment_plans')
    .select('*, student:pwu_students!student_payment_plans_student_id_fkey(id, first_name, last_name, email)')

  if (plansError) {
    return NextResponse.json({ error: plansError.message }, { status: 500 })
  }

  if (!plans || plans.length === 0) {
    return NextResponse.json({
      students: [],
      totals: {
        studentsWithPlan: 0,
        totalPaid: 0,
        totalRemaining: 0,
        totalCollected: 0,
        totalPending: 0,
        totalOverdue: 0,
      },
    })
  }

  // 2. Collect all student emails to batch-query transactions
  const emailSet = new Set<string>()
  for (const plan of plans) {
    const student = plan.student as { id: string; first_name: string; last_name: string | null; email: string | null } | null
    if (student?.email) emailSet.add(student.email.toLowerCase())
  }

  // 3. Fetch completed payment-plan transactions for those emails
  let txCountByEmail: Record<string, number> = {}
  if (emailSet.size > 0) {
    const { data: txRows, error: txError } = await supabase
      .from('transactions')
      .select('buyer_email')
      .in('buyer_email', Array.from(emailSet))
      .ilike('offer_title', '%Payment Plan%')
      .eq('status', 'completed')

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    for (const tx of txRows ?? []) {
      const key = (tx.buyer_email as string).toLowerCase()
      txCountByEmail[key] = (txCountByEmail[key] ?? 0) + 1
    }
  }

  // 4. Build per-student data
  const now = new Date()
  let totalPaid = 0
  let totalRemaining = 0
  let totalCollected = 0
  let totalPending = 0
  let totalOverdue = 0

  const students = plans.map((plan) => {
    const student = plan.student as { id: string; first_name: string; last_name: string | null; email: string | null } | null
    const name = [student?.first_name, student?.last_name].filter(Boolean).join(' ') || 'Unknown'
    const email = student?.email?.toLowerCase() ?? ''

    // Actual completed transaction count for this student
    const actualPaidCount = txCountByEmail[email] ?? 0

    const paid = Math.min(actualPaidCount, plan.total_installments)
    const remaining = plan.total_installments - paid
    const collected = paid * plan.amount_per_installment
    const pending = remaining * plan.amount_per_installment
    const progressPct = plan.total_installments > 0
      ? Math.round((paid / plan.total_installments) * 100)
      : 0

    // Calculate months elapsed since start_date
    const start = new Date(plan.start_date + 'T12:00:00')
    const monthsElapsed = Math.max(
      0,
      (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()),
    )
    // Cap at total_installments — can't be overdue for more than the plan
    const cappedMonths = Math.min(monthsElapsed, plan.total_installments)
    const overdueInstallments = Math.max(0, cappedMonths - actualPaidCount)
    const isOverdue = overdueInstallments > 0

    totalPaid += paid
    totalRemaining += remaining
    totalCollected += collected
    totalPending += pending
    totalOverdue += overdueInstallments

    return {
      id: plan.id,
      studentId: student?.id ?? plan.student_id,
      name,
      email: student?.email ?? null,
      amountPerInstallment: plan.amount_per_installment,
      currency: plan.currency,
      startDate: plan.start_date,
      totalInstallments: plan.total_installments,
      paid,
      remaining,
      collected,
      pending,
      progressPct,
      monthsElapsed: cappedMonths,
      actualPaidCount,
      overdueInstallments,
      isOverdue,
    }
  })

  return NextResponse.json({
    students,
    totals: {
      studentsWithPlan: students.length,
      totalPaid,
      totalRemaining,
      totalCollected,
      totalPending,
      totalOverdue,
    },
  })
}

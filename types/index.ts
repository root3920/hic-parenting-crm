export interface Transaction {
  id: string
  date: string
  offer_title: string
  cost: number
  buyer_name: string
  buyer_email: string
  buyer_phone?: string
  currency: string
  transaction_id?: string
  source: 'Kajabi' | 'GoHighLevel' | 'Manual' | 'Stripe' | 'PayPal' | 'Otro'
  payment_source?: string
  status?: 'completed' | 'refunded' | 'failed' | 'recovered'
  created_at: string
}

export interface SetterReport {
  id: string
  setter_name: string
  date: string
  total_convos: number
  follow_ups: number
  outbound: number
  inbound: number
  call_proposed: number
  qualified_calls: number
  disqualified: number
  hours_worked: number
  performance_score: number
  highs: string
  lows: string
  notes: string
  created_at: string
}

export interface CloserReport {
  id: string
  closer_name: string
  date: string
  total_meetings: number
  showed_meetings: number
  cancelled_meetings: number
  no_show_meetings: number
  rescheduled_meetings: number
  offers_proposed: number
  won_deals: number
  lost_deals: number
  cash_collected: number
  recurrent_pipeline: number
  feedback: string
  created_at: string
}

export interface SpcMember {
  id: string
  name: string
  email: string
  phone?: string | null
  plan: 'monthly' | 'annual'
  amount: number
  status: 'active' | 'trial' | 'cancelled' | 'expired'
  provider: 'Kajabi' | 'Stripe' | 'PayPal'
  joined_at: string
  next_payment_date: string
  trial_end_date: string | null
  trial_days: number | null
  created_at: string
}

export interface KPIData {
  title: string
  value: string | number
  subtitle?: string
  trend?: number
  trendLabel?: string
}

export interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

export interface Call {
  id: string
  start_date: string
  end_date: string | null
  full_name: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  meeting_url: string | null
  activity_type: string | null
  status: 'Scheduled' | 'Rescheduled' | 'Showed Up' | 'Cancelled' | 'No show'
  call_type: 'Qualified' | 'Disqualified' | 'Onboarding' | 'Interview' | null
  calendar: string | null
  setter_name: string | null
  closer_name: string | null
  notes: string | null
  objections: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  created_at: string
  call_status: 'No Show' | 'Showed Up' | null
  next_step: 'Follow Up' | 'Cancelled' | 'Rescheduled' | null
  call_summary: string | null
  reported_at: string | null
  reported_by: string | null
}

export interface CloserDailyReport {
  id: string
  date: string
  closer_name: string
  total_meetings: number
  showed_meetings: number
  cancelled_meetings: number
  no_show_meetings: number
  rescheduled_meetings: number
  followup_meetings: number
  total_offers: number
  offers_proposed: number
  won_deals: number
  lost_deals: number
  cash_collected: number
  recurrent_cash: number
  feedback: string | null
  source: string
  created_at: string
}

export interface SetterDailyReport {
  id: string
  date: string
  setter_name: string
  hours_worked: number
  // Conversaciones
  total_convos: number
  followups: number
  inbound: number
  outbound: number
  no_reply: number
  new_leads: number
  // Pipeline de llamadas
  calls_proposed: number
  calls_booked: number
  calls_done: number
  calls_cancelled: number
  calls_noshow: number
  calls_rescheduled: number
  // Leads calificados
  qual_apps: number
  disqual_apps: number
  waiting: number
  requalified: string
  disqual_reasons: string[] | null
  // SPC
  spc_invites: number
  spc_new: number
  spc_interested: number
  // Autoevaluación
  performance_score: number
  highs: string[] | null
  lows: string[] | null
  notas: string | null
  created_at: string
}

export interface PwuStudent {
  id: string
  contact_id: string | null
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  cohort: string
  type: 'group' | 'individual'
  status: 'active' | 'graduated' | 'paused' | 'refund'
  graduated_at: string | null
  notes: string | null
  cohort_assigned_at: string | null
  last_contacted_at: string | null
  payment_date: string | null
  payment_amount: number | null
  transaction_id: string | null
  created_at: string
  updated_at: string
}

export interface StudentNote {
  id: string
  student_id: string
  note: string
  created_by: string
  created_at: string
}

export interface StudentPaymentPlan {
  id: string
  student_id: string
  total_installments: number
  amount_per_installment: number
  currency: string
  start_date: string
  notes: string | null
  created_at: string
}

export interface SpcReport {
  id: string
  date: string
  rep_name: string
  hours_worked: number
  // Community metrics
  community_size: number
  new_members: number
  members_welcomed: number
  members_introduced: number
  questions_answered: number
  wins_shared: number
  // Content & Activity
  published_post: boolean
  post_type: string | null
  sent_class_reminder: boolean
  // Retention
  inactive_identified: number
  checkin_messages_sent: number
  parent_frustration: boolean
  parent_frustration_notes: string | null
  referral_mentioned: boolean
  referrals_count: number
  // End of day
  highs: string | null
  lows: string | null
  performance: number
  created_at: string
}

export interface CsmReport {
  id: string
  date: string
  csm_name: string
  // Retención
  r_solicitudes: number
  r_saved: number
  r_churn: number
  r_pausas: number
  r_cancel_reasons: string[] | null
  r_notas: string | null
  // Seguimiento
  s_checkins: number
  s_riesgo: number
  s_wins: number
  s_dudas: number
  s_engagement: string
  s_fricciones: string[] | null
  s_notas: string | null
  // Graduados
  g_contactados: number
  g_conversaciones: number
  g_llamadas: number
  g_seguimientos: number
  g_sin_respuesta: number
  g_referidos: number
  g_oportunidades: string[] | null
  g_objeciones: string[] | null
  g_notas: string | null
  // Soporte
  t_recibidos: number
  t_resueltos: number
  t_pendientes: number
  t_escalados: number
  t_origen: string[] | null
  t_notas: string | null
  // Escalamientos
  e_criticos: number
  e_coaches: number
  e_liderazgo: number
  e_resueltos: number
  e_caso_relevante: string | null
  // Cierre
  c_wins: string | null
  c_riesgos: string | null
  c_accion1: string | null
  c_accion2: string | null
  c_accion3: string | null
  created_at: string
}

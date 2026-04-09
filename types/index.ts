export interface Transaction {
  id: string
  date: string
  offer_title: string
  cost: number
  buyer_name: string
  buyer_email: string
  currency: string
  source: 'Kajabi' | 'GoHighLevel'
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
  plan: 'monthly' | 'annual'
  amount: number
  status: 'active' | 'trial'
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

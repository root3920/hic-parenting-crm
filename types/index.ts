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

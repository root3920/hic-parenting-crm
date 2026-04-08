CREATE TABLE IF NOT EXISTS csm_reports (
  id uuid default gen_random_uuid() primary key,

  -- Meta
  date date not null,
  csm_name text not null,

  -- RETENCIÓN (Coaching programs activos)
  r_solicitudes int default 0,
  r_saved int default 0,
  r_churn int default 0,
  r_pausas int default 0,
  r_cancel_reasons text[],
  r_notas text,

  -- SEGUIMIENTO (Estudiantes activos)
  s_checkins int default 0,
  s_riesgo int default 0,
  s_wins int default 0,
  s_dudas int default 0,
  s_engagement text default 'Alto',
  s_fricciones text[],
  s_notas text,

  -- GRADUADOS
  g_contactados int default 0,
  g_conversaciones int default 0,
  g_llamadas int default 0,
  g_seguimientos int default 0,
  g_sin_respuesta int default 0,
  g_referidos int default 0,
  g_oportunidades text[],
  g_objeciones text[],
  g_notas text,

  -- TICKETS / SOPORTE
  t_recibidos int default 0,
  t_resueltos int default 0,
  t_pendientes int default 0,
  t_escalados int default 0,
  t_origen text[],
  t_notas text,

  -- ESCALAMIENTOS
  e_criticos int default 0,
  e_coaches int default 0,
  e_liderazgo int default 0,
  e_resueltos int default 0,
  e_caso_relevante text,

  -- CIERRE DEL DÍA
  c_wins text,
  c_riesgos text,
  c_accion1 text,
  c_accion2 text,
  c_accion3 text,

  created_at timestamptz default now()
);

ALTER TABLE csm_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users only" ON csm_reports
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_csm_reports_date ON csm_reports(date DESC);
CREATE INDEX idx_csm_reports_csm ON csm_reports(csm_name);

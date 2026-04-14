-- Migration: student_payment_plans
-- One payment plan per student (enforced by unique constraint)

CREATE TABLE IF NOT EXISTS student_payment_plans (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid        NOT NULL REFERENCES pwu_students(id) ON DELETE CASCADE,
  total_installments      integer     NOT NULL CHECK (total_installments BETWEEN 1 AND 12),
  amount_per_installment  numeric     NOT NULL,
  currency                text        NOT NULL DEFAULT 'USD',
  start_date              date        NOT NULL,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT student_payment_plans_student_id_unique UNIQUE (student_id)
);

-- RLS: allow authenticated users full access
ALTER TABLE student_payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage payment plans"
  ON student_payment_plans
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

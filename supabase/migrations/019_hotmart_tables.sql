-- Hotmart webhook support tables

CREATE TABLE IF NOT EXISTS hotmart_payment_failures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  transaction_id TEXT,
  amount NUMERIC,
  failed_at TIMESTAMPTZ DEFAULT now(),
  retry_count INTEGER DEFAULT 1,
  resolved BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS hotmart_cart_abandoned (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  product TEXT,
  offer_code TEXT,
  abandoned_at TIMESTAMPTZ DEFAULT now(),
  recovered BOOLEAN DEFAULT false,
  recovered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS hotmart_webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event TEXT,
  email TEXT,
  payload JSONB,
  status TEXT,
  error_message TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

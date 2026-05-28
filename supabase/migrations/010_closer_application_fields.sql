ALTER TABLE job_applications
ADD COLUMN IF NOT EXISTS past_sales_performance TEXT,
ADD COLUMN IF NOT EXISTS best_month_cash_collected NUMERIC,
ADD COLUMN IF NOT EXISTS sales_methodologies TEXT,
ADD COLUMN IF NOT EXISTS objection_handling TEXT,
ADD COLUMN IF NOT EXISTS closing_superpower TEXT,
ADD COLUMN IF NOT EXISTS crm_tools_proficient TEXT;

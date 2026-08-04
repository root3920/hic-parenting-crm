-- Add country column to hotmart_cart_abandoned
ALTER TABLE hotmart_cart_abandoned ADD COLUMN IF NOT EXISTS country TEXT;

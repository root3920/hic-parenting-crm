-- Calendar categories
CREATE TABLE calendar_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Calendar events
CREATE TABLE calendar_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category_id UUID REFERENCES calendar_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default categories
INSERT INTO calendar_categories (name, color) VALUES
  ('Proyecto Activo', '#3B82F6'),
  ('Vacaciones',      '#10B981'),
  ('Lanzamiento',     '#F59E0B'),
  ('Reunión',         '#8B5CF6'),
  ('Fecha límite',    '#EF4444');

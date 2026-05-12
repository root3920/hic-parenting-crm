-- Team Members table: dynamic list of closers, setters, and CSMs
CREATE TABLE IF NOT EXISTS team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text,
  role       text NOT NULL CHECK (role IN ('closer', 'setter', 'csm_spc', 'csm_ht')),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast role-based lookups
CREATE INDEX idx_team_members_role_active ON team_members (role, active);

-- Seed with existing closers
INSERT INTO team_members (name, role) VALUES
  ('Marcela HIC Parenting', 'closer'),
  ('Ana Martin',            'closer'),
  ('Cali Luna',             'closer'),
  ('Ariana Peña',           'closer'),
  ('Jessica Fisk-Abraham',  'closer'),
  ('Maya Ahmed',            'closer'),
  ('Sona Patel',            'closer'),
  ('Steffanie Williams',    'closer'),
  ('Sylvia Smit',           'closer'),
  ('Tina Balmer',           'closer'),
  ('Veronica Herrera',      'closer'),
  ('Liliana Mendoza',       'closer'),
  ('Karina Lopez',          'closer'),
  ('Amanda Smith',          'closer');

-- Seed with existing setters
INSERT INTO team_members (name, role) VALUES
  ('Valentina Llano',       'setter'),
  ('Marcela Collier',       'setter'),
  ('Ana Martin',            'setter'),
  ('Beatriz Navarro',       'setter'),
  ('Casper Holm',           'setter'),
  ('Hamza Sayyed',          'setter'),
  ('Katy Castellanos',      'setter'),
  ('Lamees Attia',          'setter'),
  ('Mariana Llano',         'setter'),
  ('Marrian Yousef',        'setter'),
  ('Patsy George',          'setter'),
  ('Rohit Rajendranath',    'setter'),
  ('Tina Balmer',           'setter'),
  ('Sylvia Smit',           'setter'),
  ('Venicia Lloyd',         'setter');

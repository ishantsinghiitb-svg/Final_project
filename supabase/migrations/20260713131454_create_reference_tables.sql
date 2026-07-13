-- ── Reference Tables ──
-- Normalized lookup tables to avoid duplicated company names, skills, roles, and locations.

-- ── companies ──
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  logo_url text,
  industry text,
  size text,
  headquarters text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_name_unique ON companies (lower(name));
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- public read
DROP POLICY IF EXISTS "companies_public_read" ON companies;
CREATE POLICY "companies_public_read" ON companies FOR SELECT
  TO anon, authenticated USING (true);

-- ── skills ──
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS skills_name_unique ON skills (lower(name));
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skills_public_read" ON skills;
CREATE POLICY "skills_public_read" ON skills FOR SELECT
  TO anon, authenticated USING (true);

-- ── roles ──
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_title_unique ON roles (lower(title));
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_public_read" ON roles;
CREATE POLICY "roles_public_read" ON roles FOR SELECT
  TO anon, authenticated USING (true);

-- ── locations ──
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  state text,
  country text NOT NULL DEFAULT 'US',
  remote boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS locations_city_state_country_unique
  ON locations (lower(city), lower(coalesce(state, '')), lower(country));
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_public_read" ON locations;
CREATE POLICY "locations_public_read" ON locations FOR SELECT
  TO anon, authenticated USING (true);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS companies_set_updated_at ON companies;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

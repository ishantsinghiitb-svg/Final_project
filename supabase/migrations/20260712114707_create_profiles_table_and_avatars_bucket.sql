/*
# Create profiles table and avatars storage bucket

## 1. Profiles Table

Creates a `profiles` table that stores user profile information.
Each row corresponds 1:1 with an `auth.users` row via the `id` column
(which is both the primary key and a foreign key to `auth.users.id`).

### Columns:
- `id` (uuid, PK, FK → auth.users.id ON DELETE CASCADE)
- `full_name` (text, nullable — populated from signup or Google)
- `email` (text, nullable — populated from auth.users email)
- `location` (text, nullable — user-editable in settings)
- `target_role` (text, nullable — user-editable in settings)
- `avatar_url` (text, nullable — public URL from avatars bucket)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now(), auto-updated via trigger)

## 2. Auto-update trigger

A trigger keeps `updated_at` current on every UPDATE.

## 3. Avatars Storage Bucket

Creates a public storage bucket named `avatars` for profile picture uploads.

## 4. Row Level Security

### profiles table:
- SELECT: authenticated users can read only their own profile
- INSERT: authenticated users can insert only their own profile
- UPDATE: authenticated users can update only their own profile
- DELETE: authenticated users can delete only their own profile

### avatars bucket:
- SELECT (read): public — anyone can view avatar images (they are public URLs)
- INSERT: authenticated users can upload to their own folder (avatars/<uid>/)
- UPDATE: authenticated users can update files in their own folder
- DELETE: authenticated users can delete files in their own folder

## 5. Notes

- The `id` column has DEFAULT `auth.uid()` so inserts that omit `id`
  automatically fill from the authenticated session.
- Policies use `auth.uid()` (never `current_user`).
- All statements are idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
*/

-- ── Profiles table ──
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  location text,
  target_role text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ── updated_at trigger ──
DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE OR REPLACE FUNCTION profiles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_set_updated_at();

-- ── RLS policies for profiles ──
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ── Avatars storage bucket ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ──
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Shared updated_at trigger function ──
-- Reusable across all tables; the existing profiles_set_updated_at is kept as-is.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── Storage buckets (resumes, exports, documents) ──
-- avatars bucket already exists from the initial migration.

INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS: resumes (private — only owner can read/write) ──
DROP POLICY IF EXISTS "resumes_read_own" ON storage.objects;
CREATE POLICY "resumes_read_own" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resumes_insert_own" ON storage.objects;
CREATE POLICY "resumes_insert_own" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resumes_update_own" ON storage.objects;
CREATE POLICY "resumes_update_own" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resumes_delete_own" ON storage.objects;
CREATE POLICY "resumes_delete_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Storage RLS: exports (private — only owner) ──
DROP POLICY IF EXISTS "exports_read_own" ON storage.objects;
CREATE POLICY "exports_read_own" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "exports_insert_own" ON storage.objects;
CREATE POLICY "exports_insert_own" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "exports_delete_own" ON storage.objects;
CREATE POLICY "exports_delete_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Storage RLS: documents (private — only owner) ──
DROP POLICY IF EXISTS "documents_read_own" ON storage.objects;
CREATE POLICY "documents_read_own" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "documents_insert_own" ON storage.objects;
CREATE POLICY "documents_insert_own" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "documents_update_own" ON storage.objects;
CREATE POLICY "documents_update_own" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "documents_delete_own" ON storage.objects;
CREATE POLICY "documents_delete_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

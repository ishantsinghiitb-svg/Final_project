-- ── Module 10B.2 Dry Run Audit fix: disable the inherited foreign seed rows ──
--
-- Module 10's strategy is primarily Indian / Indian-origin companies. The
-- initial seed migration (20260814000001) shipped 8 US companies as a
-- framework smoke-test set (Stripe, Figma, Databricks, Airbnb, Spotify,
-- OpenAI, Linear, Ramp) — useful to prove the crawler worked, but outside the
-- curated strategy the 2026-08-09 Dry Run audit reviewed against.
--
-- This is a data-only UPDATE, not a delete: the rows, their crawl history and
-- health status are preserved untouched. Flipping `enabled = false` removes
-- them from `crawlEligibility()`'s allowlist (Module 10B.2), so they simply
-- stop being selected for any future crawl.
--
-- `enabled = true` in the WHERE clause makes this idempotent and safe to
-- re-run: an operator who deliberately re-enables one of these later will not
-- have that choice silently reverted by a future migration replay.

UPDATE crawl_company_registry
SET
  enabled = false,
  notes = CASE
    WHEN notes IS NULL OR btrim(notes) = ''
      THEN 'Disabled: outside the curated Indian/Indian-origin company strategy (Module 10B.2 audit, 2026-08-09).'
    ELSE notes || ' | Disabled: outside the curated Indian/Indian-origin company strategy (Module 10B.2 audit, 2026-08-09).'
  END,
  updated_at = now()
WHERE enabled = true
  AND platform = 'career-pages'
  AND company_name IN ('Airbnb', 'Databricks', 'Figma', 'Linear', 'OpenAI', 'Ramp', 'Spotify', 'Stripe');

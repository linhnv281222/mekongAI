-- ============================================================
-- Test script for version tracking migration
-- Run after add-version-tracking.sql
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════
-- 1. Verify tables created
-- ══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check drawing_item_versions table
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'mekongai' 
    AND table_name = 'drawing_item_versions';
  
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Table mekongai.drawing_item_versions not found';
  END IF;
  RAISE NOTICE '✓ Table drawing_item_versions exists';

  -- Check field_evidence table
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'mekongai' 
    AND table_name = 'field_evidence';
  
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Table mekongai.field_evidence not found';
  END IF;
  RAISE NOTICE '✓ Table field_evidence exists';

  -- Check feedback_events table
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'mekongai' 
    AND table_name = 'feedback_events';
  
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Table mekongai.feedback_events not found';
  END IF;
  RAISE NOTICE '✓ Table feedback_events exists';
END $$;

-- ══════════════════════════════════════════════════════════
-- 2. Check migration data
-- ══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_jobs_count INTEGER;
  v_drawings_count INTEGER;
  v_versions_count INTEGER;
BEGIN
  -- Count jobs with drawings
  SELECT COUNT(*) INTO v_jobs_count
  FROM mekongai.agent_jobs
  WHERE drawings IS NOT NULL 
    AND jsonb_array_length(drawings) > 0;
  
  RAISE NOTICE '✓ Jobs with drawings: %', v_jobs_count;

  -- Count total drawings in jobs
  SELECT SUM(jsonb_array_length(drawings)) INTO v_drawings_count
  FROM mekongai.agent_jobs
  WHERE drawings IS NOT NULL 
    AND jsonb_array_length(drawings) > 0;
  
  RAISE NOTICE '✓ Total drawings in jobs: %', v_drawings_count;

  -- Count migrated versions
  SELECT COUNT(*) INTO v_versions_count
  FROM mekongai.drawing_item_versions
  WHERE version_type = 'ai_extracted';
  
  RAISE NOTICE '✓ Migrated versions: %', v_versions_count;

  -- Verify counts match
  IF v_drawings_count != v_versions_count THEN
    RAISE WARNING 'Migration count mismatch: expected %, got %', v_drawings_count, v_versions_count;
  ELSE
    RAISE NOTICE '✓ Migration complete: all drawings migrated';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════
-- 3. Sample data inspection
-- ══════════════════════════════════════════════════════════

-- Show first 5 migrated versions
SELECT 
  id,
  job_id,
  drawing_index,
  version_no,
  version_type,
  source,
  source_model,
  jsonb_object_keys(data) AS field_keys,
  created_at
FROM mekongai.drawing_item_versions
ORDER BY created_at DESC
LIMIT 5;

-- ══════════════════════════════════════════════════════════
-- 4. Test insert user_draft version
-- ══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_job_id INTEGER;
  v_ai_version_id INTEGER;
  v_draft_version_id INTEGER;
BEGIN
  -- Get first job with versions
  SELECT job_id INTO v_job_id
  FROM mekongai.drawing_item_versions
  WHERE version_type = 'ai_extracted'
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE NOTICE 'No jobs to test with';
    RETURN;
  END IF;

  -- Get ai_extracted version
  SELECT id INTO v_ai_version_id
  FROM mekongai.drawing_item_versions
  WHERE job_id = v_job_id 
    AND drawing_index = 0 
    AND version_type = 'ai_extracted'
  LIMIT 1;

  -- Create user_draft version (copy ai_extracted + modify so_luong)
  INSERT INTO mekongai.drawing_item_versions (
    job_id, 
    drawing_index, 
    version_no, 
    version_type, 
    data,
    source,
    created_by,
    change_reason
  )
  SELECT 
    job_id,
    drawing_index,
    2, -- version 2
    'user_draft',
    jsonb_set(data, '{data,so_luong}', '999'),
    'user',
    'test_user',
    'Test draft version'
  FROM mekongai.drawing_item_versions
  WHERE id = v_ai_version_id
  RETURNING id INTO v_draft_version_id;

  RAISE NOTICE '✓ Created test user_draft version: %', v_draft_version_id;

  -- Rollback test insert
  RAISE EXCEPTION 'Test complete, rolling back test data';
END $$;

ROLLBACK; -- Rollback test inserts

-- ══════════════════════════════════════════════════════════
-- 5. Verification report
-- ══════════════════════════════════════════════════════════

SELECT 
  'drawing_item_versions' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT job_id) AS unique_jobs,
  COUNT(DISTINCT version_type) AS version_types
FROM mekongai.drawing_item_versions

UNION ALL

SELECT 
  'field_evidence' AS table_name,
  COUNT(*) AS total_rows,
  0 AS unique_jobs,
  0 AS version_types
FROM mekongai.field_evidence

UNION ALL

SELECT 
  'feedback_events' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT job_id) AS unique_jobs,
  0 AS version_types
FROM mekongai.feedback_events;

-- Show version distribution
SELECT 
  version_type,
  COUNT(*) AS count,
  COUNT(DISTINCT job_id) AS jobs,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM mekongai.drawing_item_versions
GROUP BY version_type
ORDER BY version_type;

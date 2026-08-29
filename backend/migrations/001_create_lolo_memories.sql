-- =============================================================================
-- LOLO AUREA — Long-Term Memory Table Migration
-- Phase 6
-- =============================================================================
-- Run this in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/<your-project>/sql/new
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lolo_memories (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 INTEGER     NOT NULL,
    content                 TEXT        NOT NULL CHECK (char_length(content) BETWEEN 3 AND 500),
    priority                TEXT        NOT NULL DEFAULT 'medium'
                                        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    category                TEXT        NOT NULL DEFAULT 'other'
                                        CHECK (category IN ('personal', 'health', 'preference', 'event', 'conversation', 'other')),
    source_conversation_id  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at        TIMESTAMPTZ
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Fast user lookups (most queries filter by user_id)
CREATE INDEX IF NOT EXISTS idx_lolo_memories_user_id
    ON public.lolo_memories (user_id);

-- Priority-ordered retrieval per user
CREATE INDEX IF NOT EXISTS idx_lolo_memories_user_priority
    ON public.lolo_memories (user_id, priority, created_at DESC);

-- ── Row Level Security (RLS) ─────────────────────────────────────────────────
-- NOTE: We use the service-role key from the Flask backend, so RLS is bypassed.
-- Enable RLS only if you add user-facing Supabase Auth in the future.

ALTER TABLE public.lolo_memories DISABLE ROW LEVEL SECURITY;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT 'lolo_memories table is ready!' AS status;

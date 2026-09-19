-- =============================================================================
-- AUREA — OSCA Admin & Senior Citizen Real-Time Chat Table Migration
-- =============================================================================
-- Run this in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/<your-project>/sql/new
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.osca_chat_messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER     NOT NULL, -- Senior Citizen user ID (thread owner)
    sender_id       INTEGER     NOT NULL, -- Actual user ID of whoever sent this message
    sender_role     TEXT        NOT NULL DEFAULT 'user' CHECK (sender_role IN ('user', 'osca admin', 'super admin', 'admin')),
    sender_name     TEXT        NOT NULL DEFAULT '',
    message         TEXT        NOT NULL CHECK (char_length(message) >= 1),
    read            BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_osca_chat_user_id
    ON public.osca_chat_messages (user_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_osca_chat_unread
    ON public.osca_chat_messages (user_id, read);

CREATE INDEX IF NOT EXISTS idx_osca_chat_sender_role
    ON public.osca_chat_messages (sender_role, read);

-- ── Row Level Security (RLS) ─────────────────────────────────────────────────
-- Bypassed via Flask backend service-role key
ALTER TABLE public.osca_chat_messages DISABLE ROW LEVEL SECURITY;

SELECT 'osca_chat_messages table is ready!' AS status;

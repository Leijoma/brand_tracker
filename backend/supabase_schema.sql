-- BrandTracker Supabase Schema Migration
-- Generated: 2026-02-09

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: personas
-- ============================================
CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL,
    archetype TEXT NOT NULL,
    description TEXT NOT NULL,
    age_range TEXT NOT NULL,
    occupation TEXT NOT NULL,
    tech_savviness INTEGER NOT NULL,
    price_sensitivity INTEGER NOT NULL,
    brand_loyalty INTEGER NOT NULL,
    key_priorities TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'ai_generated',
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Table: questions
-- ============================================
CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    context TEXT,
    origin TEXT NOT NULL DEFAULT 'ai_generated',
    category TEXT,
    research_area TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Table: sessions
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT,
    category TEXT NOT NULL,
    brands TEXT NOT NULL,
    market_context TEXT NOT NULL,
    questions_per_persona INTEGER NOT NULL DEFAULT 5,
    research_areas TEXT,
    primary_brand TEXT,
    language TEXT DEFAULT 'English',
    status TEXT NOT NULL DEFAULT 'setup',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Table: session_personas (M:N join)
-- ============================================
CREATE TABLE IF NOT EXISTS session_personas (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, persona_id)
);

-- ============================================
-- Table: session_questions (M:N join)
-- ============================================
CREATE TABLE IF NOT EXISTS session_questions (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, question_id)
);

-- ============================================
-- Table: research_runs
-- ============================================
CREATE TABLE IF NOT EXISTS research_runs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    models_used TEXT NOT NULL DEFAULT '["claude"]'
);

-- ============================================
-- Table: responses
-- ============================================
CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    response_text TEXT NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'claude',
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Table: analysis_results
-- ============================================
CREATE TABLE IF NOT EXISTS analysis_results (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    brand TEXT NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'claude',
    total_mentions INTEGER NOT NULL,
    recommendation_count INTEGER NOT NULL,
    first_mention_count INTEGER NOT NULL,
    avg_sentiment_score DOUBLE PRECISION NOT NULL,
    share_of_voice DOUBLE PRECISION NOT NULL,
    persona_affinity TEXT NOT NULL,
    topic_scores TEXT
);

-- ============================================
-- Indexes for common query patterns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_questions_persona_id ON questions(persona_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_session_id ON research_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_run_id ON responses(run_id);
CREATE INDEX IF NOT EXISTS idx_responses_question_id ON responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_persona_id ON responses(persona_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_run_id ON analysis_results(run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_brand ON analysis_results(brand);

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS set_updated_at_personas ON personas;
CREATE TRIGGER set_updated_at_personas
    BEFORE UPDATE ON personas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_questions ON questions;
CREATE TRIGGER set_updated_at_questions
    BEFORE UPDATE ON questions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_sessions ON sessions;
CREATE TRIGGER set_updated_at_sessions
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for sessions: users can only access their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own sessions" ON sessions
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own sessions" ON sessions
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own sessions" ON sessions
    FOR DELETE USING (auth.uid()::text = user_id);

-- Enable RLS on related tables with access through session ownership
ALTER TABLE session_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- session_personas: accessible if user owns the session
CREATE POLICY "Users can access own session_personas" ON session_personas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = session_personas.session_id
            AND sessions.user_id = auth.uid()::text
        )
    );

-- session_questions: accessible if user owns the session
CREATE POLICY "Users can access own session_questions" ON session_questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = session_questions.session_id
            AND sessions.user_id = auth.uid()::text
        )
    );

-- research_runs: accessible if user owns the session
CREATE POLICY "Users can access own research_runs" ON research_runs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = research_runs.session_id
            AND sessions.user_id = auth.uid()::text
        )
    );

-- responses: accessible if user owns the session (via research_run)
CREATE POLICY "Users can access own responses" ON responses
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM research_runs
            JOIN sessions ON sessions.id = research_runs.session_id
            WHERE research_runs.id = responses.run_id
            AND sessions.user_id = auth.uid()::text
        )
    );

-- analysis_results: accessible if user owns the session (via research_run)
CREATE POLICY "Users can access own analysis_results" ON analysis_results
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM research_runs
            JOIN sessions ON sessions.id = research_runs.session_id
            WHERE research_runs.id = analysis_results.run_id
            AND sessions.user_id = auth.uid()::text
        )
    );

-- Personas and questions are shared resources (readable by all authenticated users)
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read personas" ON personas
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert personas" ON personas
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read questions" ON questions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert questions" ON questions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Service role bypasses RLS automatically in Supabase
-- The backend uses the service_role key, so it has full access

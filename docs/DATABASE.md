# BrandTracker Database Schema

## Overview

BrandTracker uses **Supabase PostgreSQL** as the primary database with **Row Level Security (RLS)** for multi-tenant data isolation.

## Database Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                       │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ sessions │───<│ personas │───<│ questions│             │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│       │               │               │                      │
│       │          ┌────┴────────────────┴─────┐              │
│       │          │   session_personas        │              │
│       │          │   session_questions       │              │
│       │          │   (join tables)           │              │
│       │          └───────────────────────────┘              │
│       │                                                      │
│       │          ┌──────────┐                               │
│       └─────────<│   runs   │                               │
│                  └────┬─────┘                               │
│                       │                                      │
│                  ┌────┴─────┐   ┌──────────────┐           │
│                  │responses │──<│ analysis_    │           │
│                  └──────────┘   │ results      │           │
│                                 └──────────────┘            │
│                                                              │
│  + Supabase Auth (users table, managed by Supabase)         │
└─────────────────────────────────────────────────────────────┘
```

## Tables

### 1. `sessions`

Research sessions created by users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique session ID |
| `user_id` | UUID | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Owner user ID |
| `category` | TEXT | NOT NULL | Product/service category |
| `brands` | JSONB | NOT NULL | Array of brand names |
| `market_context` | TEXT | | Market description |
| `questions_per_persona` | INTEGER | DEFAULT 3 | Questions to generate per persona |
| `research_areas` | JSONB | NOT NULL DEFAULT '[]' | Array of research focus areas |
| `primary_brand` | TEXT | | Primary brand being researched |
| `language` | TEXT | DEFAULT 'en' | Language code (en, sv, etc.) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_sessions_user_id` ON `user_id`

**RLS Policies**:
```sql
-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only create sessions for themselves
CREATE POLICY "Users can create own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own sessions
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own sessions
CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (auth.uid() = user_id);
```

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid",
  "category": "Technology",
  "brands": ["Apple", "Samsung", "Google"],
  "market_context": "Consumer electronics market",
  "questions_per_persona": 3,
  "research_areas": ["Brand Perception", "Product Quality"],
  "primary_brand": "Apple",
  "language": "en",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

### 2. `personas`

User personas (AI-generated or manual).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique persona ID |
| `user_id` | UUID | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Owner user ID |
| `name` | TEXT | NOT NULL | Persona name |
| `archetype` | TEXT | NOT NULL | Persona archetype |
| `description` | TEXT | | Detailed description |
| `age_range` | TEXT | | Age range (e.g., "25-35") |
| `occupation` | TEXT | | Job/occupation |
| `tech_savviness` | TEXT | | Tech skill level |
| `price_sensitivity` | TEXT | | Price sensitivity |
| `brand_loyalty` | TEXT | | Brand loyalty level |
| `key_priorities` | JSONB | NOT NULL DEFAULT '[]' | Array of priorities |
| `origin` | TEXT | DEFAULT 'manual' | "ai" or "manual" |
| `category` | TEXT | | Related category |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Indexes**:
- `idx_personas_user_id` ON `user_id`

**RLS Policies**:
```sql
-- Users can only see their own personas
CREATE POLICY "Users can view own personas" ON personas
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create personas for themselves
CREATE POLICY "Users can create own personas" ON personas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own personas
CREATE POLICY "Users can update own personas" ON personas
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own personas
CREATE POLICY "Users can delete own personas" ON personas
  FOR DELETE USING (auth.uid() = user_id);
```

**Example**:
```json
{
  "id": "persona-uuid",
  "user_id": "user-uuid",
  "name": "Tech-Savvy Professional",
  "archetype": "Early Adopter",
  "description": "A young professional who loves the latest technology",
  "age_range": "25-35",
  "occupation": "Software Engineer",
  "tech_savviness": "high",
  "price_sensitivity": "medium",
  "brand_loyalty": "low",
  "key_priorities": ["Innovation", "Performance", "Design"],
  "origin": "ai",
  "category": "Technology",
  "created_at": "2024-01-15T10:35:00Z"
}
```

---

### 3. `questions`

Research questions (AI-generated or manual).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique question ID |
| `user_id` | UUID | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Owner user ID |
| `persona_id` | UUID | REFERENCES personas(id) ON DELETE CASCADE | Associated persona |
| `question_text` | TEXT | NOT NULL | The actual question |
| `context` | TEXT | | Additional context |
| `origin` | TEXT | DEFAULT 'manual' | "ai" or "manual" |
| `category` | TEXT | | Related category |
| `research_area` | TEXT | | Research area/focus |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Indexes**:
- `idx_questions_user_id` ON `user_id`
- `idx_questions_persona_id` ON `persona_id`

**RLS Policies**:
```sql
-- Users can only see their own questions
CREATE POLICY "Users can view own questions" ON questions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create questions for themselves
CREATE POLICY "Users can create own questions" ON questions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own questions
CREATE POLICY "Users can update own questions" ON questions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own questions
CREATE POLICY "Users can delete own questions" ON questions
  FOR DELETE USING (auth.uid() = user_id);
```

**Example**:
```json
{
  "id": "question-uuid",
  "user_id": "user-uuid",
  "persona_id": "persona-uuid",
  "question_text": "What's your experience with Apple's customer service?",
  "context": "Considering your recent interaction",
  "origin": "ai",
  "category": "Technology",
  "research_area": "Customer Service",
  "created_at": "2024-01-15T10:40:00Z"
}
```

---

### 4. `session_personas`

Many-to-many relationship between sessions and personas.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `session_id` | UUID | REFERENCES sessions(id) ON DELETE CASCADE | Session ID |
| `persona_id` | UUID | REFERENCES personas(id) ON DELETE CASCADE | Persona ID |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Composite Primary Key**: `(session_id, persona_id)`

**Indexes**:
- `idx_session_personas_session` ON `session_id`
- `idx_session_personas_persona` ON `persona_id`

**RLS Policies**:
```sql
-- Users can only see links for their own sessions
CREATE POLICY "Users can view own session_personas" ON session_personas
  FOR SELECT USING (
    session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())
  );
```

---

### 5. `session_questions`

Many-to-many relationship between sessions and questions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `session_id` | UUID | REFERENCES sessions(id) ON DELETE CASCADE | Session ID |
| `question_id` | UUID | REFERENCES questions(id) ON DELETE CASCADE | Question ID |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Composite Primary Key**: `(session_id, question_id)`

**Indexes**:
- `idx_session_questions_session` ON `session_id`
- `idx_session_questions_question` ON `question_id`

**RLS Policies**:
```sql
-- Users can only see links for their own sessions
CREATE POLICY "Users can view own session_questions" ON session_questions
  FOR SELECT USING (
    session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())
  );
```

---

### 6. `runs`

Research runs (execution instances).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique run ID |
| `session_id` | UUID | NOT NULL, REFERENCES sessions(id) ON DELETE CASCADE | Associated session |
| `started_at` | TIMESTAMPTZ | DEFAULT NOW() | Start time |
| `completed_at` | TIMESTAMPTZ | | Completion time |
| `status` | TEXT | DEFAULT 'pending' | "pending", "running", "completed", "error" |
| `models_used` | JSONB | NOT NULL DEFAULT '[]' | Array of AI model IDs |
| `error_message` | TEXT | | Error details if failed |

**Indexes**:
- `idx_runs_session_id` ON `session_id`

**RLS Policies**:
```sql
-- Users can only see runs for their own sessions
CREATE POLICY "Users can view own runs" ON runs
  FOR SELECT USING (
    session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())
  );
```

**Example**:
```json
{
  "id": "run-uuid",
  "session_id": "session-uuid",
  "started_at": "2024-01-15T11:00:00Z",
  "completed_at": "2024-01-15T11:05:00Z",
  "status": "completed",
  "models_used": ["claude-sonnet", "gpt-4"],
  "error_message": null
}
```

---

### 7. `responses`

AI model responses during research runs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique response ID |
| `run_id` | UUID | NOT NULL, REFERENCES runs(id) ON DELETE CASCADE | Associated run |
| `question_id` | UUID | REFERENCES questions(id) ON DELETE CASCADE | Question asked |
| `persona_id` | UUID | REFERENCES personas(id) ON DELETE SET NULL | Persona context |
| `brand` | TEXT | NOT NULL | Brand being evaluated |
| `response_text` | TEXT | NOT NULL | AI model response |
| `model` | TEXT | NOT NULL | AI model used |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Response timestamp |

**Indexes**:
- `idx_responses_run_id` ON `run_id`
- `idx_responses_question_id` ON `question_id`
- `idx_responses_persona_id` ON `persona_id`
- `idx_responses_brand` ON `brand`

**RLS Policies**:
```sql
-- Users can only see responses from their own runs
CREATE POLICY "Users can view own responses" ON responses
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM runs WHERE session_id IN (
        SELECT id FROM sessions WHERE user_id = auth.uid()
      )
    )
  );
```

**Example**:
```json
{
  "id": "response-uuid",
  "run_id": "run-uuid",
  "question_id": "question-uuid",
  "persona_id": "persona-uuid",
  "brand": "Apple",
  "response_text": "Apple's customer service is generally excellent...",
  "model": "claude-sonnet",
  "created_at": "2024-01-15T11:02:00Z"
}
```

---

### 8. `analysis_results`

Analysis results from AI evaluation of responses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique analysis ID |
| `run_id` | UUID | NOT NULL, REFERENCES runs(id) ON DELETE CASCADE | Associated run |
| `analysis_text` | TEXT | NOT NULL | Full analysis text |
| `sentiment_scores` | JSONB | | Brand sentiment scores |
| `themes` | JSONB | | Identified themes |
| `comparative_insights` | JSONB | | Comparative analysis |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Analysis timestamp |

**Indexes**:
- `idx_analysis_run_id` ON `run_id`

**RLS Policies**:
```sql
-- Users can only see analysis for their own runs
CREATE POLICY "Users can view own analysis" ON analysis_results
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM runs WHERE session_id IN (
        SELECT id FROM sessions WHERE user_id = auth.uid()
      )
    )
  );
```

**Example**:
```json
{
  "id": "analysis-uuid",
  "run_id": "run-uuid",
  "analysis_text": "Overall brand sentiment analysis...",
  "sentiment_scores": {
    "Apple": 0.75,
    "Samsung": 0.65
  },
  "themes": {
    "Apple": ["Innovation", "Premium Quality"],
    "Samsung": ["Value", "Customization"]
  },
  "comparative_insights": [
    "Apple leads in brand loyalty",
    "Samsung offers better value perception"
  ],
  "created_at": "2024-01-15T11:10:00Z"
}
```

---

## Relationships

### One-to-Many
- `users` → `sessions` (one user has many sessions)
- `users` → `personas` (one user has many personas)
- `users` → `questions` (one user has many questions)
- `sessions` → `runs` (one session has many runs)
- `runs` → `responses` (one run has many responses)
- `runs` → `analysis_results` (one run has one or more analyses)

### Many-to-Many
- `sessions` ↔ `personas` (via `session_personas`)
- `sessions` ↔ `questions` (via `session_questions`)

### Optional References
- `questions` → `personas` (question may reference a persona)
- `responses` → `questions` (response references a question)
- `responses` → `personas` (response references persona context)

---

## Cascade Behaviors

### ON DELETE CASCADE
When a parent record is deleted, all child records are automatically deleted:

- Delete `session` → deletes all `runs`, `session_personas`, `session_questions`
- Delete `run` → deletes all `responses`, `analysis_results`
- Delete `persona` → deletes `session_personas` links
- Delete `question` → deletes `session_questions` links, `responses`
- Delete `user` (Supabase Auth) → deletes all `sessions`, `personas`, `questions`

### ON DELETE SET NULL
When referenced record is deleted, foreign key is set to NULL:

- Delete `persona` → `responses.persona_id` set to NULL (preserves response history)

---

## Row Level Security (RLS)

All tables have RLS enabled with policies ensuring users can only access their own data.

### How RLS Works

1. **User Authentication**: Supabase Auth provides JWT tokens
2. **Token Verification**: Backend verifies JWT with Supabase
3. **User Context**: `auth.uid()` function returns current user ID in SQL
4. **Policy Enforcement**: PostgreSQL checks RLS policies on every query
5. **Data Filtering**: Only rows matching policy conditions are returned

### Example RLS in Action

```sql
-- User A tries to query sessions
SELECT * FROM sessions;

-- PostgreSQL applies RLS policy:
-- WHERE user_id = auth.uid()

-- User A only sees their own sessions, never User B's sessions
```

### Bypassing RLS (Service Role)

The backend uses the **service role key** which bypasses RLS:
- Used for server-side operations
- Backend code applies `user_id` filters manually
- Frontend never gets service role key

---

## Indexes

Indexes improve query performance for common access patterns:

- **User ID indexes**: Fast lookup of user's data
- **Foreign key indexes**: Efficient joins
- **Composite primary keys**: Unique constraints on join tables

---

## Migrations

Database schema is defined in `backend/supabase_schema.sql`.

### Applying Schema

1. Go to Supabase Dashboard → SQL Editor
2. Create a new query
3. Paste contents of `supabase_schema.sql`
4. Click "Run"

### Schema Changes

When modifying schema:

1. Update `supabase_schema.sql`
2. Create a migration SQL script
3. Apply migration in Supabase Dashboard
4. Update backend models (`backend/models.py`)
5. Update CRUD operations (`backend/crud.py`)

---

## Common Queries

### Get Session with All Data

```sql
SELECT
  s.*,
  -- Get personas
  COALESCE(
    json_agg(DISTINCT p.*) FILTER (WHERE p.id IS NOT NULL),
    '[]'
  ) as personas,
  -- Get questions
  COALESCE(
    json_agg(DISTINCT q.*) FILTER (WHERE q.id IS NOT NULL),
    '[]'
  ) as questions,
  -- Get runs
  COALESCE(
    json_agg(DISTINCT r.*) FILTER (WHERE r.id IS NOT NULL),
    '[]'
  ) as runs
FROM sessions s
LEFT JOIN session_personas sp ON s.id = sp.session_id
LEFT JOIN personas p ON sp.persona_id = p.id
LEFT JOIN session_questions sq ON s.id = sq.session_id
LEFT JOIN questions q ON sq.question_id = q.id
LEFT JOIN runs r ON s.id = r.session_id
WHERE s.id = 'session-uuid'
  AND s.user_id = 'user-uuid'
GROUP BY s.id;
```

### Get Run with Responses

```sql
SELECT
  r.*,
  COALESCE(
    json_agg(res.* ORDER BY res.created_at) FILTER (WHERE res.id IS NOT NULL),
    '[]'
  ) as responses
FROM runs r
LEFT JOIN responses res ON r.id = res.run_id
WHERE r.id = 'run-uuid'
GROUP BY r.id;
```

---

## Data Access Patterns

### Backend (Supabase Python Client)

```python
from supabase import Client

# Get user's sessions (RLS applied)
result = supabase.table("sessions") \
    .select("*, personas(*), questions(*)") \
    .eq("user_id", user_id) \
    .execute()

# Insert with user_id
supabase.table("sessions").insert({
    "user_id": user_id,
    "category": "Technology",
    ...
}).execute()
```

### Frontend (Supabase JS Client)

Frontend should **not** query the database directly. Instead:
- Make API calls to backend
- Backend enforces authorization
- Backend adds `user_id` filters

---

## Performance Considerations

### Indexes
- All foreign keys are indexed
- User ID columns are indexed for RLS filtering

### JSONB Columns
- Used for flexible arrays (`brands`, `research_areas`, `key_priorities`)
- Can be queried with JSONB operators
- Consider GIN indexes for large-scale JSONB querying

### Cascade Deletes
- Efficient cleanup of related data
- Single delete propagates automatically
- No orphaned records

---

## Backup & Recovery

Supabase provides automatic backups:
- **Daily backups**: Retained for 7 days (free tier)
- **Point-in-time recovery**: Available on paid plans
- **Manual backup**: Export via Supabase Dashboard → Database → Backups

---

## Next Steps

- Read [API.md](API.md) for API endpoints using this schema
- Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- Read [DEVELOPMENT.md](DEVELOPMENT.md) for local development setup

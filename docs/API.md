# BrandTracker API Documentation

## Base URL

- **Development**: `http://localhost:8000/api` or `http://localhost:8011/api` (Docker)
- **Production**: `https://driftwoodstudios.se/brandtracker/api`

## Authentication

All endpoints except health check require authentication via JWT token.

### Headers

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Getting a Token

1. Sign up or sign in through the frontend
2. Token is stored in Supabase session storage
3. Frontend automatically includes token in API requests

## Response Format

### Success Response

```json
{
  "id": "uuid",
  "field1": "value1",
  "field2": "value2"
}
```

### Error Response

```json
{
  "detail": "Error message"
}
```

## Endpoints

### Health Check

#### `GET /`

Check if the API is running.

**Authentication**: Not required

**Response**: `200 OK`
```json
{
  "message": "BrandTracker API is running"
}
```

---

## Sessions

### Create Session

#### `POST /api/sessions`

Create a new research session.

**Request Body**:
```json
{
  "category": "Technology",
  "brands": ["Apple", "Samsung", "Google"],
  "market_context": "Consumer electronics market with focus on smartphones",
  "questions_per_persona": 3,
  "research_areas": ["Brand Perception", "Product Quality", "Customer Service"],
  "primary_brand": "Apple",
  "language": "en"
}
```

**Response**: `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "category": "Technology",
  "brands": ["Apple", "Samsung", "Google"],
  "market_context": "Consumer electronics market with focus on smartphones",
  "questions_per_persona": 3,
  "research_areas": ["Brand Perception", "Product Quality", "Customer Service"],
  "primary_brand": "Apple",
  "language": "en",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "personas": [],
  "questions": [],
  "runs": [],
  "responses": [],
  "analysis": null
}
```

### List Sessions

#### `GET /api/sessions`

Get all sessions for the authenticated user.

**Response**: `200 OK`
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "category": "Technology",
    "brands": ["Apple", "Samsung"],
    "primary_brand": "Apple",
    "created_at": "2024-01-15T10:30:00Z",
    "personas": [...],
    "questions": [...],
    "runs": [...],
    ...
  }
]
```

### Get Session

#### `GET /api/sessions/{session_id}`

Get a specific session with all related data.

**Parameters**:
- `session_id` (path): Session UUID

**Response**: `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "category": "Technology",
  "personas": [
    {
      "id": "persona-uuid",
      "name": "Tech-Savvy Professional",
      "archetype": "Early Adopter",
      ...
    }
  ],
  "questions": [
    {
      "id": "question-uuid",
      "persona_id": "persona-uuid",
      "question_text": "What's your experience with Apple products?",
      ...
    }
  ],
  "runs": [...],
  "responses": [...],
  "analysis": {...}
}
```

**Errors**:
- `404 Not Found`: Session doesn't exist or doesn't belong to user

### Update Session

#### `PUT /api/sessions/{session_id}`

Update session configuration.

**Parameters**:
- `session_id` (path): Session UUID

**Request Body**:
```json
{
  "category": "Technology",
  "brands": ["Apple", "Samsung", "Google", "OnePlus"],
  "market_context": "Updated market context",
  "questions_per_persona": 5,
  "research_areas": ["Brand Perception", "Innovation"],
  "primary_brand": "Apple",
  "language": "en"
}
```

**Response**: `200 OK` (Updated session object)

**Errors**:
- `404 Not Found`: Session doesn't exist or doesn't belong to user

### Delete Session

#### `DELETE /api/sessions/{session_id}`

Delete a session and all related data.

**Parameters**:
- `session_id` (path): Session UUID

**Response**: `204 No Content`

**Errors**:
- `404 Not Found`: Session doesn't exist or doesn't belong to user

---

## Personas

### Create Persona

#### `POST /api/personas`

Create a persona manually.

**Request Body**:
```json
{
  "session_id": "session-uuid",
  "name": "Tech-Savvy Professional",
  "archetype": "Early Adopter",
  "description": "A young professional who loves the latest technology",
  "age_range": "25-35",
  "occupation": "Software Engineer",
  "tech_savviness": "high",
  "price_sensitivity": "medium",
  "brand_loyalty": "low",
  "key_priorities": ["Innovation", "Performance", "Design"],
  "category": "Technology"
}
```

**Response**: `200 OK`
```json
{
  "id": "persona-uuid",
  "name": "Tech-Savvy Professional",
  "archetype": "Early Adopter",
  ...
  "origin": "manual"
}
```

### Generate Personas (AI)

#### `POST /api/generate-personas`

Generate personas using AI based on session context.

**Request Body**:
```json
{
  "session_id": "session-uuid",
  "count": 3
}
```

**Response**: `200 OK`
```json
{
  "task_id": "task-uuid",
  "message": "Persona generation started"
}
```

**Check Progress**:

#### `GET /api/generation-progress/{task_id}`

**Response**: `200 OK`
```json
{
  "status": "completed",
  "current": 3,
  "total": 3,
  "message": "All personas generated",
  "session_id": "session-uuid"
}
```

**Status values**:
- `generating`: In progress
- `completed`: Finished successfully
- `error`: Failed with error

### List Personas

#### `GET /api/personas?session_id={session_id}`

Get all personas for a session.

**Query Parameters**:
- `session_id` (optional): Filter by session

**Response**: `200 OK`
```json
[
  {
    "id": "persona-uuid",
    "name": "Tech-Savvy Professional",
    "archetype": "Early Adopter",
    ...
  }
]
```

### Update Persona

#### `PUT /api/personas/{persona_id}`

Update a persona.

**Parameters**:
- `persona_id` (path): Persona UUID

**Request Body**:
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "age_range": "30-40"
}
```

**Response**: `200 OK` (Updated persona object)

### Delete Persona

#### `DELETE /api/personas/{persona_id}`

Delete a persona.

**Parameters**:
- `persona_id` (path): Persona UUID

**Response**: `204 No Content`

---

## Questions

### Create Question

#### `POST /api/questions`

Create a question manually.

**Request Body**:
```json
{
  "persona_id": "persona-uuid",
  "session_id": "session-uuid",
  "question_text": "What do you think about Apple's customer service?",
  "context": "Considering your last interaction",
  "research_area": "Customer Service",
  "category": "Technology"
}
```

**Response**: `200 OK`
```json
{
  "id": "question-uuid",
  "persona_id": "persona-uuid",
  "question_text": "What do you think about Apple's customer service?",
  ...
  "origin": "manual"
}
```

### Generate Questions (AI)

#### `POST /api/generate-questions`

Generate questions using AI for specific personas.

**Request Body**:
```json
{
  "session_id": "session-uuid",
  "persona_ids": ["persona-uuid-1", "persona-uuid-2"]
}
```

**Response**: `200 OK`
```json
{
  "task_id": "task-uuid",
  "message": "Question generation started"
}
```

**Check Progress**: Same as persona generation (`GET /api/generation-progress/{task_id}`)

### List Questions

#### `GET /api/questions?session_id={session_id}&persona_id={persona_id}`

Get questions with optional filters.

**Query Parameters**:
- `session_id` (optional): Filter by session
- `persona_id` (optional): Filter by persona

**Response**: `200 OK`
```json
[
  {
    "id": "question-uuid",
    "persona_id": "persona-uuid",
    "question_text": "What's your experience with Apple products?",
    ...
  }
]
```

### Update Question

#### `PUT /api/questions/{question_id}`

Update a question.

**Parameters**:
- `question_id` (path): Question UUID

**Request Body**:
```json
{
  "question_text": "Updated question text",
  "context": "Updated context"
}
```

**Response**: `200 OK` (Updated question object)

### Delete Question

#### `DELETE /api/questions/{question_id}`

Delete a question.

**Parameters**:
- `question_id` (path): Question UUID

**Response**: `204 No Content`

---

## Research Execution

### Start Research Run

#### `POST /api/sessions/{session_id}/run`

Start a research run querying AI models.

**Parameters**:
- `session_id` (path): Session UUID

**Request Body**:
```json
{
  "models": ["claude-sonnet", "gpt-4"]
}
```

**Response**: `200 OK`
```json
{
  "run_id": "run-uuid",
  "session_id": "session-uuid",
  "message": "Research started"
}
```

**Note**: This starts a background task. Use the progress endpoint to check status.

### Check Research Progress

#### `GET /api/sessions/{session_id}/runs/{run_id}/progress`

Check progress of a running research task.

**Parameters**:
- `session_id` (path): Session UUID
- `run_id` (path): Run UUID

**Response**: `200 OK`
```json
{
  "status": "running",
  "current": 5,
  "total": 15,
  "message": "Processing..."
}
```

**Status values**:
- `pending`: Not started
- `running`: In progress
- `completed`: Finished
- `error`: Failed

### Analyze Research Run

#### `POST /api/sessions/{session_id}/runs/{run_id}/analyze`

Analyze responses from a completed research run.

**Parameters**:
- `session_id` (path): Session UUID
- `run_id` (path): Run UUID

**Response**: `200 OK`
```json
{
  "brand_results": {
    "Apple": {
      "sentiment": "positive",
      "score": 0.75,
      "themes": ["Innovation", "Premium Quality", "Great Ecosystem"],
      "concerns": ["High Price", "Limited Customization"],
      "quotes": [
        "Apple products just work seamlessly together"
      ]
    },
    "Samsung": {
      ...
    }
  },
  "comparative_insights": [
    "Apple leads in ecosystem integration",
    "Samsung offers better value for money"
  ],
  "run_id": "run-uuid"
}
```

### Compare Research Runs

#### `POST /api/compare-runs`

Compare results from multiple research runs.

**Request Body**:
```json
{
  "run_ids": ["run-uuid-1", "run-uuid-2"],
  "session_id": "session-uuid"
}
```

**Response**: `200 OK`
```json
{
  "comparison": {
    "trends": [
      "Sentiment for Apple improved by 10% between runs"
    ],
    "changes": {
      "Apple": {
        "run1_score": 0.65,
        "run2_score": 0.75,
        "change": "+15%"
      }
    }
  }
}
```

---

## Utilities

### Get Available Models

#### `GET /api/available-models`

List all AI models available for research.

**Authentication**: Not required

**Response**: `200 OK`
```json
[
  {
    "id": "claude-sonnet",
    "name": "Claude Sonnet 4.5",
    "provider": "Anthropic"
  },
  {
    "id": "gpt-4",
    "name": "GPT-4",
    "provider": "OpenAI"
  }
]
```

---

## Data Models

### ResearchSession

```typescript
{
  id: string;
  category: string;
  brands: string[];
  market_context: string;
  questions_per_persona: number;
  research_areas: string[];
  primary_brand: string;
  language: string;
  created_at: string;
  updated_at: string;
  personas: Persona[];
  questions: Question[];
  runs: ResearchRun[];
  responses: QueryResponse[];
  analysis: AnalysisResult | null;
}
```

### Persona

```typescript
{
  id: string;
  name: string;
  archetype: string;
  description: string;
  age_range: string;
  occupation: string;
  tech_savviness: string;
  price_sensitivity: string;
  brand_loyalty: string;
  key_priorities: string[];
  origin: "ai" | "manual";
  category: string;
}
```

### Question

```typescript
{
  id: string;
  persona_id: string;
  question_text: string;
  context?: string;
  origin: "ai" | "manual";
  category?: string;
  research_area?: string;
}
```

### ResearchRun

```typescript
{
  id: string;
  session_id: string;
  started_at: string;
  completed_at?: string;
  status: "pending" | "running" | "completed" | "error";
  models_used: string[];
  responses: QueryResponse[];
}
```

### QueryResponse

```typescript
{
  id: string;
  question_id: string;
  persona_id: string;
  brand: string;
  response_text: string;
  model: string;
  timestamp: string;
}
```

### AnalysisResult

```typescript
{
  id: string;
  run_id: string;
  analysis_text: string;
  sentiment_score: number;
  created_at: string;
}
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| `200` | Success |
| `201` | Created |
| `204` | No Content (successful deletion) |
| `400` | Bad Request (invalid input) |
| `401` | Unauthorized (missing or invalid token) |
| `404` | Not Found (resource doesn't exist) |
| `422` | Unprocessable Entity (validation error) |
| `500` | Internal Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. In production, consider:
- Rate limiting per user
- Rate limiting per IP
- Request queuing for AI calls

---

## Examples

### Complete Research Flow (cURL)

```bash
# 1. Create session
SESSION_ID=$(curl -X POST http://localhost:8000/api/sessions \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "Technology",
    "brands": ["Apple", "Samsung"],
    "market_context": "Smartphone market",
    "questions_per_persona": 2,
    "research_areas": ["Brand Perception"],
    "primary_brand": "Apple",
    "language": "en"
  }' | jq -r '.id')

# 2. Generate personas
TASK_ID=$(curl -X POST http://localhost:8000/api/generate-personas \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"count\": 2}" \
  | jq -r '.task_id')

# 3. Wait for personas (check progress)
curl http://localhost:8000/api/generation-progress/$TASK_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

# 4. Generate questions
TASK_ID=$(curl -X POST http://localhost:8000/api/generate-questions \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\"}" \
  | jq -r '.task_id')

# 5. Start research
RUN_ID=$(curl -X POST http://localhost:8000/api/sessions/$SESSION_ID/run \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"models": ["claude-sonnet"]}' \
  | jq -r '.run_id')

# 6. Check progress
curl http://localhost:8000/api/sessions/$SESSION_ID/runs/$RUN_ID/progress \
  -H "Authorization: Bearer $JWT_TOKEN"

# 7. Analyze results
curl -X POST http://localhost:8000/api/sessions/$SESSION_ID/runs/$RUN_ID/analyze \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

## Interactive API Documentation

FastAPI provides interactive API documentation:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

These interfaces allow you to:
- Browse all endpoints
- See request/response schemas
- Try out API calls directly
- Authenticate with JWT tokens

---

## Next Steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- Read [DATABASE.md](DATABASE.md) for database schema
- Read [DEVELOPMENT.md](DEVELOPMENT.md) for local development setup

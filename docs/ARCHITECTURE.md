# BrandTracker Architecture

## System Overview

BrandTracker is a full-stack AI-powered brand perception research tool that uses Claude to generate personas, research questions, and analyze brand sentiment across multiple AI models.

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│  Next.js 14 (App Router) + React 18 + TypeScript + Tailwind │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/REST + Supabase Auth (JWT)
┌───────────────────────────┴─────────────────────────────────┐
│                       API Gateway Layer                       │
│         FastAPI (Python 3.11+) + CORS Middleware             │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────┴────────┐  ┌──────┴──────┐  ┌────────┴────────┐
│  Auth Service  │  │ AI Services │  │  CRUD Service   │
│   (Supabase)   │  │ (Claude API)│  │  (Supabase)     │
└───────┬────────┘  └──────┬──────┘  └────────┬────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                      Database Layer                          │
│              Supabase PostgreSQL + RLS Policies              │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript 5
- **UI Library**: React 18
- **Styling**: Tailwind CSS 3
- **Charts**: Recharts
- **HTTP Client**: Axios
- **Authentication**: Supabase Auth (JWT-based)
- **Build**: Docker multi-stage build

### Backend
- **Framework**: FastAPI (async)
- **Language**: Python 3.11+
- **Database Client**: Supabase Python SDK
- **AI Integration**: Anthropic Claude API (`anthropic>=0.40.0`)
- **Authentication**: Supabase Auth (JWT verification)
- **CORS**: Configured for localhost and production domains

### Database
- **Primary DB**: Supabase PostgreSQL
- **Auth**: Supabase Auth with email verification
- **Security**: Row Level Security (RLS) policies
- **Schema**: See [DATABASE.md](DATABASE.md)

### AI Services
- **Primary AI**: Anthropic Claude (claude-sonnet-4-5-20250929)
- **Additional AI**: OpenAI GPT-4, GPT-3.5 (optional)
- **Use Cases**:
  - Persona generation
  - Question generation
  - Multi-model research queries
  - Sentiment analysis

## Core Components

### 1. Frontend Components

#### Wizard Flow (Multi-Step Process)
```
Setup → Personas → Questions → Research → Methodology → Dashboard
```

**Key Files**:
- `frontend/src/app/page.tsx` - Main wizard orchestrator
- `frontend/src/components/SetupStep.tsx` - Session configuration
- `frontend/src/components/PersonasStep.tsx` - Persona management
- `frontend/src/components/QuestionsStep.tsx` - Question management
- `frontend/src/components/ResearchStep.tsx` - Research execution
- `frontend/src/components/MethodologyStep.tsx` - Methodology description
- `frontend/src/components/DashboardStep.tsx` - Results visualization

#### Authentication
- `frontend/src/components/AuthPage.tsx` - Login/signup UI
- `frontend/src/lib/auth-context.tsx` - Auth state management
- `frontend/src/lib/supabase.ts` - Supabase client configuration

#### API Client
- `frontend/src/lib/api.ts` - Axios-based API wrapper with auth headers

### 2. Backend Services

#### Main API (`backend/main.py`)
FastAPI application with the following endpoint groups:

**Session Management**:
- `POST /api/sessions` - Create research session
- `GET /api/sessions` - List user sessions
- `GET /api/sessions/{id}` - Get session details
- `PUT /api/sessions/{id}` - Update session
- `DELETE /api/sessions/{id}` - Delete session

**Persona Management**:
- `POST /api/personas` - Create persona
- `GET /api/personas` - List personas
- `PUT /api/personas/{id}` - Update persona
- `DELETE /api/personas/{id}` - Delete persona
- `POST /api/generate-personas` - AI-generate personas

**Question Management**:
- `POST /api/questions` - Create question
- `GET /api/questions` - List questions
- `PUT /api/questions/{id}` - Update question
- `DELETE /api/questions/{id}` - Delete question
- `POST /api/generate-questions` - AI-generate questions

**Research Execution**:
- `POST /api/sessions/{id}/run` - Start research run
- `GET /api/sessions/{id}/runs/{run_id}/progress` - Check progress
- `POST /api/sessions/{id}/runs/{run_id}/analyze` - Analyze results
- `POST /api/compare-runs` - Compare multiple runs

**Utilities**:
- `GET /` - Health check
- `GET /api/available-models` - List supported AI models

#### AI Service (`backend/ai_service.py`)
Abstract interface for multiple AI providers:
- Claude (Anthropic)
- GPT-4 / GPT-3.5 (OpenAI)
- Extensible for additional providers

#### Claude Service (`backend/claude_service.py`)
Primary AI service implementation:
- Persona generation from market context
- Question generation from personas
- Brand research queries
- Sentiment analysis
- JSON response parsing with fallback

#### CRUD Service (`backend/crud.py`)
Database operations using Supabase Python SDK:
- Session CRUD with RLS filtering
- Persona CRUD with user association
- Question CRUD with user association
- Research run tracking
- Response storage
- Analysis result storage

#### Authentication (`backend/auth.py`)
JWT token verification using Supabase:
- Extract JWT from Authorization header
- Verify token with Supabase
- Return user ID for RLS filtering

#### Database Client (`backend/database.py`)
Supabase client factory:
- Environment-based configuration
- Dependency injection for FastAPI

## Data Flow

### 1. Session Creation & Setup
```
User Input → Frontend → POST /api/sessions → Supabase → Session Record
```

### 2. Persona Generation
```
Session Context → POST /api/generate-personas → Claude API
    ↓
Parse JSON Response → Create Persona Records → Supabase
    ↓
Return Personas → Frontend Display
```

### 3. Question Generation
```
Personas + Session → POST /api/generate-questions → Claude API
    ↓
Parse JSON Response → Create Question Records → Supabase
    ↓
Return Questions → Frontend Display
```

### 4. Research Execution
```
POST /api/sessions/{id}/run → Create Run Record → Background Task
    ↓
For each (Question × Persona × Selected Models):
    ↓
    Query AI Model → Store Response → Update Progress
    ↓
Mark Run Complete → Return Run ID
```

### 5. Analysis
```
POST /api/sessions/{id}/runs/{run_id}/analyze → Fetch All Responses
    ↓
Group by Brand → Send to Claude for Analysis
    ↓
Store Analysis Results → Return to Frontend → Visualize
```

## Authentication Flow

### Sign Up
```
User → Supabase Auth → Confirmation Email
    ↓
User Clicks Link → Redirect to App → Auto Sign In
    ↓
JWT Token → Stored in Session → Used for API Calls
```

### Sign In
```
User Credentials → Supabase Auth → Verify
    ↓
Return JWT Token → Store in Session
    ↓
Include in Authorization Header for all API calls
```

### Protected Routes
```
API Request → Extract JWT → Verify with Supabase
    ↓
Get User ID → Apply RLS Filtering → Return User's Data Only
```

## Deployment Architecture

### Development
```
Frontend: http://localhost:3000
Backend:  http://localhost:8000
Database: Supabase Cloud
```

### Production (Docker + Nginx)
```
Internet → Nginx (443/HTTPS) → Docker Network
                                      ↓
                        ┌─────────────┴──────────────┐
                        │                            │
                Frontend Container            Backend Container
                (port 3000 internal)          (port 8000 internal)
                        │                            │
                        └─────────────┬──────────────┘
                                      ↓
                              Supabase Cloud (PostgreSQL + Auth)
```

**Domain**: `https://driftwoodstudios.se/brandtracker`
- Frontend: `/brandtracker` → Container port 3000
- Backend: `/brandtracker/api` → Container port 8000

## Security

### Authentication
- Supabase JWT tokens (short-lived)
- Email verification required
- Password hashing by Supabase

### Authorization
- Row Level Security (RLS) policies in PostgreSQL
- User ID filtering in all queries
- JWT verification on every API request

### CORS
- Whitelist specific origins
- Credentials allowed for auth cookies
- Production domain configured

### Secrets Management
- API keys in environment variables
- Never committed to git
- Separate dev/prod configurations

## Performance Considerations

### Backend
- Async I/O with FastAPI
- Background tasks for long-running research
- In-memory progress tracking
- Connection pooling via Supabase client

### Frontend
- Next.js App Router with React Server Components
- Client-side state management
- Lazy loading of heavy components
- Axios request deduplication

### Database
- Indexed foreign keys
- Efficient RLS policies
- JSON columns for flexible data
- Connection pooling

## Scalability

### Current Architecture
- Stateless API (scales horizontally)
- Managed database (Supabase handles scaling)
- Docker containers (easy replication)

### Bottlenecks
- AI API rate limits (Claude, OpenAI)
- In-memory progress tracking (doesn't scale across instances)

### Future Improvements
- Move progress tracking to Redis/database
- Implement request queuing for AI calls
- Add caching layer for repeated queries
- Load balancing for multiple backend instances

## Error Handling

### Frontend
- Try/catch blocks around API calls
- User-friendly error messages
- Loading states for async operations

### Backend
- HTTPException for API errors
- Structured error responses
- Logging for debugging
- Fallback for malformed AI responses

### AI Service
- Retry logic for transient failures
- JSON parsing fallbacks
- Model availability checks
- Timeout handling

## Monitoring & Debugging

### Logs
- Backend: FastAPI logs to stdout
- Frontend: Next.js logs to stdout
- Docker: `docker compose logs -f`

### Health Checks
- Backend: `GET /` endpoint
- Docker: healthcheck configurations
- Database: Supabase dashboard

### Debugging
- Local development with hot reload
- VSCode debugging support
- Browser DevTools for frontend
- FastAPI interactive docs at `/docs`

## File Structure

```
brandtracker/
├── backend/
│   ├── main.py              # FastAPI app & endpoints
│   ├── ai_service.py        # AI provider abstraction
│   ├── claude_service.py    # Claude implementation
│   ├── auth.py              # JWT verification
│   ├── crud.py              # Database operations
│   ├── database.py          # Supabase client
│   ├── models.py            # Pydantic schemas
│   ├── requirements.txt     # Python dependencies
│   ├── Dockerfile           # Backend container
│   └── .env                 # Environment variables
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx     # Main wizard
│   │   │   └── layout.tsx   # Root layout
│   │   ├── components/      # React components
│   │   ├── lib/
│   │   │   ├── api.ts       # API client
│   │   │   ├── supabase.ts  # Supabase client
│   │   │   └── auth-context.tsx  # Auth provider
│   │   └── types/
│   │       └── index.ts     # TypeScript types
│   ├── Dockerfile           # Frontend container
│   ├── next.config.js       # Next.js config
│   ├── package.json         # Node dependencies
│   └── .env.production      # Production env vars
├── docs/                    # Documentation
├── docker-compose.yml       # Dev compose
├── docker-compose.prod.yml  # Prod compose
├── nginx.conf.example       # Nginx config
└── DEPLOYMENT.md           # Deployment guide
```

## Development Workflow

1. **Local Development**: Run services natively (see [DEVELOPMENT.md](DEVELOPMENT.md))
2. **Testing**: Docker Compose locally (see [DOCKER.md](DOCKER.md))
3. **Production**: Deploy with Docker + Nginx (see [DEPLOYMENT.md](../DEPLOYMENT.md))

## API Documentation

For detailed API endpoint documentation, see [API.md](API.md).

## Database Schema

For detailed database schema, see [DATABASE.md](DATABASE.md).

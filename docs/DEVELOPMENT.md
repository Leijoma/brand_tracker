# BrandTracker Development Guide

## Prerequisites

### Required Software
- **Python**: 3.11 or higher
- **Node.js**: 18.x or higher (LTS recommended)
- **npm**: 9.x or higher
- **Git**: For version control
- **Docker & Docker Compose**: For containerized development (optional but recommended)

### Required Accounts
- **Supabase**: Free account at [supabase.com](https://supabase.com)
  - Used for authentication and database
- **Anthropic**: API key from [console.anthropic.com](https://console.anthropic.com)
  - Used for Claude AI integration
- **OpenAI** (optional): API key from [platform.openai.com](https://platform.openai.com)
  - Used for GPT models (optional)

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Leijoma/brand_tracker.git
cd brand_tracker
```

### 2. Supabase Setup

#### Create a Supabase Project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Wait for the database to provision (~2 minutes)

#### Configure Authentication
1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL**: `http://localhost:3000` (for local dev)
3. Add **Redirect URLs**: `http://localhost:3000/**`
4. Go to **Authentication** → **Providers**
5. Enable **Email** provider
6. Configure email templates if desired

#### Run Database Migration
1. Go to **SQL Editor** in Supabase Dashboard
2. Create a new query
3. Copy and paste the contents of `backend/supabase_schema.sql`
4. Click **Run** to create the schema

#### Get API Keys
1. Go to **Settings** → **API**
2. Copy:
   - Project URL
   - `anon` `public` key (publishable key starting with `sb_publishable_`)
   - `service_role` `secret` key (service role key - keep this secret!)

### 3. Backend Setup

```bash
cd backend

# Create a virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\activate     # On Windows

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
# Anthropic API Key (required)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# OpenAI API Key (optional - for GPT models)
OPEN_AI_API_KEY=your_openai_api_key_here

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
EOF

# Edit .env and replace the placeholder values with your actual keys
nano .env  # or use your preferred editor
```

**Important**: Never commit the `.env` file to git! It's already in `.gitignore`.

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file for development
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_anon_key_here
EOF

# Edit .env.local and replace with your actual Supabase values
nano .env.local
```

## Running the Application

### Option 1: Native Development (Recommended for Development)

This approach gives you hot reload for both frontend and backend.

#### Terminal 1: Backend
```bash
cd backend
source venv/bin/activate  # Activate virtual environment
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at `http://localhost:8000`
- API docs: `http://localhost:8000/docs` (interactive Swagger UI)
- Health check: `http://localhost:8000/`

#### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Option 2: Docker Compose (Recommended for Testing)

This approach runs both services in containers, similar to production.

```bash
# From the project root
docker compose up --build

# Or run in detached mode
docker compose up -d --build

# View logs
docker compose logs -f

# Stop services
docker compose down
```

The services will be available at:
- Frontend: `http://localhost:3011`
- Backend: `http://localhost:8011`

**Note**: The Docker setup uses different ports (3011, 8011) to avoid conflicts with native development.

## Development Workflow

### Making Changes

#### Backend Changes
1. Edit Python files in `backend/`
2. If running natively with `--reload`, changes will auto-reload
3. If using Docker, rebuild: `docker compose up --build backend`

#### Frontend Changes
1. Edit TypeScript/React files in `frontend/src/`
2. If running with `npm run dev`, changes will hot-reload
3. If using Docker, rebuild: `docker compose up --build frontend`

### Testing API Endpoints

#### Using FastAPI Docs (Recommended)
1. Go to `http://localhost:8000/docs`
2. Click "Authorize" and enter your JWT token (see below)
3. Try out endpoints interactively

#### Getting a JWT Token
1. Sign up through the frontend at `http://localhost:3000`
2. Open browser DevTools → Application → Session Storage
3. Look for `supabase.auth.token`
4. Copy the `access_token` value

#### Using curl
```bash
# Health check (no auth required)
curl http://localhost:8000/

# Get sessions (requires auth)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:8000/api/sessions

# Create a session
curl -X POST http://localhost:8000/api/sessions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{
       "category": "Technology",
       "brands": ["Apple", "Samsung", "Google"],
       "market_context": "Consumer electronics market",
       "questions_per_persona": 3,
       "research_areas": ["Brand Perception", "Product Quality"],
       "primary_brand": "Apple",
       "language": "en"
     }'
```

## Project Structure

### Backend (`backend/`)
```
backend/
├── main.py              # FastAPI app, endpoints, main entry point
├── ai_service.py        # Abstract AI service interface
├── claude_service.py    # Claude-specific implementation
├── auth.py              # JWT authentication middleware
├── crud.py              # Database CRUD operations
├── database.py          # Supabase client configuration
├── models.py            # Pydantic data models
├── requirements.txt     # Python dependencies
├── Dockerfile           # Container configuration
└── .env                 # Environment variables (not in git)
```

**Key Files**:
- `main.py`: All API endpoints and FastAPI configuration
- `crud.py`: All database queries using Supabase Python SDK
- `claude_service.py`: Claude API integration
- `models.py`: Request/response schemas

### Frontend (`frontend/src/`)
```
frontend/src/
├── app/
│   ├── page.tsx         # Main application (wizard orchestrator)
│   ├── layout.tsx       # Root layout with providers
│   └── globals.css      # Global styles
├── components/
│   ├── SetupStep.tsx           # Step 1: Session setup
│   ├── PersonasStep.tsx        # Step 2: Persona management
│   ├── QuestionsStep.tsx       # Step 3: Question management
│   ├── ResearchStep.tsx        # Step 4: Research execution
│   ├── MethodologyStep.tsx     # Step 5: Methodology info
│   ├── DashboardStep.tsx       # Step 6: Results dashboard
│   └── AuthPage.tsx            # Login/signup page
├── lib/
│   ├── api.ts                  # API client functions
│   ├── supabase.ts             # Supabase client config
│   └── auth-context.tsx        # Auth state management
└── types/
    └── index.ts                # TypeScript type definitions
```

**Key Files**:
- `app/page.tsx`: Main wizard with step navigation
- `lib/api.ts`: All API calls to backend
- `lib/auth-context.tsx`: Authentication state and functions
- `types/index.ts`: Shared TypeScript interfaces

## Common Tasks

### Add a New API Endpoint

1. **Define Pydantic Model** (`backend/models.py`):
```python
class MyRequest(BaseModel):
    field1: str
    field2: int

class MyResponse(BaseModel):
    result: str
```

2. **Add CRUD Function** (`backend/crud.py`):
```python
def my_crud_operation(supabase: Client, data: dict, user_id: str = None) -> dict:
    result = supabase.table("my_table").insert(data).execute()
    return result.data[0] if result.data else None
```

3. **Add Endpoint** (`backend/main.py`):
```python
@app.post("/api/my-endpoint", response_model=MyResponse)
async def my_endpoint(
    request: MyRequest,
    supabase: Client = Depends(get_supabase),
    user_id: Optional[str] = Depends(get_current_user)
):
    result = crud.my_crud_operation(supabase, request.dict(), user_id)
    return MyResponse(result=result)
```

4. **Add Frontend Function** (`frontend/src/lib/api.ts`):
```typescript
export const myApiCall = async (data: MyRequest): Promise<MyResponse> => {
  const response = await api.post('/api/my-endpoint', data);
  return response.data;
};
```

### Add a New Frontend Component

1. **Create Component** (`frontend/src/components/MyComponent.tsx`):
```typescript
'use client';

import { useState } from 'react';

interface MyComponentProps {
  data: string;
  onAction: () => void;
}

export default function MyComponent({ data, onAction }: MyComponentProps) {
  const [state, setState] = useState('');

  return (
    <div>
      <p>{data}</p>
      <button onClick={onAction}>Action</button>
    </div>
  );
}
```

2. **Use Component** in parent:
```typescript
import MyComponent from '@/components/MyComponent';

// In render
<MyComponent data="hello" onAction={() => console.log('clicked')} />
```

### Database Schema Changes

1. **Modify** `backend/supabase_schema.sql`
2. **Apply migration** in Supabase Dashboard → SQL Editor
3. **Update** `backend/crud.py` if new tables/columns added
4. **Update** `backend/models.py` if new fields needed in API

### Add New AI Provider

1. **Create Service** (`backend/my_ai_service.py`):
```python
from ai_service import AIService

class MyAIService(AIService):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def query(self, prompt: str, **kwargs) -> str:
        # Implement API call
        pass

    def get_model_name(self) -> str:
        return "my-model-name"
```

2. **Register in** `backend/ai_service.py`:
```python
def get_available_models() -> List[str]:
    models = ["claude-sonnet", "gpt-4", "my-model-name"]
    return models
```

3. **Update** `get_service()` function to instantiate your service

## Troubleshooting

### Backend Won't Start

**Error**: `ModuleNotFoundError: No module named 'fastapi'`
- **Solution**: Activate virtual environment and install dependencies
  ```bash
  source venv/bin/activate
  pip install -r requirements.txt
  ```

**Error**: `Supabase connection failed`
- **Solution**: Check `.env` file has correct `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

**Error**: `ANTHROPIC_API_KEY not found`
- **Solution**: Add your Anthropic API key to `.env` file

### Frontend Won't Build

**Error**: `Module not found: Can't resolve '@/lib/api'`
- **Solution**: Run `npm install` in the frontend directory

**Error**: `supabaseUrl is required`
- **Solution**: Create `.env.local` with Supabase configuration

**Error**: `Failed to fetch` when calling API
- **Solution**:
  - Ensure backend is running at `http://localhost:8000`
  - Check `NEXT_PUBLIC_API_URL` in `.env.local`
  - Check CORS settings in `backend/main.py`

### Authentication Issues

**Error**: `Invalid JWT token`
- **Solution**:
  - Token might be expired (refresh the page)
  - Verify `SUPABASE_URL` matches in frontend and backend
  - Check Supabase JWT secret is correct

**Error**: `User not found` after login
- **Solution**:
  - Check RLS policies are configured correctly
  - Verify user ID is being passed to API calls

### Docker Issues

**Error**: `Cannot connect to Docker daemon`
- **Solution**: Start Docker Desktop or Docker service

**Error**: `Port already in use`
- **Solution**:
  - Stop other services on ports 3011/8011
  - Or change ports in `docker-compose.yml`

**Error**: Container builds but API calls fail
- **Solution**:
  - Check container logs: `docker compose logs backend`
  - Verify `.env` file exists in `backend/`
  - Ensure Supabase keys are correct

## IDE Setup

### VS Code (Recommended)

**Extensions**:
- Python
- Pylance
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Docker

**Settings** (`.vscode/settings.json`):
```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/backend/venv/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": false,
  "python.linting.flake8Enabled": true,
  "python.formatting.provider": "black",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Environment Variables Reference

### Backend (`.env`)
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...           # Claude API key
SUPABASE_URL=https://xxx.supabase.co   # Supabase project URL
SUPABASE_SERVICE_KEY=eyJh...           # Supabase service role key

# Optional
OPEN_AI_API_KEY=sk-...                 # OpenAI API key (for GPT models)
```

### Frontend (`.env.local`)
```bash
# Required
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

**Note**: `NEXT_PUBLIC_` prefix makes variables available to browser code.

## Performance Tips

### Backend
- Use `--reload` only in development (it watches for file changes)
- Use `uvicorn` directly in production (not `--reload`)
- Enable logging for debugging: `logging.basicConfig(level=logging.DEBUG)`

### Frontend
- Use Next.js production build for testing: `npm run build && npm start`
- Check bundle size: `npm run build` shows size info
- Use React DevTools for component profiling

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, then stage
git add .

# Commit with descriptive message
git commit -m "feat: add new feature"

# Push to remote
git push origin feature/my-feature

# Create pull request on GitHub
```

## Next Steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design overview
- Read [API.md](API.md) for detailed API documentation
- Read [DATABASE.md](DATABASE.md) for database schema
- Read [DOCKER.md](DOCKER.md) for Docker deployment
- Read [../DEPLOYMENT.md](../DEPLOYMENT.md) for production deployment

## Getting Help

- Check the [Troubleshooting](#troubleshooting) section
- Review logs: `docker compose logs -f` or check terminal output
- FastAPI docs: `http://localhost:8000/docs`
- Supabase docs: [supabase.com/docs](https://supabase.com/docs)
- Next.js docs: [nextjs.org/docs](https://nextjs.org/docs)

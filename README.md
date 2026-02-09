# BrandTracker - AI Brand Perception Research

A sophisticated research tool that analyzes how AI models perceive, recommend, and position brands across different consumer personas.

## Concept

Create diverse personas → Have them ask natural questions to LLMs → Analyze which brands get mentioned, recommended, and how they're positioned in the AI's "mind."

## Architecture

### Backend (Python + FastAPI)
- Persona generation and management
- Query orchestration across personas
- Claude API integration
- Response analysis engine
- Brand mention extraction and sentiment analysis

### Frontend (Next.js + React)
- Multi-step wizard interface
- Real-time query monitoring
- Interactive dashboards
- Data visualization (rankings, sentiment, share of voice)

## Features

1. **Setup Phase**: Define brand category, competitors, and market context
2. **Persona Phase**: Generate or customize diverse consumer personas
3. **Research Phase**: Orchestrate natural queries from personas to Claude
4. **Analysis Phase**: Extract brand mentions, sentiment, and positioning
5. **Dashboard**: Visualize rankings, share of voice, and persona affinities

## Getting Started

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # Add your ANTHROPIC_API_KEY
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude access

## Tech Stack

- **Backend**: FastAPI, Python 3.11+, Anthropic SDK, SQLite
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, Recharts
- **AI**: Claude 3.5 Sonnet (via Anthropic API)

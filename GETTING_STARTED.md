# Getting Started with BrandTracker

## What is BrandTracker?

BrandTracker is a research tool that reveals how AI models perceive and recommend brands. Instead of asking direct questions about brands, it creates diverse consumer personas, has them ask natural questions, and analyzes which brands emerge organically in AI responses.

## The Concept

1. **Create Personas**: Generate 5 diverse consumer profiles (innovators, pragmatists, quality seekers, etc.)
2. **Natural Questions**: Each persona asks questions about the category WITHOUT mentioning specific brands
3. **Collect Responses**: Claude answers naturally, mentioning brands it considers relevant
4. **Analyze**: Extract brand mentions, sentiment, recommendations, and positioning

## Setup (Quick)

```bash
./setup.sh
```

Then:
1. Add your `ANTHROPIC_API_KEY` to `backend/.env`
2. Start backend: `cd backend && source venv/bin/activate && uvicorn main:app --reload`
3. Start frontend: `cd frontend && npm run dev`
4. Open http://localhost:3000

## Setup (Manual)

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Usage Flow

### 1. Setup Phase
- Define your brand category (e.g., "Project Management Software", "Running Shoes")
- List competing brands to track (e.g., "Asana, Monday, ClickUp, Notion, Trello")
- Provide market context (target audience, price range, key differentiators)
- Choose questions per persona (5 recommended)

### 2. Persona Generation
- Click "Generate Personas"
- AI creates 5 diverse personas with:
  - Unique archetypes (innovator, pragmatist, budget-conscious, etc.)
  - Demographics (age, occupation)
  - Attributes (tech-savviness, price sensitivity, brand loyalty on 1-5 scale)
  - Key priorities specific to your category

### 3. Research Execution
- Review sample questions (personas ask without mentioning brand names)
- Click "Start Research"
- Each persona asks their questions to Claude
- Responses are collected in real-time
- Click "Analyze Results" when complete

### 4. Dashboard & Insights
View comprehensive analysis:

**Brand Rankings**
- Composite scores based on mentions + recommendations + sentiment
- Share of Voice percentages

**Visualizations**
- Bar charts: Mentions vs Recommendations
- Pie chart: Share of Voice distribution
- Radar chart: Persona × Brand affinity (which brands resonate with which segments)

**Raw Data**
- Expandable view of all question-response pairs
- See exactly what Claude said about each brand

## Example Research

**Category**: "CRM Software"

**Brands**: Salesforce, HubSpot, Pipedrive, Zoho CRM, Monday.com

**Sample Persona-Generated Question**:
> "I'm looking for a tool to help my small sales team track leads and automate follow-ups. What should I consider?"

**Claude's Response** (analyzed for brand mentions):
> "For a small sales team, I'd recommend looking at **HubSpot** or **Pipedrive**. HubSpot has a generous free tier that's great for getting started, with excellent automation features..."

**Analysis Extracts**:
- ✓ HubSpot: mentioned first, recommended, positive sentiment
- ✓ Pipedrive: mentioned second, recommended, positive sentiment
- ✗ Salesforce, Zoho, Monday.com: not mentioned in this response

## Key Insights You'll Discover

1. **Invisible Brand Strength**: Which brands Claude naturally thinks of
2. **Category Positioning**: How each brand is positioned in AI's "mental model"
3. **Persona Fit**: Which brands resonate with which customer segments
4. **Sentiment Patterns**: Overall positivity/negativity in AI responses
5. **Share of Mind**: Relative mindshare across your competitive set

## Tips for Best Results

1. **Be specific with context**: Better market context = more relevant personas
2. **Choose 3-7 brands**: Too few limits insights, too many dilutes focus
3. **Let personas be diverse**: Different archetypes reveal different positioning
4. **Review raw responses**: The nuance in how brands are mentioned matters
5. **Run multiple sessions**: Track changes over time or test different categories

## Understanding the Metrics

- **Total Mentions**: How many times a brand appeared in responses
- **Recommendations**: Explicit suggestions ("I recommend...", "You should try...")
- **First Mention**: When a brand is mentioned first in a response (strong signal)
- **Sentiment Score**: -1.0 (negative) to +1.0 (positive)
- **Share of Voice**: Percentage of total mentions across all brands
- **Persona Affinity**: 0-100 score for how well a brand matched each persona's priorities

## Troubleshooting

**"Failed to generate personas"**
- Check your ANTHROPIC_API_KEY in backend/.env
- Ensure backend is running on port 8000

**"Failed to create session"**
- Verify frontend can reach backend (http://localhost:8000)
- Check browser console for CORS errors

**"Research taking too long"**
- Normal for 5 personas × 5 questions = 25 API calls
- Each question takes ~3-5 seconds
- Total research time: ~2-3 minutes

## Next Steps

Once you have results:
- Export data for presentations
- Compare multiple research sessions
- Adjust brand positioning strategy based on AI perception
- Track changes over time as you build brand awareness

## Architecture

**Backend**: FastAPI + Anthropic SDK
- `models.py`: Data schemas
- `claude_service.py`: AI operations (persona generation, questions, analysis)
- `main.py`: API endpoints

**Frontend**: Next.js + React + Recharts
- Multi-step wizard UI
- Real-time progress tracking
- Interactive data visualizations

---

Built with Claude 3.5 Sonnet via the Anthropic API

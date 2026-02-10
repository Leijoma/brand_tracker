# BrandTracker Backlog

> Living document — update as items are completed or reprioritized.

---

## In Progress (Current Sprint)

### Statistical Rigor Upgrade
- [x] Structured response format (recall / preference / forced_choice)
- [x] Multi-iteration support (1–50 per question)
- [x] Temperature control (0.0–1.5)
- [x] Wilson confidence intervals for proportions
- [x] Statistical results storage & retrieval
- [x] Confidence panel in Dashboard UI
- [x] Dual analysis path (structured stats vs legacy AI interpretation)
- [x] DB migration for new columns/tables (statistical_results, response fields, run fields)
- [x] End-to-end testing of structured response pipeline
- [x] Update Methodology step with statistical explanation

---

## Backlog

### P0 — High Priority

#### Statistical Intelligence
- [ ] **Convergence detection** — auto-detect when results stabilize ("run 50, run 50 more — did totals change?"). Show stability indicator in UI so users know when they have enough data.
- [x] **Change detection between runs** — flag when a metric shift is statistically significant vs normal variation. Two-proportion z-test on key metrics with 3-tier interpretation (noise/notable/major). Dashboard panel auto-compares selected run vs previous.
- [ ] **Budget optimizer** — given a cost ceiling, recommend optimal allocation across iterations, personas, and question types. More breadth (personas/situations) often beats more depth (iterations on one question).

#### Data & Export
- [ ] Export results to CSV/Excel
- [ ] Export results to PDF report with executive summary
- [ ] Raw response data viewer (drill down into individual AI responses)

#### Research Quality
- [ ] Response validation — detect and flag low-quality or off-topic AI responses
- [ ] Negative controls — inject fictitious brands to detect hallucination/compliance issues
- [ ] Retry logic for failed API calls during research runs
- [ ] Question type selection in UI (recall / preference / forced_choice per question)

#### GEO Intelligence
- [x] **Recommendation Strength Score** — Phase 1 complete: position-based scoring (rank 1→5, rank 2→4, rank 3→3, mentioned→2, absent→0) with CI. Stored in DB, shown in statistical confidence table. Phase 2 (language strength) and Phase 3 (conditional detection) pending.
- [x] **Contextual Relevance Matrix** — brand × persona × research area heatmap showing mention rates. Endpoint + dashboard panel with color-coded tables implemented.
- [ ] **Composite GEO Quality Score** — single trackable index: SOV (~30%) + recommendation strength (~25%) + attribute match (~25%) + narrative quality (~20%). Start with first two components from existing data; extend as attribute/narrative features land. Gives clients one number to track over time with drill-down into components.

#### Multi-Model
- [ ] Add Gemini as a third AI model option
- [ ] Model-specific prompt tuning (each model has different structured output quirks)
- [ ] Model comparison dashboard — side-by-side statistical comparison with significance tests

### P1 — Medium Priority

#### GEO Deep Analysis
- [ ] **Attribute-Based Analysis (basic)** — expand structured JSON schema to include `key_attributes_per_brand` (e.g., "battery life", "ease of use") and `attribute_valence` (strength/weakness/neutral). Self-reported by model during research — no extra API cost. Compute attribute frequency, co-occurrence, and valence distribution across iterations.
- [ ] **Attribute-Based Analysis (deep)** — post-process `reasoning` text with dedicated Claude call for detailed attribute extraction. Can re-analyze historical runs without re-running research. Produces full attribute × brand matrix with valence scoring.
- [ ] **Narrative Classification** — classify each response's implicit recommendation story: price/value, technical superiority, reliability/trust, fit/suitability, or social proof. Post-process the reasoning field. Track narrative distribution over time and across models to understand WHY the brand is recommended.
- [ ] **Gap Analysis** — identify what the AI does NOT say about your brand. Compare attribute profiles across brands: if competitors consistently get praised for "excellent support" but your brand never does, that's a concrete GEO improvement opportunity. Requires attribute data from above.

#### Longitudinal Tracking
- [ ] **Monthly tracking mode** — scheduled re-runs with identical setup for consistent time-series
- [ ] **Trend vs precision framing** — dashboard emphasis on directional movement over absolute numbers. Consistency over time is the real signal.
- [ ] **Momentum indicators** — show whether a brand is gaining, stable, or declining (3-run rolling average)
- [ ] Frozen question banks — lock question sets to ensure comparability across runs

#### Session & History
- [ ] Session list view with search/filter
- [ ] Duplicate/clone session (reuse setup, personas, questions)
- [ ] Archive/delete sessions
- [ ] Session tagging/labeling

#### Dashboard Improvements
- [ ] Time-series charts — track brand metrics across multiple runs
- [ ] Drill-down: click a brand to see per-persona and per-question breakdown
- [ ] Heatmap improvements — better color scales, hover detail
- [ ] Brand comparison mode — select 2 brands for head-to-head
- [ ] Print/share-friendly dashboard layout

#### Persona & Question Management
- [ ] Persona library — save, browse, and reuse across sessions
- [ ] Question templates by industry/category
- [ ] Import/export personas and questions (JSON/CSV)
- [ ] Persona validation — flag unrealistic demographic combos
- [ ] **Breadth-first persona strategy** — guide users toward diverse persona sets rather than deep iteration on few personas

### P2 — Lower Priority / Nice to Have

#### Collaboration & Communication
- [ ] Multi-user support (Supabase auth already in place)
- [ ] Share session results via link
- [ ] Team workspaces
- [ ] **Executive summary templates** — pre-built framing for presenting results to leadership ("We measured X across Y iterations per persona, per model. Here's what we found.")

#### Automation
- [ ] Scheduled research runs (cron-based re-runs for tracking over time)
- [ ] Webhook/notification on run completion
- [ ] API access for programmatic use
- [ ] **Convergence-based auto-stop** — keep running iterations until results stabilize, then stop automatically

#### UX Polish
- [ ] Dark mode
- [ ] Onboarding tour / first-run experience
- [ ] Mobile-responsive layout improvements
- [ ] Loading skeleton states
- [ ] Keyboard shortcuts for wizard navigation
- [ ] **Methodology explainer in-app** — contextual help that explains "what makes this credible" (for stakeholder demos)

#### GEO Visualizations
- [ ] **Visibility Heatmap** — brand × buying-context grid with color intensity = mention frequency. Hover shows which specific questions triggered the brand. Makes "mental slots" visually scannable.
- [ ] **Attribute Positioning Map** — 2D scatter plot showing competitive positioning on attribute dimensions (e.g., X = technical attributes, Y = emotional attributes). Each brand is a point.
- [ ] **GEO Score Trend** — line chart tracking composite GEO score over time with stacked area showing component breakdown (SOV, rec strength, attribute match, narrative quality).
- [ ] **Recommendation Strength Distribution** — histogram comparing language strength scores across brands. Shows whether recommendations are enthusiastic or lukewarm.

#### Advanced Analytics
- [ ] Sentiment trend analysis across runs
- [ ] Brand positioning map (2D plot — e.g., quality vs price perception)
- [ ] Competitive gap analysis — where does each brand over/under-index
- [ ] Category-level benchmarks (how does a brand compare to category average)
- [ ] Natural language summary generation (AI-written executive summary)
- [ ] **Cross-model meta-analysis** — statistical method to combine results from multiple models with model-level uncertainty

### P3 — Future / Exploration

- [ ] Plugin system for custom AI models (local LLMs, etc.)
- [ ] Multi-language research in a single session
- [ ] Real consumer survey comparison mode (AI perception vs human data)
- [ ] Embeddable dashboard widget
- [ ] White-label / tenant customization
- [ ] **Calibration studies** — compare BrandTracker results against real survey data to establish correlation/validity

---

## Technical Debt

- [ ] Add unit tests (backend: pytest, frontend: Jest/React Testing Library)
- [ ] Add integration tests for full research pipeline
- [ ] API error handling consistency (standardize error response format)
- [ ] Frontend state management — consider zustand or similar (currently prop-drilling)
- [ ] Database indexing review for query performance
- [ ] Rate limiting on API endpoints
- [ ] Logging & observability (structured logging, error tracking)
- [ ] CI/CD pipeline (lint, test, build, deploy)
- [ ] OpenAPI schema validation (auto-generate frontend types from backend)
- [ ] Docker compose health checks and restart policies

---

## Completed

### v1.0 — Initial Release
- [x] 5-step wizard (Setup → Personas → Questions → Research → Dashboard)
- [x] AI persona generation (Claude)
- [x] AI question generation (tailored to persona + research areas)
- [x] Multi-model research execution (Claude + OpenAI)
- [x] Brand analysis with mentions, sentiment, share of voice
- [x] Persona affinity heatmap
- [x] Topic-level scoring
- [x] Run comparison (time-series)
- [x] Supabase migration
- [x] Docker deployment

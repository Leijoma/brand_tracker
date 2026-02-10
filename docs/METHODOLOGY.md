# Statistical Methodology & Theoretical Framework

This document describes the statistical models, measurement decisions, known limitations, and validation approach used in BrandTracker's AI reputation intelligence platform. It is intended as a reference for anyone asking "can you prove this works?" or "how should I interpret these numbers?"

---

## Table of Contents

1. [What We Measure](#1-what-we-measure)
2. [Conceptual Framework: LLM as Probabilistic Respondent](#2-conceptual-framework-llm-as-probabilistic-respondent)
3. [Structured Response Design](#3-structured-response-design)
4. [Repetition & Sampling Strategy](#4-repetition--sampling-strategy)
5. [Confidence Intervals](#5-confidence-intervals)
6. [Core Metrics & Their Computation](#6-core-metrics--their-computation)
7. [Sentiment Scoring](#7-sentiment-scoring)
8. [Brand Matching](#8-brand-matching)
9. [Comparison to Traditional Market Research](#9-comparison-to-traditional-market-research)
10. [What This Actually Measures — and Why It Matters](#10-what-this-actually-measures--and-why-it-matters)
11. [Change Detection (Planned)](#11-change-detection-planned)
12. [Generative Engine Optimization (GEO) Metrics (Planned)](#12-generative-engine-optimization-geo-metrics-planned)
13. [Known Limitations](#13-known-limitations)
14. [Validation & Controls](#14-validation--controls)
15. [References & Prior Art](#15-references--prior-art)

---

## 1. What We Measure

BrandTracker does **not** measure consumer opinion. It measures **how large language models represent brands** when responding to consumer-like queries. Specifically, we measure:

- **Brand salience in LLM outputs** — how often and how prominently a brand appears when an AI is asked consumer questions about a category.
- **Preference distribution** — when given a list of brands, how the model ranks them relative to each other.
- **Sentiment association** — whether the model's mentions of a brand carry positive, neutral, or negative framing.
- **Persona-conditional variation** — how brand salience changes when the model is prompted to adopt different consumer archetypes.

This matters because LLMs are increasingly used as decision-support tools by real consumers, making their default brand associations a competitive factor.

### What this is NOT

- Not a survey of human consumers.
- Not a measure of actual market share.
- Not a measure of brand quality or objective truth.
- Not a predictor of future purchasing behavior (though it may correlate with it).

---

## 2. Conceptual Framework: LLM as Probabilistic Respondent

### The Core Idea

A large language model is a probability distribution over token sequences, trained on a massive corpus of human text. When we ask "Which phone brands would you recommend?", the model samples from a learned distribution that reflects patterns in its training data — product reviews, forum discussions, news articles, marketing materials, etc.

**Key insight:** At temperature > 0, the model's output is stochastic. Asking the same question multiple times yields different responses. This variance is not noise to be eliminated — it IS the signal. The frequency with which a brand appears across repeated samples approximates the model's "learned prior" for that brand in the given context.

### Analogy to Opinion Polling

| Traditional Polling | BrandTracker |
|---|---|
| Sample N humans from a population | Sample N responses from a model at temperature T |
| Each respondent has an opinion shaped by their experience | Each response is shaped by the model's training data |
| Variance comes from differences between respondents | Variance comes from stochastic decoding (temperature) |
| Compute proportions + CI across respondents | Compute proportions + CI across samples |
| Bias: sampling frame, wording effects | Bias: training data composition, prompt wording, RLHF alignment |

The analogy is imperfect (see [Limitations](#10-known-limitations)) but useful for understanding why repeated sampling produces meaningful statistics.

### Temperature as a Variance Control

- **Temperature 0.0**: Deterministic. The model always picks the highest-probability token. Repeating the query gives identical output. Useful for measuring the model's "point estimate" but provides no distributional information.
- **Temperature 0.5–0.7**: Moderate exploration. The model samples from likely tokens, producing natural variation across runs. This is our default — it gives interpretable variance without introducing too much randomness.
- **Temperature 1.0+**: High exploration. More uniform sampling across tokens. Useful for stress-testing robustness, but at very high temperatures the model may hallucinate or produce incoherent output.

**Our default: 0.7.** This balances variance (needed for statistical inference) with coherence (needed for interpretable responses).

---

## 3. Structured Response Design

### Problem with Free Text

Early versions of BrandTracker asked the AI a question, received a free-text paragraph, and then sent that paragraph to another AI call to extract brand mentions and sentiment. This introduced two sources of error:

1. **Response ambiguity** — "I've heard good things about Samsung" vs. "Samsung makes great phones" mean roughly the same thing but are phrased differently.
2. **Extraction error** — the analysis AI might miscount mentions or misinterpret sentiment.

### Solution: Constrained JSON Output

We now require models to respond in strict JSON format with explicit fields:

```json
{
  "recommendations": [
    {"brand": "Samsung", "rank": 1, "sentiment": "positive"},
    {"brand": "Apple", "rank": 2, "sentiment": "positive"}
  ],
  "reasoning": "Free-text explanation..."
}
```

**Why this works:**
- Brand mentions are **explicit** — no extraction needed.
- Rankings are **ordinal** — we get rank position directly.
- Sentiment is **categorical** — one of three values, no ambiguity.
- Reasoning is preserved for qualitative review, but metrics are computed from structured fields only.

**How we enforce it:**
- **Claude (Anthropic):** Strong JSON-only instruction in the prompt, with `_extract_json()` fallback to strip markdown code blocks if the model wraps the JSON.
- **ChatGPT (OpenAI):** Native `response_format={"type": "json_object"}` parameter, which guarantees valid JSON output.

### Three Question Types

| Type | What It Measures | Brands Provided? | Response Format |
|---|---|---|---|
| **Recall** | Spontaneous brand salience — which brands the model thinks of unprompted | No | `recommendations[]` with rank + sentiment |
| **Preference** | Aided ranking — how the model orders a known set of brands | Yes | `rankings[]` with rank + score + sentiment |
| **Forced Choice** | Single-brand selection under constraint | Yes | `chosen_brand` + `confidence` |

These correspond to established constructs in marketing research: unaided recall, aided recall/preference, and discrete choice.

---

## 4. Repetition & Sampling Strategy

### Why Repeat?

A single response from an LLM is a single draw from its output distribution. You cannot compute a confidence interval from n=1. To make any statistical claim, you need repeated independent observations.

### Independence Assumption

Each iteration is an independent API call with no conversation history carried forward. The model has no memory of prior responses. At temperature > 0, the stochastic decoding process ensures output variation across calls.

**Caveat:** The responses are not truly independent in the deepest statistical sense — they all come from the same model with the same weights. This is analogous to polling people who all watch the same news channel. They are conditionally independent given the model, which is sufficient for our purposes but means we are measuring model-specific brand representation, not some universal truth.

### Sample Size Recommendations

| Iterations | Statistical Power | Use Case |
|---|---|---|
| 1 | None — single observation, no CI | Quick exploration, not publishable |
| 5 | Very low — CIs will be ±20pp or wider | Rough directional signal |
| 10 | Low–moderate — CIs ±10–15pp | Internal screening |
| 20 | Moderate — CIs ±5–10pp | Standard research runs |
| 30 | Good — CIs ±4–7pp | Cross-model comparisons |
| 50 | Strong — CIs ±3–5pp | Publication-grade data |

These are approximate. Actual CI width depends on the observed proportion (CIs are widest at p=0.5 and narrowest at p near 0 or 1).

### Total API Calls

```
total_calls = questions × models × iterations
```

For a typical session: 25 questions × 2 models × 20 iterations = 1,000 API calls. At ~$0.003/call, that's ~$3.00.

---

## 5. Confidence Intervals

### For Proportions: Wilson Score Interval

For metrics that are proportions (mention frequency, top-3 rate, first-mention rate), we use the **Wilson score interval** rather than the more common Wald (normal approximation) interval.

**Implementation** (see `backend/statistics.py`):

```
p̂ = successes / total
centre = (p̂ + z²/2n) / (1 + z²/n)
spread = z × √((p̂(1-p̂) + z²/4n) / n) / (1 + z²/n)
CI = [centre - spread, centre + spread]
```

**Why Wilson over Wald:**

The Wald interval (p̂ ± z√(p̂(1-p̂)/n)) has well-known problems:

1. **Overshoots [0,1]** — for p near 0 or 1, the Wald CI can extend below 0 or above 1. Wilson is bounded by construction.
2. **Poor coverage at small n** — the Wald interval's actual coverage probability drops well below the nominal 95% when n < 30 or p < 0.1. Wilson maintains closer-to-nominal coverage.
3. **Zero problem** — if a brand is never mentioned (p=0), the Wald CI is [0,0], which is absurdly overconfident. Wilson gives a non-degenerate interval: with 0/20 observations, Wilson 95% CI ≈ [0, 0.16], correctly reflecting that we can't rule out a 16% mention rate.

**Reference:** Wilson, E.B. (1927). "Probable Inference, the Law of Succession, and Statistical Inference." JASA, 22(158), 209–212. Also recommended by Agresti & Coull (1998) and Brown, Cai & DasGupta (2001) as the best simple interval for proportions.

### For Means: z-based Interval

For continuous metrics (average rank, average sentiment score), we use the standard z-based confidence interval:

```
mean ± z × (s / √n)
```

Where s is the sample standard deviation (using Bessel's correction, n-1 denominator).

**Why z instead of t-distribution:** For our typical sample sizes (n ≥ 20), the z and t distributions are nearly identical. We use z=1.96 for all intervals, which is exact for the normal distribution and a very close approximation to t at df ≥ 20.

**Note for small samples:** At n < 15, using the t-distribution with df=n-1 would be more appropriate. This is a known simplification in the current implementation.

### Confidence Level

All intervals are 95% confidence (z = 1.96). This means: if we were to repeat the entire experiment many times, approximately 95% of the computed intervals would contain the true parameter value.

"True parameter value" here means the model's actual long-run frequency at the given temperature — the proportion we'd observe if we ran infinite iterations.

---

## 6. Core Metrics & Their Computation

### Mention Frequency

```
mention_frequency = (times brand appeared in responses) / (total iterations)
```

- Computed from `structured_data.recommendations[]` (recall) or `structured_data.rankings[]` (preference).
- A brand appearing anywhere in a response counts as one mention, regardless of rank.
- CI: Wilson score interval.

### Top-3 Rate

```
top3_rate = (times brand was ranked 1st, 2nd, or 3rd) / (total iterations)
```

- Only counts responses where the brand appeared with rank ≤ 3.
- Recall questions: rank is the order in which brands appear in the `recommendations` list.
- Preference questions: rank is the explicit rank field.
- CI: Wilson score interval.

### First Mention Rate

```
first_mention_rate = (times brand was ranked #1) / (total iterations)
```

- Measures how often the brand is the model's top-of-mind recommendation.
- For forced choice: the chosen brand always gets rank 1.
- CI: Wilson score interval.

### Recommendation Rate

```
recommendation_rate = recommendation_count / total_iterations
```

- For recall/preference: brands ranked in top 3 count as "recommended."
- For forced choice: the chosen brand counts as recommended.
- This is closely related to top-3 rate but can diverge if we add question types where "recommendation" has a different threshold.

### Average Rank

```
avg_rank = mean(rank values across responses where brand was mentioned)
```

- Only computed over iterations where the brand actually appeared.
- Lower is better (1 = first mentioned/highest ranked).
- CI: z-based mean interval.
- **Note:** This is conditional on mention — a brand that is rarely mentioned but always ranked #1 will show avg_rank = 1.0 but low mention_frequency. Both metrics are needed for a complete picture.

### Share of Voice

```
share_of_voice = brand_total_mentions / sum(all_brand_mentions)
```

- Cross-brand metric: all brands' SOV sums to 1.0.
- Not computed per-iteration but across the entire run.
- No CI provided (would require bootstrapping the entire metric, not yet implemented).

### Persona Affinity

```
persona_affinity[persona_id] = (times brand mentioned by persona) / (total iterations)
```

- Measures whether the model shows different brand preferences when adopting different persona roles.
- Useful for segmentation analysis: "Is Brand X stronger with tech-savvy personas?"

---

## 7. Sentiment Scoring

### Categorical → Numeric Mapping

| Sentiment Label | Numeric Score |
|---|---|
| positive | +1.0 |
| neutral | 0.0 |
| negative | -1.0 |

This is a coarse 3-point scale. We chose simplicity over granularity because:

1. LLMs are unreliable at fine-grained sentiment (e.g., distinguishing 0.6 from 0.7 on a continuous scale).
2. Three categories are robust to slight prompt variations.
3. The aggregation across many iterations smooths this into an effectively continuous metric (avg_sentiment ranges from -1 to +1).

### For Preference Questions

Preference-type responses include an explicit `score` field (0.0–1.0) which is used directly instead of the categorical sentiment conversion. This provides finer granularity for aided ranking questions.

### For Forced Choice

The `confidence` field (0.0–1.0) is stored in the sentiment slot for the chosen brand. This is a pragmatic design choice — confidence and sentiment measure different things, but for forced choice the chosen brand inherently has positive sentiment, and confidence captures the relevant magnitude.

**Limitation:** This means forced-choice sentiment scores are not directly comparable to recall/preference sentiment scores. We document this here and recommend filtering by question type when analyzing sentiment.

---

## 8. Brand Matching

AI models don't always use exact brand names. "Apple" might appear as "Apple iPhone", "apple", or "APPLE" in responses. Our matching strategy:

1. **Exact case-insensitive match:** `response_brand.lower() == tracked_brand.lower()`
2. **Partial containment fallback:** `tracked_brand.lower() in response_brand.lower()` or vice versa.

**Example:** Tracked brand "Apple" matches response brand "Apple iPhone" via partial containment.

**Limitation:** Partial matching can produce false positives. "General" would match "General Electric" and "General Motors". For tracked brand lists, users should use sufficiently specific names (e.g., "GE" and "GM" instead of "General Electric" and "General Motors" if both are tracked).

---

## 9. Comparison to Traditional Market Research

### Where BrandTracker and Traditional Methods Align

| Aspect | Traditional Survey | BrandTracker |
|---|---|---|
| Measurement constructs | Unaided recall, aided recall, preference, NPS | Recall, preference, forced choice |
| Statistical method | Proportion estimates + CI from sample survey theory | Proportion estimates + CI from repeated LLM sampling |
| Persona segmentation | Demographic segments in survey sample | Persona-conditioned prompts |
| Confidence intervals | Standard for any reputable survey | Wilson score intervals |
| N requirement | ~400 for ±5pp at 95% CI | ~20–50 iterations per question for similar precision |

### Where They Diverge

**Population vs. Model:**
Traditional surveys sample from a human population and generalize to that population. BrandTracker samples from a language model's output distribution — it characterizes the model, not a human population.

**Validity:**
Survey validity rests on representative sampling and well-designed questions. BrandTracker's validity rests on the assumption that the model's brand representations are informative (i.e., that they correlate with real-world brand perception, training data being a reflection of public discourse).

**Temporal dynamics:**
A survey captures opinion at the time of asking. A model captures training data from its cutoff date, plus RLHF preferences. The model's brand representations may lag real-world changes.

**Social desirability:**
Humans may give socially desirable answers. LLMs have their own version — RLHF alignment may suppress negative statements about certain brands, creating a "positivity bias."

---

## 10. What This Actually Measures — and Why It Matters

### The Seismograph, Not the Thermometer

BrandTracker is not a thermometer that gives you an absolute reading. It is a seismograph — it detects movement. You get:

- **Direction** — which brand is leading?
- **Relative position** — who's ahead, who's behind?
- **Change** — who's gaining, who's losing?
- **Momentum** — is a trend accelerating?

These are exactly the inputs that marketing strategy is built on. You rarely need to know that your brand awareness is exactly 34.7%. You need to know that it's higher than last quarter and closing the gap on your competitor.

### The Real Measurement Target

BrandTracker does not attempt to mirror the consumer market. It measures **what future customers will hear when they ask AI for recommendations**. As LLM-powered search (ChatGPT, Perplexity, Google AI Overview, Bing Copilot) becomes a significant consumer touchpoint, the model's brand representation is not a proxy for reality — it IS part of reality.

If the model recommends your competitor in 30% of responses and you in 10%, that is the actual risk you live with in AI-mediated discovery.

### All Perception Measurement Is Approximation

Every established brand research method has known biases:

| Method | Known Biases |
|---|---|
| Consumer surveys | Sampling bias, social desirability, question wording effects |
| Focus groups | Groupthink, moderator influence, small N |
| NPS | Ceiling effects, cultural response styles, poor predictive validity |
| Social listening | Self-selection (only vocal people), platform-specific demographics |
| BrandTracker | Training data composition, RLHF alignment, prompt sensitivity |

BrandTracker's approach is not more "wrong" than these. It is new. The statistical methods (repeated sampling, confidence intervals, multi-model triangulation) bring the same rigor that makes traditional methods credible.

### Convergence Behavior

In practice, results from repeated sampling follow a predictable pattern:

- **First ~20 iterations:** High variance. Rankings may shift substantially between batches. This is normal — the law of large numbers needs material to work with.
- **~40–60 iterations:** Results begin stabilizing. Batch-to-batch variation decreases noticeably.
- **~80+ iterations:** Rankings are stable. Adding more iterations narrows CIs but rarely changes relative positions.

A practical stability check: run 50 iterations, then 50 more. If the overall metrics barely change, you have enough data. If they shift meaningfully, keep going.

### Budget Allocation Strategy

Given a fixed budget, breadth typically beats depth. Instead of 1,000 iterations on one question:

| Strategy | What You Get |
|---|---|
| 1,000 iterations × 1 question × 1 persona | Very precise answer to a very narrow question |
| 50 iterations × 5 questions × 4 personas | Broad understanding across segments and angles |

The second strategy produces more strategically valuable insight, even though individual metrics have wider CIs. Brand rankings stabilize far before individual proportions converge, because the gaps between brands tend to be 10–30 percentage points — large enough to detect with moderate sample sizes.

**Recommended sweet spot:** ~50 iterations per question, which gives ±3–5pp CIs at reasonable cost.

### What Enterprise Stakeholders Accept

A statement like:

> "We ran 80 iterations per persona, per model, per month, with 95% Wilson confidence intervals."

establishes credibility with data-literate audiences. The key ingredients:

1. Sufficient repetition (n ≥ 50)
2. Named statistical method (Wilson CI)
3. Consistency over time (same method, same questions, monthly cadence)
4. Multi-model validation (not relying on a single AI's opinion)

### Trend Over Precision

The most powerful signal in BrandTracker is not any single measurement — it is **consistent change over time**. If you see a competitor climbing across multiple personas, multiple question types, and multiple models over three consecutive months, that is not noise. That is the model's world shifting.

**Consistency over time is what makes the system strong. Not perfection in any single month.**

---

## 11. Change Detection (Planned)

### The Problem

If Brand X's mention rate goes from 35% to 40% between two runs, is that a real change or sampling noise?

### Statistical Approach

For proportions (mention frequency, top-3 rate), we can apply a two-proportion z-test:

```
z = (p₁ - p₂) / √(p̂(1-p̂)(1/n₁ + 1/n₂))
```

Where p̂ is the pooled proportion. If |z| > 1.96, the change is statistically significant at the 95% level.

### Practical Thresholds

| Change Magnitude | Interpretation |
|---|---|
| < 3pp and not significant | Normal variation — ignore |
| 3–10pp and significant | Notable shift — investigate |
| > 10pp and significant | Major change — act |

### Rolling Baselines

For monthly tracking, compare each run against a 3-run rolling average rather than the immediately preceding run. This reduces false alarms from single noisy runs.

---

## 12. Generative Engine Optimization (GEO) Metrics (Planned)

Sections 1–11 describe BrandTracker's **quantitative** layer: how often, how high, how positive. This section describes the **qualitative** layer: how and why the AI recommends a brand. Together they form a complete GEO monitoring system.

### 12.1 Why Qualitative Analysis Matters

A brand can have high share of voice but weak recommendations ("it's an option"). Another brand can have lower visibility but enthusiastic endorsements ("the clear best choice"). Quantitative metrics alone cannot distinguish these situations. The qualitative layer answers the question every strategist actually cares about: **what story is the AI telling about my brand?**

### 12.2 Recommendation Strength

Not all mentions are equal. We quantify recommendation strength on two dimensions:

**Position-based scoring** (deterministic, from existing data):

| Rank | Score | Interpretation |
|---|---|---|
| 1 (first mentioned / top ranked) | 5 | Top-of-mind, strongest recommendation |
| 2 | 4 | Strong secondary recommendation |
| 3 | 3 | Included in consideration set |
| Mentioned but not top 3 | 2 | Acknowledged but not recommended |
| Not mentioned | 0 | Invisible in this context |

**Language strength scoring** (from expanded structured response):

The model self-reports recommendation conviction on a 1–5 scale:

| Score | Language Pattern | Example |
|---|---|---|
| 5 | Superlative, unconditional | "The clear best choice", "I'd highly recommend" |
| 4 | Strong, clear preference | "Excellent option", "A top pick" |
| 3 | Positive but hedged | "Good option", "Worth considering" |
| 2 | Lukewarm, conditional | "Could work if budget is limited" |
| 1 | Mentioned with reservations | "Has some issues, but..." |

**Conditionality detection**: Whether a recommendation is unconditional ("best CRM overall") or conditional ("best CRM if you need Salesforce integration") changes its strategic meaning. Conditional recommendations reveal which "mental slot" the brand occupies.

The combined recommendation strength metric averages position score and language strength, weighted 40/60 (language strength carries more signal than list position).

### 12.3 Attribute-Based Analysis

Every AI recommendation implicitly references product attributes — "great battery life", "easy to set up", "affordable pricing". Systematically extracting these reveals the brand's **attribute profile** as perceived by the AI.

**Extraction approach (hybrid):**

1. **Self-reported (basic)** — During the research response, the structured JSON schema includes `key_attributes_per_brand`, where the model lists 2–5 attributes it associated with each recommendation. This is cheap (no extra API call) but limited to what the model consciously reports.

2. **Post-processed (deep)** — A separate analysis pass sends the `reasoning` text to Claude with a dedicated extraction prompt. This catches implicit attributes the model didn't explicitly list and produces a richer profile. Can be run on historical data.

**Three metrics per attribute:**

| Metric | Definition | Example |
|---|---|---|
| Attribute frequency | How often the attribute surfaces across iterations | "battery life" appears in 65% of Samsung mentions |
| Attribute profile | Which attributes map to which brands | Samsung → battery, display; Apple → ecosystem, privacy |
| Attribute valence | Is the attribute framed as strength, weakness, or neutral? | "battery life" for Samsung: 90% strength, 10% neutral |

**Why this matters for GEO:** If a brand's website emphasizes "enterprise security" but the AI never associates that attribute with the brand, there's a content gap. Attribute analysis pinpoints exactly which claims are landing in the AI's representation and which aren't.

### 12.4 Contextual Relevance & Mental Slots

People don't ask "what's the best CRM?" in a vacuum. They ask "best CRM for a small sales team" or "affordable alternative to Salesforce." Each framing is a distinct **use case**, and the AI may recommend entirely different brands depending on context.

**Key concepts:**

- **Use case** = the specific situation behind the query. Different use cases activate different brands in the model's output distribution.
- **Mental slot** = the positioning the AI has learned to associate with the brand. If an AI consistently recommends a brand for budget queries but never in enterprise contexts, it occupies a "budget-friendly" slot.
- **Prompt matrix** = a structured grid combining dimensions (company size × buying priority × specific needs) into realistic prompts that mirror real buyer behavior.

**Measurement approach:**

Build a brand × context heatmap from existing data. Each cell = mention frequency of brand B in context C (defined by the question + persona combination). This requires no additional API calls — the research run already covers multiple personas and question types.

**Interpretation:**

A brand with high overall mention frequency but concentrated in a few contexts has narrow relevance — it's a specialist. A brand with moderate frequency but broad coverage has wide relevance — it's a generalist. Both can be strategic strengths, but they require different GEO approaches.

### 12.5 Narrative Classification

Every recommendation contains an implicit story: "this is right for you because..." We classify these into five narrative types drawn from established brand positioning theory:

| Narrative Type | Pattern | Example |
|---|---|---|
| **Price/Value** | Cost efficiency, bang for buck | "You get a lot for your money" |
| **Technical Superiority** | Features, performance, capabilities | "Best feature set in the category" |
| **Reliability/Trust** | Track record, reputation, safety | "Well-known and trusted brand" |
| **Fit/Suitability** | Match to specific needs | "Best for your specific situation" |
| **Social Proof** | Popularity, market leadership | "Most widely used", "industry standard" |

**Why track narrative distribution:**

If 70% of your brand's recommendations use the "price/value" narrative but your strategy targets "technical superiority," the AI's representation doesn't match your positioning. This is actionable — strengthening technical content (case studies, benchmarks, feature comparisons) on the brand's digital footprint can shift which narrative the AI learns over time.

**Cross-model comparison:** Different models may tell different stories about the same brand. ChatGPT may emphasize price/value while Claude emphasizes technical features. This reveals model-specific biases and helps prioritize GEO efforts by model.

### 12.6 Gap Analysis

Equally important to what the AI says is what it **doesn't** say. Gap analysis compares attribute profiles across brands to identify:

1. **Missing attributes** — attributes that competitors are praised for but your brand is never associated with. Example: Competitor gets "excellent customer support" in 40% of responses; your brand gets it in 0%.

2. **Weak attributes** — attributes your brand gets but with lower frequency or weaker valence than competitors.

3. **Unique strengths** — attributes where your brand dominates and competitors don't appear. These are defensible positions.

**Output format:** A ranked list of gaps sorted by (competitor frequency × strategic importance), giving concrete priorities for GEO content improvement.

### 12.7 Composite GEO Quality Score

Rather than tracking 15+ individual metrics, we combine them into a single index for executive tracking:

| Component | Weight | Source | Available Now? |
|---|---|---|---|
| Share of Voice | ~30% | Existing metric | Yes |
| Recommendation Strength | ~25% | Position score (now) + language strength (Phase 2) | Partial |
| Attribute Match vs Desired Profile | ~25% | Attribute analysis (Phase 2–3) | No — uses SOV as proxy until available |
| Narrative Quality | ~20% | Narrative classification (Phase 3) | No — uses sentiment as proxy until available |

**Progressive refinement:** The score is computable today using existing metrics as proxies. As attribute analysis and narrative classification are implemented, the proxy components are replaced with their proper implementations, and the score becomes more meaningful without changing the formula.

**Interpretation:**

The composite score is designed for **tracking change over time**, not for absolute comparison across categories. A GEO score of 72 means nothing in isolation. A GEO score that went from 65 → 72 → 78 over three months means the brand's AI representation is improving.

### 12.8 Limitations of Qualitative GEO Metrics

**Self-report bias:** When the model self-classifies attributes and language strength during the structured response, it may be unreliable — models are better at generating language than introspecting about it. This is why we offer the post-processing path as a higher-fidelity alternative.

**Taxonomy rigidity:** The five narrative types and attribute categories are starting frameworks, not universal truths. Different industries may need different taxonomies. Future work should allow user-defined attribute taxonomies.

**Attribute extraction consistency:** Different models (and different temperatures) may extract different attributes from the same reasoning text. Attribute metrics should be interpreted within a single model/temperature configuration, not compared across them.

---

## 13. Known Limitations

### L1: Measuring the Model, Not the Market

We measure P(brand | question, persona, model, temperature) — the probability that a specific model, at a specific temperature, mentions a specific brand when asked a specific question in a specific persona framing. This is a property of the model, not of the consumer market. Correlation with actual market perception is plausible (models are trained on human text) but not guaranteed and not yet empirically validated.

**Mitigation:** We are explicit about what we measure. Reports should state "As represented by [model name]" rather than "Consumers think."

### L2: Training Data Bias

LLMs overrepresent brands that appear frequently in their training data. English-language corpora overrepresent American brands. Recent brands may be underrepresented due to knowledge cutoffs. RLHF may create biases toward or against certain brands.

**Mitigation:** Multi-model comparison (Claude + ChatGPT) helps detect model-specific biases. If two independently trained models agree, the signal is more robust.

### L3: Prompt Sensitivity

Results depend on exact prompt wording. Small changes to the question text or persona description can shift brand rankings. This is analogous to question-wording effects in surveys, but may be more severe because LLMs are highly sensitive to phrasing.

**Mitigation:** Use frozen question banks (planned) to ensure comparability across runs. Document exact prompts used. The iteration approach (averaging over many samples) partially smooths out per-response noise, but cannot correct systematic prompt bias.

### L4: Non-independence of Observations

Repeated samples from the same model at the same temperature are not truly independent — they share the same model weights and thus the same biases. Our confidence intervals assume independence conditional on the model. This is valid for characterizing the model's output distribution but means CIs do not account for model uncertainty.

**Analogy:** It's like polling the same person 20 times vs. polling 20 different people. The variance we capture is the model's sampling noise, not the uncertainty about which model to use.

**Mitigation:** Cross-model comparison provides a different axis of variation. Future work could incorporate model-level uncertainty via multi-model meta-analysis.

### L5: Temperature-dependent Results

Results at temperature 0.3 and temperature 1.0 measure different things. At low temperature, we get the model's "most likely" response. At high temperature, we get a broader sampling of its distribution. These are both valid but answer different questions.

**Mitigation:** Store temperature with each run. Only compare runs at the same temperature. Default to 0.7 for consistency.

### L6: Coarse Sentiment Resolution

Three sentiment categories (positive/neutral/negative) lose nuance. "Pretty good" and "absolutely revolutionary" both map to "positive."

**Mitigation:** For preference questions we use a 0–1 continuous score. Future work could request fine-grained scores from all question types.

### L7: Brand Matching False Positives

Partial string matching can misattribute mentions (see section 8).

**Mitigation:** Use specific brand names. Future work could implement semantic matching or entity resolution.

### L8: z-approximation at Small n

We use z=1.96 instead of the t-distribution for mean confidence intervals. At n < 15, this understates CI width.

**Mitigation:** We recommend n ≥ 20 for all production runs, where the z-approximation is excellent.

### L9: No Correction for Multiple Comparisons

When comparing many brands across many metrics, we do not apply Bonferroni or FDR corrections. This means some "significant" differences may be false positives.

**Mitigation:** Users should interpret results as exploratory rather than confirmatory. For formal hypothesis testing, apply appropriate corrections externally.

---

## 14. Validation & Controls

### Negative Controls (Planned)

Inject fictitious brand names and irrelevant real brands into the tracked list. If the model "recommends" a fake brand with meaningful frequency, it indicates the measurement system has a hallucination or compliance problem.

**Threshold:** Fake brand mention_frequency > 5% or irrelevant brand in top-3 > 10% → flag the run as potentially unreliable.

### Persona Balance Checking (Planned)

Check that the persona set covers diverse archetypes, demographics, and priority combinations. A homogeneous persona set will produce biased results.

**Dimensions checked:** archetype distribution, tech_savviness spread, price_sensitivity spread, brand_loyalty spread.

### Cross-Model Triangulation

Running the same questions against multiple models (Claude, ChatGPT) provides a form of robustness check. Findings that replicate across independently trained models are more credible than single-model findings.

### Reproducibility

All run parameters are stored:
- Model name and version
- Temperature
- Iteration count
- Question bank version (planned: frozen question banks)
- Exact prompt templates (fixed in source code, versioned in git)

This allows any result to be reproduced by re-running with identical parameters.

---

## 15. References & Prior Art

### Statistical Methods

- **Wilson, E.B.** (1927). "Probable Inference, the Law of Succession, and Statistical Inference." *Journal of the American Statistical Association*, 22(158), 209–212. — Foundation for our proportion confidence intervals.

- **Agresti, A. & Coull, B.A.** (1998). "Approximate is Better than 'Exact' for Interval Estimation of Binomial Proportions." *The American Statistician*, 52(2), 119–126. — Recommends Wilson interval over Wald; our primary justification.

- **Brown, L.D., Cai, T.T., & DasGupta, A.** (2001). "Interval Estimation for a Binomial Proportion." *Statistical Science*, 16(2), 101–133. — Comprehensive comparison of binomial intervals; Wilson and Agresti-Coull intervals emerge as best simple methods.

### LLM Brand Perception Research

- **Goli, A. & Singh, A.** (2024). "Front-of-Mind Brands in LLMs." — Pioneering work on measuring which brands LLMs recommend and how this varies by context. Our recall question type is conceptually similar.

- **Brand mentions in AI assistants** are an emerging area of study as LLM-powered search (Bing Chat, Google AI Overview, Perplexity) becomes a significant consumer touchpoint. BrandTracker's approach of systematic repeated sampling is designed to bring survey-methodology rigor to this new measurement domain.

### Traditional Brand Research Methodology

- **Keller, K.L.** (1993). "Conceptualizing, Measuring, and Managing Customer-Based Brand Equity." *Journal of Marketing*, 57(1), 1–22. — Foundational framework for brand equity measurement. Our metrics map to Keller's constructs: recall → brand awareness, preference → brand preference, sentiment → brand image.

- **Aaker, D.A.** (1996). "Measuring Brand Equity Across Products and Markets." *California Management Review*, 38(3), 102–120. — Brand equity dimensions that inform our metric design.

---

## Changelog

| Date | Change | Rationale |
|---|---|---|
| 2025-02-10 | Initial document | Documenting Phase 1+2 implementation (structured responses, repetition, Wilson CI) |
| 2026-02-10 | Added sections 10–11 | Strategic framing (seismograph metaphor, convergence, budget allocation, change detection, trend philosophy) |
| 2026-02-10 | Added section 12 | GEO qualitative metrics framework (recommendation strength, attributes, contextual relevance, narrative classification, gap analysis, composite score) |

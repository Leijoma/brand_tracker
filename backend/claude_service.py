import asyncio
import anthropic
import os
from typing import List, Dict
import json
from models import Persona, PersonaArchetype, Question, AnalysisResult


class ClaudeService:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model = "claude-sonnet-4-5-20250929"

    def _extract_json(self, response_text: str) -> str:
        """Extract JSON from Claude's response, handling markdown code blocks"""
        response_text = response_text.strip()
        if response_text.startswith('```'):
            # Remove markdown code blocks
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1]) if len(lines) > 2 else response_text
            response_text = response_text.replace('```json', '').replace('```', '').strip()
        return response_text

    async def generate_personas(self, category: str, market_context: str, count: int = 5, language: str = "English") -> List[Persona]:
        """Generate diverse personas for the given category"""

        lang_instruction = f"\n\nIMPORTANT: Write ALL persona descriptions, names, occupations, and key_priorities in {language}." if language != "English" else ""

        prompt = f"""Generate {count} diverse consumer personas for the "{category}" category.

Market Context: {market_context}{lang_instruction}

For each persona, provide:
1. A realistic name
2. Archetype (choose from: innovator, pragmatist, conservative, budget_conscious, quality_seeker)
3. A brief description (2-3 sentences)
4. Age range
5. Occupation
6. Tech savviness (1-5 scale)
7. Price sensitivity (1-5 scale)
8. Brand loyalty (1-5 scale)
9. 3-5 key priorities when choosing in this category

Make the personas diverse in demographics, priorities, and decision-making styles.

Return ONLY valid JSON in this exact format:
{{
  "personas": [
    {{
      "name": "string",
      "archetype": "innovator|pragmatist|conservative|budget_conscious|quality_seeker",
      "description": "string",
      "age_range": "string",
      "occupation": "string",
      "tech_savviness": 1-5,
      "price_sensitivity": 1-5,
      "brand_loyalty": 1-5,
      "key_priorities": ["string", "string", ...]
    }}
  ]
}}"""

        message = await asyncio.to_thread(
            self.client.messages.create,
            model=self.model,
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        response_text = self._extract_json(response_text)
        data = json.loads(response_text)

        personas = []
        for i, p in enumerate(data["personas"]):
            personas.append(Persona(
                id=f"persona_{i}",
                name=p["name"],
                archetype=PersonaArchetype(p["archetype"]),
                description=p["description"],
                age_range=p["age_range"],
                occupation=p["occupation"],
                tech_savviness=p["tech_savviness"],
                price_sensitivity=p["price_sensitivity"],
                brand_loyalty=p["brand_loyalty"],
                key_priorities=p["key_priorities"]
            ))

        return personas

    async def generate_questions(
        self,
        persona: Persona,
        category: str,
        market_context: str,
        count: int = 5,
        research_areas: List[str] = None,
        language: str = "English",
    ) -> List[Question]:
        """Generate natural questions this persona would ask about the category.

        IMPORTANT: Questions should NOT mention specific brands - we want to see
        what the AI brings up organically.
        """
        # Auto-increase count to cover all research areas
        effective_count = count
        if research_areas:
            effective_count = max(count, len(research_areas) * 2)

        areas_section = ""
        areas_json_field = ""
        if research_areas:
            areas_section = f"""
Research areas to cover: {', '.join(research_areas)}
- You MUST generate questions that cover ALL of these research areas
- Distribute questions so each area is addressed by at least 1-2 questions
- Each question should be tagged with which research area it targets
"""
            areas_json_field = ',\n      "research_area": "which research area this question targets (must be one of: {", ".join(research_areas)})"'

        prompt = f"""You are {persona.name}, a {persona.age_range} {persona.occupation}.

Your profile:
- Archetype: {persona.archetype.value}
- Description: {persona.description}
- Tech savviness: {persona.tech_savviness}/5
- Price sensitivity: {persona.price_sensitivity}/5
- Brand loyalty: {persona.brand_loyalty}/5
- Key priorities: {', '.join(persona.key_priorities)}

You're researching the "{category}" category. Context: {market_context}
{areas_section}
Generate {effective_count} natural questions you would ask when researching this category.
{"Write ALL questions and context in " + language + "." if language != "English" else ""}

CRITICAL RULES:
- DO NOT mention specific brand names in questions
- The majority of questions (at least 60-70%) should directly ask for brand/model suggestions and recommendations
- Questions should be phrased to elicit concrete brand names and specific model/product recommendations
- The remaining questions can cover features, comparisons, or experiences but should still invite mentioning brands
- Questions should reflect your priorities, concerns, and decision-making style

Examples of GOOD questions (note how they ask for specific suggestions):
- "Which brands and models would you recommend for a family that prioritizes safety?"
- "Can you suggest some good options in [category] that have the best value for money?"
- "What specific models should I look at if I want [priority]?"
- "Which brands are considered the most reliable in [category] right now?"
- "What would you recommend if I'm looking for [specific need]?"
- "What are the top 3 options you'd suggest for someone who values [priority]?"

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question_text": "string",
      "context": "brief explanation of why this persona asks this"{areas_json_field}
    }}
  ]
}}"""

        message = await asyncio.to_thread(
            self.client.messages.create,
            model=self.model,
            max_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        response_text = self._extract_json(response_text)
        data = json.loads(response_text)

        questions = []
        for i, q in enumerate(data["questions"]):
            questions.append(Question(
                id=f"{persona.id}_q_{i}",
                persona_id=persona.id,
                question_text=q["question_text"],
                context=q.get("context"),
                research_area=q.get("research_area"),
            ))

        return questions

    async def ask_question(self, question: Question, persona: Persona, category: str) -> str:
        """Have Claude answer the persona's question as naturally as possible"""

        prompt = f"""A user is asking for advice about {category}.

Their question: {question.question_text}

Provide a helpful, natural response as if you're having a conversation. If relevant, mention specific products, services, or brands that would be good fits. Be specific and give reasoning for your recommendations."""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )

        return message.content[0].text

    def analyze_structured_responses(
        self,
        statistical_results: List[Dict],
        brands: List[str],
        research_areas: List[str] = None,
        topic_scores: Dict[str, Dict[str, Dict]] = None,
    ) -> List[AnalysisResult]:
        """Convert statistical results to AnalysisResult format (deterministic, no AI call).

        This is the new path for structured responses — metrics are already computed
        by the statistics module, we just need to convert the format.

        Args:
            topic_scores: Pre-computed {brand: {area: {"score": float, "mentions": int}}}
        """
        results = []
        for brand in brands:
            stats = next((s for s in statistical_results if s["brand"] == brand), None)
            if not stats:
                results.append(AnalysisResult(
                    brand=brand,
                    total_mentions=0,
                    recommendation_count=0,
                    first_mention_count=0,
                    avg_sentiment_score=0.0,
                    share_of_voice=0.0,
                    persona_affinity={},
                    topic_scores=topic_scores.get(brand) if topic_scores else None,
                ))
                continue

            # persona_affinity may be a JSON string from the DB
            pa = stats.get("persona_affinity", {})
            if isinstance(pa, str):
                pa = json.loads(pa)

            results.append(AnalysisResult(
                brand=brand,
                total_mentions=stats.get("total_mentions", 0),
                recommendation_count=stats.get("recommendation_count", 0),
                first_mention_count=stats.get("first_mention_count", 0),
                avg_sentiment_score=stats.get("avg_sentiment_score", 0.0),
                share_of_voice=stats.get("share_of_voice", 0.0),
                persona_affinity=pa,
                topic_scores=topic_scores.get(brand) if topic_scores else None,
            ))

        # Sort by composite score
        results.sort(
            key=lambda x: (
                x.total_mentions * 2 +
                x.recommendation_count * 3 +
                x.first_mention_count * 2 +
                (x.avg_sentiment_score + 1) * 5
            ),
            reverse=True
        )
        return results

    async def analyze_responses(
        self,
        responses: List[Dict],  # {question, response, persona}
        brands: List[str],
        category: str,
        primary_brand: str = None,
        research_areas: List[str] = None,
        language: str = "English",
    ) -> List[AnalysisResult]:
        """Legacy analysis: send all responses to Claude for interpretation.

        Used for old 'legacy_freetext' responses that don't have structured_data.
        For new structured responses, use analyze_structured_responses() instead.
        """

        # Prepare responses text
        responses_text = ""
        for i, r in enumerate(responses):
            responses_text += f"\n--- Response {i+1} ---\n"
            responses_text += f"Persona: {r['persona_name']} ({r['persona_id']})\n"
            responses_text += f"Question: {r['question']}\n"
            responses_text += f"Response: {r['response']}\n"

        topic_section = ""
        topic_json = ""
        if research_areas:
            topic_section = f"""
Research areas to analyze: {', '.join(research_areas)}
For each brand, you MUST evaluate how it performs in EACH of these research areas based on what was said in the responses.
CRITICAL: The "topic_scores" field is REQUIRED for EVERY brand. You MUST include a score for EVERY research area listed above, even if the brand was barely mentioned — use score 0.0 and mentions 0 in that case.
"""
            areas_example = ", ".join(f'"{a}": {{"score": 0.0, "mentions": 0}}' for a in research_areas)
            topic_json = f""",
      "topic_scores": {{
        {areas_example}
      }}"""

        primary_section = ""
        if primary_brand:
            primary_section = f"""
Primary brand for comparison: {primary_brand}
When analyzing, pay special attention to how {primary_brand} compares to competitors.
"""

        prompt = f"""Analyze these AI responses about "{category}" for brand perception research.

Tracked brands: {', '.join(brands)}
{primary_section}{topic_section}
Responses to analyze:
{responses_text}

For EACH tracked brand, analyze:
1. Total mentions across all responses
2. How many times it was explicitly recommended
3. How many times it was mentioned first in a response
4. Sentiment (aggregate across mentions): score from -1.0 (very negative) to 1.0 (very positive)
5. Affinity with each persona (0.0 to 1.0 based on how well it matched their priorities)

Also note if any brands were NOT mentioned at all.

Return ONLY valid JSON:
{{
  "results": [
    {{
      "brand": "string",
      "total_mentions": number,
      "recommendation_count": number,
      "first_mention_count": number,
      "avg_sentiment_score": -1.0 to 1.0,
      "persona_affinity": {{
        "persona_0": 0.0-1.0,
        "persona_1": 0.0-1.0,
        ...
      }}{topic_json}
    }}
  ],
  "category_insights": "2-3 sentences about emergent patterns",
  "methodology_notes": "any important caveats or observations"
}}"""

        message = await asyncio.to_thread(
            self.client.messages.create,
            model=self.model,
            max_tokens=6000,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        response_text = self._extract_json(response_text)
        data = json.loads(response_text)

        # Calculate share of voice
        total_mentions = sum(r["total_mentions"] for r in data["results"])

        results = []
        for r in data["results"]:
            share_of_voice = r["total_mentions"] / total_mentions if total_mentions > 0 else 0.0

            # Ensure topic_scores has all research areas
            ts = r.get("topic_scores")
            if research_areas:
                if not ts:
                    ts = {}
                for area in research_areas:
                    if area not in ts:
                        ts[area] = {"score": 0.0, "mentions": 0}

            results.append(AnalysisResult(
                brand=r["brand"],
                total_mentions=r["total_mentions"],
                recommendation_count=r["recommendation_count"],
                first_mention_count=r["first_mention_count"],
                avg_sentiment_score=r["avg_sentiment_score"],
                share_of_voice=share_of_voice,
                persona_affinity=r["persona_affinity"],
                topic_scores=ts,
            ))

        # Sort by a composite score (mentions + recommendations + sentiment)
        results.sort(
            key=lambda x: (
                x.total_mentions * 2 +
                x.recommendation_count * 3 +
                x.first_mention_count * 2 +
                (x.avg_sentiment_score + 1) * 5  # normalize to 0-10
            ),
            reverse=True
        )

        return results

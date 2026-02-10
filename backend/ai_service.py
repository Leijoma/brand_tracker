"""Pluggable AI service abstraction for multi-model research queries.

Supports structured JSON responses for statistical analysis.
"""

import asyncio
import hashlib
import json
import logging
import os
import random
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Tuple

import anthropic
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


def _stable_hash(text: str) -> int:
    """Return a stable integer hash that does not change across Python processes."""
    return int(hashlib.md5(text.encode("utf-8")).hexdigest(), 16)


def _extract_json(text: str) -> str:
    """Extract JSON from a response that may be wrapped in markdown code blocks."""
    text = text.strip()
    if text.startswith('```'):
        lines = text.split('\n')
        text = '\n'.join(lines[1:-1]) if len(lines) > 2 else text
        text = text.replace('```json', '').replace('```', '').strip()
    return text


# ---- Prompt templates per question type ----

RECALL_PROMPT = """A consumer is researching {category}.

{persona_context}

Based on what you know about this person's profile, priorities, and preferences, answer the following question in a way that is most relevant to them.

Question: {question_text}

{lang_instruction}

You MUST respond with ONLY valid JSON in this exact format (no other text):
{{
  "recommendations": [
    {{"brand": "BrandName", "rank": 1, "sentiment": "positive"}},
    {{"brand": "AnotherBrand", "rank": 2, "sentiment": "positive"}}
  ],
  "reasoning": "Your explanation of why you recommend these brands in this order, given this person's profile."
}}

Rules:
- List ALL brands you would genuinely recommend for this person, in order of preference (rank 1 = best).
- "sentiment" must be one of: "positive", "neutral", "negative".
- Tailor your recommendations to this person's priorities and characteristics. Include at least 2-3 brands.
- The "reasoning" field should explain your thought process, referencing the person's specific needs.
- Do NOT include any text outside the JSON object."""

PREFERENCE_PROMPT = """A consumer is researching {category}.

{persona_context}

Based on what you know about this person, evaluate the following brands from their perspective: {brands_list}

Question: {question_text}

{lang_instruction}

You MUST respond with ONLY valid JSON in this exact format (no other text):
{{
  "rankings": [
    {{"brand": "BrandName", "rank": 1, "score": 0.95, "sentiment": "positive"}},
    {{"brand": "AnotherBrand", "rank": 2, "score": 0.80, "sentiment": "positive"}}
  ],
  "reasoning": "Your explanation of this ranking, given this person's profile."
}}

Rules:
- You MUST rank ALL provided brands, no exceptions.
- rank 1 = best. Score is 0.0 to 1.0 (how strongly this person would prefer this brand).
- "sentiment" must be one of: "positive", "neutral", "negative".
- Tailor the ranking to this person's priorities, price sensitivity, and preferences.
- Do NOT include any text outside the JSON object."""

FORCED_CHOICE_PROMPT = """A consumer is researching {category}.

{persona_context}

Based on what you know about this person, choose exactly ONE brand from this list that would be the best fit for them: {brands_list}

Question: {question_text}

{lang_instruction}

You MUST respond with ONLY valid JSON in this exact format (no other text):
{{
  "chosen_brand": "BrandName",
  "confidence": 0.85,
  "reasoning": "Why this brand is the best fit for this person, given their profile."
}}

Rules:
- You MUST pick exactly one brand from the provided list.
- "confidence" is 0.0 to 1.0 (how confident you are this is the right choice for this person).
- Base your choice on this person's priorities, preferences, and characteristics.
- Do NOT include any text outside the JSON object."""



# ---- Iteration variation for diverse responses ----

THINKING_STYLES = [
    "Think step by step about what matters most to you.",
    "Consider your recent experiences and what left the strongest impression.",
    "Think about what your friends or colleagues would say about these brands.",
    "Focus on long-term value and reliability over short-term appeal.",
    "Consider which brands you've seen the most positive buzz about recently.",
    "Think about which brands best align with your personal values and lifestyle.",
    "Focus on innovation and which brands are pushing boundaries.",
    "Consider practical everyday use — which brands deliver consistently?",
    "Think about which brands you'd recommend to someone you care about.",
    "Focus on the overall brand experience, not just the core product.",
]

SCENARIO_CONTEXTS = [
    "",  # No extra context (baseline)
    "You're making this decision after doing extensive online research.",
    "A close friend just asked you for a recommendation.",
    "You're comparing options for an important purchase decision.",
    "You recently had a conversation about this topic with colleagues.",
    "You're writing a review and want to be thorough and balanced.",
    "You need to make a quick decision — go with your gut feeling.",
    "You're advising someone with a tight budget who wants the best value.",
    "You're thinking about which brands have improved the most recently.",
    "You're considering switching from your current choice — what would you pick?",
]


class AIService(ABC):
    """Abstract base for AI model services used in research queries."""

    name: str
    display_name: str

    @abstractmethod
    async def ask_question(
        self,
        question_text: str,
        persona_name: str,
        category: str,
        language: str = "English",
        question_type: str = "recall",
        brands: Optional[List[str]] = None,
        temperature: float = 0.7,
        iteration: int = 1,
        persona_context: Optional[str] = None,
    ) -> Dict:
        """Ask a research question and return structured response.

        Returns:
            {"structured_data": {...}, "reasoning": "...", "raw_text": "..."}
        """
        ...

    def _build_prompt(
        self,
        question_text: str,
        persona_name: str,
        category: str,
        language: str,
        question_type: str,
        brands: Optional[List[str]],
        iteration: int = 1,
        persona_context: Optional[str] = None,
    ) -> Tuple[str, Optional[Dict]]:
        """Build prompt and return (prompt_text, variation_metadata).

        variation_metadata is None for iteration==1 (baseline), otherwise a dict
        with keys: thinking_style, scenario_context, brand_order (if shuffled).
        """
        lang_instruction = f"Respond in {language}." if language != "English" else ""
        variation_meta = None

        # Build persona context block — use full profile if provided, otherwise just name
        if persona_context:
            ctx = persona_context
        else:
            ctx = f"About the person asking:\n- Name: {persona_name}"

        # Shuffle brand order per iteration for preference/forced_choice
        # to reduce position bias
        if brands and iteration > 1 and question_type in ("preference", "forced_choice"):
            shuffled = list(brands)
            rng = random.Random(iteration * 31 + _stable_hash(question_text) % 10000)
            rng.shuffle(shuffled)
            brands_list = ", ".join(shuffled)
        else:
            brands_list = ", ".join(brands) if brands else ""

        templates = {
            "recall": RECALL_PROMPT,
            "preference": PREFERENCE_PROMPT,
            "forced_choice": FORCED_CHOICE_PROMPT,
        }
        template = templates.get(question_type, RECALL_PROMPT)

        prompt = template.format(
            persona_context=ctx,
            category=category,
            question_text=question_text,
            lang_instruction=lang_instruction,
            brands_list=brands_list,
        )

        # Add iteration-dependent variation to elicit diverse responses
        if iteration > 1:
            rng = random.Random(iteration * 17 + _stable_hash(question_text) % 10000)
            thinking = rng.choice(THINKING_STYLES)
            scenario = rng.choice(SCENARIO_CONTEXTS)

            variation = f"\n\n{thinking}"
            if scenario:
                variation += f" {scenario}"
            prompt = prompt + variation

            variation_meta = {
                "thinking_style": thinking,
                "scenario_context": scenario,
            }
            if brands and question_type in ("preference", "forced_choice"):
                variation_meta["brand_order"] = brands_list.split(", ")

        return prompt, variation_meta

    def _parse_response(self, raw_text: str, question_type: str) -> Dict:
        """Parse AI response into structured_data + reasoning."""
        try:
            cleaned = _extract_json(raw_text)
            data = json.loads(cleaned)

            if question_type == "recall":
                return {
                    "structured_data": {
                        "recommendations": data.get("recommendations", []),
                    },
                    "reasoning": data.get("reasoning", ""),
                    "raw_text": raw_text,
                }
            elif question_type == "preference":
                return {
                    "structured_data": {
                        "rankings": data.get("rankings", []),
                    },
                    "reasoning": data.get("reasoning", ""),
                    "raw_text": raw_text,
                }
            elif question_type == "forced_choice":
                return {
                    "structured_data": {
                        "chosen_brand": data.get("chosen_brand", ""),
                        "confidence": data.get("confidence", 0.5),
                    },
                    "reasoning": data.get("reasoning", ""),
                    "raw_text": raw_text,
                }
            else:
                return {
                    "structured_data": data,
                    "reasoning": data.get("reasoning", ""),
                    "raw_text": raw_text,
                }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning(f"Failed to parse structured response: {e}. Falling back to legacy.")
            return {
                "structured_data": None,
                "reasoning": raw_text,
                "raw_text": raw_text,
            }


class ClaudeAIService(AIService):
    name = "claude"
    display_name = "Claude"

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model = "claude-sonnet-4-5-20250929"

    async def ask_question(
        self,
        question_text: str,
        persona_name: str,
        category: str,
        language: str = "English",
        question_type: str = "recall",
        brands: Optional[List[str]] = None,
        temperature: float = 0.7,
        iteration: int = 1,
        persona_context: Optional[str] = None,
    ) -> Dict:
        prompt, variation_meta = self._build_prompt(
            question_text, persona_name, category, language, question_type, brands, iteration,
            persona_context=persona_context,
        )
        message = await asyncio.to_thread(
            self.client.messages.create,
            model=self.model,
            max_tokens=1500,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = message.content[0].text
        result = self._parse_response(raw_text, question_type)
        result["prompt_variation"] = variation_meta
        return result


class OpenAIService(AIService):
    name = "chatgpt"
    display_name = "ChatGPT"

    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPEN_AI_API_KEY"))
        self.model = "gpt-4o"

    async def ask_question(
        self,
        question_text: str,
        persona_name: str,
        category: str,
        language: str = "English",
        question_type: str = "recall",
        brands: Optional[List[str]] = None,
        temperature: float = 0.7,
        iteration: int = 1,
        persona_context: Optional[str] = None,
    ) -> Dict:
        prompt, variation_meta = self._build_prompt(
            question_text, persona_name, category, language, question_type, brands, iteration,
            persona_context=persona_context,
        )
        response = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=1500,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
        )
        raw_text = response.choices[0].message.content
        result = self._parse_response(raw_text, question_type)
        result["prompt_variation"] = variation_meta
        return result


# ---- Registry & Factory ----

_ALL_SERVICES: List[dict] = [
    {"name": "claude", "display_name": "Claude", "env_key": "ANTHROPIC_API_KEY", "cls": ClaudeAIService},
    {"name": "chatgpt", "display_name": "ChatGPT", "env_key": "OPEN_AI_API_KEY", "cls": OpenAIService},
]

_instances: Dict[str, AIService] = {}


def get_available_models() -> List[dict]:
    """Return models that have a valid API key configured."""
    result = []
    for svc in _ALL_SERVICES:
        available = bool(os.getenv(svc["env_key"]))
        result.append({
            "name": svc["name"],
            "display_name": svc["display_name"],
            "available": available,
        })
    return result


def get_service(model_name: str) -> AIService:
    """Get (or create) an AI service instance by model name."""
    if model_name in _instances:
        return _instances[model_name]
    for svc in _ALL_SERVICES:
        if svc["name"] == model_name:
            instance = svc["cls"]()
            _instances[model_name] = instance
            return instance
    raise ValueError(f"Unknown model: {model_name}")

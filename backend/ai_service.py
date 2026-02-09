"""Pluggable AI service abstraction for multi-model research queries."""

import asyncio
import os
from abc import ABC, abstractmethod
from typing import List, Dict, Optional

import anthropic
from openai import AsyncOpenAI


class AIService(ABC):
    """Abstract base for AI model services used in research queries."""

    name: str           # e.g. "claude", "chatgpt"
    display_name: str   # e.g. "Claude", "ChatGPT"

    @abstractmethod
    async def ask_question(self, question_text: str, persona_name: str, category: str, language: str = "English") -> str:
        """Ask a research question and return the model's response."""
        ...


class ClaudeAIService(AIService):
    name = "claude"
    display_name = "Claude"

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model = "claude-sonnet-4-5-20250929"

    async def ask_question(self, question_text: str, persona_name: str, category: str, language: str = "English") -> str:
        lang_instruction = f" Respond in {language}." if language != "English" else ""
        prompt = (
            f"A user is asking for advice about {category}.\n\n"
            f"Their question: {question_text}\n\n"
            f"Provide a helpful, natural response as if you're having a conversation. "
            f"If relevant, mention specific products, services, or brands that would be good fits. "
            f"Be specific and give reasoning for your recommendations.{lang_instruction}"
        )
        message = await asyncio.to_thread(
            self.client.messages.create,
            model=self.model,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text


class OpenAIService(AIService):
    name = "chatgpt"
    display_name = "ChatGPT"

    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPEN_AI_API_KEY"))
        self.model = "gpt-4o"

    async def ask_question(self, question_text: str, persona_name: str, category: str, language: str = "English") -> str:
        lang_instruction = f" Respond in {language}." if language != "English" else ""
        prompt = (
            f"A user is asking for advice about {category}.\n\n"
            f"Their question: {question_text}\n\n"
            f"Provide a helpful, natural response as if you're having a conversation. "
            f"If relevant, mention specific products, services, or brands that would be good fits. "
            f"Be specific and give reasoning for your recommendations.{lang_instruction}"
        )
        response = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content


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

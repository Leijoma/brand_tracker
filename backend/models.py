from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum


class PersonaArchetype(str, Enum):
    INNOVATOR = "innovator"
    PRAGMATIST = "pragmatist"
    CONSERVATIVE = "conservative"
    BUDGET_CONSCIOUS = "budget_conscious"
    QUALITY_SEEKER = "quality_seeker"


# ---- Persona schemas ----

class Persona(BaseModel):
    id: Optional[str] = None
    name: str
    archetype: PersonaArchetype
    description: str
    age_range: str
    occupation: str
    tech_savviness: int = Field(ge=1, le=5)
    price_sensitivity: int = Field(ge=1, le=5)
    brand_loyalty: int = Field(ge=1, le=5)
    key_priorities: List[str]
    origin: str = "ai_generated"
    category: Optional[str] = None


class PersonaCreate(BaseModel):
    name: str
    archetype: PersonaArchetype
    description: str
    age_range: str
    occupation: str
    tech_savviness: int = Field(ge=1, le=5)
    price_sensitivity: int = Field(ge=1, le=5)
    brand_loyalty: int = Field(ge=1, le=5)
    key_priorities: List[str]
    category: Optional[str] = None


class PersonaUpdate(BaseModel):
    name: Optional[str] = None
    archetype: Optional[PersonaArchetype] = None
    description: Optional[str] = None
    age_range: Optional[str] = None
    occupation: Optional[str] = None
    tech_savviness: Optional[int] = Field(default=None, ge=1, le=5)
    price_sensitivity: Optional[int] = Field(default=None, ge=1, le=5)
    brand_loyalty: Optional[int] = Field(default=None, ge=1, le=5)
    key_priorities: Optional[List[str]] = None


# ---- Question schemas ----

class Question(BaseModel):
    id: Optional[str] = None
    persona_id: str
    question_text: str
    context: Optional[str] = None
    origin: str = "ai_generated"
    category: Optional[str] = None
    research_area: Optional[str] = None


class QuestionCreate(BaseModel):
    persona_id: str
    question_text: str
    context: Optional[str] = None
    category: Optional[str] = None


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    context: Optional[str] = None


# ---- Session schemas ----

class ResearchSetup(BaseModel):
    category: str
    brands: List[str]
    market_context: str
    questions_per_persona: int = Field(default=5, ge=1, le=10)
    research_areas: List[str] = []
    primary_brand: Optional[str] = None
    language: str = "English"


# ---- Response schemas ----

class QueryResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    id: Optional[str] = None
    question_id: str
    persona_id: str
    response_text: str
    model_name: str = "claude"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    structured_data: Optional[Dict] = None
    response_type: str = "recall"
    iteration: int = 1


# ---- Analysis schemas ----

class AnalysisResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    brand: str
    total_mentions: int
    recommendation_count: int
    first_mention_count: int
    avg_sentiment_score: float
    share_of_voice: float
    persona_affinity: Dict[str, float]
    model_name: str = "claude"
    topic_scores: Optional[Dict[str, Dict[str, float]]] = None


class StatisticalResult(BaseModel):
    """Statistical metrics with confidence intervals from repeated measurements."""
    model_config = ConfigDict(protected_namespaces=())
    brand: str
    model_name: str = "claude"
    mention_frequency: float = 0.0
    avg_rank: float = 0.0
    top3_rate: float = 0.0
    first_mention_rate: float = 0.0
    recommendation_rate: float = 0.0
    # Confidence intervals
    mention_frequency_ci: List[float] = [0.0, 0.0]  # [low, high]
    avg_rank_ci: List[float] = [0.0, 0.0]
    top3_rate_ci: List[float] = [0.0, 0.0]
    avg_sentiment_score: float = 0.0
    sentiment_ci: List[float] = [0.0, 0.0]
    # Recommendation strength (position-based, 0-5 scale)
    recommendation_strength: float = 0.0
    recommendation_strength_ci: List[float] = [0.0, 0.0]
    # Legacy compat
    total_iterations: int = 1
    total_mentions: int = 0
    share_of_voice: float = 0.0
    recommendation_count: int = 0
    first_mention_count: int = 0
    persona_affinity: Dict[str, float] = {}


# ---- Research Run schemas ----

class ResearchRun(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    id: str
    session_id: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str = "running"
    models_used: List[str] = ["claude"]
    iterations_per_question: int = 1
    temperature: float = 0.7
    responses: List[QueryResponse] = []
    analysis: Optional[List[AnalysisResult]] = None
    statistical_results: Optional[List[StatisticalResult]] = None


# ---- Session response schemas ----

class SessionPersonaIds(BaseModel):
    persona_ids: List[str]


class SessionQuestionIds(BaseModel):
    question_ids: List[str]


class ResearchSession(BaseModel):
    id: Optional[str] = None
    setup: ResearchSetup
    personas: List[Persona] = []
    questions: List[Question] = []
    runs: List[ResearchRun] = []
    # Backward-compat: flatten latest run's data
    responses: List[QueryResponse] = []
    analysis: Optional[List[AnalysisResult]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "setup"
    share_token: Optional[str] = None

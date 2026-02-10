import asyncio
import json
import logging
from typing import List, Optional, Dict

from pydantic import BaseModel as PydanticBaseModel
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import Client

from database import get_supabase
from models import (
    ResearchSetup, Persona, PersonaCreate, PersonaUpdate,
    Question, QuestionCreate, QuestionUpdate,
    QueryResponse, AnalysisResult, StatisticalResult, ResearchRun,
    ResearchSession, SessionPersonaIds, SessionQuestionIds,
)
from claude_service import ClaudeService
from ai_service import get_available_models, get_service
from statistics import compute_brand_statistics, compute_change_detection
from auth import get_current_user
import crud

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="BrandTracker API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.68.92:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

claude_service = ClaudeService()

# ---- Progress tracking (in-memory) ----
run_progress: Dict[str, Dict] = {}  # run_id -> {current, total, status}
# task_id -> {current, total, status, message, session_id}
generation_progress: Dict[str, Dict] = {}


# ---- Helpers: Dict -> Pydantic ----

def persona_from_db(p: dict) -> Persona:
    return Persona(
        id=p["id"],
        name=p["name"],
        archetype=p["archetype"],
        description=p["description"],
        age_range=p["age_range"],
        occupation=p["occupation"],
        tech_savviness=p["tech_savviness"],
        price_sensitivity=p["price_sensitivity"],
        brand_loyalty=p["brand_loyalty"],
        key_priorities=json.loads(
            p["key_priorities"]) if isinstance(
            p["key_priorities"],
            str) else p["key_priorities"],
        origin=p["origin"],
        category=p.get("category"),
    )


def question_from_db(q: dict) -> Question:
    return Question(
        id=q["id"],
        persona_id=q["persona_id"],
        question_text=q["question_text"],
        context=q.get("context"),
        origin=q["origin"],
        category=q.get("category"),
        research_area=q.get("research_area"),
    )


def session_to_response(s: dict) -> ResearchSession:
    brands = json.loads(
        s["brands"]) if isinstance(
        s["brands"],
        str) else s["brands"]
    personas = [persona_from_db(p) for p in s.get("personas", [])]
    questions = [question_from_db(q) for q in s.get("questions", [])]

    runs = []
    responses = []
    analysis = None

    if s.get("runs"):
        sorted_runs = sorted(s["runs"], key=lambda r: r["started_at"])
        for run in sorted_runs:
            run_responses = [
                QueryResponse(
                    id=r["id"],
                    question_id=r["question_id"],
                    persona_id=r["persona_id"],
                    response_text=r["response_text"],
                    model_name=r["model_name"],
                    timestamp=r["timestamp"],
                    structured_data=json.loads(r["structured_data"]) if r.get("structured_data") and isinstance(r["structured_data"], str) else r.get("structured_data"),
                    response_type=r.get("response_type", "recall"),
                    iteration=r.get("iteration", 1),
                ) for r in run.get(
                    "responses",
                    [])]
            run_analysis = [
                AnalysisResult(
                    brand=a["brand"],
                    total_mentions=a["total_mentions"],
                    recommendation_count=a["recommendation_count"],
                    first_mention_count=a["first_mention_count"],
                    avg_sentiment_score=a["avg_sentiment_score"],
                    share_of_voice=a["share_of_voice"],
                    persona_affinity=json.loads(
                        a["persona_affinity"]) if isinstance(
                        a["persona_affinity"],
                        str) else a["persona_affinity"],
                    model_name=a["model_name"],
                    topic_scores=json.loads(
                        a["topic_scores"]) if a.get("topic_scores") and isinstance(
                        a["topic_scores"],
                        str) else a.get("topic_scores"),
                ) for a in run.get(
                    "analysis_results",
                    [])] if run.get("analysis_results") else None

            models_used = json.loads(
                run["models_used"]) if isinstance(
                run["models_used"],
                str) else run["models_used"]

            # Parse statistical results if present
            run_stats = None
            if run.get("statistical_results"):
                run_stats = [
                    StatisticalResult(
                        brand=sr["brand"],
                        model_name=sr["model_name"],
                        mention_frequency=sr.get("mention_frequency", 0),
                        avg_rank=sr.get("avg_rank", 0),
                        top3_rate=sr.get("top3_rate", 0),
                        first_mention_rate=sr.get("first_mention_rate", 0),
                        recommendation_rate=sr.get("recommendation_rate", 0),
                        mention_frequency_ci=[sr.get("mention_frequency_ci_low", 0), sr.get("mention_frequency_ci_high", 0)],
                        avg_rank_ci=[sr.get("avg_rank_ci_low", 0), sr.get("avg_rank_ci_high", 0)],
                        top3_rate_ci=[sr.get("top3_rate_ci_low", 0), sr.get("top3_rate_ci_high", 0)],
                        avg_sentiment_score=sr.get("avg_sentiment_score", 0),
                        sentiment_ci=[sr.get("sentiment_ci_low", 0), sr.get("sentiment_ci_high", 0)],
                        recommendation_strength=sr.get("recommendation_strength", 0),
                        recommendation_strength_ci=[sr.get("recommendation_strength_ci_low", 0), sr.get("recommendation_strength_ci_high", 0)],
                        total_iterations=sr.get("total_iterations", 1),
                        total_mentions=sr.get("total_mentions", 0),
                        share_of_voice=sr.get("share_of_voice", 0),
                        recommendation_count=sr.get("recommendation_count", 0) if sr.get("recommendation_count") else 0,
                        first_mention_count=sr.get("first_mention_count", 0) if sr.get("first_mention_count") else 0,
                        persona_affinity=json.loads(sr["persona_affinity"]) if sr.get("persona_affinity") and isinstance(sr["persona_affinity"], str) else sr.get("persona_affinity", {}),
                    ) for sr in run["statistical_results"]
                ]

            runs.append(
                ResearchRun(
                    id=run["id"],
                    session_id=run["session_id"],
                    started_at=run["started_at"],
                    completed_at=run.get("completed_at"),
                    status=run["status"],
                    models_used=models_used,
                    iterations_per_question=run.get("iterations_per_question", 1),
                    temperature=run.get("temperature", 0.7),
                    responses=run_responses,
                    analysis=run_analysis,
                    statistical_results=run_stats,
                ))

        # Use latest run's responses, and latest analyzed run's analysis
        latest = runs[-1]
        responses = latest.responses
        for r in reversed(runs):
            if r.analysis:
                analysis = r.analysis
                break

    research_areas = json.loads(
        s.get("research_areas") or "[]") if isinstance(
        s.get("research_areas"),
        str) else s.get(
            "research_areas",
        [])

    return ResearchSession(
        id=s["id"],
        setup=ResearchSetup(
            category=s["category"], brands=brands,
            market_context=s["market_context"],
            questions_per_persona=s["questions_per_persona"],
            research_areas=research_areas,
            primary_brand=s.get("primary_brand"),
            language=s.get("language") or "English",
        ),
        personas=personas, questions=questions,
        runs=runs, responses=responses, analysis=analysis,
        created_at=s["created_at"], status=s["status"],
        share_token=s.get("share_token"),
    )


# ---- Health ----

@app.get("/")
async def root():
    return {"message": "BrandTracker API", "version": "2.0.0"}


# ---- AI Models ----

@app.get("/api/models")
async def list_models():
    return get_available_models()


# ---- Persona CRUD ----

@app.get("/api/personas", response_model=List[Persona])
async def list_personas(
        category: Optional[str] = None,
        supabase: Client = Depends(get_supabase)):
    personas = crud.list_personas(supabase, category=category)
    return [persona_from_db(p) for p in personas]


@app.post("/api/personas", response_model=Persona)
async def create_persona_endpoint(
        data: PersonaCreate,
        supabase: Client = Depends(get_supabase)):
    p = crud.create_persona(supabase, origin="custom", **data.model_dump())
    return persona_from_db(p)


@app.put("/api/personas/{persona_id}", response_model=Persona)
async def update_persona(
        persona_id: str,
        data: PersonaUpdate,
        supabase: Client = Depends(get_supabase)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    p = crud.update_persona(supabase, persona_id, updates)
    if not p:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona_from_db(p)


@app.delete("/api/personas/{persona_id}")
async def delete_persona(
        persona_id: str,
        supabase: Client = Depends(get_supabase)):
    if not crud.delete_persona(supabase, persona_id):
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"message": "Persona deleted"}


# ---- Question CRUD ----

@app.get("/api/questions", response_model=List[Question])
async def list_questions(
        persona_id: Optional[str] = None,
        category: Optional[str] = None,
        supabase: Client = Depends(get_supabase)):
    questions = crud.list_questions(
        supabase,
        persona_id=persona_id,
        category=category)
    return [question_from_db(q) for q in questions]


@app.post("/api/questions", response_model=Question)
async def create_question_endpoint(
        data: QuestionCreate,
        supabase: Client = Depends(get_supabase)):
    q = crud.create_question(supabase, origin="custom", **data.model_dump())
    return question_from_db(q)


@app.put("/api/questions/{question_id}", response_model=Question)
async def update_question(
        question_id: str,
        data: QuestionUpdate,
        supabase: Client = Depends(get_supabase)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    q = crud.update_question(supabase, question_id, updates)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return question_from_db(q)


@app.delete("/api/questions/{question_id}")
async def delete_question(
        question_id: str,
        supabase: Client = Depends(get_supabase)):
    if not crud.delete_question(supabase, question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question deleted"}


# ---- Session Management ----

@app.get("/api/sessions")
async def list_sessions(
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    sessions = crud.list_sessions(supabase, user_id=user_id)
    return [{"id": s["id"], "category": s["category"], "brands": json.loads(
        s["brands"]) if isinstance(s["brands"], str) else s["brands"], "status": s["status"], "created_at": s["created_at"]} for s in sessions]


@app.post("/api/sessions", response_model=ResearchSession)
async def create_session(
        setup: ResearchSetup,
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    s = crud.create_session(
        supabase,
        category=setup.category,
        brands=setup.brands,
        market_context=setup.market_context,
        questions_per_persona=setup.questions_per_persona,
        research_areas=setup.research_areas,
        primary_brand=setup.primary_brand,
        language=setup.language,
        user_id=user_id,
    )
    s = crud.get_session(supabase, s["id"], user_id=user_id)
    return session_to_response(s)


@app.put("/api/sessions/{session_id}", response_model=ResearchSession)
async def update_session(
        session_id: str,
        setup: ResearchSetup,
        reset_research: bool = False,
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    updates = {
        "category": setup.category,
        "brands": setup.brands,
        "market_context": setup.market_context,
        "questions_per_persona": setup.questions_per_persona,
        "research_areas": setup.research_areas,
        "primary_brand": setup.primary_brand,
        "language": setup.language,
    }
    s = crud.update_session(supabase, session_id, updates, user_id=user_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if reset_research:
        crud.delete_session_runs(supabase, session_id)
        has_questions = bool(s.get("questions"))
        has_personas = bool(s.get("personas"))
        new_status = "questions_ready" if has_questions else "personas_ready" if has_personas else "setup"
        crud.update_session_status(supabase, session_id, new_status)
        s = crud.get_session(supabase, session_id, user_id=user_id)
    return session_to_response(s)


@app.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(
        session_id: str,
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    if not crud.delete_session(supabase, session_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}


@app.get("/api/sessions/{session_id}", response_model=ResearchSession)
async def get_session(
        session_id: str,
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    s = crud.get_session(supabase, session_id, user_id=user_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_to_response(s)


# ---- Session Sharing ----

@app.post("/api/sessions/{session_id}/share")
async def create_share_link(
        session_id: str,
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    token = crud.create_share_token(supabase, session_id, user_id)
    if not token:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"share_token": token}


@app.delete("/api/sessions/{session_id}/share")
async def revoke_share_link(
        session_id: str,
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    if not crud.revoke_share_token(supabase, session_id, user_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Share link revoked"}


@app.get("/api/shared/{share_token}", response_model=ResearchSession)
async def get_shared_session(
        share_token: str,
        supabase: Client = Depends(get_supabase)):
    """Public endpoint — no authentication required."""
    s = crud.get_session_by_share_token(supabase, share_token)
    if not s:
        raise HTTPException(status_code=404, detail="Shared session not found")
    return session_to_response(s)


# ---- Delete Research Runs ----

@app.delete("/api/sessions/{session_id}/runs")
async def delete_all_runs(
        session_id: str,
        supabase: Client = Depends(get_supabase),
        user_id: Optional[str] = Depends(get_current_user)):
    s = crud.get_session(supabase, session_id, user_id=user_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    count = crud.delete_session_runs(supabase, session_id)
    has_questions = bool(s.get("questions"))
    has_personas = bool(s.get("personas"))
    new_status = "questions_ready" if has_questions else "personas_ready" if has_personas else "setup"
    crud.update_session_status(supabase, session_id, new_status)
    return {"deleted": count, "new_status": new_status}


# ---- Generation Progress ----

@app.get("/api/generation/{task_id}/progress")
async def get_generation_progress(
        task_id: str,
        supabase: Client = Depends(get_supabase)):
    progress = generation_progress.get(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    result = {**progress}
    if progress["status"] in ("completed", "error"):
        if progress["status"] == "completed" and progress.get("session_id"):
            s = crud.get_session(supabase, progress["session_id"])
            result["session"] = session_to_response(
                s).model_dump() if s else None
        del generation_progress[task_id]
    return result


# ---- Session: Generate & Manage Personas ----

async def _generate_personas_background(session_id: str, task_id: str):
    generation_progress[task_id] = {
        "current": 0,
        "total": 2,
        "status": "running",
        "message": "Generating personas with AI...",
        "session_id": session_id}
    try:
        supabase = get_supabase()
        s = crud.get_session(supabase, session_id)
        language = s.get('language') or 'English'

        ai_personas = await claude_service.generate_personas(
            category=s["category"], market_context=s["market_context"], count=5,
            language=language,
        )
        generation_progress[task_id].update(
            {"current": 1, "message": "Saving personas..."})

        persona_ids = []
        for p in ai_personas:
            db_persona = crud.create_persona(
                supabase,
                name=p.name,
                archetype=p.archetype.value,
                description=p.description,
                age_range=p.age_range,
                occupation=p.occupation,
                tech_savviness=p.tech_savviness,
                price_sensitivity=p.price_sensitivity,
                brand_loyalty=p.brand_loyalty,
                key_priorities=p.key_priorities,
                origin="ai_generated",
                category=s["category"],
            )
            persona_ids.append(db_persona["id"])

        crud.add_personas_to_session(supabase, session_id, persona_ids)
        crud.update_session_status(supabase, session_id, "personas_ready")

        generation_progress[task_id].update(
            {"current": 2, "status": "completed", "message": "Done"})
    except Exception as e:
        supabase = get_supabase()
        crud.update_session_status(supabase, session_id, "error")
        generation_progress[task_id].update(
            {"status": "error", "message": str(e)})
        logger.error(f"Persona generation error: {e}")


@app.post("/api/sessions/{session_id}/generate-personas")
async def generate_personas(session_id: str,
                            supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    crud.update_session_status(supabase, session_id, "generating_personas")

    from uuid import uuid4
    task_id = str(uuid4())
    asyncio.create_task(_generate_personas_background(session_id, task_id))
    return {"task_id": task_id, "status": "started"}


@app.put("/api/sessions/{session_id}/personas", response_model=List[Persona])
async def set_personas(
        session_id: str,
        data: SessionPersonaIds,
        supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    crud.set_session_personas(supabase, session_id, data.persona_ids)
    s = crud.get_session(supabase, session_id)
    return [persona_from_db(p) for p in s.get("personas", [])]


# ---- Session: Generate & Manage Questions ----

async def _generate_questions_background(session_id: str, task_id: str):
    try:
        supabase = get_supabase()
        s = crud.get_session(supabase, session_id)
        personas = [persona_from_db(p) for p in s.get("personas", [])]
        research_areas = json.loads(
            s.get("research_areas")) if s.get("research_areas") and isinstance(
            s.get("research_areas"), str) else []
        language = s.get('language') or 'English'

        total = len(personas)
        generation_progress[task_id] = {
            "current": 0,
            "total": total,
            "status": "running",
            "message": f"Generating questions for {personas[0].name}...",
            "session_id": session_id}

        question_ids = []
        for i, persona in enumerate(personas):
            generation_progress[task_id].update(
                {"current": i, "message": f"Generating questions for {persona.name}..."})

            ai_questions = await claude_service.generate_questions(
                persona=persona, category=s["category"],
                market_context=s["market_context"], count=s["questions_per_persona"],
                research_areas=research_areas if research_areas else None,
                language=language,
            )

            supabase = get_supabase()
            for q in ai_questions:
                db_q = crud.create_question(
                    supabase,
                    persona_id=persona.id,
                    question_text=q.question_text,
                    context=q.context,
                    origin="ai_generated",
                    category=s["category"],
                    research_area=q.research_area,
                )
                question_ids.append(db_q["id"])

        supabase = get_supabase()
        crud.set_session_questions(supabase, session_id, question_ids)
        crud.update_session_status(supabase, session_id, "questions_ready")

        generation_progress[task_id].update(
            {"current": total, "status": "completed", "message": "Done"})
    except Exception as e:
        supabase = get_supabase()
        crud.update_session_status(supabase, session_id, "error")
        generation_progress[task_id].update(
            {"status": "error", "message": str(e)})
        logger.error(f"Question generation error: {e}")


@app.post("/api/sessions/{session_id}/generate-questions")
async def generate_questions(session_id: str,
                             supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if not s.get("personas"):
        raise HTTPException(status_code=400, detail="Generate personas first")

    from uuid import uuid4
    task_id = str(uuid4())
    asyncio.create_task(_generate_questions_background(session_id, task_id))
    return {
        "task_id": task_id,
        "status": "started",
        "total_personas": len(
            s.get("personas", []))}


@app.put("/api/sessions/{session_id}/questions", response_model=List[Question])
async def set_questions(
        session_id: str,
        data: SessionQuestionIds,
        supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    crud.set_session_questions(supabase, session_id, data.question_ids)
    s = crud.get_session(supabase, session_id)
    return [question_from_db(q) for q in s.get("questions", [])]


# ---- Research Runs ----

async def _run_research_background(
        session_id: str,
        run_id: str,
        questions,
        personas,
        category: str,
        brands: List[str],
        models: List[str],
        iterations: int = 1,
        temperature: float = 0.7,
        language: str = "English"):
    """Background task that processes all questions across all selected models in parallel.

    With iterations > 1, each question is asked multiple times for statistical analysis.
    """
    total = len(questions) * len(models) * iterations
    run_progress[run_id] = {"current": 0, "total": total, "status": "running"}
    progress_lock = asyncio.Lock()
    current_step = 0

    sem = asyncio.Semaphore(5)  # max 5 concurrent API calls

    def _build_persona_context(persona) -> str:
        """Build a persona context string for the AI prompt."""
        lines = ["About the person asking:"]
        lines.append(f"- Name: {persona.name}")
        if persona.description:
            lines.append(f"- Description: {persona.description}")
        if persona.archetype:
            lines.append(f"- Consumer type: {persona.archetype}")
        if persona.age_range:
            lines.append(f"- Age range: {persona.age_range}")
        if persona.occupation:
            lines.append(f"- Occupation: {persona.occupation}")
        if persona.key_priorities:
            priorities = persona.key_priorities if isinstance(persona.key_priorities, list) else [persona.key_priorities]
            lines.append(f"- Key priorities: {', '.join(priorities)}")
        if persona.tech_savviness:
            lines.append(f"- Tech savviness: {persona.tech_savviness}")
        if persona.price_sensitivity:
            lines.append(f"- Price sensitivity: {persona.price_sensitivity}")
        if persona.brand_loyalty:
            lines.append(f"- Brand loyalty: {persona.brand_loyalty}")
        return "\n".join(lines)

    async def do_one(model_name: str, question, persona, iteration: int):
        nonlocal current_step
        service = get_service(model_name)
        question_type = getattr(question, 'question_type', None) or "recall"
        persona_ctx = _build_persona_context(persona)
        async with sem:
            logger.info(
                f"Run {run_id} [{service.display_name}] iter={iteration}: {question.question_text[:60]}...")
            result = await service.ask_question(
                question_text=question.question_text,
                persona_name=persona.name,
                category=category,
                language=language,
                question_type=question_type,
                brands=brands,
                temperature=temperature,
                iteration=iteration,
                persona_context=persona_ctx,
            )
        # Store response with structured data
        supabase = get_supabase()
        structured_data = result.get("structured_data")
        reasoning = result.get("reasoning", "")
        raw_text = result.get("raw_text", reasoning)
        # Use reasoning as display text, fall back to raw_text
        response_text = reasoning if reasoning else raw_text

        # Serialize prompt variation metadata for reproducibility
        prompt_variation = result.get("prompt_variation")
        prompt_variation_str = json.dumps(prompt_variation) if prompt_variation else None

        crud.add_response(
            supabase,
            run_id,
            question.id,
            persona.id,
            response_text,
            model_name=model_name,
            structured_data=structured_data,
            response_type=question_type,
            iteration=iteration,
            prompt_variation=prompt_variation_str,
        )
        async with progress_lock:
            current_step += 1
            run_progress[run_id]["current"] = current_step

    try:
        tasks = []
        for model_name in models:
            for question in questions:
                persona = next(
                    (p for p in personas if p.id == question.persona_id), None)
                if not persona:
                    logger.warning(f"No persona for question {question.id}")
                    async with progress_lock:
                        current_step += iterations
                        run_progress[run_id]["current"] = current_step
                    continue
                for iteration in range(1, iterations + 1):
                    tasks.append(do_one(model_name, question, persona, iteration))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Log any individual failures but don't fail the whole run
        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            for e in errors:
                logger.error(f"Research query error in run {run_id}: {e}")

        # Auto-compute statistical results if we have structured data
        supabase = get_supabase()
        try:
            run_data = crud.get_run(supabase, run_id)
            if run_data and run_data.get("responses"):
                # Check if any responses have structured data
                has_structured = any(r.get("structured_data") for r in run_data["responses"])
                if has_structured:
                    # Compute statistics per model
                    for model_name in models:
                        model_responses = [
                            {
                                "structured_data": json.loads(r["structured_data"]) if isinstance(r.get("structured_data"), str) else r.get("structured_data"),
                                "response_type": r.get("response_type", "recall"),
                                "iteration": r.get("iteration", 1),
                                "persona_id": r.get("persona_id", ""),
                            }
                            for r in run_data["responses"]
                            if r["model_name"] == model_name and r.get("structured_data")
                        ]
                        if model_responses:
                            persona_dicts = [{"id": p.id, "name": p.name} for p in personas]
                            stats = compute_brand_statistics(
                                model_responses, brands, total_iterations=len(questions) * iterations,
                                personas=persona_dicts,
                            )
                            crud.add_statistical_results(supabase, run_id, stats, model_name=model_name)
                            logger.info(f"Computed statistical results for {model_name}: {len(stats)} brands")
        except Exception as stats_err:
            logger.error(f"Error computing statistics for run {run_id}: {stats_err}")

        crud.complete_run(supabase, run_id)
        crud.update_session_status(
            supabase, session_id, "research_complete")
        run_progress[run_id]["status"] = "completed"
        logger.info(
            f"Run {run_id} complete ({len(models)} models, {iterations} iterations, {total} total queries, {len(errors)} errors)")

    except Exception as e:
        supabase = get_supabase()
        crud.fail_run(supabase, run_id)
        crud.update_session_status(supabase, session_id, "error")
        run_progress[run_id]["status"] = "error"
        run_progress[run_id]["error"] = str(e)
        logger.error(f"Research error: {str(e)}")


class RunRequest(PydanticBaseModel):
    models: Optional[List[str]] = None
    iterations_per_question: int = 1
    temperature: float = 0.7


@app.post("/api/sessions/{session_id}/runs")
async def create_run(
        session_id: str,
        body: RunRequest = RunRequest(),
        supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if not s.get("questions"):
        raise HTTPException(status_code=400, detail="Generate questions first")

    # Determine which models to use
    available = [m["name"] for m in get_available_models() if m["available"]]
    selected_models = body.models if body.models else available
    # Filter to only available models
    selected_models = [m for m in selected_models if m in available]
    if not selected_models:
        raise HTTPException(
            status_code=400,
            detail="No AI models available. Check API keys in .env")

    iterations = max(1, min(body.iterations_per_question, 50))  # Clamp 1-50
    temperature = max(0.0, min(body.temperature, 1.5))

    crud.update_session_status(supabase, session_id, "researching")
    run = crud.create_run(
        supabase, session_id, models_used=selected_models,
        iterations_per_question=iterations, temperature=temperature,
    )

    questions = [question_from_db(q) for q in s.get("questions", [])]
    personas = [persona_from_db(p) for p in s.get("personas", [])]

    brands = json.loads(s["brands"]) if isinstance(s["brands"], str) else s["brands"]

    total = len(questions) * len(selected_models) * iterations
    language = s.get('language') or 'English'

    # Launch in background — return immediately
    asyncio.create_task(
        _run_research_background(
            session_id,
            run["id"],
            questions,
            personas,
            s["category"],
            brands,
            selected_models,
            iterations=iterations,
            temperature=temperature,
            language=language))

    return {
        "run_id": run["id"],
        "total_questions": total,
        "iterations_per_question": iterations,
        "status": "started",
        "models": selected_models}


@app.get("/api/sessions/{session_id}/runs/{run_id}/progress")
async def get_run_progress(
        session_id: str,
        run_id: str,
        supabase: Client = Depends(get_supabase)):
    """Poll this endpoint to track research progress."""
    progress = run_progress.get(run_id)
    if progress:
        result = {**progress}
        # If completed, return full session and clean up
        if progress["status"] in ("completed", "error"):
            if progress["status"] == "completed":
                s = crud.get_session(supabase, session_id)
                result["session"] = session_to_response(
                    s).model_dump() if s else None
            # Clean up after client reads the result
            del run_progress[run_id]
        return result

    # Progress not in memory — check DB (run may have completed before we
    # started tracking)
    runs = crud.list_runs(supabase, session_id)
    run = next((r for r in runs if r["id"] == run_id), None)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run["status"] == "completed":
        s = crud.get_session(supabase, session_id)
        return {
            "current": len(run["responses"]), "total": len(run["responses"]),
            "status": "completed",
            "session": session_to_response(s).model_dump() if s else None,
        }
    return {"current": 0, "total": 0, "status": run["status"]}


@app.get("/api/sessions/{session_id}/runs")
async def list_runs(session_id: str, supabase: Client = Depends(get_supabase)):
    runs = crud.list_runs(supabase, session_id)
    return [{"id": r["id"],
             "started_at": r["started_at"],
             "completed_at": r.get("completed_at"),
             "status": r["status"]} for r in runs]


# ---- Analysis ----

@app.post("/api/sessions/{session_id}/runs/{run_id}/analyze",
          response_model=ResearchSession)
async def analyze_run(
        session_id: str,
        run_id: str,
        supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    run = crud.get_run(supabase, run_id)
    if not run or run["session_id"] != session_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if not run.get("responses"):
        raise HTTPException(status_code=400, detail="No responses to analyze")

    crud.update_session_status(supabase, session_id, "analyzing")

    try:
        personas = [persona_from_db(p) for p in s.get("personas", [])]
        questions = [question_from_db(q) for q in s.get("questions", [])]
        brands = json.loads(
            s["brands"]) if isinstance(
            s["brands"],
            str) else s["brands"]

        raw_areas = s.get("research_areas")
        if isinstance(raw_areas, str):
            research_areas = json.loads(raw_areas) if raw_areas else []
        elif isinstance(raw_areas, list):
            research_areas = raw_areas
        else:
            research_areas = []

        # Check if run has statistical results (structured path)
        has_stats = bool(run.get("statistical_results"))

        # Group responses by model
        models_used = json.loads(
            run["models_used"]) if isinstance(
            run["models_used"],
            str) else run["models_used"]

        # Build question_id -> research_area mapping for topic_scores
        question_area_map = {}
        for q in questions:
            if q.research_area:
                question_area_map[q.id] = q.research_area

        if has_stats:
            # Compute per-model topic_scores from raw responses
            def _compute_topic_scores(responses, model_name, brand_list, area_map, areas):
                """Compute {brand: {area: {"score": float, "mentions": int}}} from responses."""
                if not areas or not area_map:
                    return None
                # Count mentions per brand per area
                area_responses = {a: 0 for a in areas}  # total responses per area
                brand_area_mentions = {b: {a: 0 for a in areas} for b in brand_list}
                brand_lower_map = {b.lower(): b for b in brand_list}

                for r in responses:
                    if r["model_name"] != model_name:
                        continue
                    qid = r.get("question_id", "")
                    area = area_map.get(qid)
                    if not area or area not in area_responses:
                        continue
                    area_responses[area] += 1

                    structured = r.get("structured_data")
                    if isinstance(structured, str):
                        try:
                            structured = json.loads(structured)
                        except (json.JSONDecodeError, TypeError):
                            continue
                    if not structured:
                        continue

                    # Extract mentioned brands from structured data
                    items = structured.get("recommendations", []) or structured.get("rankings", [])
                    if items:
                        for item in items:
                            bname = item.get("brand", "").strip().lower()
                            canonical = brand_lower_map.get(bname)
                            if not canonical:
                                for bl, bc in brand_lower_map.items():
                                    if bl in bname or bname in bl:
                                        canonical = bc
                                        break
                            if canonical:
                                brand_area_mentions[canonical][area] += 1
                    elif structured.get("chosen_brand"):
                        chosen = structured["chosen_brand"].strip().lower()
                        canonical = brand_lower_map.get(chosen)
                        if not canonical:
                            for bl, bc in brand_lower_map.items():
                                if bl in chosen or chosen in bl:
                                    canonical = bc
                                    break
                        if canonical:
                            brand_area_mentions[canonical][area] += 1

                # Compute scores (mention rate per area)
                result = {}
                for brand in brand_list:
                    result[brand] = {}
                    for area in areas:
                        total = area_responses[area]
                        mentions = brand_area_mentions[brand][area]
                        score = mentions / total if total > 0 else 0.0
                        result[brand][area] = {"score": round(score, 3), "mentions": mentions}
                return result

            # New path: use pre-computed statistical results (deterministic)
            for model_name in models_used:
                model_stats = [
                    sr for sr in run["statistical_results"]
                    if sr["model_name"] == model_name
                ]
                if not model_stats:
                    continue
                topic_scores = _compute_topic_scores(
                    run.get("responses", []), model_name, brands,
                    question_area_map, research_areas if research_areas else [],
                )
                analysis = claude_service.analyze_structured_responses(
                    statistical_results=model_stats,
                    brands=brands,
                    research_areas=research_areas if research_areas else None,
                    topic_scores=topic_scores,
                )
                crud.add_analysis_results(
                    supabase, run_id,
                    [{"brand": a.brand,
                      "total_mentions": a.total_mentions,
                      "recommendation_count": a.recommendation_count,
                      "first_mention_count": a.first_mention_count,
                      "avg_sentiment_score": a.avg_sentiment_score,
                      "share_of_voice": a.share_of_voice,
                      "persona_affinity": a.persona_affinity,
                      "topic_scores": a.topic_scores} for a in analysis],
                    model_name=model_name)
        else:
            # Legacy path: send free-text responses to Claude for interpretation
            responses_by_model: Dict[str, list] = {m: [] for m in models_used}
            for r in run["responses"]:
                question = next(
                    (q for q in questions if q.id == r["question_id"]), None)
                persona = next((p for p in personas if p.id == r["persona_id"]), None)
                if question and persona:
                    model = r["model_name"] if r["model_name"] in responses_by_model else models_used[0]
                    responses_by_model.setdefault(model, []).append({
                        "persona_id": persona.id, "persona_name": persona.name,
                        "question": question.question_text, "response": r["response_text"],
                    })

            for model_name, responses_data in responses_by_model.items():
                if not responses_data:
                    continue
                language = s.get('language') or 'English'
                analysis = await claude_service.analyze_responses(
                    responses=responses_data, brands=brands, category=s["category"],
                    primary_brand=s.get("primary_brand"),
                    research_areas=research_areas if research_areas else None,
                    language=language,
                )
                crud.add_analysis_results(
                    supabase, run_id,
                    [{"brand": a.brand,
                      "total_mentions": a.total_mentions,
                      "recommendation_count": a.recommendation_count,
                      "first_mention_count": a.first_mention_count,
                      "avg_sentiment_score": a.avg_sentiment_score,
                      "share_of_voice": a.share_of_voice,
                      "persona_affinity": a.persona_affinity,
                      "topic_scores": a.topic_scores} for a in analysis],
                    model_name=model_name)

        crud.update_session_status(supabase, session_id, "completed")
        # Re-fetch session to get updated analysis_results
        s = crud.get_session(supabase, session_id)
        return session_to_response(s)

    except Exception as e:
        crud.update_session_status(supabase, session_id, "error")
        raise HTTPException(status_code=500,
                            detail=f"Error during analysis: {str(e)}")


# ---- Contextual Relevance Matrix ----

@app.get("/api/sessions/{session_id}/runs/{run_id}/contextual_relevance")
async def get_contextual_relevance(
        session_id: str,
        run_id: str,
        supabase: Client = Depends(get_supabase)):
    """Returns brand × persona × research_area mention matrix from a run's responses.

    This reveals which buying contexts (persona + topic) trigger each brand,
    showing the 'mental slot' the AI has assigned to each brand.
    """
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    run = crud.get_run(supabase, run_id)
    if not run or run["session_id"] != session_id:
        raise HTTPException(status_code=404, detail="Run not found")

    brands = json.loads(s["brands"]) if isinstance(s["brands"], str) else s["brands"]
    brand_lower_map = {b.lower(): b for b in brands}

    personas = {p["id"]: p["name"] for p in s.get("personas", [])}
    questions = {q["id"]: q for q in s.get("questions", [])}

    raw_areas = s.get("research_areas")
    if isinstance(raw_areas, str):
        research_areas = json.loads(raw_areas) if raw_areas else []
    elif isinstance(raw_areas, list):
        research_areas = raw_areas
    else:
        research_areas = []

    # Build matrices: brand × persona, brand × research_area
    # Count total responses per context and mentions per brand per context
    persona_totals = {}   # persona_id -> total responses
    persona_brand = {}    # (persona_id, brand) -> mention count
    area_totals = {}      # area -> total responses
    area_brand = {}       # (area, brand) -> mention count

    for r in run.get("responses", []):
        pid = r.get("persona_id", "")
        qid = r.get("question_id", "")
        q = questions.get(qid, {})
        area = q.get("research_area") if isinstance(q, dict) else None

        persona_totals[pid] = persona_totals.get(pid, 0) + 1
        if area:
            area_totals[area] = area_totals.get(area, 0) + 1

        # Extract mentioned brands from structured data
        structured = r.get("structured_data")
        if isinstance(structured, str):
            try:
                structured = json.loads(structured)
            except (json.JSONDecodeError, TypeError):
                structured = None
        if not structured:
            continue

        mentioned_brands = set()
        items = structured.get("recommendations", []) or structured.get("rankings", [])
        if items:
            for item in items:
                bname = item.get("brand", "").strip().lower()
                canonical = brand_lower_map.get(bname)
                if not canonical:
                    for bl, bc in brand_lower_map.items():
                        if bl in bname or bname in bl:
                            canonical = bc
                            break
                if canonical:
                    mentioned_brands.add(canonical)
        elif structured.get("chosen_brand"):
            chosen = structured["chosen_brand"].strip().lower()
            canonical = brand_lower_map.get(chosen)
            if not canonical:
                for bl, bc in brand_lower_map.items():
                    if bl in chosen or chosen in bl:
                        canonical = bc
                        break
            if canonical:
                mentioned_brands.add(canonical)

        for brand in mentioned_brands:
            persona_brand[(pid, brand)] = persona_brand.get((pid, brand), 0) + 1
            if area:
                area_brand[(area, brand)] = area_brand.get((area, brand), 0) + 1

    # Build response matrices as mention rates
    by_persona = {}
    for pid, pname in personas.items():
        total = persona_totals.get(pid, 0)
        by_persona[pname] = {
            brand: round(persona_brand.get((pid, brand), 0) / total, 3) if total > 0 else 0.0
            for brand in brands
        }

    by_area = {}
    for area in research_areas:
        total = area_totals.get(area, 0)
        by_area[area] = {
            brand: round(area_brand.get((area, brand), 0) / total, 3) if total > 0 else 0.0
            for brand in brands
        }

    return {
        "brands": brands,
        "by_persona": by_persona,
        "by_research_area": by_area,
        "personas": list(personas.values()),
        "research_areas": research_areas,
    }


# ---- Comparison ----

@app.get("/api/sessions/{session_id}/compare")
async def compare_runs(
        session_id: str,
        supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    brands = json.loads(s["brands"]) if isinstance(s["brands"], str) else s["brands"]
    comparison = {brand: [] for brand in brands}
    for run in s.get("runs", []):
        if not run.get("analysis_results"):
            continue
        for a in run["analysis_results"]:
            if a["brand"] in comparison:
                comparison[a["brand"]].append({
                    "run_id": run["id"], "timestamp": run["started_at"],
                    "model_name": a["model_name"],
                    "total_mentions": a["total_mentions"], "recommendation_count": a["recommendation_count"],
                    "avg_sentiment_score": a["avg_sentiment_score"], "share_of_voice": a["share_of_voice"],
                })
    return comparison


# ---- Change Detection ----

@app.get("/api/sessions/{session_id}/change_detection")
async def change_detection(
        session_id: str,
        run_a: str,
        run_b: str,
        supabase: Client = Depends(get_supabase)):
    """Compare two runs and flag statistically significant metric changes.

    Query params:
        run_a: ID of the baseline run (earlier)
        run_b: ID of the comparison run (later)

    Returns per-brand z-test results on key proportion metrics.
    """
    s = crud.get_session(supabase, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    stats_a = crud.get_statistical_results(supabase, run_a)
    stats_b = crud.get_statistical_results(supabase, run_b)

    if not stats_a or not stats_b:
        raise HTTPException(status_code=400, detail="Both runs must have statistical results")

    changes = compute_change_detection(stats_a, stats_b)
    return {"run_a": run_a, "run_b": run_b, "changes": changes}


# ---- Backward compat: old endpoint paths still work ----

@app.post("/api/sessions/{session_id}/personas")
async def generate_personas_compat(
        session_id: str,
        supabase: Client = Depends(get_supabase)):
    return await generate_personas(session_id, supabase)


@app.post("/api/sessions/{session_id}/questions")
async def generate_questions_compat(
        session_id: str,
        supabase: Client = Depends(get_supabase)):
    return await generate_questions(session_id, supabase)


@app.post("/api/sessions/{session_id}/research",
          response_model=ResearchSession)
async def run_research_compat(session_id: str,
                              supabase: Client = Depends(get_supabase)):
    return await create_run(session_id, supabase)


@app.post("/api/sessions/{session_id}/analyze", response_model=ResearchSession)
async def analyze_compat(
        session_id: str,
        supabase: Client = Depends(get_supabase)):
    s = crud.get_session(supabase, session_id)
    if not s or not s.get("runs"):
        raise HTTPException(status_code=400, detail="Run research first")
    latest_run = s["runs"][0]
    return await analyze_run(session_id, latest_run["id"], supabase)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

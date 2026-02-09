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
    QueryResponse, AnalysisResult, ResearchRun,
    ResearchSession, SessionPersonaIds, SessionQuestionIds,
)
from claude_service import ClaudeService
from ai_service import get_available_models, get_service
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
            runs.append(
                ResearchRun(
                    id=run["id"],
                    session_id=run["session_id"],
                    started_at=run["started_at"],
                    completed_at=run.get("completed_at"),
                    status=run["status"],
                    models_used=models_used,
                    responses=run_responses,
                    analysis=run_analysis,
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
        models: List[str],
        language: str = "English"):
    """Background task that processes all questions across all selected models in parallel."""
    total = len(questions) * len(models)
    run_progress[run_id] = {"current": 0, "total": total, "status": "running"}
    progress_lock = asyncio.Lock()
    current_step = 0

    sem = asyncio.Semaphore(5)  # max 5 concurrent API calls

    async def do_one(model_name: str, question, persona):
        nonlocal current_step
        service = get_service(model_name)
        async with sem:
            logger.info(
                f"Run {run_id} [{service.display_name}]: {question.question_text[:60]}...")
            response_text = await service.ask_question(
                question_text=question.question_text,
                persona_name=persona.name,
                category=category,
                language=language,
            )
        # Each task gets its own DB session (AsyncSession is not thread-safe)
        supabase = get_supabase()
        crud.add_response(
            supabase,
            run_id,
            question.id,
            persona.id,
            response_text,
            model_name=model_name)
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
                        current_step += 1
                        run_progress[run_id]["current"] = current_step
                    continue
                tasks.append(do_one(model_name, question, persona))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Log any individual failures but don't fail the whole run
        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            for e in errors:
                logger.error(f"Research query error in run {run_id}: {e}")

        supabase = get_supabase()
        crud.complete_run(supabase, run_id)
        crud.update_session_status(
            supabase, session_id, "research_complete")
        run_progress[run_id]["status"] = "completed"
        logger.info(
            f"Run {run_id} complete ({len(models)} models, {total} total queries, {len(errors)} errors)")

    except Exception as e:
        supabase = get_supabase()
        crud.fail_run(supabase, run_id)
        crud.update_session_status(supabase, session_id, "error")
        run_progress[run_id]["status"] = "error"
        run_progress[run_id]["error"] = str(e)
        logger.error(f"Research error: {str(e)}")


class RunRequest(PydanticBaseModel):
    models: Optional[List[str]] = None


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

    crud.update_session_status(supabase, session_id, "researching")
    run = crud.create_run(supabase, session_id, models_used=selected_models)

    questions = [question_from_db(q) for q in s.get("questions", [])]
    personas = [persona_from_db(p) for p in s.get("personas", [])]
    total = len(questions) * len(selected_models)

    language = s.get('language') or 'English'

    # Launch in background — return immediately
    asyncio.create_task(
        _run_research_background(
            session_id,
            run["id"],
            questions,
            personas,
            s["category"],
            selected_models,
            language=language))

    return {
        "run_id": run["id"],
        "total_questions": total,
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

        research_areas = json.loads(
            s.get("research_areas")) if s.get("research_areas") and isinstance(
            s.get("research_areas"), str) else []

        # Group responses by model
        models_used = json.loads(
            run["models_used"]) if isinstance(
            run["models_used"],
            str) else run["models_used"]
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

        # Analyze each model's responses separately
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
            crud.add_analysis_results(supabase,
                                      run_id,
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

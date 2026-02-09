import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import List, Optional, Dict

from pydantic import BaseModel as PydanticBaseModel
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession

from database import init_db, get_db, async_session_factory
from models import (
    ResearchSetup, Persona, PersonaCreate, PersonaUpdate,
    Question, QuestionCreate, QuestionUpdate,
    QueryResponse, AnalysisResult, ResearchRun,
    ResearchSession, SessionPersonaIds, SessionQuestionIds,
)
from claude_service import ClaudeService
from ai_service import get_available_models, get_service
import crud

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialized")
    yield

app = FastAPI(title="BrandTracker API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.68.92:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

claude_service = ClaudeService()

# ---- Run progress tracking (in-memory) ----
run_progress: Dict[str, Dict] = {}  # run_id -> {current, total, status}


# ---- Helpers: DB model -> Pydantic ----

def persona_from_db(p) -> Persona:
    return Persona(
        id=p.id, name=p.name, archetype=p.archetype,
        description=p.description, age_range=p.age_range,
        occupation=p.occupation, tech_savviness=p.tech_savviness,
        price_sensitivity=p.price_sensitivity, brand_loyalty=p.brand_loyalty,
        key_priorities=json.loads(p.key_priorities) if isinstance(p.key_priorities, str) else p.key_priorities,
        origin=p.origin, category=p.category,
    )


def question_from_db(q) -> Question:
    return Question(
        id=q.id, persona_id=q.persona_id, question_text=q.question_text,
        context=q.context, origin=q.origin, category=q.category,
    )


def session_to_response(s) -> ResearchSession:
    brands = json.loads(s.brands) if isinstance(s.brands, str) else s.brands
    personas = [persona_from_db(p) for p in s.personas]
    questions = [question_from_db(q) for q in s.questions]

    runs = []
    responses = []
    analysis = None

    if s.runs:
        sorted_runs = sorted(s.runs, key=lambda r: r.started_at)
        for run in sorted_runs:
            run_responses = [
                QueryResponse(
                    id=r.id, question_id=r.question_id,
                    persona_id=r.persona_id, response_text=r.response_text,
                    model_name=r.model_name,
                    timestamp=r.timestamp,
                ) for r in run.responses
            ]
            run_analysis = [
                AnalysisResult(
                    brand=a.brand, total_mentions=a.total_mentions,
                    recommendation_count=a.recommendation_count,
                    first_mention_count=a.first_mention_count,
                    avg_sentiment_score=a.avg_sentiment_score,
                    share_of_voice=a.share_of_voice,
                    persona_affinity=json.loads(a.persona_affinity) if isinstance(a.persona_affinity, str) else a.persona_affinity,
                    model_name=a.model_name,
                ) for a in run.analysis_results
            ] if run.analysis_results else None

            models_used = json.loads(run.models_used) if isinstance(run.models_used, str) else run.models_used
            runs.append(ResearchRun(
                id=run.id, session_id=run.session_id,
                started_at=run.started_at, completed_at=run.completed_at,
                status=run.status, models_used=models_used,
                responses=run_responses, analysis=run_analysis,
            ))

        # Use latest run's responses, and latest analyzed run's analysis
        latest = runs[-1]
        responses = latest.responses
        for r in reversed(runs):
            if r.analysis:
                analysis = r.analysis
                break

    return ResearchSession(
        id=s.id,
        setup=ResearchSetup(
            category=s.category, brands=brands,
            market_context=s.market_context,
            questions_per_persona=s.questions_per_persona,
        ),
        personas=personas, questions=questions,
        runs=runs, responses=responses, analysis=analysis,
        created_at=s.created_at, status=s.status,
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
async def list_personas(category: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    personas = await crud.list_personas(db, category=category)
    return [persona_from_db(p) for p in personas]


@app.post("/api/personas", response_model=Persona)
async def create_persona_endpoint(data: PersonaCreate, db: AsyncSession = Depends(get_db)):
    p = await crud.create_persona(db, origin="custom", **data.model_dump())
    return persona_from_db(p)


@app.put("/api/personas/{persona_id}", response_model=Persona)
async def update_persona(persona_id: str, data: PersonaUpdate, db: AsyncSession = Depends(get_db)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    p = await crud.update_persona(db, persona_id, updates)
    if not p:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona_from_db(p)


@app.delete("/api/personas/{persona_id}")
async def delete_persona(persona_id: str, db: AsyncSession = Depends(get_db)):
    if not await crud.delete_persona(db, persona_id):
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"message": "Persona deleted"}


# ---- Question CRUD ----

@app.get("/api/questions", response_model=List[Question])
async def list_questions(persona_id: Optional[str] = None, category: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    questions = await crud.list_questions(db, persona_id=persona_id, category=category)
    return [question_from_db(q) for q in questions]


@app.post("/api/questions", response_model=Question)
async def create_question_endpoint(data: QuestionCreate, db: AsyncSession = Depends(get_db)):
    q = await crud.create_question(db, origin="custom", **data.model_dump())
    return question_from_db(q)


@app.put("/api/questions/{question_id}", response_model=Question)
async def update_question(question_id: str, data: QuestionUpdate, db: AsyncSession = Depends(get_db)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    q = await crud.update_question(db, question_id, updates)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return question_from_db(q)


@app.delete("/api/questions/{question_id}")
async def delete_question(question_id: str, db: AsyncSession = Depends(get_db)):
    if not await crud.delete_question(db, question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question deleted"}


# ---- Session Management ----

@app.get("/api/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    sessions = await crud.list_sessions(db)
    return [
        {"id": s.id, "category": s.category, "brands": json.loads(s.brands), "status": s.status, "created_at": s.created_at}
        for s in sessions
    ]


@app.post("/api/sessions", response_model=ResearchSession)
async def create_session(setup: ResearchSetup, db: AsyncSession = Depends(get_db)):
    s = await crud.create_session(
        db, category=setup.category, brands=setup.brands,
        market_context=setup.market_context, questions_per_persona=setup.questions_per_persona,
    )
    s = await crud.get_session(db, s.id)
    return session_to_response(s)


@app.get("/api/sessions/{session_id}", response_model=ResearchSession)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_to_response(s)


# ---- Session: Generate & Manage Personas ----

@app.post("/api/sessions/{session_id}/generate-personas", response_model=List[Persona])
async def generate_personas(session_id: str, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    await crud.update_session_status(db, session_id, "generating_personas")

    try:
        ai_personas = await claude_service.generate_personas(
            category=s.category, market_context=s.market_context, count=5,
        )

        persona_ids = []
        for p in ai_personas:
            db_persona = await crud.create_persona(
                db, name=p.name, archetype=p.archetype.value,
                description=p.description, age_range=p.age_range,
                occupation=p.occupation, tech_savviness=p.tech_savviness,
                price_sensitivity=p.price_sensitivity, brand_loyalty=p.brand_loyalty,
                key_priorities=p.key_priorities, origin="ai_generated", category=s.category,
            )
            persona_ids.append(db_persona.id)

        await crud.add_personas_to_session(db, session_id, persona_ids)
        await crud.update_session_status(db, session_id, "personas_ready")

        s = await crud.get_session(db, session_id)
        return [persona_from_db(p) for p in s.personas]

    except Exception as e:
        await crud.update_session_status(db, session_id, "error")
        raise HTTPException(status_code=500, detail=f"Error generating personas: {str(e)}")


@app.put("/api/sessions/{session_id}/personas", response_model=List[Persona])
async def set_personas(session_id: str, data: SessionPersonaIds, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    await crud.set_session_personas(db, session_id, data.persona_ids)
    s = await crud.get_session(db, session_id)
    return [persona_from_db(p) for p in s.personas]


# ---- Session: Generate & Manage Questions ----

@app.post("/api/sessions/{session_id}/generate-questions", response_model=List[Question])
async def generate_questions(session_id: str, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if not s.personas:
        raise HTTPException(status_code=400, detail="Generate personas first")

    try:
        question_ids = []
        for persona_db in s.personas:
            persona = persona_from_db(persona_db)
            ai_questions = await claude_service.generate_questions(
                persona=persona, category=s.category,
                market_context=s.market_context, count=s.questions_per_persona,
            )
            for q in ai_questions:
                db_q = await crud.create_question(
                    db, persona_id=persona.id, question_text=q.question_text,
                    context=q.context, origin="ai_generated", category=s.category,
                )
                question_ids.append(db_q.id)

        await crud.set_session_questions(db, session_id, question_ids)
        await crud.update_session_status(db, session_id, "questions_ready")

        s = await crud.get_session(db, session_id)
        return [question_from_db(q) for q in s.questions]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating questions: {str(e)}")


@app.put("/api/sessions/{session_id}/questions", response_model=List[Question])
async def set_questions(session_id: str, data: SessionQuestionIds, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    await crud.set_session_questions(db, session_id, data.question_ids)
    s = await crud.get_session(db, session_id)
    return [question_from_db(q) for q in s.questions]


# ---- Research Runs ----

async def _run_research_background(session_id: str, run_id: str, questions, personas, category: str, models: List[str]):
    """Background task that processes all questions across all selected models."""
    total = len(questions) * len(models)
    run_progress[run_id] = {"current": 0, "total": total, "status": "running"}

    try:
        async with async_session_factory() as db:
            step = 0
            for model_name in models:
                service = get_service(model_name)
                for i, question in enumerate(questions):
                    persona = next((p for p in personas if p.id == question.persona_id), None)
                    if not persona:
                        logger.warning(f"No persona for question {question.id}")
                        step += 1
                        run_progress[run_id]["current"] = step
                        continue

                    logger.info(f"Run {run_id} [{service.display_name}]: Q{i+1}/{len(questions)}: {question.question_text[:60]}...")
                    run_progress[run_id]["current"] = step

                    response_text = await service.ask_question(
                        question_text=question.question_text,
                        persona_name=persona.name,
                        category=category,
                    )
                    await crud.add_response(db, run_id, question.id, persona.id, response_text, model_name=model_name)
                    step += 1
                    run_progress[run_id]["current"] = step

            await crud.complete_run(db, run_id)
            await crud.update_session_status(db, session_id, "research_complete")
            run_progress[run_id]["status"] = "completed"
            logger.info(f"Run {run_id} complete ({len(models)} models, {total} total queries)")

    except Exception as e:
        async with async_session_factory() as db:
            await crud.fail_run(db, run_id)
            await crud.update_session_status(db, session_id, "error")
        run_progress[run_id]["status"] = "error"
        run_progress[run_id]["error"] = str(e)
        logger.error(f"Research error: {str(e)}")


class RunRequest(PydanticBaseModel):
    models: Optional[List[str]] = None

@app.post("/api/sessions/{session_id}/runs")
async def create_run(session_id: str, body: RunRequest = RunRequest(), db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if not s.questions:
        raise HTTPException(status_code=400, detail="Generate questions first")

    # Determine which models to use
    available = [m["name"] for m in get_available_models() if m["available"]]
    selected_models = body.models if body.models else available
    # Filter to only available models
    selected_models = [m for m in selected_models if m in available]
    if not selected_models:
        raise HTTPException(status_code=400, detail="No AI models available. Check API keys in .env")

    await crud.update_session_status(db, session_id, "researching")
    run = await crud.create_run(db, session_id, models_used=selected_models)

    questions = [question_from_db(q) for q in s.questions]
    personas = [persona_from_db(p) for p in s.personas]
    total = len(questions) * len(selected_models)

    # Launch in background — return immediately
    asyncio.create_task(
        _run_research_background(session_id, run.id, questions, personas, s.category, selected_models)
    )

    return {"run_id": run.id, "total_questions": total, "status": "started", "models": selected_models}


@app.get("/api/sessions/{session_id}/runs/{run_id}/progress")
async def get_run_progress(session_id: str, run_id: str, db: AsyncSession = Depends(get_db)):
    """Poll this endpoint to track research progress."""
    progress = run_progress.get(run_id)
    if progress:
        result = {**progress}
        # If completed, return full session and clean up
        if progress["status"] in ("completed", "error"):
            if progress["status"] == "completed":
                s = await crud.get_session(db, session_id)
                result["session"] = session_to_response(s).model_dump() if s else None
            # Clean up after client reads the result
            del run_progress[run_id]
        return result

    # Progress not in memory — check DB (run may have completed before we started tracking)
    runs = await crud.list_runs(db, session_id)
    run = next((r for r in runs if r.id == run_id), None)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "completed":
        s = await crud.get_session(db, session_id)
        return {
            "current": len(run.responses), "total": len(run.responses),
            "status": "completed",
            "session": session_to_response(s).model_dump() if s else None,
        }
    return {"current": 0, "total": 0, "status": run.status}


@app.get("/api/sessions/{session_id}/runs")
async def list_runs(session_id: str, db: AsyncSession = Depends(get_db)):
    runs = await crud.list_runs(db, session_id)
    return [{"id": r.id, "started_at": r.started_at, "completed_at": r.completed_at, "status": r.status} for r in runs]


# ---- Analysis ----

@app.post("/api/sessions/{session_id}/runs/{run_id}/analyze", response_model=ResearchSession)
async def analyze_run(session_id: str, run_id: str, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    run = await crud.get_run(db, run_id)
    if not run or run.session_id != session_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if not run.responses:
        raise HTTPException(status_code=400, detail="No responses to analyze")

    await crud.update_session_status(db, session_id, "analyzing")

    try:
        personas = [persona_from_db(p) for p in s.personas]
        questions = [question_from_db(q) for q in s.questions]
        brands = json.loads(s.brands) if isinstance(s.brands, str) else s.brands

        # Group responses by model
        models_used = json.loads(run.models_used) if isinstance(run.models_used, str) else run.models_used
        responses_by_model: Dict[str, list] = {m: [] for m in models_used}
        for r in run.responses:
            question = next((q for q in questions if q.id == r.question_id), None)
            persona = next((p for p in personas if p.id == r.persona_id), None)
            if question and persona:
                model = r.model_name if r.model_name in responses_by_model else models_used[0]
                responses_by_model.setdefault(model, []).append({
                    "persona_id": persona.id, "persona_name": persona.name,
                    "question": question.question_text, "response": r.response_text,
                })

        # Analyze each model's responses separately
        for model_name, responses_data in responses_by_model.items():
            if not responses_data:
                continue
            analysis = await claude_service.analyze_responses(
                responses=responses_data, brands=brands, category=s.category,
            )
            await crud.add_analysis_results(db, run_id, [
                {"brand": a.brand, "total_mentions": a.total_mentions, "recommendation_count": a.recommendation_count,
                 "first_mention_count": a.first_mention_count, "avg_sentiment_score": a.avg_sentiment_score,
                 "share_of_voice": a.share_of_voice, "persona_affinity": a.persona_affinity}
                for a in analysis
            ], model_name=model_name)

        await crud.update_session_status(db, session_id, "completed")
        s = await crud.get_session(db, session_id)
        return session_to_response(s)

    except Exception as e:
        await crud.update_session_status(db, session_id, "error")
        raise HTTPException(status_code=500, detail=f"Error during analysis: {str(e)}")


# ---- Comparison ----

@app.get("/api/sessions/{session_id}/compare")
async def compare_runs(session_id: str, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    brands = json.loads(s.brands) if isinstance(s.brands, str) else s.brands
    comparison = {brand: [] for brand in brands}
    for run in s.runs:
        if not run.analysis_results:
            continue
        for a in run.analysis_results:
            if a.brand in comparison:
                comparison[a.brand].append({
                    "run_id": run.id, "timestamp": run.started_at.isoformat(),
                    "model_name": a.model_name,
                    "total_mentions": a.total_mentions, "recommendation_count": a.recommendation_count,
                    "avg_sentiment_score": a.avg_sentiment_score, "share_of_voice": a.share_of_voice,
                })
    return comparison


# ---- Backward compat: old endpoint paths still work ----

@app.post("/api/sessions/{session_id}/personas", response_model=List[Persona])
async def generate_personas_compat(session_id: str, db: AsyncSession = Depends(get_db)):
    return await generate_personas(session_id, db)


@app.post("/api/sessions/{session_id}/questions", response_model=List[Question])
async def generate_questions_compat(session_id: str, db: AsyncSession = Depends(get_db)):
    return await generate_questions(session_id, db)


@app.post("/api/sessions/{session_id}/research", response_model=ResearchSession)
async def run_research_compat(session_id: str, db: AsyncSession = Depends(get_db)):
    return await create_run(session_id, db)


@app.post("/api/sessions/{session_id}/analyze", response_model=ResearchSession)
async def analyze_compat(session_id: str, db: AsyncSession = Depends(get_db)):
    s = await crud.get_session(db, session_id)
    if not s or not s.runs:
        raise HTTPException(status_code=400, detail="Run research first")
    latest_run = s.runs[0]
    return await analyze_run(session_id, latest_run.id, db)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

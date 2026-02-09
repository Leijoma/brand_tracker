import json
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db_models import (
    PersonaDB, QuestionDB, SessionDB, ResearchRunDB,
    ResponseDB, AnalysisResultDB, session_personas, session_questions
)


# ---- Personas ----

async def create_persona(db: AsyncSession, **kwargs) -> PersonaDB:
    if "key_priorities" in kwargs and isinstance(kwargs["key_priorities"], list):
        kwargs["key_priorities"] = json.dumps(kwargs["key_priorities"])
    if "id" not in kwargs:
        kwargs["id"] = str(uuid4())
    persona = PersonaDB(**kwargs)
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return persona


async def get_persona(db: AsyncSession, persona_id: str) -> Optional[PersonaDB]:
    return await db.get(PersonaDB, persona_id)


async def list_personas(db: AsyncSession, category: Optional[str] = None) -> List[PersonaDB]:
    stmt = select(PersonaDB).order_by(PersonaDB.created_at.desc())
    if category:
        stmt = stmt.where(PersonaDB.category == category)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_persona(db: AsyncSession, persona_id: str, updates: dict) -> Optional[PersonaDB]:
    persona = await db.get(PersonaDB, persona_id)
    if not persona:
        return None
    if "key_priorities" in updates and isinstance(updates["key_priorities"], list):
        updates["key_priorities"] = json.dumps(updates["key_priorities"])
    updates["updated_at"] = datetime.utcnow()
    for key, value in updates.items():
        setattr(persona, key, value)
    await db.commit()
    await db.refresh(persona)
    return persona


async def delete_persona(db: AsyncSession, persona_id: str) -> bool:
    persona = await db.get(PersonaDB, persona_id)
    if not persona:
        return False
    await db.delete(persona)
    await db.commit()
    return True


# ---- Questions ----

async def create_question(db: AsyncSession, **kwargs) -> QuestionDB:
    if "id" not in kwargs:
        kwargs["id"] = str(uuid4())
    question = QuestionDB(**kwargs)
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def get_question(db: AsyncSession, question_id: str) -> Optional[QuestionDB]:
    return await db.get(QuestionDB, question_id)


async def list_questions(db: AsyncSession, persona_id: Optional[str] = None, category: Optional[str] = None) -> List[QuestionDB]:
    stmt = select(QuestionDB).order_by(QuestionDB.created_at.desc())
    if persona_id:
        stmt = stmt.where(QuestionDB.persona_id == persona_id)
    if category:
        stmt = stmt.where(QuestionDB.category == category)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_question(db: AsyncSession, question_id: str, updates: dict) -> Optional[QuestionDB]:
    question = await db.get(QuestionDB, question_id)
    if not question:
        return None
    updates["updated_at"] = datetime.utcnow()
    for key, value in updates.items():
        setattr(question, key, value)
    await db.commit()
    await db.refresh(question)
    return question


async def delete_question(db: AsyncSession, question_id: str) -> bool:
    question = await db.get(QuestionDB, question_id)
    if not question:
        return False
    await db.delete(question)
    await db.commit()
    return True


# ---- Sessions ----

async def create_session(db: AsyncSession, category: str, brands: List[str], market_context: str, questions_per_persona: int = 5) -> SessionDB:
    session = SessionDB(
        id=str(uuid4()),
        category=category,
        brands=json.dumps(brands),
        market_context=market_context,
        questions_per_persona=questions_per_persona,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session(db: AsyncSession, session_id: str) -> Optional[SessionDB]:
    stmt = (
        select(SessionDB)
        .options(
            selectinload(SessionDB.personas),
            selectinload(SessionDB.questions),
            selectinload(SessionDB.runs).selectinload(ResearchRunDB.responses),
            selectinload(SessionDB.runs).selectinload(ResearchRunDB.analysis_results),
        )
        .where(SessionDB.id == session_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_sessions(db: AsyncSession) -> List[SessionDB]:
    stmt = select(SessionDB).order_by(SessionDB.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_session_status(db: AsyncSession, session_id: str, status: str) -> None:
    session = await db.get(SessionDB, session_id)
    if session:
        session.status = status
        session.updated_at = datetime.utcnow()
        await db.commit()


async def add_personas_to_session(db: AsyncSession, session_id: str, persona_ids: List[str]) -> None:
    session = await get_session(db, session_id)
    if not session:
        return
    # Clear existing and set new
    session.personas.clear()
    for pid in persona_ids:
        persona = await db.get(PersonaDB, pid)
        if persona:
            session.personas.append(persona)
    await db.commit()


async def set_session_personas(db: AsyncSession, session_id: str, persona_ids: List[str]) -> None:
    session = await get_session(db, session_id)
    if not session:
        return
    session.personas.clear()
    for pid in persona_ids:
        persona = await db.get(PersonaDB, pid)
        if persona:
            session.personas.append(persona)
    await db.commit()


async def set_session_questions(db: AsyncSession, session_id: str, question_ids: List[str]) -> None:
    session = await get_session(db, session_id)
    if not session:
        return
    session.questions.clear()
    for qid in question_ids:
        question = await db.get(QuestionDB, qid)
        if question:
            session.questions.append(question)
    await db.commit()


# ---- Research Runs ----

async def create_run(db: AsyncSession, session_id: str, models_used: List[str] = None) -> ResearchRunDB:
    run = ResearchRunDB(
        id=str(uuid4()),
        session_id=session_id,
        status="running",
        models_used=json.dumps(models_used or ["claude"]),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def complete_run(db: AsyncSession, run_id: str) -> None:
    run = await db.get(ResearchRunDB, run_id)
    if run:
        run.status = "completed"
        run.completed_at = datetime.utcnow()
        await db.commit()


async def fail_run(db: AsyncSession, run_id: str) -> None:
    run = await db.get(ResearchRunDB, run_id)
    if run:
        run.status = "error"
        run.completed_at = datetime.utcnow()
        await db.commit()


async def get_run(db: AsyncSession, run_id: str) -> Optional[ResearchRunDB]:
    stmt = (
        select(ResearchRunDB)
        .options(
            selectinload(ResearchRunDB.responses),
            selectinload(ResearchRunDB.analysis_results),
        )
        .where(ResearchRunDB.id == run_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_runs(db: AsyncSession, session_id: str) -> List[ResearchRunDB]:
    stmt = (
        select(ResearchRunDB)
        .where(ResearchRunDB.session_id == session_id)
        .order_by(ResearchRunDB.started_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---- Responses ----

async def add_response(db: AsyncSession, run_id: str, question_id: str, persona_id: str, response_text: str, model_name: str = "claude") -> ResponseDB:
    response = ResponseDB(
        id=str(uuid4()),
        run_id=run_id,
        question_id=question_id,
        persona_id=persona_id,
        response_text=response_text,
        model_name=model_name,
    )
    db.add(response)
    await db.commit()
    await db.refresh(response)
    return response


# ---- Analysis ----

async def add_analysis_results(db: AsyncSession, run_id: str, results: list, model_name: str = "claude") -> List[AnalysisResultDB]:
    db_results = []
    for r in results:
        ar = AnalysisResultDB(
            id=str(uuid4()),
            run_id=run_id,
            brand=r["brand"],
            model_name=model_name,
            total_mentions=r["total_mentions"],
            recommendation_count=r["recommendation_count"],
            first_mention_count=r["first_mention_count"],
            avg_sentiment_score=r["avg_sentiment_score"],
            share_of_voice=r["share_of_voice"],
            persona_affinity=json.dumps(r["persona_affinity"]),
        )
        db.add(ar)
        db_results.append(ar)
    await db.commit()
    return db_results

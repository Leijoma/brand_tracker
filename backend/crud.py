import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4
from supabase import Client


# ---- Personas ----

def create_persona(supabase: Client, **kwargs) -> Dict[str, Any]:
    """Create a new persona"""
    if "id" not in kwargs:
        kwargs["id"] = str(uuid4())
    if "created_at" not in kwargs:
        kwargs["created_at"] = datetime.utcnow().isoformat()
    if "updated_at" not in kwargs:
        kwargs["updated_at"] = datetime.utcnow().isoformat()
    # key_priorities is stored as TEXT (JSON string) in DB
    if "key_priorities" in kwargs and isinstance(kwargs["key_priorities"], list):
        kwargs["key_priorities"] = json.dumps(kwargs["key_priorities"])

    result = supabase.table("personas").insert(kwargs).execute()
    return result.data[0] if result.data else None


def get_persona(supabase: Client, persona_id: str) -> Optional[Dict[str, Any]]:
    """Get persona by ID"""
    result = supabase.table("personas").select("*").eq("id", persona_id).execute()
    return result.data[0] if result.data else None


def list_personas(supabase: Client, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """List all personas, optionally filtered by category"""
    query = supabase.table("personas").select("*").order("created_at", desc=True)
    if category:
        query = query.eq("category", category)
    result = query.execute()
    return result.data


def update_persona(supabase: Client, persona_id: str, updates: dict) -> Optional[Dict[str, Any]]:
    """Update persona"""
    if "key_priorities" in updates and isinstance(updates["key_priorities"], list):
        updates["key_priorities"] = json.dumps(updates["key_priorities"])
    updates["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("personas").update(updates).eq("id", persona_id).execute()
    return result.data[0] if result.data else None


def delete_persona(supabase: Client, persona_id: str) -> bool:
    """Delete persona"""
    result = supabase.table("personas").delete().eq("id", persona_id).execute()
    return len(result.data) > 0


# ---- Questions ----

def create_question(supabase: Client, **kwargs) -> Dict[str, Any]:
    """Create a new question"""
    if "id" not in kwargs:
        kwargs["id"] = str(uuid4())
    if "created_at" not in kwargs:
        kwargs["created_at"] = datetime.utcnow().isoformat()
    if "updated_at" not in kwargs:
        kwargs["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("questions").insert(kwargs).execute()
    return result.data[0] if result.data else None


def get_question(supabase: Client, question_id: str) -> Optional[Dict[str, Any]]:
    """Get question by ID"""
    result = supabase.table("questions").select("*").eq("id", question_id).execute()
    return result.data[0] if result.data else None


def list_questions(supabase: Client, persona_id: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """List questions, optionally filtered by persona or category"""
    query = supabase.table("questions").select("*").order("created_at", desc=True)
    if persona_id:
        query = query.eq("persona_id", persona_id)
    if category:
        query = query.eq("category", category)
    result = query.execute()
    return result.data


def update_question(supabase: Client, question_id: str, updates: dict) -> Optional[Dict[str, Any]]:
    """Update question"""
    updates["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("questions").update(updates).eq("id", question_id).execute()
    return result.data[0] if result.data else None


def delete_question(supabase: Client, question_id: str) -> bool:
    """Delete question"""
    result = supabase.table("questions").delete().eq("id", question_id).execute()
    return len(result.data) > 0


# ---- Sessions ----

def create_session(supabase: Client, category: str, brands: List[str], market_context: str,
                  questions_per_persona: int = 5, research_areas: List[str] = None,
                  primary_brand: str = None, language: str = "English",
                  user_id: str = None) -> Dict[str, Any]:
    """Create a new session"""
    session_data = {
        "id": str(uuid4()),
        "user_id": user_id,
        "category": category,
        "brands": json.dumps(brands),
        "market_context": market_context,
        "questions_per_persona": questions_per_persona,
        "research_areas": json.dumps(research_areas or []),
        "primary_brand": primary_brand,
        "language": language,
        "status": "setup",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    result = supabase.table("sessions").insert(session_data).execute()
    return result.data[0] if result.data else None


def get_session(supabase: Client, session_id: str, user_id: str = None) -> Optional[Dict[str, Any]]:
    """Get session by ID with related data"""
    query = supabase.table("sessions").select("*").eq("id", session_id)
    if user_id is not None:
        query = query.eq("user_id", user_id)
    result = query.execute()

    if not result.data:
        return None

    session = result.data[0]

    # Fetch related personas
    personas_result = supabase.table("session_personas").select("persona_id").eq("session_id", session_id).execute()
    if personas_result.data:
        persona_ids = [p["persona_id"] for p in personas_result.data]
        personas = supabase.table("personas").select("*").in_("id", persona_ids).execute()
        session["personas"] = personas.data
    else:
        session["personas"] = []

    # Fetch related questions
    questions_result = supabase.table("session_questions").select("question_id").eq("session_id", session_id).execute()
    if questions_result.data:
        question_ids = [q["question_id"] for q in questions_result.data]
        questions = supabase.table("questions").select("*").in_("id", question_ids).execute()
        session["questions"] = questions.data
    else:
        session["questions"] = []

    # Fetch research runs
    runs = list_runs(supabase, session_id)
    session["runs"] = runs

    return session


def list_sessions(supabase: Client, user_id: str = None) -> List[Dict[str, Any]]:
    """List all sessions"""
    query = supabase.table("sessions").select("*").order("created_at", desc=True)
    if user_id is not None:
        query = query.eq("user_id", user_id)
    result = query.execute()
    return result.data


def delete_session(supabase: Client, session_id: str, user_id: str = None) -> bool:
    """Delete session and all related data"""
    # Verify session exists and user has access
    session = get_session(supabase, session_id, user_id=user_id)
    if not session:
        return False

    # Delete cascade is handled by database FK constraints
    result = supabase.table("sessions").delete().eq("id", session_id).execute()
    return len(result.data) > 0


def delete_session_runs(supabase: Client, session_id: str) -> int:
    """Delete all research runs for a session. DB CASCADE handles responses, analysis, stats."""
    result = supabase.table("research_runs").delete().eq("session_id", session_id).execute()
    return len(result.data)


def create_share_token(supabase: Client, session_id: str, user_id: str = None) -> Optional[str]:
    """Generate and store a share token for a session. Returns the token."""
    session = get_session(supabase, session_id, user_id=user_id)
    if not session:
        return None
    token = str(uuid4())
    supabase.table("sessions").update({
        "share_token": token,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", session_id).execute()
    return token


def revoke_share_token(supabase: Client, session_id: str, user_id: str = None) -> bool:
    """Revoke (null out) the share token for a session."""
    session = get_session(supabase, session_id, user_id=user_id)
    if not session:
        return False
    supabase.table("sessions").update({
        "share_token": None,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", session_id).execute()
    return True


def get_session_by_share_token(supabase: Client, share_token: str) -> Optional[Dict[str, Any]]:
    """Get a session by its share token, with all related data (public, no user check)."""
    result = supabase.table("sessions").select("*").eq("share_token", share_token).execute()
    if not result.data:
        return None

    session = result.data[0]
    session_id = session["id"]

    # Fetch related personas
    personas_result = supabase.table("session_personas").select("persona_id").eq("session_id", session_id).execute()
    if personas_result.data:
        persona_ids = [p["persona_id"] for p in personas_result.data]
        personas = supabase.table("personas").select("*").in_("id", persona_ids).execute()
        session["personas"] = personas.data
    else:
        session["personas"] = []

    # Fetch related questions
    questions_result = supabase.table("session_questions").select("question_id").eq("session_id", session_id).execute()
    if questions_result.data:
        question_ids = [q["question_id"] for q in questions_result.data]
        questions = supabase.table("questions").select("*").in_("id", question_ids).execute()
        session["questions"] = questions.data
    else:
        session["questions"] = []

    # Fetch research runs
    runs = list_runs(supabase, session_id)
    session["runs"] = runs

    return session


def update_session_status(supabase: Client, session_id: str, status: str) -> None:
    """Update session status"""
    supabase.table("sessions").update({
        "status": status,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", session_id).execute()


def update_session(supabase: Client, session_id: str, updates: dict, user_id: str = None) -> Optional[Dict[str, Any]]:
    """Update session with provided fields"""
    # Verify session exists and user has access
    session = get_session(supabase, session_id, user_id=user_id)
    if not session:
        return None

    # Only allow updating specific fields
    allowed_fields = ["category", "brands", "market_context", "questions_per_persona",
                     "research_areas", "primary_brand", "language"]

    update_data = {}
    for field in allowed_fields:
        if field in updates:
            value = updates[field]
            # Convert lists to JSON strings for storage
            if field in ["brands", "research_areas"] and isinstance(value, list):
                value = json.dumps(value)
            update_data[field] = value

    if not update_data:
        return session  # No valid updates provided

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("sessions").update(update_data).eq("id", session_id).execute()
    if not result.data:
        return None

    # Return updated session with all related data
    return get_session(supabase, session_id, user_id=user_id)


def add_personas_to_session(supabase: Client, session_id: str, persona_ids: List[str]) -> None:
    """Add personas to session (clears existing first)"""
    # Remove existing persona associations
    supabase.table("session_personas").delete().eq("session_id", session_id).execute()

    # Add new associations
    if persona_ids:
        associations = [{"session_id": session_id, "persona_id": pid} for pid in persona_ids]
        supabase.table("session_personas").insert(associations).execute()


def set_session_personas(supabase: Client, session_id: str, persona_ids: List[str]) -> None:
    """Set session personas (replaces all existing)"""
    add_personas_to_session(supabase, session_id, persona_ids)


def set_session_questions(supabase: Client, session_id: str, question_ids: List[str]) -> None:
    """Set session questions (replaces all existing)"""
    # Remove existing question associations
    supabase.table("session_questions").delete().eq("session_id", session_id).execute()

    # Add new associations
    if question_ids:
        associations = [{"session_id": session_id, "question_id": qid} for qid in question_ids]
        supabase.table("session_questions").insert(associations).execute()


# ---- Research Runs ----

def create_run(supabase: Client, session_id: str, models_used: List[str] = None,
              iterations_per_question: int = 1, temperature: float = 0.7) -> Dict[str, Any]:
    """Create a new research run"""
    run_data = {
        "id": str(uuid4()),
        "session_id": session_id,
        "status": "running",
        "models_used": json.dumps(models_used or ["claude"]),
        "iterations_per_question": iterations_per_question,
        "temperature": temperature,
        "started_at": datetime.utcnow().isoformat(),
    }
    result = supabase.table("research_runs").insert(run_data).execute()
    return result.data[0] if result.data else None


def complete_run(supabase: Client, run_id: str) -> None:
    """Mark run as completed"""
    supabase.table("research_runs").update({
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat()
    }).eq("id", run_id).execute()


def fail_run(supabase: Client, run_id: str) -> None:
    """Mark run as failed"""
    supabase.table("research_runs").update({
        "status": "error",
        "completed_at": datetime.utcnow().isoformat()
    }).eq("id", run_id).execute()


def get_run(supabase: Client, run_id: str) -> Optional[Dict[str, Any]]:
    """Get run by ID with related data"""
    result = supabase.table("research_runs").select("*").eq("id", run_id).execute()

    if not result.data:
        return None

    run = result.data[0]

    # Fetch responses
    responses = supabase.table("responses").select("*").eq("run_id", run_id).execute()
    run["responses"] = responses.data

    # Fetch analysis results
    analysis = supabase.table("analysis_results").select("*").eq("run_id", run_id).execute()
    run["analysis_results"] = analysis.data

    # Fetch statistical results
    stats = supabase.table("statistical_results").select("*").eq("run_id", run_id).execute()
    run["statistical_results"] = stats.data

    return run


def list_runs(supabase: Client, session_id: str) -> List[Dict[str, Any]]:
    """List all runs for a session"""
    result = supabase.table("research_runs").select("*").eq("session_id", session_id).order("started_at", desc=True).execute()

    # Fetch related data for each run
    for run in result.data:
        responses = supabase.table("responses").select("*").eq("run_id", run["id"]).execute()
        run["responses"] = responses.data

        analysis = supabase.table("analysis_results").select("*").eq("run_id", run["id"]).execute()
        run["analysis_results"] = analysis.data

        stats = supabase.table("statistical_results").select("*").eq("run_id", run["id"]).execute()
        run["statistical_results"] = stats.data

    return result.data


# ---- Responses ----

def add_response(supabase: Client, run_id: str, question_id: str, persona_id: str,
                response_text: str, model_name: str = "claude",
                structured_data: Dict = None, response_type: str = "recall",
                iteration: int = 1, prompt_variation: str = None) -> Dict[str, Any]:
    """Add a response to a run"""
    response_data = {
        "id": str(uuid4()),
        "run_id": run_id,
        "question_id": question_id,
        "persona_id": persona_id,
        "response_text": response_text,
        "model_name": model_name,
        "timestamp": datetime.utcnow().isoformat(),
        "structured_data": json.dumps(structured_data) if structured_data else None,
        "response_type": response_type,
        "iteration": iteration,
        "prompt_variation": prompt_variation,
    }
    result = supabase.table("responses").insert(response_data).execute()
    return result.data[0] if result.data else None


# ---- Analysis ----

def add_analysis_results(supabase: Client, run_id: str, results: list, model_name: str = "claude") -> List[Dict[str, Any]]:
    """Add analysis results for a run"""
    db_results = []
    for r in results:
        ar_data = {
            "id": str(uuid4()),
            "run_id": run_id,
            "brand": r["brand"],
            "model_name": model_name,
            "total_mentions": r["total_mentions"],
            "recommendation_count": r["recommendation_count"],
            "first_mention_count": r["first_mention_count"],
            "avg_sentiment_score": r["avg_sentiment_score"],
            "share_of_voice": r["share_of_voice"],
            "persona_affinity": json.dumps(r["persona_affinity"]),
            "topic_scores": json.dumps(r.get("topic_scores")) if r.get("topic_scores") else None,
        }
        db_results.append(ar_data)

    if db_results:
        result = supabase.table("analysis_results").insert(db_results).execute()
        return result.data
    return []


# ---- Statistical Results ----

def add_statistical_results(supabase: Client, run_id: str, results: Dict[str, Dict],
                           model_name: str = "claude") -> List[Dict[str, Any]]:
    """Add statistical results for a run"""
    db_results = []
    for brand, stats in results.items():
        sr_data = {
            "id": str(uuid4()),
            "run_id": run_id,
            "brand": brand,
            "model_name": model_name,
            "mention_frequency": stats["mention_frequency"],
            "avg_rank": stats["avg_rank"],
            "top3_rate": stats["top3_rate"],
            "first_mention_rate": stats["first_mention_rate"],
            "recommendation_rate": stats["recommendation_rate"],
            "mention_frequency_ci_low": stats["mention_frequency_ci_low"],
            "mention_frequency_ci_high": stats["mention_frequency_ci_high"],
            "avg_rank_ci_low": stats["avg_rank_ci_low"],
            "avg_rank_ci_high": stats["avg_rank_ci_high"],
            "top3_rate_ci_low": stats["top3_rate_ci_low"],
            "top3_rate_ci_high": stats["top3_rate_ci_high"],
            "avg_sentiment_score": stats["avg_sentiment_score"],
            "sentiment_ci_low": stats["sentiment_ci_low"],
            "sentiment_ci_high": stats["sentiment_ci_high"],
            "recommendation_strength": stats.get("recommendation_strength", 0.0),
            "recommendation_strength_ci_low": stats.get("recommendation_strength_ci_low", 0.0),
            "recommendation_strength_ci_high": stats.get("recommendation_strength_ci_high", 0.0),
            "total_iterations": stats["total_iterations"],
            "total_mentions": stats["total_mentions"],
            "share_of_voice": stats["share_of_voice"],
            "persona_affinity": json.dumps(stats.get("persona_affinity", {})),
        }
        db_results.append(sr_data)

    if db_results:
        result = supabase.table("statistical_results").insert(db_results).execute()
        return result.data
    return []


def get_statistical_results(supabase: Client, run_id: str) -> List[Dict[str, Any]]:
    """Get statistical results for a run"""
    result = supabase.table("statistical_results").select("*").eq("run_id", run_id).execute()
    return result.data

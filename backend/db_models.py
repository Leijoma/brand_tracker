from sqlalchemy import Column, String, Integer, Float, Text, DateTime, Table, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from database import Base


def gen_uuid():
    return str(uuid4())


# Association tables
session_personas = Table(
    "session_personas",
    Base.metadata,
    Column("session_id", String, ForeignKey("sessions.id"), primary_key=True),
    Column("persona_id", String, ForeignKey("personas.id"), primary_key=True),
)

session_questions = Table(
    "session_questions",
    Base.metadata,
    Column("session_id", String, ForeignKey("sessions.id"), primary_key=True),
    Column("question_id", String, ForeignKey("questions.id"), primary_key=True),
)


class PersonaDB(Base):
    __tablename__ = "personas"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    archetype = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    age_range = Column(String, nullable=False)
    occupation = Column(String, nullable=False)
    tech_savviness = Column(Integer, nullable=False)
    price_sensitivity = Column(Integer, nullable=False)
    brand_loyalty = Column(Integer, nullable=False)
    key_priorities = Column(Text, nullable=False)  # JSON array as text
    origin = Column(String, nullable=False, default="ai_generated")
    category = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions = relationship("QuestionDB", back_populates="persona")
    sessions = relationship("SessionDB", secondary=session_personas, back_populates="personas")


class QuestionDB(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=gen_uuid)
    persona_id = Column(String, ForeignKey("personas.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    context = Column(Text, nullable=True)
    origin = Column(String, nullable=False, default="ai_generated")
    category = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    persona = relationship("PersonaDB", back_populates="questions")
    sessions = relationship("SessionDB", secondary=session_questions, back_populates="questions")


class SessionDB(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    category = Column(String, nullable=False)
    brands = Column(Text, nullable=False)  # JSON array as text
    market_context = Column(Text, nullable=False)
    questions_per_persona = Column(Integer, nullable=False, default=5)
    status = Column(String, nullable=False, default="setup")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    personas = relationship("PersonaDB", secondary=session_personas, back_populates="sessions")
    questions = relationship("QuestionDB", secondary=session_questions, back_populates="sessions")
    runs = relationship("ResearchRunDB", back_populates="session", order_by="ResearchRunDB.started_at.desc()")


class ResearchRunDB(Base):
    __tablename__ = "research_runs"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="running")
    models_used = Column(Text, nullable=False, default='["claude"]')  # JSON array

    session = relationship("SessionDB", back_populates="runs")
    responses = relationship("ResponseDB", back_populates="run")
    analysis_results = relationship("AnalysisResultDB", back_populates="run")


class ResponseDB(Base):
    __tablename__ = "responses"

    id = Column(String, primary_key=True, default=gen_uuid)
    run_id = Column(String, ForeignKey("research_runs.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    persona_id = Column(String, ForeignKey("personas.id"), nullable=False)
    response_text = Column(Text, nullable=False)
    model_name = Column(String, nullable=False, default="claude")
    timestamp = Column(DateTime, default=datetime.utcnow)

    run = relationship("ResearchRunDB", back_populates="responses")


class AnalysisResultDB(Base):
    __tablename__ = "analysis_results"

    id = Column(String, primary_key=True, default=gen_uuid)
    run_id = Column(String, ForeignKey("research_runs.id"), nullable=False)
    brand = Column(String, nullable=False)
    model_name = Column(String, nullable=False, default="claude")
    total_mentions = Column(Integer, nullable=False)
    recommendation_count = Column(Integer, nullable=False)
    first_mention_count = Column(Integer, nullable=False)
    avg_sentiment_score = Column(Float, nullable=False)
    share_of_voice = Column(Float, nullable=False)
    persona_affinity = Column(Text, nullable=False)  # JSON object as text

    run = relationship("ResearchRunDB", back_populates="analysis_results")

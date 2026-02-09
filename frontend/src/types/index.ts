export interface ResearchSetup {
  category: string;
  brands: string[];
  market_context: string;
  questions_per_persona: number;
  research_areas: string[];
  primary_brand?: string;
  language?: string;
}

export interface Persona {
  id: string;
  name: string;
  archetype: 'innovator' | 'pragmatist' | 'conservative' | 'budget_conscious' | 'quality_seeker';
  description: string;
  age_range: string;
  occupation: string;
  tech_savviness: number;
  price_sensitivity: number;
  brand_loyalty: number;
  key_priorities: string[];
  origin: 'ai_generated' | 'custom';
  category?: string;
}

export interface PersonaCreate {
  name: string;
  archetype: Persona['archetype'];
  description: string;
  age_range: string;
  occupation: string;
  tech_savviness: number;
  price_sensitivity: number;
  brand_loyalty: number;
  key_priorities: string[];
  category?: string;
}

export interface Question {
  id: string;
  persona_id: string;
  question_text: string;
  context?: string;
  origin: 'ai_generated' | 'custom';
  category?: string;
  research_area?: string;
}

export interface QueryResponse {
  id: string;
  question_id: string;
  persona_id: string;
  response_text: string;
  model_name: string;
  timestamp: string;
}

export interface AnalysisResult {
  brand: string;
  total_mentions: number;
  recommendation_count: number;
  first_mention_count: number;
  avg_sentiment_score: number;
  share_of_voice: number;
  persona_affinity: { [key: string]: number };
  model_name: string;
  topic_scores?: { [area: string]: { score: number; mentions: number } };
}

export interface ResearchRun {
  id: string;
  session_id: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'error';
  models_used: string[];
  responses: QueryResponse[];
  analysis?: AnalysisResult[];
}

export interface AIModel {
  name: string;
  display_name: string;
  available: boolean;
}

export interface ResearchSession {
  id: string;
  setup: ResearchSetup;
  personas: Persona[];
  questions: Question[];
  runs: ResearchRun[];
  responses: QueryResponse[];
  analysis?: AnalysisResult[];
  created_at: string;
  status: string;
}

export interface SessionSummary {
  id: string;
  category: string;
  brands: string[];
  status: string;
  created_at: string;
}

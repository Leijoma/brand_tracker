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
  structured_data?: {
    recommendations?: Array<{ brand: string; rank: number; sentiment?: string }>;
    rankings?: Array<{ brand: string; rank: number; score?: number; sentiment?: string }>;
    chosen_brand?: string;
    confidence?: number;
  };
  response_type?: 'recall' | 'preference' | 'forced_choice' | 'legacy_freetext';
  iteration?: number;
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

export interface StatisticalResult {
  brand: string;
  model_name: string;
  mention_frequency: number;
  avg_rank: number;
  top3_rate: number;
  first_mention_rate: number;
  recommendation_rate: number;
  mention_frequency_ci: [number, number];
  avg_rank_ci: [number, number];
  top3_rate_ci: [number, number];
  avg_sentiment_score: number;
  sentiment_ci: [number, number];
  recommendation_strength: number;
  recommendation_strength_ci: [number, number];
  total_iterations: number;
  total_mentions: number;
  share_of_voice: number;
  recommendation_count: number;
  first_mention_count: number;
  persona_affinity: { [key: string]: number };
}

export interface ResearchRun {
  id: string;
  session_id: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'error';
  models_used: string[];
  iterations_per_question: number;
  temperature: number;
  responses: QueryResponse[];
  analysis?: AnalysisResult[];
  statistical_results?: StatisticalResult[];
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
  share_token?: string;
}

export interface SessionSummary {
  id: string;
  category: string;
  brands: string[];
  status: string;
  created_at: string;
}

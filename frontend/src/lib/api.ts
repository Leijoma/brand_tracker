import axios from 'axios';
import { supabase } from './supabase';
import type {
  ResearchSetup, ResearchSession, Persona, PersonaCreate,
  Question, AnalysisResult, SessionSummary, ResearchRun, AIModel,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Supabase JWT to all API requests
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    // No auth available — proceed without token
  }
  return config;
});

// ---- Persona CRUD ----

export const listPersonas = async (category?: string): Promise<Persona[]> => {
  const params = category ? { category } : {};
  const response = await api.get('/api/personas', { params });
  return response.data;
};

export const createPersona = async (data: PersonaCreate): Promise<Persona> => {
  const response = await api.post('/api/personas', data);
  return response.data;
};

export const updatePersona = async (id: string, data: Partial<Persona>): Promise<Persona> => {
  const response = await api.put(`/api/personas/${id}`, data);
  return response.data;
};

export const deletePersona = async (id: string): Promise<void> => {
  await api.delete(`/api/personas/${id}`);
};

// ---- Question CRUD ----

export const listQuestions = async (personaId?: string): Promise<Question[]> => {
  const params = personaId ? { persona_id: personaId } : {};
  const response = await api.get('/api/questions', { params });
  return response.data;
};

export const createQuestion = async (data: { persona_id: string; question_text: string; context?: string; category?: string }): Promise<Question> => {
  const response = await api.post('/api/questions', data);
  return response.data;
};

export const updateQuestion = async (id: string, data: { question_text?: string; context?: string }): Promise<Question> => {
  const response = await api.put(`/api/questions/${id}`, data);
  return response.data;
};

export const deleteQuestion = async (id: string): Promise<void> => {
  await api.delete(`/api/questions/${id}`);
};

// ---- Sessions ----

export const listSessions = async (): Promise<SessionSummary[]> => {
  const response = await api.get('/api/sessions');
  return response.data;
};

export const createSession = async (setup: ResearchSetup): Promise<ResearchSession> => {
  const response = await api.post('/api/sessions', setup);
  return response.data;
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await api.delete(`/api/sessions/${sessionId}`);
};

export const getSession = async (sessionId: string): Promise<ResearchSession> => {
  const response = await api.get(`/api/sessions/${sessionId}`);
  return response.data;
};

export const updateSession = async (sessionId: string, setup: ResearchSetup): Promise<ResearchSession> => {
  const response = await api.put(`/api/sessions/${sessionId}`, setup);
  return response.data;
};

// ---- Session: Persona & Question Generation ----

export interface GenerationProgress {
  current: number;
  total: number;
  status: 'running' | 'completed' | 'error';
  message: string;
  session?: ResearchSession;
}

export const getGenerationProgress = async (taskId: string): Promise<GenerationProgress> => {
  const response = await api.get(`/api/generation/${taskId}/progress`);
  return response.data;
};

export const generatePersonas = async (
  sessionId: string,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<ResearchSession> => {
  const response = await api.post(`/api/sessions/${sessionId}/generate-personas`);
  const { task_id } = response.data;

  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const progress = await getGenerationProgress(task_id);
    onProgress?.(progress);

    if (progress.status === 'completed' && progress.session) {
      return progress.session;
    }
    if (progress.status === 'error') {
      throw new Error(progress.message || 'Persona generation failed');
    }
  }
};

export const generateQuestions = async (
  sessionId: string,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<ResearchSession> => {
  const response = await api.post(`/api/sessions/${sessionId}/generate-questions`);
  const { task_id } = response.data;

  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const progress = await getGenerationProgress(task_id);
    onProgress?.(progress);

    if (progress.status === 'completed' && progress.session) {
      return progress.session;
    }
    if (progress.status === 'error') {
      throw new Error(progress.message || 'Question generation failed');
    }
  }
};

export const setSessionPersonas = async (sessionId: string, personaIds: string[]): Promise<Persona[]> => {
  const response = await api.put(`/api/sessions/${sessionId}/personas`, { persona_ids: personaIds });
  return response.data;
};

export const setSessionQuestions = async (sessionId: string, questionIds: string[]): Promise<Question[]> => {
  const response = await api.put(`/api/sessions/${sessionId}/questions`, { question_ids: questionIds });
  return response.data;
};

// ---- AI Models ----

export const listModels = async (): Promise<AIModel[]> => {
  const response = await api.get('/api/models');
  return response.data;
};

// ---- Research Runs ----

export interface RunStartResult {
  run_id: string;
  total_questions: number;
  status: string;
  models?: string[];
}

export interface RunProgress {
  current: number;
  total: number;
  status: 'running' | 'completed' | 'error';
  session?: ResearchSession;
  error?: string;
}

export const startResearchRun = async (sessionId: string, models?: string[]): Promise<RunStartResult> => {
  const response = await api.post(`/api/sessions/${sessionId}/runs`, models ? { models } : {});
  return response.data;
};

export const getRunProgress = async (sessionId: string, runId: string): Promise<RunProgress> => {
  const response = await api.get(`/api/sessions/${sessionId}/runs/${runId}/progress`);
  return response.data;
};

export const runResearch = async (
  sessionId: string,
  onProgress?: (current: number, total: number) => void,
  models?: string[],
): Promise<ResearchSession> => {
  const { run_id, total_questions } = await startResearchRun(sessionId, models);
  onProgress?.(0, total_questions);

  // Poll until done
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const progress = await getRunProgress(sessionId, run_id);
    onProgress?.(progress.current, progress.total);

    if (progress.status === 'completed' && progress.session) {
      return progress.session;
    }
    if (progress.status === 'error') {
      throw new Error(progress.error || 'Research run failed');
    }
  }
};

export const listRuns = async (sessionId: string): Promise<ResearchRun[]> => {
  const response = await api.get(`/api/sessions/${sessionId}/runs`);
  return response.data;
};

// ---- Analysis ----

export const analyzeRun = async (sessionId: string, runId: string): Promise<ResearchSession> => {
  const response = await api.post(`/api/sessions/${sessionId}/runs/${runId}/analyze`);
  return response.data;
};

// Backward compat
export const analyzeSession = async (sessionId: string): Promise<ResearchSession> => {
  const response = await api.post(`/api/sessions/${sessionId}/analyze`);
  return response.data;
};

// ---- Comparison ----

export const compareRuns = async (sessionId: string): Promise<Record<string, any[]>> => {
  const response = await api.get(`/api/sessions/${sessionId}/compare`);
  return response.data;
};

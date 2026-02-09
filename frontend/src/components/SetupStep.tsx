'use client';

import { useState, useEffect } from 'react';
import { createSession, listSessions, getSession, deleteSession } from '@/lib/api';
import type { ResearchSession, ResearchSetup, SessionSummary } from '@/types';
import { ArrowRight, Plus, X, History, Loader2, Tag, Globe, Trash2 } from 'lucide-react';

interface SetupStepProps {
  onComplete: (session: ResearchSession) => void;
  onResume: (session: ResearchSession, step: 'personas' | 'questions' | 'research' | 'methodology' | 'dashboard') => void;
}

export default function SetupStep({ onComplete, onResume }: SetupStepProps) {
  const [category, setCategory] = useState('');
  const [brandInput, setBrandInput] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [marketContext, setMarketContext] = useState('');
  const [questionsPerPersona, setQuestionsPerPersona] = useState(5);
  const [researchAreas, setResearchAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState('');
  const [primaryBrand, setPrimaryBrand] = useState('');
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [previousSessions, setPreviousSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const sessions = await listSessions();
      setPreviousSessions(sessions);
    } catch {
      // Silently fail — sessions list is optional
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleResumeSession = async (summary: SessionSummary) => {
    setLoadingSession(summary.id);
    setError('');
    try {
      const session = await getSession(summary.id);
      // Determine where to resume based on session state
      if (session.runs.length > 0 && session.analysis && session.analysis.length > 0) {
        onResume(session, 'dashboard');
      } else if (session.runs.length > 0) {
        onResume(session, 'research');
      } else if (session.questions.length > 0) {
        onResume(session, 'research');
      } else if (session.personas.length > 0) {
        onResume(session, 'questions');
      } else {
        onResume(session, 'personas');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to load session.';
      setError(`Error: ${errorMessage}`);
    } finally {
      setLoadingSession(null);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirmDeleteId !== sessionId) {
      setConfirmDeleteId(sessionId);
      return;
    }
    try {
      await deleteSession(sessionId);
      setPreviousSessions(prev => prev.filter(s => s.id !== sessionId));
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError('Failed to delete session.');
    }
  };

  const addBrand = () => {
    if (brandInput.trim() && !brands.includes(brandInput.trim())) {
      setBrands([...brands, brandInput.trim()]);
      setBrandInput('');
    }
  };

  const removeBrand = (brand: string) => {
    setBrands(brands.filter(b => b !== brand));
    if (primaryBrand === brand) setPrimaryBrand('');
  };

  const addArea = () => {
    if (areaInput.trim() && !researchAreas.includes(areaInput.trim())) {
      setResearchAreas([...researchAreas, areaInput.trim()]);
      setAreaInput('');
    }
  };

  const removeArea = (area: string) => {
    setResearchAreas(researchAreas.filter(a => a !== area));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (brands.length < 2) {
      setError('Please add at least 2 brands to track');
      return;
    }

    setLoading(true);

    try {
      const setup: ResearchSetup = {
        category,
        brands,
        market_context: marketContext,
        questions_per_persona: questionsPerPersona,
        research_areas: researchAreas,
        primary_brand: primaryBrand || undefined,
        language,
      };

      const session = await createSession(setup);
      onComplete(session);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to create session. Please try again.';
      setError(`Error: ${errorMessage}`);
      console.error('Full error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Previous Sessions */}
      {previousSessions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-bold text-slate-900">Previous Sessions</h2>
            </div>
            <p className="text-slate-600 text-sm mt-1">
              Resume a previous research session
            </p>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {previousSessions.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    onClick={() => handleResumeSession(s)}
                    disabled={loadingSession === s.id}
                    className="flex-1 flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{s.category}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {s.brands.map((brand) => (
                          <span key={brand} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                            {brand}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">
                        {new Date(s.created_at).toLocaleDateString()} — {s.status}
                      </p>
                    </div>
                    {loadingSession === s.id ? (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                    ) : (
                      <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    onBlur={() => confirmDeleteId === s.id && setTimeout(() => setConfirmDeleteId(null), 200)}
                    className={`p-3 rounded-lg border transition-colors flex-shrink-0 ${
                      confirmDeleteId === s.id
                        ? 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100'
                        : 'border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50'
                    }`}
                    title={confirmDeleteId === s.id ? 'Click again to confirm' : 'Delete session'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loadingSessions && previousSessions.length === 0 && (
        <div className="text-center py-4">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin inline-block" />
        </div>
      )}

      {/* New Session Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-8 py-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">
            {previousSessions.length > 0 ? 'New Research Session' : 'Setup Research'}
          </h2>
          <p className="text-slate-600 mt-1">
            Define your category, competitors, and research parameters
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Brand Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., CRM platforms, Management consulting, Running shoes"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              The product or service category you want to research
            </p>
          </div>

          {/* Brands */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Brands to Track
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={brandInput}
                onChange={(e) => setBrandInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addBrand())}
                placeholder="Enter brand name"
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={addBrand}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {brands.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {brands.map((brand) => (
                  <span
                    key={brand}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
                  >
                    {brand}
                    <button
                      type="button"
                      onClick={() => removeBrand(brand)}
                      className="hover:text-blue-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Add at least 2 brands to compare (Press Enter or click Add)
            </p>
          </div>

          {/* Primary Brand */}
          {brands.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Your Brand (optional)
              </label>
              <select
                value={primaryBrand}
                onChange={(e) => setPrimaryBrand(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">None selected</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Results will be shown relative to this brand in the analysis
              </p>
            </div>
          )}

          {/* Market Context */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Market Context
            </label>
            <textarea
              value={marketContext}
              onChange={(e) => setMarketContext(e.target.value)}
              placeholder="e.g., B2B SaaS for sales teams, Enterprise market, Price range $50-200/month"
              rows={4}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Provide context about the market, target customers, and competitive landscape
            </p>
          </div>

          {/* Research Areas */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              <Tag className="w-4 h-4 inline mr-1" />
              Research Areas
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArea())}
                placeholder="e.g., Quality, Safety, Price"
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={addArea}
                className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {/* Suggestion chips */}
            {researchAreas.length === 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="text-xs text-slate-500 py-1">Suggestions:</span>
                {['Quality', 'Safety', 'Innovation', 'Price/Value', 'Sustainability', 'Design', 'Reliability', 'Customer Service'].map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => !researchAreas.includes(suggestion) && setResearchAreas([...researchAreas, suggestion])}
                    className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
            )}

            {researchAreas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {researchAreas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium"
                  >
                    {area}
                    <button type="button" onClick={() => removeArea(area)} className="hover:text-indigo-900">
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Specific areas to investigate and compare. Questions and analysis will be tailored to these.
            </p>
          </div>

          {/* Questions per Persona */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Questions per Persona
            </label>
            <input
              type="number"
              value={questionsPerPersona}
              onChange={(e) => setQuestionsPerPersona(parseInt(e.target.value))}
              min={1}
              max={10}
              className="w-32 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 mt-1">
              How many questions each persona will ask (1-10)
            </p>
          </div>

          {/* Content Language */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              <Globe className="w-4 h-4 inline mr-1" />
              Content Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="English">English</option>
              <option value="Swedish">Swedish (Svenska)</option>
              <option value="German">German (Deutsch)</option>
              <option value="French">French (Fran&ccedil;ais)</option>
              <option value="Spanish">Spanish (Espa&ntilde;ol)</option>
              <option value="Norwegian">Norwegian (Norsk)</option>
              <option value="Danish">Danish (Dansk)</option>
              <option value="Finnish">Finnish (Suomi)</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Language for AI-generated content (personas, questions, responses, and analysis)
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? 'Creating Session...' : 'Start Research'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

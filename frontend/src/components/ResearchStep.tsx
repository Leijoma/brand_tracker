'use client';

import { useState, useEffect } from 'react';
import { runResearch, analyzeRun, analyzeSession, listModels } from '@/lib/api';
import type { ResearchSession, AIModel } from '@/types';
import { Play, BarChart3, MessageSquare, CheckCircle2, Clock, RefreshCw, Cpu } from 'lucide-react';

interface ResearchStepProps {
  session: ResearchSession;
  onUpdate: (session: ResearchSession) => void;
  onNext: () => void;
}

export default function ResearchStep({ session, onUpdate, onNext }: ResearchStepProps) {
  const [researching, setResearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [error, setError] = useState('');
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const totalQuestions = session.questions.length;
  const hasResponses = session.responses.length > 0 || session.runs.some(r => r.responses.length > 0);
  const hasRuns = session.runs.length > 0;
  const latestRun = hasRuns ? session.runs[session.runs.length - 1] : null;

  useEffect(() => {
    listModels().then((m) => {
      setModels(m);
      // Select all available models by default
      setSelectedModels(m.filter(x => x.available).map(x => x.name));
    }).catch(() => {
      // Fallback: just Claude
      setSelectedModels(['claude']);
    });
  }, []);

  const toggleModel = (name: string) => {
    setSelectedModels(prev =>
      prev.includes(name)
        ? prev.filter(m => m !== name)
        : [...prev, name]
    );
  };

  const handleRunResearch = async () => {
    if (selectedModels.length === 0) {
      setError('Please select at least one AI model.');
      return;
    }
    setResearching(true);
    setError('');
    setProgressCurrent(0);
    setProgressTotal(0);

    try {
      const updatedSession = await runResearch(session.id, (current, total) => {
        setProgressCurrent(current);
        setProgressTotal(total);
      }, selectedModels);
      onUpdate(updatedSession);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to run research.';
      setError(`Error: ${errorMessage}`);
      try {
        const { getSession } = await import('@/lib/api');
        const refreshed = await getSession(session.id);
        onUpdate(refreshed);
      } catch {}
    } finally {
      setResearching(false);
    }
  };

  const handleAnalyzeRun = async (runId: string) => {
    setAnalyzing(true);
    setError('');

    try {
      const updatedSession = await analyzeRun(session.id, runId);
      onUpdate(updatedSession);
      onNext();
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to analyze.';
      setError(`Error: ${errorMessage}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeLatest = async () => {
    if (latestRun) {
      await handleAnalyzeRun(latestRun.id);
    } else {
      setAnalyzing(true);
      setError('');
      try {
        const updatedSession = await analyzeSession(session.id);
        onUpdate(updatedSession);
        onNext();
      } catch (err: any) {
        const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to analyze.';
        setError(`Error: ${errorMessage}`);
      } finally {
        setAnalyzing(false);
      }
    }
  };

  const MODEL_COLORS: Record<string, string> = {
    claude: 'bg-orange-100 text-orange-700 border-orange-300',
    chatgpt: 'bg-green-100 text-green-700 border-green-300',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 px-8 py-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">Research Phase</h2>
          <p className="text-slate-600 mt-1">
            Execute queries across all personas and collect AI responses
          </p>
        </div>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Questions</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{totalQuestions}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Play className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">Personas</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{session.personas.length}</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-900">Runs</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{session.runs.length}</p>
            </div>
          </div>

          {/* Model Selection */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4" /> AI Models
            </h3>
            <div className="flex gap-3 flex-wrap">
              {models.map((model) => (
                <label
                  key={model.name}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                    !model.available
                      ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                      : selectedModels.includes(model.name)
                      ? MODEL_COLORS[model.name] || 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model.name)}
                    onChange={() => toggleModel(model.name)}
                    disabled={!model.available || researching}
                    className="rounded"
                  />
                  <span className="font-medium text-sm">{model.display_name}</span>
                  {!model.available && <span className="text-xs">(no API key)</span>}
                </label>
              ))}
            </div>
            {selectedModels.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Total queries: {totalQuestions} questions x {selectedModels.length} model{selectedModels.length > 1 ? 's' : ''} = {totalQuestions * selectedModels.length}
              </p>
            )}
          </div>

          {/* Previous Runs */}
          {hasRuns && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Run History</h3>
              <div className="space-y-2">
                {session.runs.map((run, idx) => (
                  <div key={run.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600 font-medium">Run #{idx + 1}</span>
                    <span className="text-slate-700">{new Date(run.started_at).toLocaleString()}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      run.status === 'completed' ? 'bg-green-100 text-green-700' :
                      run.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{run.status}</span>
                    {run.models_used && run.models_used.map(m => (
                      <span key={m} className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        MODEL_COLORS[m] || 'bg-slate-100 text-slate-600'
                      }`}>{m}</span>
                    ))}
                    <span className="text-slate-500">{run.responses.length} responses</span>
                    {run.analysis ? (
                      <span className="text-emerald-600 text-xs font-medium">analyzed</span>
                    ) : (
                      run.status === 'completed' && (
                        <button
                          onClick={() => handleAnalyzeRun(run.id)}
                          disabled={analyzing}
                          className="ml-auto text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                        >
                          Analyze
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Research Action */}
          <div className="text-center py-8">
            {researching && (
              <div className="mb-6">
                <div className="w-full bg-slate-200 rounded-full h-3 mb-2">
                  <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progressTotal > 0 ? (progressCurrent / progressTotal) * 100 : 0}%` }} />
                </div>
                <p className="text-sm text-slate-600">
                  {progressTotal > 0
                    ? `Processing query ${progressCurrent} of ${progressTotal}...`
                    : 'Starting research run...'}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={handleRunResearch} disabled={researching || selectedModels.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-50 inline-flex items-center gap-2">
                {researching ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Running...</>
                ) : (
                  <><Play className="w-5 h-5" /> {hasRuns ? 'Run Again' : 'Start Research'}</>
                )}
              </button>

              {hasResponses && (
                <button onClick={handleAnalyzeLatest} disabled={analyzing}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 inline-flex items-center gap-2">
                  {analyzing ? (
                    <><BarChart3 className="w-5 h-5 animate-pulse" /> Analyzing...</>
                  ) : (
                    <><BarChart3 className="w-5 h-5" /> Analyze &amp; View Dashboard</>
                  )}
                </button>
              )}

              {hasRuns && session.analysis && session.analysis.length > 0 && (
                <button onClick={onNext}
                  className="px-6 py-3 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 inline-flex items-center gap-2">
                  View Dashboard
                </button>
              )}
            </div>
          </div>

          {error && <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        </div>
      </div>
    </div>
  );
}

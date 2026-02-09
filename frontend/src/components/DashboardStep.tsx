'use client';

import { useState, useEffect, useMemo } from 'react';
import { compareRuns } from '@/lib/api';
import type { ResearchSession, AnalysisResult, ResearchRun } from '@/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  TrendingUp,
  Award,
  ThumbsUp,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  Clock,
  Cpu,
} from 'lucide-react';

interface DashboardStepProps {
  session: ResearchSession;
}

type ViewMode = 'single' | 'compare';

export default function DashboardStep({ session }: DashboardStepProps) {
  const [expandedResponses, setExpandedResponses] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<Record<string, any[]> | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [modelFilter, setModelFilter] = useState<string>('all');

  // Runs that have analysis
  const analyzedRuns = session.runs.filter(r => r.analysis && r.analysis.length > 0);

  // Collect all model names from analysis results
  const availableModels = useMemo(() => {
    const models = new Set<string>();
    for (const run of session.runs) {
      if (run.analysis) {
        for (const a of run.analysis) {
          if (a.model_name) models.add(a.model_name);
        }
      }
    }
    if (session.analysis) {
      for (const a of session.analysis) {
        if (a.model_name) models.add(a.model_name);
      }
    }
    return Array.from(models);
  }, [session]);

  // Determine which analysis to display (filtered by model)
  const currentAnalysis: AnalysisResult[] | undefined = useMemo(() => {
    let analysis: AnalysisResult[] | undefined;
    if (selectedRunId) {
      const run = session.runs.find(r => r.id === selectedRunId);
      analysis = run?.analysis || undefined;
    } else {
      analysis = session.analysis;
    }
    if (!analysis) return undefined;
    if (modelFilter === 'all') return analysis;
    return analysis.filter(a => a.model_name === modelFilter);
  }, [selectedRunId, session, modelFilter]);

  // Determine which responses to display
  const currentResponses = useMemo(() => {
    if (selectedRunId) {
      const run = session.runs.find(r => r.id === selectedRunId);
      return run?.responses || [];
    }
    return session.responses;
  }, [selectedRunId, session]);

  // Load comparison data when switching to compare mode
  useEffect(() => {
    if (viewMode === 'compare' && analyzedRuns.length >= 2 && !comparisonData) {
      loadComparison();
    }
  }, [viewMode]);

  const loadComparison = async () => {
    setLoadingComparison(true);
    try {
      const raw = await compareRuns(session.id);
      // Normalize: API returns `timestamp`, standardize to `run_date`
      const normalized: Record<string, any[]> = {};
      for (const [brand, entries] of Object.entries(raw)) {
        normalized[brand] = entries.map((e: any) => ({
          ...e,
          run_date: e.run_date || e.timestamp,
        }));
      }
      setComparisonData(normalized);
    } catch {
      // Build comparison data locally from runs
      const localData: Record<string, any[]> = {};
      for (const run of analyzedRuns) {
        if (!run.analysis) continue;
        for (const result of run.analysis) {
          if (!localData[result.brand]) {
            localData[result.brand] = [];
          }
          localData[result.brand].push({
            run_date: run.started_at,
            total_mentions: result.total_mentions,
            recommendation_count: result.recommendation_count,
            avg_sentiment_score: result.avg_sentiment_score,
            share_of_voice: result.share_of_voice,
          });
        }
      }
      setComparisonData(localData);
    } finally {
      setLoadingComparison(false);
    }
  };

  if (!currentAnalysis || currentAnalysis.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-600">No analysis results available yet.</p>
        </div>
      </div>
    );
  }

  const topBrand = currentAnalysis[0];

  // Prepare data for visualizations
  const rankingData = currentAnalysis.map((result) => ({
    brand: result.brand,
    mentions: result.total_mentions,
    recommendations: result.recommendation_count,
    sentiment: ((result.avg_sentiment_score + 1) / 2) * 100,
  }));

  const shareOfVoiceData = currentAnalysis.map((result) => ({
    brand: result.brand,
    value: result.share_of_voice * 100,
  }));

  // Radar chart - persona affinity
  const personaAffinityData = session.personas.map((persona) => {
    const data: any = { persona: persona.name };
    currentAnalysis.forEach((result) => {
      // Claude may key by persona ID or persona name — check both
      const affinity = result.persona_affinity[persona.id!]
        ?? result.persona_affinity[persona.name]
        ?? 0;
      data[result.brand] = affinity * 100;
    });
    return data;
  });

  // Comparison line chart data
  const comparisonLineData = useMemo(() => {
    if (!comparisonData) return [];
    // Create time-series data points
    const allDates = new Set<string>();
    Object.values(comparisonData).forEach(entries => {
      entries.forEach(e => allDates.add(e.run_date));
    });
    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map((date, idx) => {
      const point: any = {
        run: `Run ${idx + 1}`,
        date: new Date(date).toLocaleDateString(),
      };
      Object.entries(comparisonData).forEach(([brand, entries]) => {
        const entry = entries.find(e => e.run_date === date);
        if (entry) {
          point[`${brand}_mentions`] = entry.total_mentions;
          point[`${brand}_sentiment`] = ((entry.avg_sentiment_score + 1) / 2) * 100;
          point[`${brand}_sov`] = entry.share_of_voice * 100;
        }
      });
      return point;
    });
  }, [comparisonData]);

  const COLORS = [
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#10b981',
    '#6366f1',
    '#f43f5e',
  ];

  const brands = currentAnalysis.map(r => r.brand);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Controls Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4 flex-wrap">
        {analyzedRuns.length >= 2 && (
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            <button
              onClick={() => setViewMode('single')}
              className={`px-4 py-2 text-sm font-medium ${
                viewMode === 'single'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Single Run
            </button>
            <button
              onClick={() => setViewMode('compare')}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 ${
                viewMode === 'compare'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <GitCompareArrows className="w-4 h-4" />
              Compare Over Time
            </button>
          </div>
        )}

        {viewMode === 'single' && analyzedRuns.length >= 2 && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <select
              value={selectedRunId || ''}
              onChange={(e) => setSelectedRunId(e.target.value || null)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Latest Analysis</option>
              {analyzedRuns.map((run, idx) => (
                <option key={run.id} value={run.id}>
                  Run #{idx + 1} — {new Date(run.started_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Model Filter */}
        {availableModels.length > 1 && viewMode === 'single' && (
          <div className="flex items-center gap-2 ml-auto">
            <Cpu className="w-4 h-4 text-slate-500" />
            <div className="flex rounded-lg border border-slate-300 overflow-hidden">
              <button
                onClick={() => setModelFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium ${
                  modelFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                All Models
              </button>
              {availableModels.map(m => (
                <button
                  key={m}
                  onClick={() => setModelFilter(m)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize ${
                    modelFilter === m ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m === 'chatgpt' ? 'ChatGPT' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Comparison View */}
      {viewMode === 'compare' && analyzedRuns.length >= 2 && (
        <div className="space-y-6">
          {loadingComparison ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
              <p className="text-slate-600">Loading comparison data...</p>
            </div>
          ) : comparisonLineData.length > 0 ? (
            <>
              {/* Mentions Over Time */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900">Mentions Over Time</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    How brand mentions change across research runs
                  </p>
                </div>
                <div className="p-8">
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={comparisonLineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {brands.map((brand, idx) => (
                        <Line
                          key={brand}
                          type="monotone"
                          dataKey={`${brand}_mentions`}
                          name={`${brand}`}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 5 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sentiment Over Time */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900">Sentiment Over Time</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Brand sentiment trends (0% = very negative, 100% = very positive)
                  </p>
                </div>
                <div className="p-8">
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={comparisonLineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      {brands.map((brand, idx) => (
                        <Line
                          key={brand}
                          type="monotone"
                          dataKey={`${brand}_sentiment`}
                          name={`${brand}`}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 5 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Share of Voice Over Time */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900">Share of Voice Over Time</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    How each brand's share of conversation changes
                  </p>
                </div>
                <div className="p-8">
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={comparisonLineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      {brands.map((brand, idx) => (
                        <Line
                          key={brand}
                          type="monotone"
                          dataKey={`${brand}_sov`}
                          name={`${brand}`}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 5 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
              <p className="text-slate-600">Run research at least twice to see comparison data.</p>
            </div>
          )}
        </div>
      )}

      {/* Single Run View */}
      {viewMode === 'single' && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5" />
                <span className="text-sm font-medium opacity-90">Top Brand</span>
              </div>
              <p className="text-2xl font-bold">{topBrand.brand}</p>
              <p className="text-sm opacity-75 mt-1">{topBrand.total_mentions} mentions</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-slate-600" />
                <span className="text-sm font-medium text-slate-600">Total Mentions</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {currentAnalysis.reduce((sum, r) => sum + r.total_mentions, 0)}
              </p>
              <p className="text-sm text-slate-500 mt-1">Across all brands</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <ThumbsUp className="w-5 h-5 text-slate-600" />
                <span className="text-sm font-medium text-slate-600">Recommendations</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {currentAnalysis.reduce((sum, r) => sum + r.recommendation_count, 0)}
              </p>
              <p className="text-sm text-slate-500 mt-1">Explicit recommendations</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-slate-600" />
                <span className="text-sm font-medium text-slate-600">Avg Sentiment</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {(
                  (currentAnalysis.reduce((sum, r) => sum + r.avg_sentiment_score, 0) /
                    currentAnalysis.length +
                    1) *
                  50
                ).toFixed(0)}
                %
              </p>
              <p className="text-sm text-slate-500 mt-1">Positive sentiment</p>
            </div>
          </div>

          {/* Brand Rankings */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">
                Brand Rankings
                {modelFilter !== 'all' && (
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    ({modelFilter === 'chatgpt' ? 'ChatGPT' : modelFilter.charAt(0).toUpperCase() + modelFilter.slice(1)} only)
                  </span>
                )}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Composite scores based on mentions, recommendations, and sentiment
              </p>
            </div>
            <div className="p-8">
              <div className="space-y-4">
                {currentAnalysis.map((result, index) => (
                  <div
                    key={result.brand}
                    className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        index === 0
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-white'
                          : index === 1
                          ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                          : index === 2
                          ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{result.brand}</h3>
                      <div className="flex gap-4 mt-1 text-xs text-slate-600">
                        <span>{result.total_mentions} mentions</span>
                        <span>{result.recommendation_count} recommendations</span>
                        <span>
                          {((result.avg_sentiment_score + 1) * 50).toFixed(0)}% positive
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">
                        {(result.share_of_voice * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-600">Share of Voice</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Visualizations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">Mentions & Recommendations</h3>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={rankingData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="brand" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="mentions" fill="#3b82f6" name="Mentions" />
                    <Bar dataKey="recommendations" fill="#8b5cf6" name="Recommendations" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart - Share of Voice */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">Share of Voice</h3>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={shareOfVoiceData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ brand, value }) => `${brand}: ${value.toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {shareOfVoiceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Radar Chart - Persona Affinity */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Persona x Brand Affinity</h2>
              <p className="text-sm text-slate-600 mt-1">
                Which brands resonate with which consumer segments
              </p>
            </div>
            <div className="p-8">
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={personaAffinityData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="persona" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  {currentAnalysis.map((result, index) => (
                    <Radar
                      key={result.brand}
                      name={result.brand}
                      dataKey={result.brand}
                      stroke={COLORS[index % COLORS.length]}
                      fill={COLORS[index % COLORS.length]}
                      fillOpacity={0.3}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Raw Responses */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button
              onClick={() => setExpandedResponses(!expandedResponses)}
              className="w-full px-8 py-6 border-b border-slate-200 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div>
                <h2 className="text-xl font-bold text-slate-900">Raw Data</h2>
                <p className="text-sm text-slate-600 mt-1">
                  View all {currentResponses.length} question-response pairs
                </p>
              </div>
              {expandedResponses ? (
                <ChevronUp className="w-5 h-5 text-slate-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-600" />
              )}
            </button>
            {expandedResponses && (
              <div className="p-8 space-y-4 max-h-96 overflow-y-auto">
                {currentResponses.map((response) => {
                  const question = session.questions.find((q) => q.id === response.question_id);
                  const persona = session.personas.find((p) => p.id === response.persona_id);

                  return (
                    <div
                      key={response.id}
                      className="p-4 border border-slate-200 rounded-lg space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          {persona?.name}
                        </span>
                        {response.model_name && (
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            response.model_name === 'chatgpt'
                              ? 'bg-green-100 text-green-700'
                              : response.model_name === 'claude'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {response.model_name === 'chatgpt' ? 'ChatGPT' : response.model_name.charAt(0).toUpperCase() + response.model_name.slice(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-900">
                        Q: {question?.question_text}
                      </p>
                      <p className="text-sm text-slate-700">A: {response.response_text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

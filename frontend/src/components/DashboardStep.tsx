'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
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
  Tag,
  RefreshCw,
} from 'lucide-react';

interface DashboardStepProps {
  session: ResearchSession;
  onRerun?: () => void;
}

type ViewMode = 'single' | 'compare';

export default function DashboardStep({ session, onRerun }: DashboardStepProps) {
  const [expandedResponses, setExpandedResponses] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<Record<string, any[]> | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');

  const researchAreas = session.setup.research_areas || [];
  const primaryBrand = session.setup.primary_brand;

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

  // Determine which analysis to display (filtered or merged by model)
  const currentAnalysis: AnalysisResult[] | undefined = useMemo(() => {
    let analysis: AnalysisResult[] | undefined;
    if (selectedRunId) {
      const run = session.runs.find(r => r.id === selectedRunId);
      analysis = run?.analysis || undefined;
    } else {
      analysis = session.analysis;
    }
    if (!analysis) return undefined;

    if (modelFilter !== 'all') {
      return analysis.filter(a => a.model_name === modelFilter);
    }

    // Merge results across models: average scores per brand
    const brandMap = new Map<string, AnalysisResult[]>();
    for (const a of analysis) {
      const existing = brandMap.get(a.brand);
      if (existing) {
        existing.push(a);
      } else {
        brandMap.set(a.brand, [a]);
      }
    }

    return Array.from(brandMap.entries()).map(([brand, items]) => {
      const n = items.length;
      const mergedAffinity: { [key: string]: number } = {};
      for (const item of items) {
        for (const [key, val] of Object.entries(item.persona_affinity)) {
          mergedAffinity[key] = (mergedAffinity[key] || 0) + val / n;
        }
      }

      // Merge topic_scores across models
      let mergedTopicScores: { [area: string]: { score: number; mentions: number } } | undefined;
      const itemsWithTopics = items.filter(i => i.topic_scores);
      if (itemsWithTopics.length > 0) {
        mergedTopicScores = {};
        const allAreas = new Set<string>();
        for (const item of itemsWithTopics) {
          for (const area of Object.keys(item.topic_scores!)) {
            allAreas.add(area);
          }
        }
        for (const area of allAreas) {
          const areaItems = itemsWithTopics.filter(i => i.topic_scores![area]);
          const an = areaItems.length;
          mergedTopicScores[area] = {
            score: areaItems.reduce((s, i) => s + (i.topic_scores![area]?.score || 0), 0) / an,
            mentions: Math.round(areaItems.reduce((s, i) => s + (i.topic_scores![area]?.mentions || 0), 0) / an),
          };
        }
      }

      return {
        brand,
        total_mentions: Math.round(items.reduce((s, i) => s + i.total_mentions, 0) / n),
        recommendation_count: Math.round(items.reduce((s, i) => s + i.recommendation_count, 0) / n),
        first_mention_count: Math.round(items.reduce((s, i) => s + i.first_mention_count, 0) / n),
        avg_sentiment_score: items.reduce((s, i) => s + i.avg_sentiment_score, 0) / n,
        share_of_voice: items.reduce((s, i) => s + i.share_of_voice, 0) / n,
        persona_affinity: mergedAffinity,
        model_name: 'all',
        topic_scores: mergedTopicScores,
      };
    }).sort((a, b) => b.share_of_voice - a.share_of_voice);
  }, [selectedRunId, session, modelFilter]);

  // Determine which responses to display
  const currentResponses = useMemo(() => {
    if (selectedRunId) {
      const run = session.runs.find(r => r.id === selectedRunId);
      return run?.responses || [];
    }
    return session.responses;
  }, [selectedRunId, session]);

  // Per-topic chart data
  const topicChartData = useMemo(() => {
    if (!currentAnalysis || researchAreas.length === 0) return [];
    const hasTopicScores = currentAnalysis.some(a => a.topic_scores);
    if (!hasTopicScores) return [];

    return researchAreas.map(area => {
      const point: any = { area };
      for (const result of currentAnalysis) {
        const ts = result.topic_scores?.[area];
        point[result.brand] = ts ? Math.round(ts.score * 100) : 0;
      }
      return point;
    });
  }, [currentAnalysis, researchAreas]);

  // Primary brand deltas
  const primaryBrandDeltas = useMemo(() => {
    if (!primaryBrand || !currentAnalysis) return null;
    const primary = currentAnalysis.find(a => a.brand === primaryBrand);
    if (!primary) return null;

    return currentAnalysis
      .filter(a => a.brand !== primaryBrand)
      .map(a => ({
        brand: a.brand,
        mentionsDelta: a.total_mentions - primary.total_mentions,
        sentimentDelta: a.avg_sentiment_score - primary.avg_sentiment_score,
        sovDelta: (a.share_of_voice - primary.share_of_voice) * 100,
      }));
  }, [currentAnalysis, primaryBrand]);

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
      const normalized: Record<string, any[]> = {};
      for (const [brand, entries] of Object.entries(raw)) {
        normalized[brand] = entries.map((e: any) => ({
          ...e,
          run_date: e.run_date || e.timestamp,
        }));
      }
      setComparisonData(normalized);
    } catch {
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

  // Custom tooltip for radar chart showing persona details
  const PersonaTooltip = ({ active, payload, label }: any) => {
    if (!active || !label) return null;
    const persona = session.personas.find(p => p.name === label);
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-[280px]">
        <p className="font-semibold text-slate-900 text-sm">{label}</p>
        {persona && (
          <>
            <p className="text-xs text-indigo-600 font-medium mt-0.5">{persona.archetype}</p>
            <p className="text-xs text-slate-600 mt-1">{persona.description}</p>
            {persona.key_priorities && persona.key_priorities.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {persona.key_priorities.map((p: string) => (
                  <span key={p} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {payload && payload.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex justify-between text-xs">
                <span style={{ color: entry.color }}>{entry.name}</span>
                <span className="font-medium text-slate-700">{Math.round(entry.value)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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
        {onRerun && (
          <button
            onClick={onRerun}
            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-emerald-600 to-cyan-600 text-white rounded-lg hover:from-emerald-700 hover:to-cyan-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Run Again
          </button>
        )}
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

      {/* Topic Filter */}
      {researchAreas.length > 0 && viewMode === 'single' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
          <Tag className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-medium text-slate-600">Topic:</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTopicFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                topicFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700'
              }`}
            >
              All Topics
            </button>
            {researchAreas.map(area => (
              <button
                key={area}
                onClick={() => setTopicFilter(area)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  topicFilter === area
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>
      )}

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
                    How each brand&apos;s share of conversation changes
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
          {/* Primary Brand Comparison */}
          {primaryBrand && primaryBrandDeltas && primaryBrandDeltas.length > 0 && topicFilter === 'all' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-900">
                  Comparison vs {primaryBrand}
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  How competitors perform relative to your brand
                </p>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {primaryBrandDeltas.map(d => (
                    <div key={d.brand} className="border border-slate-200 rounded-lg p-4">
                      <h4 className="font-semibold text-slate-900 mb-3">{d.brand}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Mentions</span>
                          <span className={d.mentionsDelta > 0 ? 'text-red-600 font-medium' : d.mentionsDelta < 0 ? 'text-green-600 font-medium' : 'text-slate-500'}>
                            {d.mentionsDelta > 0 ? '+' : ''}{d.mentionsDelta}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Sentiment</span>
                          <span className={d.sentimentDelta > 0 ? 'text-red-600 font-medium' : d.sentimentDelta < 0 ? 'text-green-600 font-medium' : 'text-slate-500'}>
                            {d.sentimentDelta > 0 ? '+' : ''}{(d.sentimentDelta * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Share of Voice</span>
                          <span className={d.sovDelta > 0 ? 'text-red-600 font-medium' : d.sovDelta < 0 ? 'text-green-600 font-medium' : 'text-slate-500'}>
                            {d.sovDelta > 0 ? '+' : ''}{d.sovDelta.toFixed(1)}pp
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Topic-specific view */}
          {topicFilter !== 'all' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-900">
                  {topicFilter} — Brand Ranking
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Score and mentions within this research area
                </p>
              </div>
              <div className="p-8">
                <div className="space-y-3">
                  {currentAnalysis
                    .filter(a => a.topic_scores?.[topicFilter])
                    .sort((a, b) => (b.topic_scores?.[topicFilter]?.score || 0) - (a.topic_scores?.[topicFilter]?.score || 0))
                    .map((result, index) => {
                      const ts = result.topic_scores![topicFilter];
                      const primaryTs = primaryBrand
                        ? currentAnalysis.find(a => a.brand === primaryBrand)?.topic_scores?.[topicFilter]
                        : null;
                      const delta = primaryTs && result.brand !== primaryBrand
                        ? ts.score - primaryTs.score
                        : null;

                      return (
                        <div key={result.brand} className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-white'
                            : index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                            : index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'
                            : 'bg-slate-100 text-slate-600'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">
                              {result.brand}
                              {result.brand === primaryBrand && (
                                <span className="ml-2 text-xs text-indigo-600 font-normal">(your brand)</span>
                              )}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">{ts.mentions} mentions</p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-slate-900">
                              {Math.round(ts.score * 100)}
                            </div>
                            <div className="text-xs text-slate-600">score</div>
                          </div>
                          {delta !== null && (
                            <div className={`text-sm font-medium ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                              {delta > 0 ? '+' : ''}{(delta * 100).toFixed(0)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Overview Cards — only show when viewing all topics */}
          {topicFilter === 'all' && (
            <>
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
                          <h3 className="font-semibold text-slate-900">
                            {result.brand}
                            {result.brand === primaryBrand && (
                              <span className="ml-2 text-xs text-indigo-600 font-normal">(your brand)</span>
                            )}
                          </h3>
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

              {/* Performance by Research Area */}
              {topicChartData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-8 py-6 border-b border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900">Performance by Research Area</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      How each brand performs within each area (0-100)
                    </p>
                  </div>
                  <div className="p-8">
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={topicChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="area" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Legend />
                        {brands.map((brand, idx) => (
                          <Bar key={brand} dataKey={brand} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Fallback when topic scores are missing */}
              {topicChartData.length === 0 && researchAreas.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-8 py-6 border-b border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900">Performance by Research Area</h2>
                  </div>
                  <div className="p-8 text-center">
                    <p className="text-slate-500 text-sm">
                      Topic scores not available for this analysis. Re-run and re-analyze to generate per-area scores.
                    </p>
                  </div>
                </div>
              )}

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
                      <Tooltip content={<PersonaTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

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
              <div className="p-8 space-y-4 max-h-[600px] overflow-y-auto">
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
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown>{response.response_text}</ReactMarkdown>
                      </div>
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

'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { compareRuns, createShareLink, revokeShareLink, getContextualRelevance, getChangeDetection } from '@/lib/api';
import type { ContextualRelevance, ChangeDetectionResult } from '@/lib/api';
import type { ResearchSession, AnalysisResult, StatisticalResult, ResearchRun } from '@/types';
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
  LineChart,
  Line,
} from 'recharts';
import {
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  Clock,
  Cpu,
  Tag,
  RefreshCw,
  Settings,
  Share2,
  Copy,
  Check,
  Link2Off,
  X,
  Search,
} from 'lucide-react';
import type { QueryResponse } from '@/types';

interface DashboardStepProps {
  session: ResearchSession;
  onRerun?: () => void;
  onEditSetup?: () => void;
  readOnly?: boolean;
}

type ViewMode = 'single' | 'compare';

export default function DashboardStep({ session, onRerun, onEditSetup, readOnly = false }: DashboardStepProps) {
  const [expandedResponses, setExpandedResponses] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<Record<string, any[]> | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [shareToken, setShareToken] = useState<string | null>(session.share_token || null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [contextualRelevance, setContextualRelevance] = useState<ContextualRelevance | null>(null);
  const [changeDetection, setChangeDetection] = useState<ChangeDetectionResult | null>(null);

  // Collapsible panel state — panels default to open except raw-data
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    'raw-data': true,
  });
  const togglePanel = (id: string) =>
    setCollapsedPanels(prev => ({ ...prev, [id]: !prev[id] }));
  const isOpen = (id: string) => !collapsedPanels[id];

  const handleShare = async () => {
    setShareLoading(true);
    try {
      const { share_token } = await createShareLink(session.id);
      setShareToken(share_token);
    } catch (err) {
      console.error('Failed to create share link:', err);
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevokeShare = async () => {
    setShareLoading(true);
    try {
      await revokeShareLink(session.id);
      setShareToken(null);
    } catch (err) {
      console.error('Failed to revoke share link:', err);
    } finally {
      setShareLoading(false);
    }
  };

  const getShareUrl = () => `${window.location.origin}/brandtracker/shared/${shareToken}`;

  const handleCopyShareLink = async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      const input = document.querySelector<HTMLInputElement>('[data-share-url]');
      if (input) {
        input.select();
        document.execCommand('copy');
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    }
  };

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

  // Get statistical results for the current run (if available)
  const currentStats: StatisticalResult[] | null = useMemo(() => {
    let run: ResearchRun | undefined;
    if (selectedRunId) {
      run = session.runs.find(r => r.id === selectedRunId);
    } else {
      run = [...session.runs].reverse().find(r => r.statistical_results && r.statistical_results.length > 0);
    }
    if (!run?.statistical_results || run.statistical_results.length === 0) return null;

    if (modelFilter !== 'all') {
      return run.statistical_results.filter(s => s.model_name === modelFilter);
    }
    return run.statistical_results;
  }, [selectedRunId, session, modelFilter]);

  // Merge statistical results across models so each brand appears once
  const mergedStats: StatisticalResult[] | null = useMemo(() => {
    if (!currentStats) return null;

    // If already filtered to one model, no merging needed
    if (modelFilter !== 'all') return currentStats;

    // Group by brand
    const brandMap = new Map<string, StatisticalResult[]>();
    for (const stat of currentStats) {
      const existing = brandMap.get(stat.brand);
      if (existing) existing.push(stat);
      else brandMap.set(stat.brand, [stat]);
    }

    // If each brand only has one entry, no merging needed
    const needsMerge = Array.from(brandMap.values()).some(items => items.length > 1);
    if (!needsMerge) return currentStats;

    return Array.from(brandMap.entries()).map(([brand, items]) => {
      const n = items.length;
      const mergedAffinity: { [key: string]: number } = {};
      for (const item of items) {
        for (const [key, val] of Object.entries(item.persona_affinity)) {
          mergedAffinity[key] = (mergedAffinity[key] || 0) + val / n;
        }
      }
      return {
        brand,
        model_name: 'all',
        mention_frequency: items.reduce((s, i) => s + i.mention_frequency, 0) / n,
        avg_rank: items.reduce((s, i) => s + i.avg_rank, 0) / n,
        top3_rate: items.reduce((s, i) => s + i.top3_rate, 0) / n,
        first_mention_rate: items.reduce((s, i) => s + i.first_mention_rate, 0) / n,
        recommendation_rate: items.reduce((s, i) => s + i.recommendation_rate, 0) / n,
        mention_frequency_ci: [
          Math.min(...items.map(i => i.mention_frequency_ci[0])),
          Math.max(...items.map(i => i.mention_frequency_ci[1])),
        ] as [number, number],
        avg_rank_ci: [
          Math.min(...items.map(i => i.avg_rank_ci[0])),
          Math.max(...items.map(i => i.avg_rank_ci[1])),
        ] as [number, number],
        top3_rate_ci: [
          Math.min(...items.map(i => i.top3_rate_ci[0])),
          Math.max(...items.map(i => i.top3_rate_ci[1])),
        ] as [number, number],
        avg_sentiment_score: items.reduce((s, i) => s + i.avg_sentiment_score, 0) / n,
        sentiment_ci: [
          Math.min(...items.map(i => i.sentiment_ci[0])),
          Math.max(...items.map(i => i.sentiment_ci[1])),
        ] as [number, number],
        total_iterations: items[0].total_iterations,
        total_mentions: Math.round(items.reduce((s, i) => s + i.total_mentions, 0) / n),
        share_of_voice: items.reduce((s, i) => s + i.share_of_voice, 0) / n,
        recommendation_count: Math.round(items.reduce((s, i) => s + (i.recommendation_count || 0), 0) / n),
        first_mention_count: Math.round(items.reduce((s, i) => s + (i.first_mention_count || 0), 0) / n),
        recommendation_strength: items.reduce((s, i) => s + (i.recommendation_strength || 0), 0) / n,
        recommendation_strength_ci: [
          Math.min(...items.map(i => (i.recommendation_strength_ci || [0, 0])[0])),
          Math.max(...items.map(i => (i.recommendation_strength_ci || [0, 0])[1])),
        ] as [number, number],
        persona_affinity: mergedAffinity,
      };
    }).sort((a, b) => b.share_of_voice - a.share_of_voice);
  }, [currentStats, modelFilter]);

  const hasStatisticalData = mergedStats !== null && mergedStats.length > 0;
  const selectedRun = useMemo(() => {
    if (selectedRunId) return session.runs.find(r => r.id === selectedRunId);
    return [...session.runs].reverse().find(r => r.statistical_results && r.statistical_results.length > 0);
  }, [selectedRunId, session]);
  const iterationsPerQuestion = selectedRun?.iterations_per_question || 1;
  const totalResponses = hasStatisticalData ? mergedStats[0].total_iterations : 0;

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

  // ---- Helpers for co-mentions and drill-down ----

  const extractBrandsFromResponse = (resp: QueryResponse): string[] => {
    const sd = resp.structured_data;
    if (!sd) return [];
    const knownBrands = session.setup.brands;
    const knownLower = knownBrands.map(b => b.toLowerCase());
    const found: string[] = [];

    const items = sd.recommendations || sd.rankings || [];
    for (const item of items) {
      const name = (item.brand || '').trim().toLowerCase();
      const idx = knownLower.findIndex(k => k === name || k.includes(name) || name.includes(k));
      if (idx !== -1 && !found.includes(knownBrands[idx])) {
        found.push(knownBrands[idx]);
      }
    }

    if (sd.chosen_brand) {
      const name = sd.chosen_brand.trim().toLowerCase();
      const idx = knownLower.findIndex(k => k === name || k.includes(name) || name.includes(k));
      if (idx !== -1 && !found.includes(knownBrands[idx])) {
        found.push(knownBrands[idx]);
      }
    }

    return found;
  };

  const getRankForBrand = (resp: QueryResponse, brand: string): number | null => {
    const sd = resp.structured_data;
    if (!sd) return null;
    const items = sd.recommendations || sd.rankings || [];
    const lower = brand.toLowerCase();
    const item = items.find(i => {
      const n = (i.brand || '').trim().toLowerCase();
      return n === lower || n.includes(lower) || lower.includes(n);
    });
    return item?.rank ?? null;
  };

  // Co-mention computation
  const coMentionData = useMemo(() => {
    const coMentions: Record<string, Record<string, number>> = {};
    for (const brand of session.setup.brands) {
      coMentions[brand] = {};
    }
    for (const resp of currentResponses) {
      const mentioned = extractBrandsFromResponse(resp);
      for (const brandA of mentioned) {
        for (const brandB of mentioned) {
          if (brandA !== brandB && coMentions[brandA]) {
            coMentions[brandA][brandB] = (coMentions[brandA][brandB] || 0) + 1;
          }
        }
      }
    }
    return coMentions;
  }, [currentResponses, session.setup.brands]);

  // Drill-down state
  const [drilldown, setDrilldown] = useState<{
    brand: string;
    metric: 'mentions' | 'recommendations' | 'first_mention' | 'co_mention';
    label: string;
  } | null>(null);

  const drilldownResponses = useMemo(() => {
    if (!drilldown) return [];
    return currentResponses.filter(resp => {
      const mentioned = extractBrandsFromResponse(resp);
      const brandLower = drilldown.brand.toLowerCase();
      const hasBrand = mentioned.some(b => b.toLowerCase() === brandLower);

      switch (drilldown.metric) {
        case 'mentions':
          return hasBrand;
        case 'recommendations': {
          const rank = getRankForBrand(resp, drilldown.brand);
          return rank !== null && rank <= 3;
        }
        case 'first_mention': {
          const rank = getRankForBrand(resp, drilldown.brand);
          return rank === 1;
        }
        case 'co_mention':
          return hasBrand && primaryBrand
            ? mentioned.some(b => b.toLowerCase() === primaryBrand.toLowerCase())
            : false;
        default:
          return false;
      }
    });
  }, [drilldown, currentResponses, primaryBrand]);

  // Co-mention chart data for the focus brand
  const coMentionChartData = useMemo(() => {
    const focusBrand = primaryBrand || (currentAnalysis?.[0]?.brand);
    if (!focusBrand || !coMentionData[focusBrand]) return [];
    return Object.entries(coMentionData[focusBrand])
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([brand, count]) => ({ brand, count }));
  }, [coMentionData, primaryBrand, currentAnalysis]);

  const coMentionFocusBrand = primaryBrand || (currentAnalysis?.[0]?.brand) || '';

  // Load contextual relevance data for current run
  useEffect(() => {
    if (!selectedRun) return;
    getContextualRelevance(session.id, selectedRun.id)
      .then(setContextualRelevance)
      .catch(() => setContextualRelevance(null));
  }, [selectedRun?.id]);

  // Load change detection data when we have 2+ runs with stats
  useEffect(() => {
    const runsWithStats = session.runs.filter(r => r.statistical_results && r.statistical_results.length > 0);
    if (runsWithStats.length < 2 || !selectedRun) {
      setChangeDetection(null);
      return;
    }
    // Compare selected run against the previous run (by start time)
    const sorted = [...runsWithStats].sort((a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    const selectedIdx = sorted.findIndex(r => r.id === selectedRun.id);
    if (selectedIdx <= 0) {
      setChangeDetection(null);
      return;
    }
    const prevRun = sorted[selectedIdx - 1];
    getChangeDetection(session.id, prevRun.id, selectedRun.id)
      .then(setChangeDetection)
      .catch(() => setChangeDetection(null));
  }, [selectedRun?.id, session.runs.length]);

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

  // Custom tooltip for radar chart
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

  // ---- Collapsible panel header helper ----
  const PanelHeader = ({
    id,
    title,
    subtitle,
    badge,
  }: {
    id: string;
    title: string;
    subtitle?: string;
    badge?: string;
  }) => (
    <button
      onClick={() => togglePanel(id)}
      className="w-full px-8 py-6 border-b border-slate-200 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
    >
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          {title}
          {badge && (
            <span className="text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </h2>
        {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
      </div>
      {isOpen(id) ? (
        <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
      ) : (
        <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
      )}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Controls Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4 flex-wrap">
        {onEditSetup && !readOnly && (
          <button
            onClick={onEditSetup}
            className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" />
            Edit Setup
          </button>
        )}
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

        {/* Share Controls */}
        {!readOnly && (
          <div className={`flex items-center gap-2 ${availableModels.length <= 1 ? 'ml-auto' : ''}`}>
            {shareToken ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  data-share-url
                  readOnly
                  value={getShareUrl()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-600 w-[340px] max-w-[50vw] font-mono truncate"
                />
                <button
                  onClick={handleCopyShareLink}
                  className="px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1.5"
                >
                  {shareCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {shareCopied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleRevokeShare}
                  disabled={shareLoading}
                  className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 rounded-lg hover:bg-red-50 flex items-center gap-1.5"
                >
                  <Link2Off className="w-4 h-4" />
                  Revoke
                </button>
              </div>
            ) : (
              <button
                onClick={handleShare}
                disabled={shareLoading}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 flex items-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                {shareLoading ? 'Sharing...' : 'Share Dashboard'}
              </button>
            )}
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
                <PanelHeader id="compare-mentions" title="Mentions Over Time" subtitle="How brand mentions change across research runs" />
                {isOpen('compare-mentions') && (
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
                )}
              </div>

              {/* Sentiment Over Time */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader id="compare-sentiment" title="Sentiment Over Time" subtitle="Brand sentiment trends (0% = very negative, 100% = very positive)" />
                {isOpen('compare-sentiment') && (
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
                )}
              </div>

              {/* Share of Voice Over Time */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader id="compare-sov" title="Share of Voice Over Time" subtitle="How each brand's share of conversation changes" />
                {isOpen('compare-sov') && (
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
                )}
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
          {/* Topic-specific view */}
          {topicFilter !== 'all' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <PanelHeader id="topic-ranking" title={`${topicFilter} — Brand Ranking`} subtitle="Score and mentions within this research area" />
              {isOpen('topic-ranking') && (
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
              )}
            </div>
          )}

          {/* === PANEL ORDER (topicFilter === 'all') === */}
          {topicFilter === 'all' && (
            <>
              {/* 1. Brand Rankings */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader
                  id="brand-rankings"
                  title={`Brand Rankings${modelFilter !== 'all' ? ` (${modelFilter === 'chatgpt' ? 'ChatGPT' : modelFilter.charAt(0).toUpperCase() + modelFilter.slice(1)} only)` : ''}`}
                  subtitle={hasStatisticalData
                    ? `Based on ${iterationsPerQuestion} iterations per question (${totalResponses} total responses)`
                    : 'Composite scores based on mentions, recommendations, and sentiment'}
                />
                {isOpen('brand-rankings') && (
                  <div className="p-8">
                    <div className="space-y-4">
                      {currentAnalysis.map((result, index) => {
                        const stat = mergedStats?.find(s => s.brand === result.brand);
                        return (
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
                                {stat ? (
                                  <>
                                    <button
                                      onClick={() => setDrilldown({ brand: result.brand, metric: 'mentions', label: `${result.brand} — All mentions` })}
                                      className="hover:text-blue-600 hover:underline cursor-pointer"
                                    >
                                      {(stat.mention_frequency * 100).toFixed(1)}% mention rate
                                    </button>
                                    <button
                                      onClick={() => setDrilldown({ brand: result.brand, metric: 'recommendations', label: `${result.brand} — Top-3 recommendations` })}
                                      className="hover:text-blue-600 hover:underline cursor-pointer"
                                    >
                                      {(stat.top3_rate * 100).toFixed(1)}% top-3 rate
                                    </button>
                                    <span>
                                      {((stat.avg_sentiment_score + 1) * 50).toFixed(0)}% positive
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setDrilldown({ brand: result.brand, metric: 'mentions', label: `${result.brand} — All mentions` })}
                                      className="hover:text-blue-600 hover:underline cursor-pointer"
                                    >
                                      {result.total_mentions} mentions
                                    </button>
                                    <button
                                      onClick={() => setDrilldown({ brand: result.brand, metric: 'recommendations', label: `${result.brand} — Top-3 recommendations` })}
                                      className="hover:text-blue-600 hover:underline cursor-pointer"
                                    >
                                      {result.recommendation_count} recommendations
                                    </button>
                                    <span>
                                      {((result.avg_sentiment_score + 1) * 50).toFixed(0)}% positive
                                    </span>
                                  </>
                                )}
                              </div>
                              {/* Co-mention badges */}
                              {coMentionData[result.brand] && Object.keys(coMentionData[result.brand]).length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <span className="text-[10px] text-slate-400">Often with:</span>
                                  {Object.entries(coMentionData[result.brand])
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 3)
                                    .map(([other, count]) => (
                                      <button
                                        key={other}
                                        onClick={() => setDrilldown({ brand: result.brand, metric: 'co_mention', label: `${result.brand} + ${other} co-mentions` })}
                                        className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] rounded hover:bg-purple-100 cursor-pointer"
                                      >
                                        {other} ({count})
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-slate-900">
                                {(result.share_of_voice * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-slate-600">Share of Voice</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Drill-Down Panel (auto-shows when drilldown is set) */}
              {drilldown && (
                <div className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Search className="w-5 h-5 text-blue-600" />
                      <div>
                        <h3 className="font-semibold text-slate-900">{drilldown.label}</h3>
                        <p className="text-sm text-slate-500">{drilldownResponses.length} matching responses</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setDrilldown(null)}
                      className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-500 hover:text-slate-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-6 space-y-3 max-h-[500px] overflow-y-auto">
                    {drilldownResponses.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No matching responses found.</p>
                    ) : (
                      drilldownResponses.map((response) => {
                        const question = session.questions.find((q) => q.id === response.question_id);
                        const persona = session.personas.find((p) => p.id === response.persona_id);
                        const mentionedBrands = extractBrandsFromResponse(response);
                        const rank = getRankForBrand(response, drilldown.brand);

                        return (
                          <div
                            key={response.id}
                            className="p-4 border border-slate-200 rounded-lg space-y-2"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
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
                              {response.iteration && response.iteration > 1 && (
                                <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded">
                                  iter #{response.iteration}
                                </span>
                              )}
                              {rank !== null && (
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  rank === 1 ? 'bg-yellow-100 text-yellow-700' : rank <= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  Rank #{rank}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-900">
                              Q: {question?.question_text}
                            </p>
                            <div className="flex gap-1.5 flex-wrap">
                              {mentionedBrands.map(b => (
                                <span
                                  key={b}
                                  className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                                    b.toLowerCase() === drilldown.brand.toLowerCase()
                                      ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                            <div className="prose prose-sm prose-slate max-w-none">
                              <ReactMarkdown>{response.response_text}</ReactMarkdown>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* 3. How competitors perform relative to your brand */}
              {primaryBrand && primaryBrandDeltas && primaryBrandDeltas.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <PanelHeader
                    id="competitor-comparison"
                    title={`Comparison vs ${primaryBrand}`}
                    subtitle="How competitors perform relative to your brand"
                  />
                  {isOpen('competitor-comparison') && (
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
                  )}
                </div>
              )}

              {/* 4. Co-Mention Analysis */}
              {coMentionChartData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <PanelHeader
                    id="co-mentions"
                    title={`Co-mentioned with ${coMentionFocusBrand}`}
                    subtitle={`How often other brands appear in the same response as ${coMentionFocusBrand}`}
                  />
                  {isOpen('co-mentions') && (
                    <div className="p-8">
                      <ResponsiveContainer width="100%" height={Math.max(200, coMentionChartData.length * 50)}>
                        <BarChart data={coMentionChartData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="brand" type="category" width={120} />
                          <Tooltip
                            formatter={(value: number) => [`${value} times`, 'Co-mentions']}
                          />
                          <Bar
                            dataKey="count"
                            fill="#8b5cf6"
                            radius={[0, 4, 4, 0]}
                            cursor="pointer"
                            onClick={(data: any) => {
                              if (data?.brand) {
                                setDrilldown({
                                  brand: data.brand,
                                  metric: 'co_mention',
                                  label: `${coMentionFocusBrand} + ${data.brand} co-mentions`,
                                });
                              }
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}

              {/* 5. Performance by Research Area */}
              {topicChartData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <PanelHeader
                    id="research-areas"
                    title="Performance by Research Area"
                    subtitle="How each brand performs within each area (0-100)"
                  />
                  {isOpen('research-areas') && (
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
                  )}
                </div>
              )}
              {topicChartData.length === 0 && researchAreas.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <PanelHeader id="research-areas-empty" title="Performance by Research Area" />
                  {isOpen('research-areas-empty') && (
                    <div className="p-8 text-center">
                      <p className="text-slate-500 text-sm">
                        Topic scores not available for this analysis. Re-run and re-analyze to generate per-area scores.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 6. Persona x Brand Affinity */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader
                  id="persona-affinity"
                  title="Persona x Brand Affinity"
                  subtitle="Which brands resonate with which consumer segments"
                />
                {isOpen('persona-affinity') && (
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
                )}
              </div>

              {/* 7. Contextual Relevance Matrix */}
              {contextualRelevance && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader
                  id="contextual-relevance"
                  title="Contextual Relevance Matrix"
                  subtitle="Where each brand dominates: by persona and research area"
                />
                {isOpen('contextual-relevance') && (
                  <div className="p-8 space-y-8">
                    {/* By Persona */}
                    {contextualRelevance.personas.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Brand Mention Rate by Persona</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 pr-4 text-slate-500 font-medium">Persona</th>
                                {contextualRelevance.brands.map(brand => (
                                  <th key={brand} className="text-center py-2 px-3 text-slate-500 font-medium">{brand}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {contextualRelevance.personas.map(persona => (
                                <tr key={persona} className="border-b border-slate-100">
                                  <td className="py-2 pr-4 text-slate-700 font-medium">{persona}</td>
                                  {contextualRelevance.brands.map(brand => {
                                    const rate = contextualRelevance.by_persona[persona]?.[brand] ?? 0;
                                    const pct = Math.round(rate * 100);
                                    // Color intensity scales with rate
                                    const bg = rate > 0.7 ? 'bg-blue-600 text-white'
                                      : rate > 0.5 ? 'bg-blue-400 text-white'
                                      : rate > 0.3 ? 'bg-blue-200 text-blue-900'
                                      : rate > 0.1 ? 'bg-blue-100 text-blue-800'
                                      : rate > 0 ? 'bg-blue-50 text-blue-700'
                                      : 'bg-slate-50 text-slate-400';
                                    return (
                                      <td key={brand} className="py-2 px-3 text-center">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${bg}`}>
                                          {pct}%
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* By Research Area */}
                    {contextualRelevance.research_areas.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Brand Mention Rate by Research Area</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 pr-4 text-slate-500 font-medium">Research Area</th>
                                {contextualRelevance.brands.map(brand => (
                                  <th key={brand} className="text-center py-2 px-3 text-slate-500 font-medium">{brand}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {contextualRelevance.research_areas.map(area => (
                                <tr key={area} className="border-b border-slate-100">
                                  <td className="py-2 pr-4 text-slate-700 font-medium">{area}</td>
                                  {contextualRelevance.brands.map(brand => {
                                    const rate = contextualRelevance.by_research_area[area]?.[brand] ?? 0;
                                    const pct = Math.round(rate * 100);
                                    const bg = rate > 0.7 ? 'bg-emerald-600 text-white'
                                      : rate > 0.5 ? 'bg-emerald-400 text-white'
                                      : rate > 0.3 ? 'bg-emerald-200 text-emerald-900'
                                      : rate > 0.1 ? 'bg-emerald-100 text-emerald-800'
                                      : rate > 0 ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-slate-50 text-slate-400';
                                    return (
                                      <td key={brand} className="py-2 px-3 text-center">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${bg}`}>
                                          {pct}%
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-400">
                      Mention rate = fraction of responses where each brand appeared, segmented by persona or research area.
                      Higher rates indicate stronger &quot;mental slot&quot; ownership in that context.
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* 8. Change Detection */}
              {changeDetection && changeDetection.changes.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader
                  id="change-detection"
                  title="Change Detection"
                  subtitle="Statistically significant shifts vs previous run"
                  badge={`${changeDetection.changes.reduce((n, c) => n + c.metrics.filter(m => m.significant).length, 0)} significant`}
                />
                {isOpen('change-detection') && (
                  <div className="p-8 space-y-6">
                    {changeDetection.changes.map(brandChange => {
                      const sigMetrics = brandChange.metrics.filter(m => m.significant);
                      const hasSignificant = sigMetrics.length > 0 || Math.abs(brandChange.strength_delta) >= 0.5;
                      return (
                        <div key={brandChange.brand} className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className={`px-4 py-3 flex items-center justify-between ${hasSignificant ? 'bg-amber-50' : 'bg-slate-50'}`}>
                            <span className="font-semibold text-slate-800">{brandChange.brand}</span>
                            <span className="text-xs text-slate-500">
                              n={brandChange.n_a} vs n={brandChange.n_b}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                  <th className="text-left py-2 px-4 font-medium">Metric</th>
                                  <th className="text-right py-2 px-3 font-medium">Before</th>
                                  <th className="text-right py-2 px-3 font-medium">After</th>
                                  <th className="text-right py-2 px-3 font-medium">Change</th>
                                  <th className="text-center py-2 px-3 font-medium">Significance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {brandChange.metrics.map(m => (
                                  <tr key={m.metric} className={`border-b border-slate-100 ${m.significant ? 'bg-amber-50/50' : ''}`}>
                                    <td className="py-2 px-4 text-slate-700">{m.label}</td>
                                    <td className="py-2 px-3 text-right text-slate-600">{(m.value_a * 100).toFixed(1)}%</td>
                                    <td className="py-2 px-3 text-right text-slate-600">{(m.value_b * 100).toFixed(1)}%</td>
                                    <td className={`py-2 px-3 text-right font-medium ${
                                      m.delta_pp > 0 ? 'text-emerald-600' : m.delta_pp < 0 ? 'text-red-600' : 'text-slate-500'
                                    }`}>
                                      {m.delta_pp > 0 ? '+' : ''}{m.delta_pp}pp
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      {m.interpretation === 'major' ? (
                                        <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                                          Major (p={m.p_value.toFixed(3)})
                                        </span>
                                      ) : m.interpretation === 'notable' ? (
                                        <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">
                                          Notable (p={m.p_value.toFixed(3)})
                                        </span>
                                      ) : (
                                        <span className="inline-block px-2 py-0.5 rounded text-xs text-slate-400">
                                          Noise
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {/* Strength row */}
                                <tr className="border-b border-slate-100">
                                  <td className="py-2 px-4 text-slate-700">Rec. Strength</td>
                                  <td className="py-2 px-3 text-right text-slate-600">{brandChange.strength_a.toFixed(2)}/5</td>
                                  <td className="py-2 px-3 text-right text-slate-600">{brandChange.strength_b.toFixed(2)}/5</td>
                                  <td className={`py-2 px-3 text-right font-medium ${
                                    brandChange.strength_delta > 0 ? 'text-emerald-600' : brandChange.strength_delta < 0 ? 'text-red-600' : 'text-slate-500'
                                  }`}>
                                    {brandChange.strength_delta > 0 ? '+' : ''}{brandChange.strength_delta.toFixed(2)}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="text-xs text-slate-400">—</span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-400">
                      Two-proportion z-test at 95% confidence. &quot;pp&quot; = percentage points.
                      Thresholds: &lt;3pp non-significant = noise, 3-10pp significant = notable, &gt;10pp significant = major change.
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* 9. Raw Data */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader
                  id="raw-data"
                  title="Raw Data"
                  subtitle={`View all ${currentResponses.length} question-response pairs`}
                />
                {isOpen('raw-data') && (
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

              {/* 8. Statistical Confidence */}
              {hasStatisticalData && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
                  <PanelHeader
                    id="statistical-confidence"
                    title="Statistical Confidence"
                    subtitle={`Metrics with 95% confidence intervals from ${iterationsPerQuestion} iterations per question (${totalResponses} total responses)`}
                    badge={`${iterationsPerQuestion}x iterations`}
                  />
                  {isOpen('statistical-confidence') && (
                    <div className="p-8">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-indigo-100">
                              <th className="pb-3 font-medium">Brand</th>
                              <th className="pb-3 font-medium text-center">Mention Rate</th>
                              <th className="pb-3 font-medium text-center">Avg Rank</th>
                              <th className="pb-3 font-medium text-center">Top-3 Rate</th>
                              <th className="pb-3 font-medium text-center">Sentiment</th>
                              <th className="pb-3 font-medium text-center">Strength</th>
                              <th className="pb-3 font-medium text-center">Share of Voice</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mergedStats!.map((stat) => {
                              const ciWidth = (ci: [number, number]) => Math.abs(ci[1] - ci[0]);
                              const confidenceColor = (ci: [number, number]) => {
                                const w = ciWidth(ci);
                                if (w < 0.05) return 'text-green-600';
                                if (w < 0.15) return 'text-amber-600';
                                return 'text-red-600';
                              };
                              return (
                                <tr key={stat.brand} className="border-b border-indigo-50 last:border-0">
                                  <td className="py-3 font-semibold text-slate-900">
                                    {stat.brand}
                                    {stat.brand === primaryBrand && (
                                      <span className="ml-1 text-xs text-indigo-600 font-normal">(primary)</span>
                                    )}
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className="font-bold text-slate-900">{(stat.mention_frequency * 100).toFixed(1)}%</span>
                                    <span className={`text-xs ml-1 ${confidenceColor(stat.mention_frequency_ci)}`}>
                                      ±{((stat.mention_frequency_ci[1] - stat.mention_frequency_ci[0]) / 2 * 100).toFixed(1)}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center">
                                    {stat.avg_rank > 0 ? (
                                      <>
                                        <span className="font-bold text-slate-900">#{stat.avg_rank.toFixed(1)}</span>
                                        <span className={`text-xs ml-1 ${confidenceColor(stat.avg_rank_ci)}`}>
                                          ±{((stat.avg_rank_ci[1] - stat.avg_rank_ci[0]) / 2).toFixed(1)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className="font-bold text-slate-900">{(stat.top3_rate * 100).toFixed(1)}%</span>
                                    <span className={`text-xs ml-1 ${confidenceColor(stat.top3_rate_ci)}`}>
                                      ±{((stat.top3_rate_ci[1] - stat.top3_rate_ci[0]) / 2 * 100).toFixed(1)}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className="font-bold text-slate-900">
                                      {((stat.avg_sentiment_score + 1) * 50).toFixed(0)}%
                                    </span>
                                    <span className={`text-xs ml-1 ${confidenceColor(stat.sentiment_ci)}`}>
                                      ±{((stat.sentiment_ci[1] - stat.sentiment_ci[0]) / 2 * 50).toFixed(0)}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center">
                                    {(stat.recommendation_strength ?? 0) > 0 ? (
                                      <>
                                        <span className="font-bold text-slate-900">{(stat.recommendation_strength ?? 0).toFixed(1)}</span>
                                        <span className="text-xs text-slate-400">/5</span>
                                        {stat.recommendation_strength_ci && (
                                          <span className="text-xs ml-1 text-slate-400">
                                            ±{(((stat.recommendation_strength_ci[1] ?? 0) - (stat.recommendation_strength_ci[0] ?? 0)) / 2).toFixed(1)}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className="font-bold text-slate-900">{(stat.share_of_voice * 100).toFixed(1)}%</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex items-center gap-6 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Narrow CI (&lt;5pp)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Moderate CI (5-15pp)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Wide CI (&gt;15pp)</span>
                        <span className="ml-auto">Higher iterations = narrower confidence intervals</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

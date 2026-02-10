'use client';

import { ArrowRight, BookOpen, AlertTriangle, BarChart3, Users, MessageSquare, Brain, TrendingUp, Shield } from 'lucide-react';

interface MethodologyStepProps {
  onNext: () => void;
}

export default function MethodologyStep({ onNext }: MethodologyStepProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-8 py-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Methodology &amp; Analysis</h2>
              <p className="text-slate-600 mt-1">
                How the research is conducted and how to interpret the results
              </p>
            </div>
          </div>
        </div>

        <div className="p-8 prose prose-slate max-w-none">
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">What We Measure</h3>
            </div>
            <p className="text-slate-700">
              BrandTracker measures <strong>how AI models represent and recommend brands</strong> when
              responding to consumer-like queries. This matters because LLM-powered search
              (ChatGPT, Perplexity, Google AI Overview) is becoming a significant channel
              where purchasing decisions are influenced. The model&apos;s brand representation
              is not just a proxy for reality &mdash; it <em>is</em> part of reality for
              AI-mediated discovery.
            </p>
            <p className="text-slate-700">
              Think of BrandTracker as a <strong>seismograph, not a thermometer</strong>.
              It detects direction, relative position, change, and momentum &mdash; exactly
              the inputs marketing strategy is built on.
            </p>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Personas</h3>
            </div>
            <p className="text-slate-700">
              AI-generated personas represent different consumer segments with varying
              priorities, price sensitivity, and technical proficiency. By asking questions
              from different perspectives, we identify which brands resonate with
              specific audiences. Breadth of personas matters more than depth &mdash;
              diverse segments reveal the full picture of brand positioning.
            </p>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Question Design &amp; Structured Responses</h3>
            </div>
            <p className="text-slate-700">
              Questions are designed to <strong>not mention specific brands</strong>,
              revealing which brands the AI spontaneously recommends. Three question
              types are used:
            </p>
            <ul className="text-slate-700 space-y-1">
              <li><strong>Recall</strong> &mdash; open-ended recommendations (unaided brand salience)</li>
              <li><strong>Preference</strong> &mdash; ranking a known set of brands (aided comparison)</li>
              <li><strong>Forced Choice</strong> &mdash; selecting exactly one brand (discrete choice)</li>
            </ul>
            <p className="text-slate-700">
              All responses use a <strong>structured JSON format</strong> with explicit brand names,
              ranks, and sentiment categories. This eliminates interpretation ambiguity &mdash;
              metrics are computed deterministically from structured fields, not from free-text parsing.
            </p>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Statistical Rigor</h3>
            </div>
            <p className="text-slate-700">
              A single AI response is like asking one person on the street. To get reliable data,
              each question is asked <strong>multiple times</strong> (iterations). At temperature &gt; 0,
              the model&apos;s output is stochastic &mdash; this variance is the signal, not noise.
            </p>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 my-4">
              <p className="text-indigo-900 text-sm m-0 font-medium">Sample Size Guidelines</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                {[
                  { n: '5-10', label: 'Directional', color: 'text-amber-700' },
                  { n: '20-30', label: 'Standard', color: 'text-blue-700' },
                  { n: '50', label: 'Strong', color: 'text-green-700' },
                  { n: '80+', label: 'Publication', color: 'text-indigo-700' },
                ].map(({ n, label, color }) => (
                  <div key={n} className="text-center">
                    <div className={`text-lg font-bold ${color}`}>{n}</div>
                    <div className="text-xs text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-slate-700">
              Confidence intervals use the <strong>Wilson score method</strong> for proportions
              (mention rate, top-3 rate) and z-based intervals for means (average rank, sentiment).
              All intervals are at the 95% confidence level.
            </p>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Metrics</h3>
            </div>
            <ul className="text-slate-700 space-y-2">
              <li>
                <strong>Mention Rate</strong> &mdash; How often a brand appears across iterations (0&ndash;100%).
                The core visibility metric.
              </li>
              <li>
                <strong>Top-3 Rate</strong> &mdash; How often the brand is ranked in the top 3.
                Measures consideration set inclusion.
              </li>
              <li>
                <strong>First Mention Rate</strong> &mdash; How often the brand is the #1 recommendation.
                Indicates &quot;top-of-mind&quot; position.
              </li>
              <li>
                <strong>Average Rank</strong> &mdash; Mean position when the brand is mentioned (lower = better).
                Conditional on being mentioned.
              </li>
              <li>
                <strong>Sentiment</strong> &mdash; Aggregated tone from &minus;1.0 (negative) to +1.0 (positive),
                based on categorical labels per response.
              </li>
              <li>
                <strong>Share of Voice</strong> &mdash; The brand&apos;s share of all mentions across
                the run. Shows competitive dominance.
              </li>
              <li>
                <strong>Persona Affinity</strong> &mdash; Mention rate per persona segment.
                Reveals which audiences the brand resonates with.
              </li>
              <li>
                <strong>Topic Scores</strong> &mdash; Per-research-area mention rate showing how the
                brand performs on specific dimensions (quality, price, etc.).
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Multi-Model Validation</h3>
            </div>
            <p className="text-slate-700">
              Running the same questions against multiple AI models (Claude, ChatGPT)
              provides cross-validation. Models trained on different data with different
              methods reduce the risk of systematic bias. Findings that replicate across
              independently trained models are more credible than single-model findings.
            </p>
          </section>

          <section className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-amber-900 m-0">Limitations &amp; Context</h3>
            </div>
            <ul className="text-amber-900 space-y-2 mb-0">
              <li>
                <strong>Model perception, not consumer opinion.</strong> Results show how AI
                represents brands, not how consumers think. However, the AI&apos;s brand
                representation <em>is</em> what consumers encounter in AI-powered search.
              </li>
              <li>
                <strong>Training data bias.</strong> LLMs overrepresent brands common in
                their training data. English corpora overrepresent American brands. Knowledge
                cutoffs mean very recent changes may not be reflected.
              </li>
              <li>
                <strong>Prompt sensitivity.</strong> Results depend on exact question wording.
                Repeated iterations partially smooth per-response noise but cannot correct
                systematic prompt bias. Consistent methodology across runs enables valid
                trend comparison.
              </li>
              <li>
                <strong>Conditional independence.</strong> Responses from the same model are
                conditionally independent (same weights, same biases). Confidence intervals
                characterize the model&apos;s output distribution, not uncertainty about
                which model to use.
              </li>
              <li>
                <strong>Every method has bias.</strong> Surveys, focus groups, NPS, and
                social listening all have known biases. BrandTracker&apos;s approach is not
                more &quot;wrong&quot; &mdash; it is new. The statistical methods bring the
                same rigor that makes traditional methods credible.
              </li>
            </ul>
          </section>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
      >
        View Results
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}

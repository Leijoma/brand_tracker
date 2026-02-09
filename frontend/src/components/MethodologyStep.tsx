'use client';

import { ArrowRight, BookOpen, AlertTriangle, BarChart3, Users, MessageSquare, Brain } from 'lucide-react';

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
              <h3 className="text-lg font-bold text-slate-900 m-0">Method</h3>
            </div>
            <p className="text-slate-700">
              BrandTracker measures <strong>AI-perceived brand positioning</strong> by
              simulating consumer queries against large language models (LLMs). The method
              is based on the fact that AI models have been trained on vast amounts of text
              from the internet, including reviews, forums, news articles, and product
              comparisons. Their responses therefore reflect an aggregated view of how
              brands are perceived in digital sources.
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
              from different perspectives, we can identify which brands resonate with
              specific target audiences. The persona distribution is based on established
              archetypes: innovators, pragmatists, conservatives, budget-conscious, and
              quality seekers.
            </p>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Question Design</h3>
            </div>
            <p className="text-slate-700">
              Questions are designed to <strong>not mention specific brands</strong>.
              Instead, we ask for recommendations, comparisons, and advice within the
              category. This reveals which brands the AI spontaneously mentions and
              recommends, reflecting their organic &quot;top-of-mind&quot; position.
              The majority of questions directly ask for concrete brand and
              model/product suggestions.
            </p>
            <p className="text-slate-700">
              When research areas have been selected (e.g., quality, safety, price),
              questions are distributed so that each area is covered by at least 1-2
              questions, enabling a structured comparison per dimension.
            </p>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Metrics</h3>
            </div>
            <ul className="text-slate-700 space-y-2">
              <li>
                <strong>Mentions</strong> &mdash; Total number of times a brand is
                mentioned across all responses. Measures visibility and &quot;share of mind&quot;.
              </li>
              <li>
                <strong>Recommendations</strong> &mdash; Number of times the AI explicitly
                recommends the brand. A stronger signal than a mention.
              </li>
              <li>
                <strong>First Mention</strong> &mdash; Number of times the brand is
                mentioned first in a response. Indicates &quot;top-of-mind&quot; position.
              </li>
              <li>
                <strong>Sentiment</strong> &mdash; Aggregated tone of mentions, from
                -1.0 (very negative) to +1.0 (very positive).
              </li>
              <li>
                <strong>Share of Voice</strong> &mdash; The brand&apos;s share of all
                mentions. The higher, the more the brand dominates the AI&apos;s responses.
              </li>
              <li>
                <strong>Persona Affinity</strong> &mdash; How well the brand matches each
                persona&apos;s priorities (0.0-1.0). Shows which segments the brand appeals to.
              </li>
              <li>
                <strong>Topic Scores</strong> &mdash; Per-area ranking showing how the
                brand performs within specific research areas.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 m-0">Multi-Model Validation</h3>
            </div>
            <p className="text-slate-700">
              By running the same questions against multiple AI models (e.g., Claude and
              ChatGPT), we can cross-validate the results. The models have been trained on
              partially different data and with different methods, reducing the risk of
              systematic bias from any single model. When viewing &quot;All Models&quot;,
              results are merged by calculating averages per brand.
            </p>
          </section>

          <section className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-amber-900 m-0">Limitations</h3>
            </div>
            <ul className="text-amber-900 space-y-2 mb-0">
              <li>
                <strong>AI is not real consumers.</strong> Results show how AI models
                perceive brands, not how real people do. However, there is correlation
                with real perception, since the models were trained on consumer-generated
                content.
              </li>
              <li>
                <strong>Training data bias.</strong> LLMs have knowledge cutoffs and may
                over-weight information that is more common in training data. Brands with
                a large online presence may be overrepresented.
              </li>
              <li>
                <strong>Small &quot;sample size&quot;.</strong> With a limited number of
                personas and questions, this is a qualitative rather than quantitative
                study. Results provide indications, not statistically significant conclusions.
              </li>
              <li>
                <strong>No temporal or geographic specificity.</strong> AI models&apos;
                knowledge is not anchored to a specific time or market. Results may
                mix global and local perspectives.
              </li>
              <li>
                <strong>Deterministic variation.</strong> At low temperature, the same
                prompt yields similar responses, which limits the spread of results.
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

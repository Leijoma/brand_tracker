'use client';

import { useState } from 'react';
import SetupStep from '@/components/SetupStep';
import PersonasStep from '@/components/PersonasStep';
import QuestionsStep from '@/components/QuestionsStep';
import ResearchStep from '@/components/ResearchStep';
import DashboardStep from '@/components/DashboardStep';
import type { ResearchSession } from '@/types';
import { Beaker } from 'lucide-react';

type Step = 'setup' | 'personas' | 'questions' | 'research' | 'dashboard';

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>('setup');
  const [session, setSession] = useState<ResearchSession | null>(null);

  const steps: { id: Step; label: string }[] = [
    { id: 'setup', label: 'Setup' },
    { id: 'personas', label: 'Personas' },
    { id: 'questions', label: 'Questions' },
    { id: 'research', label: 'Research' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Beaker className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">BrandTracker</h1>
              <p className="text-sm text-slate-600">AI Brand Perception Research</p>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isComplete = index < currentStepIndex;
              const isCurrent = step.id === currentStep;

              return (
                <li key={step.id} className="flex-1 relative">
                  {index !== 0 && (
                    <div
                      className={`absolute top-5 left-0 right-1/2 h-0.5 ${
                        isComplete ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    />
                  )}
                  <button
                    onClick={() => {
                      if (session && index <= currentStepIndex) {
                        setCurrentStep(step.id);
                      }
                    }}
                    disabled={!session || index > currentStepIndex}
                    className={`relative flex flex-col items-center ${
                      !session || index > currentStepIndex
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer hover:opacity-80'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                        isComplete
                          ? 'bg-blue-600 text-white'
                          : isCurrent
                          ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-600'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium ${
                        isCurrent ? 'text-blue-600' : 'text-slate-600'
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {currentStep === 'setup' && (
          <SetupStep
            onComplete={(newSession) => {
              setSession(newSession);
              setCurrentStep('personas');
            }}
            onResume={(resumedSession, step) => {
              setSession(resumedSession);
              setCurrentStep(step);
            }}
          />
        )}
        {currentStep === 'personas' && session && (
          <PersonasStep
            session={session}
            onUpdate={setSession}
            onNext={() => setCurrentStep('questions')}
          />
        )}
        {currentStep === 'questions' && session && (
          <QuestionsStep
            session={session}
            onUpdate={setSession}
            onNext={() => setCurrentStep('research')}
          />
        )}
        {currentStep === 'research' && session && (
          <ResearchStep
            session={session}
            onUpdate={setSession}
            onNext={() => setCurrentStep('dashboard')}
          />
        )}
        {currentStep === 'dashboard' && session && (
          <DashboardStep session={session} />
        )}
      </main>
    </div>
  );
}

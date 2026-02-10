'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getSharedSession } from '@/lib/api';
import DashboardStep from '@/components/DashboardStep';
import type { ResearchSession } from '@/types';
import { Beaker, Loader2, AlertCircle } from 'lucide-react';

export default function SharedDashboardPage() {
  const params = useParams();
  const token = params.token as string;
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchSession = async () => {
      try {
        const data = await getSharedSession(token);
        setSession(data);
      } catch (err: any) {
        setError(
          err?.response?.status === 404
            ? 'This shared dashboard link is invalid or has been revoked.'
            : 'Failed to load shared dashboard.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Dashboard Not Available</h2>
          <p className="text-slate-600">{error || 'Session not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Minimal Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Beaker className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">BrandTracker</h1>
              <p className="text-sm text-slate-600">
                Shared Dashboard &mdash; {session.setup.category}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-12">
        <DashboardStep session={session} readOnly />
      </main>
    </div>
  );
}

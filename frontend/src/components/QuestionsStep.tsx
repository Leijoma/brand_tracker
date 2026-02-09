'use client';

import { useState, useEffect } from 'react';
import { generateQuestions, updateQuestion, createQuestion, deleteQuestion, setSessionQuestions, getSession } from '@/lib/api';
import type { ResearchSession, Persona, Question } from '@/types';
import { MessageSquare, Sparkles, ArrowRight, Pencil, Trash2, Plus, Check, X } from 'lucide-react';

interface QuestionsStepProps {
  session: ResearchSession;
  onUpdate: (session: ResearchSession) => void;
  onNext: () => void;
}

export default function QuestionsStep({ session, onUpdate, onNext }: QuestionsStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [addingForPersona, setAddingForPersona] = useState<string | null>(null);
  const [newQuestionText, setNewQuestionText] = useState('');

  // Auto-generate questions if none exist
  useEffect(() => {
    if (session.questions.length === 0 && session.personas.length > 0 && !loading) {
      handleGenerate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      await generateQuestions(session.id);
      const updated = await getSession(session.id);
      onUpdate(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate questions.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async (questionId: string) => {
    if (!editText.trim()) return;
    try {
      await updateQuestion(questionId, { question_text: editText });
      const updated = await getSession(session.id);
      onUpdate(updated);
      setEditingId(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update question.');
    }
  };

  const handleDelete = async (questionId: string) => {
    try {
      const remainingIds = session.questions.filter(q => q.id !== questionId).map(q => q.id);
      await setSessionQuestions(session.id, remainingIds);
      const updated = await getSession(session.id);
      onUpdate(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to remove question.');
    }
  };

  const handleAddQuestion = async (personaId: string) => {
    if (!newQuestionText.trim()) return;
    try {
      const newQ = await createQuestion({
        persona_id: personaId,
        question_text: newQuestionText,
        category: session.setup.category,
      });
      const allIds = [...session.questions.map(q => q.id), newQ.id];
      await setSessionQuestions(session.id, allIds);
      const updated = await getSession(session.id);
      onUpdate(updated);
      setAddingForPersona(null);
      setNewQuestionText('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add question.');
    }
  };

  // Group questions by persona
  const questionsByPersona = session.personas.map(persona => ({
    persona,
    questions: session.questions.filter(q => q.persona_id === persona.id),
  }));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-50 to-blue-50 px-8 py-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">Review Questions</h2>
          <p className="text-slate-600 mt-1">
            Review, edit, or add questions before running research. Questions should NOT mention brand names.
          </p>
        </div>

        <div className="p-8">
          {loading ? (
            <div className="text-center py-12">
              <Sparkles className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600">Generating questions for each persona...</p>
            </div>
          ) : session.questions.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No questions yet.</p>
              <button onClick={handleGenerate}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold inline-flex items-center gap-2">
                <Sparkles className="w-5 h-5" /> Generate Questions
              </button>
            </div>
          ) : (
            <>
              {questionsByPersona.map(({ persona, questions }) => (
                <div key={persona.id} className="mb-8 last:mb-0">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center font-bold">
                      {questions.length}
                    </span>
                    {persona.name}
                    <span className="text-xs text-slate-500 font-normal">({persona.archetype.replace('_', ' ')})</span>
                  </h3>

                  <div className="space-y-2 ml-8">
                    {questions.map((question) => (
                      <div key={question.id} className="group p-3 bg-slate-50 rounded-lg flex items-start gap-3">
                        {editingId === question.id ? (
                          <div className="flex-1 flex gap-2">
                            <input value={editText} onChange={e => setEditText(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onKeyPress={e => e.key === 'Enter' && handleEditSave(question.id)} autoFocus />
                            <button onClick={() => handleEditSave(question.id)} className="text-blue-600 hover:bg-blue-100 p-1.5 rounded">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:bg-slate-200 p-1.5 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="flex-1 text-sm text-slate-900">{question.question_text}</p>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {question.origin === 'custom' && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[10px] rounded mr-1">custom</span>
                              )}
                              <button onClick={() => { setEditingId(question.id); setEditText(question.question_text); }}
                                className="text-blue-600 hover:bg-blue-100 p-1 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDelete(question.id)}
                                className="text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}

                    {addingForPersona === persona.id ? (
                      <div className="flex gap-2 p-2">
                        <input value={newQuestionText} onChange={e => setNewQuestionText(e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Type your question (don't mention brand names)..."
                          onKeyPress={e => e.key === 'Enter' && handleAddQuestion(persona.id)} autoFocus />
                        <button onClick={() => handleAddQuestion(persona.id)} disabled={!newQuestionText.trim()}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm disabled:opacity-50">Add</button>
                        <button onClick={() => { setAddingForPersona(null); setNewQuestionText(''); }}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingForPersona(persona.id)}
                        className="text-xs text-slate-500 hover:text-purple-600 inline-flex items-center gap-1 ml-3 mt-1">
                        <Plus className="w-3 h-3" /> Add question
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
                <button onClick={handleGenerate} disabled={loading}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors inline-flex items-center gap-2 text-sm disabled:opacity-50">
                  <Sparkles className="w-4 h-4" /> Regenerate All Questions
                </button>
                <button onClick={onNext}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 flex items-center gap-2">
                  Continue to Research <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {error && <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        </div>
      </div>
    </div>
  );
}

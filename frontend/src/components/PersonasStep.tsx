'use client';

import { useState } from 'react';
import { generatePersonas, updatePersona, createPersona, deletePersona, setSessionPersonas, getSession } from '@/lib/api';
import type { GenerationProgress } from '@/lib/api';
import type { ResearchSession, Persona, PersonaCreate } from '@/types';
import { Users, Sparkles, ArrowRight, TrendingUp, DollarSign, Heart, Pencil, Trash2, Plus, Check, X } from 'lucide-react';

interface PersonasStepProps {
  session: ResearchSession;
  onUpdate: (session: ResearchSession) => void;
  onNext: () => void;
}

export default function PersonasStep({ session, onUpdate, onNext }: PersonasStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

  const handleGeneratePersonas = async () => {
    setLoading(true);
    setError('');
    setProgressMessage('Starting persona generation...');
    try {
      const updated = await generatePersonas(session.id, (progress: GenerationProgress) => {
        setProgressMessage(progress.message);
      });
      onUpdate(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to generate personas.');
    } finally {
      setLoading(false);
      setProgressMessage('');
    }
  };

  const handleDeletePersona = async (personaId: string) => {
    try {
      const remainingIds = session.personas.filter(p => p.id !== personaId).map(p => p.id);
      await setSessionPersonas(session.id, remainingIds);
      const updated = await getSession(session.id);
      onUpdate(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to remove persona.');
    }
  };

  const handleSaveEdit = async (personaId: string, updates: Partial<Persona>) => {
    try {
      await updatePersona(personaId, updates);
      const updated = await getSession(session.id);
      onUpdate(updated);
      setEditingId(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update persona.');
    }
  };

  const handleAddPersona = async (data: PersonaCreate) => {
    try {
      const newPersona = await createPersona({ ...data, category: session.setup.category });
      const allIds = [...session.personas.map(p => p.id), newPersona.id];
      await setSessionPersonas(session.id, allIds);
      const updated = await getSession(session.id);
      onUpdate(updated);
      setShowAddForm(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add persona.');
    }
  };

  const archetypeColors: Record<string, string> = {
    innovator: 'from-purple-500 to-pink-500',
    pragmatist: 'from-blue-500 to-cyan-500',
    conservative: 'from-slate-500 to-slate-600',
    budget_conscious: 'from-green-500 to-emerald-500',
    quality_seeker: 'from-amber-500 to-orange-500',
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-8 py-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">Consumer Personas</h2>
          <p className="text-slate-600 mt-1">
            Generate, edit, or add custom personas for your research
          </p>
        </div>

        <div className="p-8">
          {session.personas.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to Generate Personas</h3>
              <p className="text-slate-600 mb-6 max-w-md mx-auto">
                We'll create 5 diverse personas. You can edit them or add your own afterward.
              </p>
              {loading && (
                <div className="mb-6 max-w-md mx-auto">
                  <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  <p className="text-sm text-slate-600">{progressMessage}</p>
                </div>
              )}
              <button onClick={handleGeneratePersonas} disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 inline-flex items-center gap-2">
                {loading ? <><Sparkles className="w-5 h-5 animate-spin" /> Generating...</> : <><Sparkles className="w-5 h-5" /> Generate Personas</>}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {session.personas.map((persona) => (
                  editingId === persona.id ? (
                    <PersonaEditCard key={persona.id} persona={persona} colors={archetypeColors}
                      onSave={(updates) => handleSaveEdit(persona.id, updates)} onCancel={() => setEditingId(null)} />
                  ) : (
                    <PersonaCard key={persona.id} persona={persona} colors={archetypeColors}
                      onEdit={() => setEditingId(persona.id)} onDelete={() => handleDeletePersona(persona.id)} />
                  )
                ))}
              </div>

              {/* Add persona buttons */}
              <div className="flex gap-3 mb-8">
                <button onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-purple-400 hover:text-purple-600 transition-colors inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Custom Persona
                </button>
                <button onClick={handleGeneratePersonas} disabled={loading}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:border-purple-400 hover:text-purple-600 transition-colors inline-flex items-center gap-2 disabled:opacity-50">
                  <Sparkles className="w-4 h-4" /> Regenerate All
                </button>
              </div>

              {showAddForm && (
                <PersonaAddForm category={session.setup.category} onSave={handleAddPersona} onCancel={() => setShowAddForm(false)} />
              )}

              {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">{error}</div>}

              <div className="flex justify-end">
                <button onClick={onNext}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 flex items-center gap-2">
                  Continue to Questions <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonaCard({ persona, colors, onEdit, onDelete }: { persona: Persona; colors: Record<string, string>; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      <div className={`h-2 bg-gradient-to-r ${colors[persona.archetype] || 'from-slate-500 to-slate-600'}`} />
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{persona.name}</h3>
            <p className="text-sm text-slate-600">{persona.age_range} &middot; {persona.occupation}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">
              {persona.archetype.replace('_', ' ')}
            </span>
            {persona.origin === 'custom' && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">custom</span>
            )}
          </div>
        </div>

        <p className="text-sm text-slate-700 mb-4">{persona.description}</p>

        <div className="space-y-2 mb-4">
          <AttributeRow icon={<TrendingUp className="w-4 h-4 text-slate-500" />} label="Tech Savviness" value={persona.tech_savviness} color="bg-blue-500" />
          <AttributeRow icon={<DollarSign className="w-4 h-4 text-slate-500" />} label="Price Sensitivity" value={persona.price_sensitivity} color="bg-green-500" />
          <AttributeRow icon={<Heart className="w-4 h-4 text-slate-500" />} label="Brand Loyalty" value={persona.brand_loyalty} color="bg-pink-500" />
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-700 mb-2">Key Priorities:</p>
          <div className="flex flex-wrap gap-1">
            {persona.key_priorities.map((p, i) => (
              <span key={i} className="px-2 py-1 bg-slate-50 text-slate-600 text-xs rounded">{p}</span>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-slate-100">
          <button onClick={onEdit} className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg inline-flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <button onClick={onDelete} className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg inline-flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function AttributeRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-slate-600 w-28">{label}:</span>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full ${i < value ? color : 'bg-slate-200'}`} />
        ))}
      </div>
    </div>
  );
}

function PersonaEditCard({ persona, colors, onSave, onCancel }: { persona: Persona; colors: Record<string, string>; onSave: (updates: Partial<Persona>) => void; onCancel: () => void }) {
  const [name, setName] = useState(persona.name);
  const [description, setDescription] = useState(persona.description);
  const [ageRange, setAgeRange] = useState(persona.age_range);
  const [occupation, setOccupation] = useState(persona.occupation);
  const [techSavviness, setTechSavviness] = useState(persona.tech_savviness);
  const [priceSensitivity, setPriceSensitivity] = useState(persona.price_sensitivity);
  const [brandLoyalty, setBrandLoyalty] = useState(persona.brand_loyalty);
  const [priorities, setPriorities] = useState(persona.key_priorities.join(', '));

  return (
    <div className="border-2 border-blue-400 rounded-xl overflow-hidden">
      <div className={`h-2 bg-gradient-to-r ${colors[persona.archetype] || 'from-slate-500 to-slate-600'}`} />
      <div className="p-6 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold" placeholder="Name" />
        <div className="grid grid-cols-2 gap-2">
          <input value={ageRange} onChange={e => setAgeRange(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Age range" />
          <input value={occupation} onChange={e => setOccupation(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Occupation" />
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Description" />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-slate-600">
            Tech ({techSavviness})
            <input type="range" min={1} max={5} value={techSavviness} onChange={e => setTechSavviness(+e.target.value)} className="w-full" />
          </label>
          <label className="text-xs text-slate-600">
            Price ({priceSensitivity})
            <input type="range" min={1} max={5} value={priceSensitivity} onChange={e => setPriceSensitivity(+e.target.value)} className="w-full" />
          </label>
          <label className="text-xs text-slate-600">
            Loyalty ({brandLoyalty})
            <input type="range" min={1} max={5} value={brandLoyalty} onChange={e => setBrandLoyalty(+e.target.value)} className="w-full" />
          </label>
        </div>
        <input value={priorities} onChange={e => setPriorities(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Priorities (comma-separated)" />
        <div className="flex gap-2 pt-2">
          <button onClick={() => onSave({ name, description, age_range: ageRange, occupation, tech_savviness: techSavviness, price_sensitivity: priceSensitivity, brand_loyalty: brandLoyalty, key_priorities: priorities.split(',').map(s => s.trim()).filter(Boolean) })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1">
            <Check className="w-4 h-4" /> Save
          </button>
          <button onClick={onCancel} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 inline-flex items-center gap-1">
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonaAddForm({ category, onSave, onCancel }: { category: string; onSave: (data: PersonaCreate) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState<Persona['archetype']>('pragmatist');
  const [description, setDescription] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [occupation, setOccupation] = useState('');
  const [techSavviness, setTechSavviness] = useState(3);
  const [priceSensitivity, setPriceSensitivity] = useState(3);
  const [brandLoyalty, setBrandLoyalty] = useState(3);
  const [priorities, setPriorities] = useState('');

  return (
    <div className="border-2 border-dashed border-purple-400 rounded-xl p-6 mb-6 space-y-3">
      <h4 className="font-semibold text-slate-900">Add Custom Persona</h4>
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={e => setName(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Name" />
        <select value={archetype} onChange={e => setArchetype(e.target.value as Persona['archetype'])} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
          <option value="innovator">Innovator</option>
          <option value="pragmatist">Pragmatist</option>
          <option value="conservative">Conservative</option>
          <option value="budget_conscious">Budget Conscious</option>
          <option value="quality_seeker">Quality Seeker</option>
        </select>
        <input value={ageRange} onChange={e => setAgeRange(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Age range (e.g., 25-35)" />
        <input value={occupation} onChange={e => setOccupation(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Occupation" />
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Brief description of this persona" />
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs text-slate-600">Tech Savviness ({techSavviness})<input type="range" min={1} max={5} value={techSavviness} onChange={e => setTechSavviness(+e.target.value)} className="w-full" /></label>
        <label className="text-xs text-slate-600">Price Sensitivity ({priceSensitivity})<input type="range" min={1} max={5} value={priceSensitivity} onChange={e => setPriceSensitivity(+e.target.value)} className="w-full" /></label>
        <label className="text-xs text-slate-600">Brand Loyalty ({brandLoyalty})<input type="range" min={1} max={5} value={brandLoyalty} onChange={e => setBrandLoyalty(+e.target.value)} className="w-full" /></label>
      </div>
      <input value={priorities} onChange={e => setPriorities(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Key priorities (comma-separated)" />
      <div className="flex gap-2 pt-2">
        <button onClick={() => { if (name && description) onSave({ name, archetype, description, age_range: ageRange, occupation, tech_savviness: techSavviness, price_sensitivity: priceSensitivity, brand_loyalty: brandLoyalty, key_priorities: priorities.split(',').map(s => s.trim()).filter(Boolean), category }); }}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1" disabled={!name || !description}>
          <Plus className="w-4 h-4" /> Add Persona
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

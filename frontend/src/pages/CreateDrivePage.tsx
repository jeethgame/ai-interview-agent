import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Mic,
  Building2,
  Clock,
  Target,
  Sparkles,
  Shield,
  Layers,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Volume2,
  Zap,
  Sliders,
  Send,
  GraduationCap
} from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const API = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

async function apiFetch(path: string, token?: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });
  if (!r.ok) {
    let errDetail = `${r.status}`;
    try {
      const errJson = await r.json();
      errDetail = errJson.detail || errDetail;
    } catch { }
    throw new Error(errDetail);
  }
  return r.json();
}

const COMMON_ROLES = [
  'Full Stack Software Engineer',
  'Backend Engineer (Python / FastAPI / Go)',
  'Frontend Engineer (React / TypeScript)',
  'AI / Machine Learning Engineer',
  'Data Engineer & Analytics',
  'Cloud & DevOps Engineer',
  'Systems & Distributed Infrastructure Engineer',
  'Product Solutions Engineer',
];

const TOPIC_PRESETS = [
  { id: 'algorithms', label: 'Algorithms & DSA', desc: 'Time/space complexity, arrays, dynamic programming, graphs' },
  { id: 'system-design', label: 'System Design & Scalability', desc: 'Distributed caching, load balancing, message queues, B-Trees' },
  { id: 'databases', label: 'Database Architecture', desc: 'PostgreSQL, query execution plans, indexing strategies, ACID' },
  { id: 'frontend', label: 'Frontend & Web APIs', desc: 'React lifecycle, state management, WebSockets, CWV rendering' },
  { id: 'devops', label: 'DevOps, CI/CD & Cloud', desc: 'Docker, Kubernetes, AWS ECS/RDS, terraform, pipelines' },
  { id: 'behavioral', label: 'Situational & Leadership', desc: 'STAR technique, conflict resolution, project leadership' },
  { id: 'security', label: 'Application Security & RBAC', desc: 'JWT auth, OAuth 2.0, OWASP Top 10, data encryption' },
  { id: 'clean-architecture', label: 'Design Patterns & OOP', desc: 'SOLID principles, microservices vs monolith, refactoring' },
];

const CreateDrivePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, getToken } = useAuth();
  const token = getToken();
  const orgId = user?.organization_id || 'org-stjosephs-cse';

  // Form State
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('Full Stack Software Engineer');
  const [customRole, setCustomRole] = useState('');
  const [company, setCompany] = useState('');
  const [style, setStyle] = useState<'formal' | 'technical' | 'casual' | 'aggressive'>('formal');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [duration, setDuration] = useState(30);
  const [questionCount, setQuestionCount] = useState(5);
  const [topicFocus, setTopicFocus] = useState<string[]>([
    'algorithms',
    'system-design',
    'databases'
  ]);
  const [voicePersona, setVoicePersona] = useState('aura-2-asteria-en');
  const [enableVeracityProbing, setEnableVeracityProbing] = useState(true);
  const [enableCoachFeedback, setEnableCoachFeedback] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const toggleTopic = (id: string) => {
    setTopicFocus(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleRoleSelect = (r: string) => {
    setRole(r);
    setCustomRole('');
  };

  const effectiveRole = customRole.trim() || role;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErr('Drive title is required');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!effectiveRole.trim()) {
      setErr('Target job role is required');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setErr('');
    try {
      await apiFetch(`/orgs/${orgId}/drives`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          target_role: effectiveRole,
          company: company.trim() || null,
          interview_style: style,
          difficulty,
          duration_minutes: duration,
          topic_focus: topicFocus,
          question_count: questionCount,
        }),
      });

      navigate('/dashboard', {
        state: { toast: `AI Interview Drive "${title}" created successfully!` },
      });
    } catch (e: any) {
      setErr(e.message || 'Failed to create placement drive');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col">
      <Header />

      {/* Top sticky control bar */}
      <div className="sticky top-14 z-30 bg-white border-b border-slate-200 px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
              title="Back to Dashboard"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <Link to="/dashboard" className="hover:text-slate-900 transition">Dashboard</Link>
                <span>/</span>
                <span className="text-slate-500">AI Placement Drives</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold">Create New Drive</span>
              </div>
              <h1 className="text-base font-extrabold text-slate-900">
                AI Interview Drive Studio
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white text-xs font-bold gap-2 shadow-xs"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating Drive…
                </>
              ) : (
                <>
                  <Send size={14} />
                  Save & Publish Drive
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {err && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl flex items-center gap-3 animate-in fade-in">
            <AlertTriangle size={18} className="shrink-0 text-[#DC2626]" />
            <span className="font-medium">{err}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column (7 cols): Drive Details & AI Config */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Drive Overview Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-[#DC2626]">
                  <Mic size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Placement Drive Overview</h2>
                  <p className="text-xs text-slate-500">Configure target title, hiring partner, and candidate scope</p>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Drive Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TCS Digital 2026 — Technical AI Interview Round"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626] font-medium"
                />
              </div>

              {/* Company and Duration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Hiring Company / Partner (Optional)
                  </label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. Google / TCS / Zoho"
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Interview Duration
                  </label>
                  <div className="relative">
                    <Clock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                    <select
                      value={duration}
                      onChange={e => setDuration(parseInt(e.target.value) || 30)}
                      className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-medium"
                    >
                      <option value={15}>15 Minutes (Fast Screen)</option>
                      <option value={30}>30 Minutes (Standard Round)</option>
                      <option value={45}>45 Minutes (In-Depth Technical)</option>
                      <option value={60}>60 Minutes (Comprehensive)</option>
                      <option value={90}>90 Minutes (Executive / Architecture)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Target Job Role */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Target Job Role *
                </label>
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {COMMON_ROLES.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleSelect(r)}
                      className={`text-xs px-3 py-1.5 rounded-xl border transition ${
                        role === r && !customRole
                          ? 'bg-[#111827] text-white border-[#111827] font-bold shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Or enter custom job role title..."
                  value={customRole}
                  onChange={e => setCustomRole(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                />
              </div>

              {/* Style & Difficulty & Question Count */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Interview Style
                  </label>
                  <select
                    value={style}
                    onChange={e => setStyle(e.target.value as any)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm capitalize focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-medium"
                  >
                    <option value="formal">Formal Assessment</option>
                    <option value="technical">Technical Deep-Dive</option>
                    <option value="casual">Conversational / Casual</option>
                    <option value="aggressive">Aggressive / Stress Test</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Difficulty Level
                  </label>
                  <select
                    value={difficulty}
                    onChange={e => setDifficulty(e.target.value as any)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm capitalize focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-medium"
                  >
                    <option value="easy">Easy (Fundamentals)</option>
                    <option value="medium">Medium (Standard DSA)</option>
                    <option value="hard">Hard (Senior / FAANG)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Questions Target
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={12}
                    value={questionCount}
                    onChange={e => setQuestionCount(parseInt(e.target.value) || 5)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626] font-medium"
                  />
                </div>
              </div>
            </div>

            {/* 2. AI Voice & Real-Time Probing Engine Configuration */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <Bot size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">AI Voice & Probing Engine</h2>
                  <p className="text-xs text-slate-500">Real-time voice streaming with turn management and ORDA evaluation</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Interviewer Voice Model
                  </label>
                  <select
                    value={voicePersona}
                    onChange={e => setVoicePersona(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-medium"
                  >
                    <option value="aura-2-asteria-en">Aura-2 Asteria (Female — Crisp & Professional)</option>
                    <option value="aura-2-orion-en">Aura-2 Orion (Male — Authoritative Technical)</option>
                    <option value="aura-2-helios-en">Aura-2 Helios (Male — Senior Architect)</option>
                    <option value="aura-2-luna-en">Aura-2 Luna (Female — Warm & Conversational)</option>
                  </select>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-[11px] text-slate-400 font-semibold uppercase">Voice Pipeline</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-700">Deepgram Nova-3 + Groq GPT-120B</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                  <input
                    type="checkbox"
                    checked={enableVeracityProbing}
                    onChange={e => setEnableVeracityProbing(e.target.checked)}
                    className="mt-0.5 rounded text-[#DC2626] focus:ring-[#DC2626]"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Enable Veracity Probing & Resume Anchoring
                    </span>
                    <span className="text-[11px] text-slate-500">
                      The AI agent cross-examines candidate answers against extracted claims from their uploaded resume.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                  <input
                    type="checkbox"
                    checked={enableCoachFeedback}
                    onChange={e => setEnableCoachFeedback(e.target.checked)}
                    className="mt-0.5 rounded text-[#DC2626] focus:ring-[#DC2626]"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Generate Real-Time Competency Scorecard & Coaching Cards
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Evaluates correctness, system design intuition, communication clarity, and provides post-interview roadmaps.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Topic Focus & Blueprint Preview */}
          <div className="lg:col-span-5 space-y-6">
            {/* Topic Focus Selector */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                    <Target size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Competency Focus Areas</h2>
                    <p className="text-[11px] text-slate-500">Select topics the AI will emphasize during turn progression</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                  {topicFocus.length} Selected
                </span>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {TOPIC_PRESETS.map(t => {
                  const isChecked = topicFocus.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      onClick={() => toggleTopic(t.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        isChecked
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="hidden"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isChecked ? 'text-white' : 'text-slate-900'}`}>
                            {t.label}
                          </span>
                          {isChecked && <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />}
                        </div>
                        <p className={`text-[11px] mt-0.5 leading-relaxed ${isChecked ? 'text-slate-300' : 'text-slate-500'}`}>
                          {t.desc}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Live Drive Blueprint Summary Card */}
            <div className="bg-gradient-to-br from-slate-900 to-[#111827] text-white rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-400" />
                  <span className="text-xs font-extrabold tracking-wider uppercase text-amber-400">
                    Live Drive Blueprint
                  </span>
                </div>
                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-mono">
                  {duration}m / {questionCount} Qs
                </span>
              </div>

              <div>
                <h3 className="text-base font-black text-white leading-tight">
                  {title || 'Untitled AI Placement Drive'}
                </h3>
                <p className="text-xs text-slate-300 mt-1 font-medium">
                  {effectiveRole} {company && `• ${company}`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Style</span>
                  <span className="font-bold text-white capitalize">{style}</span>
                </div>
                <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Difficulty</span>
                  <span className="font-bold text-emerald-400 capitalize">{difficulty}</span>
                </div>
              </div>

              <div className="pt-2">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1.5">
                  Target Competencies ({topicFocus.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {topicFocus.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">No specific focus selected</span>
                  ) : (
                    topicFocus.map(tf => (
                      <span key={tf} className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-slate-200 font-medium">
                        {TOPIC_PRESETS.find(p => p.id === tf)?.label || tf}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full mt-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold py-2.5 shadow-sm"
              >
                {submitting ? 'Creating Drive…' : 'Publish Drive to Institution'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateDrivePage;

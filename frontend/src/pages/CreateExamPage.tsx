import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  Clock,
  Shield,
  AlertTriangle,
  Code2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  BookOpen,
  Send,
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

interface QuestionItem {
  id: string;
  question_id?: string;
  title: string;
  description: string;
  topic: string;
  category?: string;
  difficulty: string;
  difficulty_level?: string;
  ctc_band?: string;
  constraints?: string | string[];
  examples?: any;
  sample_test_cases?: { input: any; expected_output?: any; output?: any }[];
}

const formatVal = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
};

const CreateExamPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, getToken } = useAuth();
  const token = getToken() || undefined;
  const orgId = (user as any)?.org_id || 'demo-org-id';

  // Initial pre-selected IDs from navigation state if any
  const preSelected: string[] = (location.state as any)?.selectedQuestionIds || [];

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [difficulty, setDifficulty] = useState('medium');
  const [passingScore, setPassingScore] = useState(70);
  const [maxInfractions, setMaxInfractions] = useState(3);
  const [sebRequired, setSebRequired] = useState(true);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>(preSelected);

  // Question Bank State
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedQId, setExpandedQId] = useState<string | null>(null);

  // Submitting state & feedback
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load question bank on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingQuestions(true);

    apiFetch('/api/questions', token)
      .catch(() => apiFetch('/questions', token))
      .then((data: any) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data?.questions || [];
        setQuestions(
          list.map((q: any) => ({
            id: String(q.id || q.question_id),
            question_id: String(q.id || q.question_id),
            title: q.title || 'Untitled Problem',
            description: q.description || '',
            topic: q.topic || q.category || 'DSA',
            category: q.topic || q.category || 'DSA',
            difficulty: (q.difficulty || q.difficulty_level || 'medium').toLowerCase(),
            difficulty_level: (q.difficulty || q.difficulty_level || 'medium').toLowerCase(),
            ctc_band: q.ctc_band || 'Standard',
            constraints: q.constraints || '',
            examples: q.examples || '',
            sample_test_cases: q.sample_test_cases || [],
          }))
        );
      })
      .catch((err) => {
        console.error('Failed to load questions in exam creator:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingQuestions(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Derived filter list
  const availableCategories = Array.from(new Set(questions.map((q) => q.topic))).filter(Boolean);

  const filteredQuestions = questions.filter((q) => {
    const matchesSearch =
      !searchQuery ||
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.topic.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDiff =
      difficultyFilter === 'all' || q.difficulty.toLowerCase() === difficultyFilter.toLowerCase();
    const matchesCat =
      categoryFilter === 'all' || q.topic.toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesDiff && matchesCat;
  });

  const selectedQuestionsList = questions.filter((q) => selectedQuestionIds.includes(q.id));

  // Toggle question selection
  const toggleQuestion = (qId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please provide a title for the examination.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    const payload = {
      title: title.trim(),
      description: description.trim() || 'Formal Scheduled Coding Examination',
      duration_minutes: Number(duration) || 60,
      difficulty,
      seb_required: sebRequired,
      max_infractions: Number(maxInfractions) || 3,
      passing_score: Number(passingScore) || 70,
      question_ids: selectedQuestionIds,
    };

    try {
      await apiFetch(`/orgs/${orgId}/exams/create`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() =>
        apiFetch(`/exams/create`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );

      setSuccessMsg('Examination created successfully! Redirecting to Dashboard…');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1200);
    } catch (err: any) {
      console.error('Failed to create exam:', err);
      setErrorMsg(err.message || 'Failed to create exam. Please check your inputs and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans">
      <Header />

      {/* Top Banner / Studio Control Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                <Link to="/dashboard" className="hover:text-gray-700">Dashboard</Link>
                <span>/</span>
                <span className="text-gray-700">Coding Exams</span>
                <span>/</span>
                <span className="text-[#DC2626]">Create New Assessment</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Code2 className="text-[#DC2626]" size={22} />
                Assessment Creator Studio
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-md shadow-red-600/20 px-6 font-semibold flex items-center gap-2"
            >
              <Send size={16} />
              {submitting ? 'Publishing Exam…' : 'Save & Publish Exam'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Studio Body: Split View */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-sm text-red-700 animate-in fade-in">
            <AlertTriangle className="text-red-500 shrink-0" size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-green-50 border border-green-200 flex items-center gap-3 text-sm text-green-700 animate-in fade-in">
            <CheckCircle2 className="text-green-500 shrink-0" size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Exam Configuration & Selected Cart (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Primary Details Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <Layers className="text-[#DC2626]" size={18} />
                <h2 className="font-bold text-gray-900 text-base">Assessment Details</h2>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                  Exam Title <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. TCS Digital — Advanced Algorithms & DSA Assessment"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                  Description & Student Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide instructions regarding problem sets, timing rules, and submission constraints..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626] transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Duration (Minutes)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={10}
                      max={360}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                    />
                    <Clock size={16} className="absolute left-3 top-3 text-gray-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Target Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                  >
                    <option value="easy">Easy (Fundamentals)</option>
                    <option value="medium">Medium (Standard DSA)</option>
                    <option value="hard">Hard (Advanced / FAANG)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Passing Score (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={passingScore}
                    onChange={(e) => setPassingScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Max Strike Warnings
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxInfractions}
                    onChange={(e) => setMaxInfractions(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                  />
                </div>
              </div>
            </div>

            {/* Proctoring & Lockdown Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <Shield className="text-emerald-600" size={18} />
                <h2 className="font-bold text-gray-900 text-base">Integrity & Proctoring Guard</h2>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer hover:bg-gray-100/70 transition-colors">
                <input
                  type="checkbox"
                  checked={sebRequired}
                  onChange={(e) => setSebRequired(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626]"
                />
                <div>
                  <p className="text-xs font-bold text-gray-900">Enforce Safe Exam Browser (SEB) Lockdown</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Restricts OS environment, disables dual monitors, blocks tab switching, copy-paste, and developer consoles.
                  </p>
                </div>
              </label>

              <div className="text-[11px] text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Candidates will receive infraction warnings when defocusing the window. Exceeding{' '}
                  <strong>{maxInfractions} strikes</strong> will auto-submit the exam with a disqualified standing.
                </span>
              </div>
            </div>

            {/* Selected Questions Cart */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <BookOpen className="text-[#DC2626]" size={18} />
                  <h2 className="font-bold text-gray-900 text-base">
                    Selected Problems ({selectedQuestionIds.length})
                  </h2>
                </div>
                {selectedQuestionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedQuestionIds([])}
                    className="text-xs text-red-600 hover:text-red-700 font-semibold"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {selectedQuestionsList.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-gray-200 rounded-2xl p-4">
                  <Code2 className="mx-auto text-gray-300 mb-2" size={32} />
                  <p className="text-sm font-semibold text-gray-700">No questions selected yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Pick problems from the Question Bank on the right to attach to this exam.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {selectedQuestionsList.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-3 group hover:bg-gray-100/80 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-600 flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{q.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500">{q.topic}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                q.difficulty === 'easy'
                                  ? 'bg-green-100 text-green-700'
                                  : q.difficulty === 'hard'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {q.difficulty.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleQuestion(q.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-white transition-colors shrink-0"
                        title="Remove question"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Interactive Question Bank Explorer (7 Cols) */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <Sparkles className="text-amber-500" size={18} />
                  Question Bank Explorer
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Browse {questions.length} problems with test cases and hidden Judge0 benchmarks
                </p>
              </div>

              <div className="text-xs font-semibold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                {selectedQuestionIds.length} of {questions.length} Selected
              </div>
            </div>

            {/* Live Search & Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6 relative">
                <input
                  type="text"
                  placeholder="Search title, topic, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626] transition-all"
                />
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
              </div>

              {/* Difficulty Pills */}
              <div className="sm:col-span-3 flex bg-gray-100 p-0.5 rounded-xl text-[11px] font-semibold">
                {['all', 'easy', 'medium', 'hard'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficultyFilter(d)}
                    className={`flex-1 py-1 text-center rounded-lg capitalize transition-all ${
                      difficultyFilter === d
                        ? 'bg-white text-gray-900 shadow-sm font-bold'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Category Dropdown */}
              <div className="sm:col-span-3">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                >
                  <option value="all">All Categories</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Questions List */}
            {loadingQuestions ? (
              <div className="py-16 text-center text-gray-400 animate-pulse">
                Loading Question Bank from database…
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl">
                <BookOpen className="mx-auto text-gray-300 mb-2" size={32} />
                <p className="text-sm font-bold text-gray-700">No matching questions found</p>
                <p className="text-xs text-gray-400 mt-1">Try relaxing your search query or difficulty filters.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
                {filteredQuestions.map((q) => {
                  const isSelected = selectedQuestionIds.includes(q.id);
                  const isExpanded = expandedQId === q.id;

                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-[#DC2626] bg-red-50/20 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleQuestion(q.id)}
                            className="mt-1 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626]"
                          />
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-gray-900 hover:text-[#DC2626] transition-colors">
                              {q.title}
                            </h3>
                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{q.description}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md font-semibold">
                                {q.topic}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  q.difficulty === 'easy'
                                    ? 'bg-green-100 text-green-700'
                                    : q.difficulty === 'hard'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {q.difficulty.toUpperCase()}
                              </span>
                              <span className="text-[10px] text-gray-400 font-medium">
                                CTC: {q.ctc_band || 'Standard'}
                              </span>
                            </div>
                          </div>
                        </label>

                        <button
                          type="button"
                          onClick={() => setExpandedQId(isExpanded ? null : q.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                          title={isExpanded ? 'Collapse preview' : 'Expand problem details'}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>

                      {/* Expandable Problem Preview */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 text-xs bg-gray-50/70 p-3.5 rounded-xl animate-in fade-in">
                          <div>
                            <span className="font-bold text-gray-600 uppercase text-[10px]">Description:</span>
                            <p className="text-gray-800 whitespace-pre-line mt-1">
                              {typeof q.description === 'object' ? JSON.stringify(q.description, null, 2) : String(q.description)}
                            </p>
                          </div>

                          {q.constraints && (
                            <div>
                              <span className="font-bold text-gray-600 uppercase text-[10px]">Constraints:</span>
                              <pre className="mt-1 p-2 bg-white rounded-lg border border-gray-200 text-gray-700 font-mono text-[11px] whitespace-pre-wrap">
                                {formatVal(q.constraints)}
                              </pre>
                            </div>
                          )}

                          {q.examples && (
                            <div>
                              <span className="font-bold text-gray-600 uppercase text-[10px]">Examples:</span>
                              <pre className="mt-1 p-2 bg-white rounded-lg border border-gray-200 text-gray-700 font-mono text-[11px] whitespace-pre-wrap">
                                {formatVal(q.examples)}
                              </pre>
                            </div>
                          )}

                          {q.sample_test_cases && q.sample_test_cases.length > 0 && (
                            <div>
                              <span className="font-bold text-gray-600 uppercase text-[10px]">Sample Test Cases:</span>
                              <div className="space-y-1.5 mt-1">
                                {q.sample_test_cases.map((tc: any, i: number) => (
                                  <div key={i} className="p-2 bg-white rounded-lg border border-gray-200 font-mono text-[11px]">
                                    <div><span className="text-gray-400 font-semibold">Input:</span> {formatVal(tc.input)}</div>
                                    <div><span className="text-gray-400 font-semibold">Output:</span> {formatVal(tc.expected_output ?? tc.output)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateExamPage;

"use client";

import React, { useState, useEffect } from "react";
import { 
  Award, TrendingUp, CheckCircle2, AlertTriangle, Calendar, 
  Sparkles, Target, Compass, ChevronRight, BookOpen, ShieldCheck 
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export interface EvaluationData {
  overallScore: number;
  correctness: number;
  complexity: number;
  systemDesign: number;
  communication: number;
  veracity: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  roadmap: Array<{ week: number; focus: string; tasks: string[] }>;
  sessionDate?: string;
  role?: string;
}

interface ScorecardViewProps {
  data?: EvaluationData;
  sessionId?: string;
}

const defaultData: EvaluationData = {
  overallScore: 84.5,
  correctness: 8.5,
  complexity: 8.0,
  systemDesign: 9.0,
  communication: 8.0,
  veracity: 9.0,
  summary:
    "Candidate demonstrated exceptional architectural intuition and structured reasoning during system design scenarios. Articulated trade-offs with high veracity against resume experience.",
  strengths: [
    "Clean modular code structure with robust error handling",
    "Quantified resume claim defense for caching throughput",
    "Optimal linear time complexity on technical challenges",
    "Clear, structured communication and active listening",
  ],
  weaknesses: [
    "Slight hesitation on distributed consensus & write-ahead logging trade-offs",
    "Could optimize auxilliary buffer allocation from O(N) to O(1)",
  ],
  roadmap: [
    {
      week: 1,
      focus: "Algorithmic Efficiency & Big-O Rigor",
      tasks: ["Drill 10 medium Two-Pointer problems", "Profile auxiliary memory via AST"],
    },
    {
      week: 2,
      focus: "System Design Trade-offs",
      tasks: ["Design distributed rate limiter with Redis", "Compare B-Tree vs LSM-Tree storage engines"],
    },
    {
      week: 3,
      focus: "Resume Claim Defense",
      tasks: ["Audit microservice circuit breakers", "Run 3 dynamic AI follow-up drills"],
    },
    {
      week: 4,
      focus: "Formal Assessment Simulation",
      tasks: ["Complete 60-min SEB lockdown exam", "Review longitudinal competency radar"],
    },
  ],
};

const API = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export const ScorecardView: React.FC<ScorecardViewProps> = ({ data, sessionId }) => {
  const { getToken } = useAuth();
  const [activeData, setActiveData] = useState<EvaluationData>(data || defaultData);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionId || null);

  useEffect(() => {
    if (data) {
      setActiveData(data);
      return;
    }

    const fetchScorecardHistory = async () => {
      setLoadingHistory(true);
      try {
        const token = getToken();
        const res = await fetch(`${API}/interview/scorecard/history?limit=5`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) {
            setHistory(rows);
            const latest = rows[0];
            setSelectedSessionId(latest.session_id);

            const dims = latest.dimension_scores || {};
            setActiveData({
              overallScore: latest.overall_score || defaultData.overallScore,
              correctness: dims.correctness || dims.technical_depth || 8.5,
              complexity: dims.complexity || dims.problem_solving || 8.0,
              systemDesign: dims.systemDesign || dims.architecture || 9.0,
              communication: dims.communication || 8.0,
              veracity: dims.veracity || dims.truthfulness || 9.0,
              summary: dims.summary || defaultData.summary,
              strengths: Array.isArray(dims.strengths) && dims.strengths.length > 0 ? dims.strengths : defaultData.strengths,
              weaknesses: Array.isArray(dims.weaknesses) && dims.weaknesses.length > 0 ? dims.weaknesses : defaultData.weaknesses,
              roadmap: Array.isArray(dims.roadmap) && dims.roadmap.length > 0 ? dims.roadmap : defaultData.roadmap,
              sessionDate: latest.date ? new Date(latest.date).toLocaleDateString() : undefined,
              role: latest.role,
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch scorecard history:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchScorecardHistory();
  }, [data, getToken]);

  const selectHistoryItem = (item: any) => {
    setSelectedSessionId(item.session_id);
    const dims = item.dimension_scores || {};
    setActiveData({
      overallScore: item.overall_score || defaultData.overallScore,
      correctness: dims.correctness || dims.technical_depth || 8.5,
      complexity: dims.complexity || dims.problem_solving || 8.0,
      systemDesign: dims.systemDesign || dims.architecture || 9.0,
      communication: dims.communication || 8.0,
      veracity: dims.veracity || dims.truthfulness || 9.0,
      summary: dims.summary || defaultData.summary,
      strengths: Array.isArray(dims.strengths) && dims.strengths.length > 0 ? dims.strengths : defaultData.strengths,
      weaknesses: Array.isArray(dims.weaknesses) && dims.weaknesses.length > 0 ? dims.weaknesses : defaultData.weaknesses,
      roadmap: Array.isArray(dims.roadmap) && dims.roadmap.length > 0 ? dims.roadmap : defaultData.roadmap,
      sessionDate: item.date ? new Date(item.date).toLocaleDateString() : undefined,
      role: item.role,
    });
  };

  const getScoreBand = (score: number) => {
    if (score >= 90) return { label: "Elite Candidate", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (score >= 80) return { label: "Ready for Placement", color: "text-[#92400E] bg-amber-50 border-amber-200" };
    if (score >= 70) return { label: "Developing Competence", color: "text-blue-700 bg-blue-50 border-blue-200" };
    return { label: "Needs Training", color: "text-rose-700 bg-rose-50 border-rose-200" };
  };

  const band = getScoreBand(activeData.overallScore);

  return (
    <div className="space-y-6">
      {/* Historical Attempts Selector if multiple exist */}
      {history.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 mr-1">Sessions:</span>
          {history.map((h, i) => (
            <button
              key={h.session_id || i}
              onClick={() => selectHistoryItem(h)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 ${
                selectedSessionId === h.session_id
                  ? "bg-[#111827] text-white border-[#111827] shadow-sm"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Calendar size={12} />
              <span>{h.date ? new Date(h.date).toLocaleDateString() : `Attempt #${history.length - i}`}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                {h.overall_score}%
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Top Header Banner */}
        <div className="px-6 py-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 via-white to-amber-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${band.color}`}>
                {band.label}
              </span>
              {activeData.role && (
                <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Target: {activeData.role}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#111827]">
              Multi-Dimensional Competency Scorecard
            </h1>
            <p className="text-xs text-gray-500">
              Generated via St. Joseph's placement assessment engine with verifiable telemetry
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-gray-200/80 shadow-xs self-start md:self-auto">
            <div className="w-12 h-12 rounded-xl bg-[#DC2626]/10 text-[#DC2626] flex items-center justify-center font-bold">
              <Award size={24} />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Overall Index
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-[#111827] font-mono tracking-tight">
                  {activeData.overallScore}
                </span>
                <span className="text-xs font-bold text-gray-400">/ 100</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5-Dimensional Metric Grid */}
        <div className="p-6 border-b border-gray-100 bg-white">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Target size={13} className="text-[#DC2626]" /> 5-Core Competency Rubric
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {[
              { label: "Correctness", score: activeData.correctness, desc: "Algorithmic accuracy & code behavior", color: "from-emerald-500 to-teal-600", bg: "bg-emerald-50 text-emerald-800" },
              { label: "Complexity", score: activeData.complexity, desc: "Optimal Time & Space complexity", color: "from-amber-500 to-orange-500", bg: "bg-amber-50 text-amber-800" },
              { label: "System Design", score: activeData.systemDesign, desc: "Scalability, caching & trade-offs", color: "from-blue-500 to-indigo-600", bg: "bg-blue-50 text-blue-800" },
              { label: "Communication", score: activeData.communication, desc: "Clarity, pacing & technical vocabulary", color: "from-purple-500 to-indigo-500", bg: "bg-purple-50 text-purple-800" },
              { label: "Veracity", score: activeData.veracity, desc: "Resume validation & project depth", color: "from-rose-500 to-red-600", bg: "bg-rose-50 text-rose-800" },
            ].map((metric) => (
              <div 
                key={metric.label}
                className="p-4 rounded-2xl border border-gray-100 bg-[#FAFAFA] hover:bg-white hover:border-gray-200 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-700">{metric.label}</span>
                    <span className={`text-[11px] font-black font-mono px-2 py-0.5 rounded-lg ${metric.bg}`}>
                      {metric.score.toFixed(1)}/10
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-tight mb-3">{metric.desc}</p>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${metric.color} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.min(100, (metric.score / 10) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Executive Summary */}
        <div className="p-6 border-b border-gray-100 bg-amber-50/20">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-[#EAB308]/20 text-[#92400E] mt-0.5 shrink-0">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-[#92400E] uppercase tracking-wider mb-1">
                Executive Synthesis
              </h2>
              <p className="text-sm text-gray-800 leading-relaxed font-medium">
                {activeData.summary}
              </p>
            </div>
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-gray-100">
          <div className="p-5 rounded-2xl bg-emerald-50/40 border border-emerald-100 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Demonstrated Strengths</h3>
            </div>
            <ul className="space-y-2">
              {activeData.strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-amber-50/40 border border-amber-100 space-y-3">
            <div className="flex items-center gap-2 text-[#92400E]">
              <AlertTriangle size={16} className="text-amber-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider">High-Priority Growth Areas</h3>
            </div>
            <ul className="space-y-2">
              {activeData.weaknesses.map((w, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EAB308] mt-1.5 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 30-Day Personalized Roadmap */}
        <div className="p-6 bg-[#FAFAFA]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-[#DC2626]" />
              <h3 className="text-sm font-black text-[#111827]">
                Personalized 30-Day Remediation Roadmap
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
              <BookOpen size={13} /> Weekly milestones
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {activeData.roadmap.map((week) => (
              <div 
                key={week.week}
                className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-md bg-[#DC2626]/10 text-[#DC2626] flex items-center justify-center font-bold text-[10px]">
                      {week.week}
                    </span>
                    <span className="text-xs font-bold text-[#111827] line-clamp-1">
                      {week.focus}
                    </span>
                  </div>
                  <ul className="space-y-1.5 mt-2">
                    {week.tasks.map((task, tidx) => (
                      <li key={tidx} className="text-[11px] text-gray-600 flex items-start gap-1.5 leading-snug">
                        <ChevronRight size={12} className="text-gray-400 shrink-0 mt-0.5" />
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                  <span>Week {week.week} Target</span>
                  <ShieldCheck size={13} className="text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScorecardView;

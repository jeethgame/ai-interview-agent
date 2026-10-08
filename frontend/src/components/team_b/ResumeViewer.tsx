"use client";

import React, { useState } from "react";

interface ResumeViewerProps {
  userId: string;
  onClaimsLoaded?: (claims: string[]) => void;
}

const API = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export const ResumeViewer: React.FC<ResumeViewerProps> = ({ userId, onClaimsLoaded }) => {
  const [resumeText, setResumeText] = useState(
    "Senior Full Stack Engineer\nSkills: Python, FastAPI, PostgreSQL, Redis, React, Docker, Kubernetes\nProjects:\n- AI Mock Interview Platform: Scaled async workers handling 500 concurrent sessions.\n- Reduced query latency by 45% using Redis caching.\n- Designed resilient circuit breaker fallback for LLM API integration."
  );
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<{
    skills: string[];
    projects: string[];
    claims: string[];
  } | null>(null);

  const handleParse = async () => {
    setParsing(true);
    try {
      const res = await fetch(`${API}/api/resumes/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, resume_text: resumeText }),
      });
      const data = await res.json();
      setParsedData({
        skills: data.skills,
        projects: data.projects,
        claims: data.claims,
      });
      if (onClaimsLoaded) onClaimsLoaded(data.claims);
    } catch (err) {
      console.error(err);
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs text-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Resume Claim Intelligence</h3>
          <p className="text-gray-500 text-[11px] mt-0.5">Extract verified technical claims for AI probing during interview sessions</p>
        </div>
        <button
          onClick={handleParse}
          disabled={parsing}
          className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white rounded-xl font-bold transition shadow-xs"
        >
          {parsing ? "Parsing Claims..." : "Ingest Resume"}
        </button>
      </div>

      {!parsedData ? (
        <div>
          <label className="text-gray-600 font-semibold block mb-1.5">Paste Resume Text / Project Experience:</label>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={5}
            className="w-full p-3 bg-gray-50 text-gray-800 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DC2626] font-mono text-xs"
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Skill Pills */}
          <div>
            <span className="font-bold text-gray-700 block mb-2">Extracted Skills:</span>
            <div className="flex flex-wrap gap-1.5">
              {parsedData.skills.map((skill, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 bg-red-50 border border-red-200 text-[#DC2626] font-semibold rounded-lg text-xs"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Verifiable Claims */}
          <div>
            <span className="font-bold text-gray-700 block mb-2">
              Verifiable Technical Claims (Anchored to Probing Agent):
            </span>
            <ul className="space-y-2">
              {parsedData.claims.map((claim, idx) => (
                <li
                  key={idx}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 flex items-start gap-2.5 leading-relaxed"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{claim}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

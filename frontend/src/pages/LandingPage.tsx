import React from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import { Mic, Brain, Search, Shield, ArrowRight, Sparkles, Bot, MessageSquare, BarChart3 } from 'lucide-react';

const LandingPage: React.FC = () => {
  const features = [
    { icon: Bot, title: 'Adaptive AI Interviewer', desc: 'Context-aware questions that adapt to your answers in real time.', color: '#DC2626' },
    { icon: Brain, title: 'Real-time Coach Agent', desc: 'Evaluates clarity, depth, and communication after every answer.', color: '#8B5CF6' },
    { icon: Search, title: 'Resource Discovery', desc: 'Curated learning resources based on your specific weak areas.', color: '#10B981' },
    { icon: Mic, title: 'Voice-First Interface', desc: 'Natural speech-to-speech interviews powered by Deepgram.', color: '#F97316' },
    { icon: BarChart3, title: 'Evidence-Grounded Scores', desc: 'Every score traces back to specific transcript turns.', color: '#3B82F6' },
    { icon: Shield, title: 'Secure Exam Portal', desc: 'Formal coding assessments with SEB lockdown and auto-scoring.', color: '#22C55E' },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section id="hero-section" className="relative text-center pt-16 pb-20 px-4 overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFDF7 60%, #FEF9E7 100%)' }}>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white border border-amber-200/80 text-xs font-bold text-[#92400E] mb-6 shadow-xs">
            <img src="/college-logo.png" alt="St. Joseph's Emblem" className="w-4 h-4 object-contain rounded-full" />
            <span>St. Joseph's College of Engineering · AI Placement & Assessment Portal</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-[#111827] leading-tight mb-4 tracking-tight">
            Next-Gen Placement Preparation<br />
            <span className="text-[#DC2626]">Powered by Multimodal AI</span>
          </h1>
          <p className="text-base sm:text-lg text-[#4B5563] max-w-2xl mx-auto mb-8 leading-relaxed font-normal">
            Adaptive speech-to-speech voice interviews, lockdown coding arena assessments, and granular faculty evaluation scorecards.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/login"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-sm shadow-md hover:shadow-[0_4px_20px_rgba(220,38,38,0.3)] transition-all">
              Sign In to Portal <ArrowRight size={16} />
            </Link>
            <Link to="/register"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl border border-gray-300 bg-white text-[#111827] font-bold text-sm hover:bg-gray-50 transition-all shadow-xs">
              Candidate Registration
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features-section" className="py-20 px-4 bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-50 border border-amber-200 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#EAB308]" />
              <span className="text-xs font-bold text-[#92400E] uppercase tracking-wider">Comprehensive Assessment Suite</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-[#111827] mb-3">Engineered for Placement Excellence</h2>
            <p className="text-[#6B7280] max-w-xl mx-auto">From real-time adaptive conversational interviews to lockdown technical coding tests.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-gray-200 border-b-[3px] border-b-[#EAB308] shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-1 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-xs" style={{ backgroundColor: color }}>
                  <Icon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-[#111827] mb-2">{title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-[#111827]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-black text-white mb-4">Ready for your upcoming campus drive?</h2>
          <p className="text-gray-400 mb-8 text-sm">Join St. Joseph's students practicing with realistic AI mock sessions and timed coding challenges.</p>
          <Link to="/login"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-sm transition-all shadow-lg">
            Access Candidate Portal <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0B0F17] border-t border-gray-800 text-gray-400 py-8 px-4 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-[#DC2626] flex items-center justify-center shrink-0">
              <Mic size={14} className="text-white" />
            </div>
            <img src="/college-logo.png" alt="St. Joseph's Crest" className="w-6 h-6 rounded-full object-contain bg-white p-0.5 shrink-0" />
            <span className="font-semibold text-gray-300">St. Joseph's College of Engineering</span>
          </div>
          <p className="text-gray-500">
            AI Placement & Assessment Portal · Department of Training & Placement
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

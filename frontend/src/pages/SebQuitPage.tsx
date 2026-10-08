import React from 'react';
import { CheckCircle2, LogOut, ShieldCheck } from 'lucide-react';

const SebQuitPage: React.FC = () => {
  const handleExit = () => {
    // Attempt standard browser close (SEB will terminate if quitURL reached)
    window.close();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col items-center justify-center p-6 selection:bg-rose-500 selection:text-white">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-xl p-8 md:p-10 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm mb-5">
          <CheckCircle2 className="w-9 h-9" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 mb-3">
          <ShieldCheck className="w-3.5 h-3.5" />
          Assessment Complete
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
          Exam Session Finalized
        </h1>

        <p className="text-slate-600 text-sm leading-relaxed max-w-md mb-8">
          Your code submissions, test case results, and integrity logs have been submitted and safely stored in the examination database.
        </p>

        <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 mb-8 leading-relaxed">
          🔒 <strong>Safe Exam Browser Lockdown Ended:</strong> You may now safely exit Safe Exam Browser. If the window does not close automatically, press <strong>Ctrl + Q</strong> or use the exit button below.
        </div>

        <button
          onClick={handleExit}
          className="w-full py-3.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Exit Safe Exam Browser
        </button>
      </div>
    </div>
  );
};

export default SebQuitPage;

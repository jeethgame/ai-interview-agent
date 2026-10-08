import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Mic, ArrowRight, AlertCircle } from 'lucide-react';

const LoginPage: React.FC = () => {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as any)?.from?.pathname || null;

  // Redirect if already logged in
  React.useEffect(() => {
    if (isAuthenticated && user) {
      const dest = from || (user.role === 'candidate' ? '/home' : '/dashboard');
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      const dest = from || (loggedInUser.role === 'candidate' ? '/home' : '/dashboard');
      navigate(dest, { replace: true });
    } catch (err: any) {
      // handleResponse throws Error(message) — not Axios-style err.response.data
      const msg = err?.message || '';
      let detailMsg = msg || 'Login failed. Please try again.';
      // Axios-style fallback (if ever used)
      const d = err?.response?.data?.detail;
      if (typeof d === 'string') detailMsg = d;
      else if (Array.isArray(d) && d.length > 0)
        detailMsg = d.map((i: any) => i.msg || i.message || JSON.stringify(i)).join(', ');
      setError(detailMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#111827] flex-col justify-between p-12 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="absolute border border-white rounded-full"
              style={{ width: `${(i + 1) * 120}px`, height: `${(i + 1) * 120}px`,
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          ))}
        </div>

        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/college-logo.png"
              alt="St. Joseph's College of Engineering"
              className="w-12 h-12 rounded-full object-contain bg-white p-1 shadow-md shrink-0"
            />
            <div>
              <span className="text-white font-extrabold text-lg tracking-tight block leading-tight">St. Joseph's College of Engineering</span>
              <span className="text-amber-400 font-semibold text-xs tracking-wider uppercase">AI Placement & Assessment Portal</span>
            </div>
          </Link>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-[#EAB308] animate-pulse" />
            <span className="text-[#EAB308] text-xs font-bold tracking-wider uppercase">Official Placement & AI Assessment</span>
          </div>
          <h1 className="text-4xl font-black text-white leading-tight">
            Prepare smarter.<br />
            <span className="text-[#EAB308]">Interview better.</span>
          </h1>
          <p className="text-gray-300 text-sm leading-relaxed max-w-sm">
            AI-driven adaptive mock interviews, formal proctored coding assessments, and institutional placement analytics.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 pt-4 border-t border-white/10">
          <img
            src="/college-logo.png"
            alt="St. Joseph's College of Engineering"
            className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shrink-0"
          />
          <div>
            <p className="text-white text-xs font-bold">St. Joseph's College of Engineering</p>
            <p className="text-gray-400 text-[11px]">Department of Placement & Training</p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/college-logo.png"
              alt="St. Joseph's College of Engineering"
              className="w-10 h-10 rounded-full object-contain bg-white border border-amber-200 p-0.5 shadow-xs shrink-0"
            />
            <div>
              <span className="text-[#111827] font-black text-sm block leading-tight">St. Joseph's College of Engineering</span>
              <span className="text-[#DC2626] font-bold text-[10px] tracking-wide uppercase">AI Placement Portal</span>
            </div>
          </Link>
        </div>

        <div className="max-w-sm w-full mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-black text-[#111827] mb-2">Welcome back</h2>
            <p className="text-[#6B7280] text-sm">Sign in to continue your interview practice</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle size={16} className="text-[#DC2626] shrink-0" />
                <p className="text-sm text-[#DC2626]">{error}</p>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#111827]">Email address</label>
              <input
                type="text" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com or candidate" autoComplete="email" required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-[#111827]
                  placeholder-gray-400 bg-white focus:outline-none focus:border-[#DC2626]
                  focus:ring-2 focus:ring-[#DC2626]/10 transition-all"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[#111827]">Password</label>
                <button type="button" onClick={() => alert('Password reset will be available after Cognito setup.')} className="text-xs text-gray-400 hover:text-gray-500 font-medium">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password" autoComplete="current-password" required
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm text-[#111827]
                    placeholder-gray-400 bg-white focus:outline-none focus:border-[#DC2626]
                    focus:ring-2 focus:ring-[#DC2626]/10 transition-all"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl
                bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-sm
                disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm
                hover:shadow-[0_4px_16px_rgba(220,38,38,0.3)]">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign in <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#6B7280]">
            Don't have an account?{' '}
            <Link to="/register" className="text-[#DC2626] font-semibold hover:underline">
              Sign up free
            </Link>
          </p>

          {/* Demo Personas for Quick Access */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center mb-2.5">
              Select Demo Persona (1-Click Login)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Candidate', email: 'candidate@dev.example.com', pwd: 'Test1234!', role: 'Student' },
                { label: 'Faculty', email: 'faculty@dev.example.com', pwd: 'Test1234!', role: 'Staff' },
                { label: 'Admin', email: 'admin@dev.example.com', pwd: 'Test1234!', role: 'Officer' },
              ].map(({ label, email: e, pwd, role }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setEmail(e);
                    setPassword(pwd);
                    setTimeout(() => document.querySelector<HTMLFormElement>('form')?.requestSubmit(), 50);
                  }}
                  className="p-2 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white hover:border-[#DC2626]/40 hover:shadow-xs transition-all text-center group cursor-pointer"
                >
                  <div className="text-xs font-bold text-gray-900 group-hover:text-[#DC2626] transition-colors">{label}</div>
                  <div className="text-[10px] text-gray-500 font-medium">{role}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-center text-gray-400 mt-2">
              Default password: <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Test1234!</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

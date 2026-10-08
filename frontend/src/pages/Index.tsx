import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInterviewSession } from '@/hooks/useInterviewSession';
import Header from '@/components/Header';
import InterviewSession from '@/components/InterviewSession';
import PostInterviewReport from '@/components/PostInterviewReport';
import BackendDownNotification from '@/components/BackendDownNotification';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles, BarChart3, Bot, BriefcaseBusiness, Building2, FileText, UploadCloud,
  Settings, ArrowRight, Target, CheckCircle,
  Brain, Search, Clock, MessageSquare,
  Mic, Shield, ScrollText, Lock
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InterviewStartRequest, api } from '@/services/api';
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const {
    state,
    messages,
    isLoading,
    results,
    postInterviewState,
    selectedVoice,
    coachFeedbackStates,
    sessionId,
    showSessionWarning,
    sessionTimeRemaining,
    actions
  } = useInterviewSession();

  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const isCandidate = user?.role === 'candidate';
  const isAdminOrFaculty = user?.role === 'admin' || user?.role === 'faculty';
  const autoStartedRef = useRef(false);
  const [isAutoStarting, setIsAutoStarting] = useState(false);

  const [isBackendDown, setIsBackendDown] = useState(false);
  const [showBackendNotification, setShowBackendNotification] = useState(false);
  const [hasCheckedBackend, setHasCheckedBackend] = useState(false);

  const [jobRole, setJobRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeContent, setResumeContent] = useState('');
  const [style, setStyle] = useState<'formal' | 'casual' | 'aggressive' | 'technical'>('formal');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [interviewDuration, setInterviewDuration] = useState(10);
  const [company, setCompany] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showRequiredError, setShowRequiredError] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const configSectionRef = useRef<HTMLDivElement>(null);
  const jobRoleSectionRef = useRef<HTMLDivElement>(null);

  const checkBackendHealth = async () => {
    if (hasCheckedBackend) return;
    try {
      setHasCheckedBackend(true);
      await api.checkHealth();
      setIsBackendDown(false);
    } catch (error) {
      setIsBackendDown(true);
      setShowBackendNotification(true);
    }
  };

  useEffect(() => {
    checkBackendHealth();

    const autoStartParam = searchParams.get('autoStart');
    const roleParam = searchParams.get('role');
    const styleParam = searchParams.get('style');
    const durationParam = searchParams.get('duration');
    const companyParam = searchParams.get('company');

    if (roleParam) setJobRole(roleParam);
    if (styleParam && ['formal', 'casual', 'aggressive', 'technical'].includes(styleParam)) {
      setStyle(styleParam as any);
    }
    if (durationParam) {
      const dur = parseInt(durationParam, 10);
      if (!isNaN(dur) && dur > 0) setInterviewDuration(dur);
    }
    if (companyParam) setCompany(companyParam);

    if (autoStartParam === 'true' && !autoStartedRef.current && state === 'configuring') {
      autoStartedRef.current = true;
      setIsAutoStarting(true);
      const targetRole = roleParam || 'Software Engineer';
      const targetStyle = (styleParam as any) || 'formal';
      const targetDuration = durationParam ? parseInt(durationParam, 10) : 15;

      const config: InterviewStartRequest = {
        job_role: targetRole,
        style: targetStyle,
        difficulty: 'medium',
        interview_duration_minutes: targetDuration,
        company_name: companyParam || undefined,
        use_time_based_interview: true,
      };

      actions.startInterview(config).finally(() => setIsAutoStarting(false));
      return;
    }

    if (roleParam || styleParam || durationParam) {
      setTimeout(() => configSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    }
  }, [searchParams, state]);

  useEffect(() => {
    if (jobRole.trim() && showRequiredError) setShowRequiredError(false);
  }, [jobRole, showRequiredError]);

  const scrollToConfig = () => configSectionRef.current?.scrollIntoView({ behavior: 'smooth' });

  const popularRoles = [
    { title: 'Software Engineer', icon: '💻' },
    { title: 'Backend Developer', icon: '⚙️' },
    { title: 'Frontend Developer', icon: '🎨' },
    { title: 'Full Stack Developer', icon: '🔗' },
    { title: 'Data Scientist', icon: '📈' },
    { title: 'ML Engineer', icon: '🧠' },
    { title: 'DevOps Engineer', icon: '🚀' },
    { title: 'Product Manager', icon: '📊' },
  ];

  const interviewStyles = [
    { value: 'formal', label: 'Professional', description: 'Traditional corporate interview style' },
    { value: 'casual', label: 'Conversational', description: 'Relaxed and friendly approach' },
    { value: 'technical', label: 'Technical Deep-dive', description: 'Focus on technical skills' },
    { value: 'aggressive', label: 'Challenging', description: 'High-pressure scenario simulation' },
  ];

  const difficultyLevels = [
    { value: 'easy', label: 'Beginner', description: 'Basic questions, gentle pace', bars: 1 },
    { value: 'medium', label: 'Intermediate', description: 'Standard interview complexity', bars: 2 },
    { value: 'hard', label: 'Advanced', description: 'Complex scenarios and follow-ups', bars: 3 },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Unsupported File Type', description: 'Please upload a .txt, .pdf, or .docx file.', variant: 'destructive' });
      return;
    }

    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setResumeContent(event.target.result as string);
          toast({ title: 'Success', description: 'Resume content loaded successfully.' });
        }
      };
      reader.readAsText(file);
    } else {
      setIsUploading(true);
      try {
        const response = await api.uploadResumeFile(file);
        if (response.resume_text) {
          setResumeContent(response.resume_text);
          toast({ title: 'Resume Processed', description: `${response.filename} content extracted successfully.` });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to upload resume.';
        toast({ title: 'Upload Error', description: errorMsg, variant: 'destructive' });
      } finally {
        setIsUploading(false);
      }
    }
    e.target.value = '';
  };

  const handleStartInterview = () => {
    if (!jobRole.trim()) {
      setShowRequiredError(true);
      setTimeout(() => jobRoleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      toast({ title: 'Required Field Missing', description: 'Please enter a job role to start your interview practice.', variant: 'destructive' });
      setTimeout(() => setShowRequiredError(false), 5000);
      return;
    }

    const config: InterviewStartRequest = {
      job_role: jobRole,
      job_description: isAdminOrFaculty ? (jobDescription || undefined) : undefined,
      resume_content: resumeContent || undefined,
      style: isAdminOrFaculty ? style : 'formal',
      difficulty: isAdminOrFaculty ? difficulty : 'medium',
      company_name: company || undefined,
      interview_duration_minutes: isAdminOrFaculty ? interviewDuration : 15,
      use_time_based_interview: true,
    };

    actions.startInterview(config);
  };

  // ── Hero ──
  const renderHeroSection = () => (
    <section
      id="hero-section"
      ref={heroRef}
      className="relative text-center pt-16 pb-14 sm:pt-20 sm:pb-18 px-4 sm:px-10 border-b border-white/5 overflow-hidden"
    >
      {/* Ambient mesh glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-red-600/10 blur-[110px]" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full bg-amber-500/6 blur-[90px]" />
        <div className="absolute top-1/2 left-10 w-48 h-48 rounded-full bg-red-800/8 blur-[70px]" />
      </div>

      <div className="container mx-auto max-w-4xl relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 mb-6 backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>St. Joseph's College of Engineering &bull; Placement Assessment Portal</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-black text-white leading-[1.1] mb-4 tracking-tight">
          AI Voice Interview{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-amber-400">
            Assessment
          </span>
        </h1>

        <p className="text-sm sm:text-base text-white/45 max-w-2xl mx-auto mb-8 leading-relaxed">
          {isAdminOrFaculty
            ? 'Administrative mode: Configure evaluation criteria, interview styles, and technical difficulty parameters for campus recruitment drives.'
            : 'Live conversational placement simulation with real-time AI feedback and evaluation.'}
        </p>

        <button
          onClick={scrollToConfig}
          className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-[0_0_35px_rgba(220,38,38,0.45)] hover:shadow-[0_0_55px_rgba(220,38,38,0.6)] transition-all duration-200 active:scale-95"
        >
          {isAdminOrFaculty ? 'Configure Assessment' : 'Setup & Launch'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );

  // ── Config Form ──
  const renderConfigurationForm = () => (
    <div ref={configSectionRef} id="config-section" className="py-12 sm:py-20 relative overflow-hidden border-t border-white/5">
      {/* Section ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full bg-red-600/4 blur-[130px] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-6xl mx-auto">

          {/* Section Header */}
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 mb-3">
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 tracking-wider uppercase">
                {isAdminOrFaculty ? 'Faculty & Admin Controls' : 'Placement Assessment Setup'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white mb-2 tracking-tight">
              {isAdminOrFaculty ? 'Configure Examination Parameters' : 'Setup Your Placement Interview'}
            </h2>
            <p className="text-white/40 text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed">
              {isAdminOrFaculty
                ? 'Manage test rubrics, difficulty calibration, interview styles, and candidate evaluation quotas.'
                : 'Select your target placement track and review your credentials before launching the live AI interview.'}
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 mb-5">
            {/* Job Role — large panel */}
            <div
              ref={jobRoleSectionRef}
              className={`lg:col-span-8 bg-[#13131A] border rounded-2xl p-6 lg:p-7 border-b-[2px] transition-all duration-300 ${
                showRequiredError
                  ? 'border-red-500/50 border-b-red-500 shadow-[0_0_25px_rgba(220,38,38,0.18)]'
                  : 'border-white/8 border-b-amber-500/40 hover:border-white/14'
              }`}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 rounded-xl bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className={`text-lg sm:text-xl font-bold ${showRequiredError ? 'text-red-400' : 'text-white'}`}>
                    Target Role
                  </h3>
                  <p className="text-white/35 text-xs">What position or track are you being evaluated for?</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full font-bold text-xs bg-red-500/15 text-red-400 border border-red-500/20">
                  Required
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {popularRoles.map((role) => (
                  <button
                    key={role.title}
                    type="button"
                    onClick={() => setJobRole(role.title)}
                    className={`relative p-3 rounded-xl border text-left transition-all duration-150 flex items-center justify-between ${
                      jobRole === role.title
                        ? 'border-red-500/50 bg-red-500/15 shadow-[0_0_12px_rgba(220,38,38,0.15)]'
                        : 'border-white/8 bg-white/3 hover:border-red-500/25 hover:bg-red-500/6'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{role.icon}</span>
                      <span className={`text-[11px] font-semibold leading-tight ${jobRole === role.title ? 'text-red-300' : 'text-white/65'}`}>
                        {role.title}
                      </span>
                    </div>
                    {jobRole === role.title && <CheckCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  </button>
                ))}
              </div>

              <Input
                placeholder="Or enter custom role (e.g., Cloud Architect, AI Systems Engineer)..."
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                className={`bg-[#0D0D14] text-white placeholder:text-white/25 border rounded-xl px-4 py-3 text-sm focus-visible:ring-red-500/25 focus-visible:border-red-500/60 ${
                  showRequiredError && !jobRole.trim() ? 'border-red-500/50' : 'border-white/10'
                }`}
              />
            </div>

            {/* Right column */}
            <div className="lg:col-span-4 space-y-4">
              {/* Company */}
              <div className="bg-[#13131A] border border-white/8 border-b-[2px] border-b-amber-500/40 rounded-2xl p-5 hover:border-white/14 transition-all">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-2 rounded-lg bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.25)]">
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white flex-1">Company / Hiring Drive</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/6 text-white/35 border border-white/8">
                    Optional
                  </span>
                </div>
                <Input
                  placeholder="e.g. Amazon, Zoho, TCS, Cisco..."
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="bg-[#0D0D14] border-white/10 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-red-500/25 focus-visible:border-red-500/60 text-xs"
                />
              </div>

              {/* Duration (admin only) */}
              {isAdminOrFaculty && (
                <div className="bg-[#13131A] border border-white/8 border-b-[2px] border-b-amber-500/40 rounded-2xl p-5 hover:border-white/14 transition-all">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/20">
                      <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Duration (Admin Control)</h3>
                      <p className="text-xs font-semibold text-red-400">{interviewDuration} minutes</p>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={interviewDuration}
                    onChange={(e) => setInterviewDuration(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-red-600 mt-1"
                  />
                  <div className="flex justify-between text-[11px] text-white/25 font-medium mt-2">
                    <span>5m • Quick</span>
                    <span>15m • Standard</span>
                    <span>30m • Deep</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Admin-only: Style + Difficulty */}
          {isAdminOrFaculty && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-5">
              {/* Interview Style */}
              <div className="bg-[#13131A] border border-white/8 border-b-[2px] border-b-amber-500/40 rounded-2xl p-5 hover:border-white/14 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.25)]">
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Interview Style (Admin Control)</h3>
                    <p className="text-white/35 text-xs">Configure questioning persona</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {interviewStyles.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStyle(s.value as any)}
                      className={`p-3 rounded-xl border text-left transition-all duration-150 ${
                        style === s.value
                          ? 'border-red-500/50 bg-red-500/15 shadow-[0_0_10px_rgba(220,38,38,0.12)]'
                          : 'border-white/8 bg-white/3 hover:border-red-500/25 hover:bg-red-500/6'
                      }`}
                    >
                      <div className={`text-xs font-bold mb-0.5 ${style === s.value ? 'text-red-300' : 'text-white/75'}`}>{s.label}</div>
                      <div className="text-[10px] text-white/30 leading-relaxed">{s.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="bg-[#13131A] border border-white/8 border-b-[2px] border-b-amber-500/40 rounded-2xl p-5 hover:border-white/14 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.25)]">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Difficulty Level (Admin Control)</h3>
                    <p className="text-white/35 text-xs">Adjust problem complexity and probing depth</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {difficultyLevels.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setDifficulty(level.value as any)}
                      className={`w-full p-3 rounded-xl border text-left transition-all duration-150 flex items-center justify-between ${
                        difficulty === level.value
                          ? 'border-red-500/50 bg-red-500/15 shadow-[0_0_10px_rgba(220,38,38,0.12)]'
                          : 'border-white/8 bg-white/3 hover:border-red-500/25 hover:bg-red-500/6'
                      }`}
                    >
                      <div>
                        <div className={`text-xs font-bold ${difficulty === level.value ? 'text-red-300' : 'text-white/75'}`}>{level.label}</div>
                        <div className="text-[10px] text-white/30 mt-0.5">{level.description}</div>
                      </div>
                      <div className="flex gap-1">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className={`w-1.5 h-4 rounded-full transition-colors ${i < level.bars ? 'bg-red-500' : 'bg-white/10'}`} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Candidate: Institutional Protocol Locked Box */}
          {!isAdminOrFaculty && (
            <div className="bg-[#13131A] border border-white/8 border-b-[2px] border-b-amber-500/40 rounded-2xl p-6 mb-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-red-500/15 text-red-400 border border-red-500/20">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Institutional Examination Protocol</h3>
                  <p className="text-xs text-white/35">St. Joseph's College of Engineering Placement Standards</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/6 border border-white/8 text-xs font-bold text-white/40">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Locked Parameters</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-white/4 border border-white/8">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Evaluation Style</p>
                  <p className="text-sm font-black text-white mt-0.5">Professional Technical</p>
                  <p className="text-[10px] text-white/30">Corporate placement standard</p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/4 border border-white/8">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Complexity</p>
                  <p className="text-sm font-black text-white mt-0.5">Adaptive Assessment</p>
                  <p className="text-[10px] text-white/30">Dynamically calibrates to answers</p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/4 border border-white/8">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Time Quota</p>
                  <p className="text-sm font-black text-white mt-0.5">{interviewDuration} Minutes</p>
                  <p className="text-[10px] text-white/30">Timed placement quota</p>
                </div>
              </div>
              <p className="text-[11px] text-white/25 italic mt-3">
                * Note: Test parameters, duration sliders, questioning persona, and scoring rubrics are managed strictly by faculty and placement administration. Candidate controls are read-only.
              </p>
            </div>
          )}

          {/* Job Description + Resume Upload */}
          <div className={`grid grid-cols-1 ${isAdminOrFaculty ? 'lg:grid-cols-2' : ''} gap-4 sm:gap-5 mb-6`}>
            {isAdminOrFaculty && (
              <div className="bg-[#13131A] border border-white/8 border-b-[2px] border-b-amber-500/40 rounded-2xl p-5 hover:border-white/14 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.25)]">
                    <ScrollText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Job Description (Admin Focus)</h3>
                    <p className="text-white/35 text-xs">Paste target role requirements for customized prompts</p>
                  </div>
                </div>
                <Textarea
                  placeholder="Paste the full job description or key requirements here to focus interview questions..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0D0D14] border-white/10 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-red-500/25 focus-visible:border-red-500/60 text-xs leading-relaxed"
                />
              </div>
            )}

            {/* Resume Upload */}
            <div className="bg-[#13131A] border border-white/8 border-b-[2px] border-b-amber-500/40 rounded-2xl p-5 hover:border-white/14 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.25)]">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white">Resume Upload</h3>
                  <p className="text-white/35 text-xs">Attach resume for dynamic, experience-grounded questioning</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/6 text-white/35 border border-white/8">Optional</span>
              </div>

              <div className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
                resumeContent
                  ? 'border-emerald-500/35 bg-emerald-500/6'
                  : 'border-white/10 bg-white/2 hover:border-red-500/25 hover:bg-red-500/4'
              }`}>
                {resumeContent ? (
                  <div className="space-y-2">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-emerald-400 font-bold text-xs">Resume extracted successfully!</p>
                    <p className="text-white/35 text-[11px]">AI agent will dynamically probe based on your project and work history.</p>
                    <button type="button" onClick={() => setResumeContent('')} className="text-red-400 hover:text-red-300 text-xs font-semibold underline">
                      Upload a different resume
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <UploadCloud className="w-8 h-8 text-red-500 mx-auto" />
                    <div>
                      <p className="text-white/60 font-semibold text-xs">Drag &amp; drop resume or click to browse</p>
                      <p className="text-white/30 text-[10px] mt-0.5">Supports PDF, DOCX, and TXT files</p>
                    </div>
                    <input type="file" accept=".txt,.pdf,.docx" onChange={handleFileUpload} className="hidden" id="resume-upload" disabled={isUploading} />
                    <label htmlFor="resume-upload" className="inline-flex items-center gap-1.5 btn-theme-primary text-xs py-2 px-4 cursor-pointer">
                      {isUploading ? (
                        <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Processing...</span></>
                      ) : (
                        <><UploadCloud className="w-3.5 h-3.5" /><span>Choose File</span></>
                      )}
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Launch Button */}
          <div className="text-center pt-2">
            <button
              onClick={handleStartInterview}
              disabled={isLoading}
              className={`btn-theme-primary text-sm sm:text-base py-3.5 px-10 rounded-xl shadow-[0_0_35px_rgba(220,38,38,0.4)] font-bold transition-all duration-300 ${
                isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 hover:shadow-[0_0_55px_rgba(220,38,38,0.55)]'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Initializing Voice Session...</span></>
                ) : (
                  <><span>{isAdminOrFaculty ? 'Launch Interview (Admin Preview)' : 'Start Placement Voice Interview'}</span><ArrowRight className="w-4 h-4" /></>
                )}
              </div>
            </button>
            {!jobRole.trim() && (
              <p className="mt-2.5 text-xs text-red-400/70 font-medium">* Please select or enter a target role above to begin.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Footer ──
  const renderFooter = () => {
    if (state !== 'configuring') return null;
    return (
      <footer className="w-full mt-auto">
        <div className="bg-red-600 text-white text-center py-5 px-6 text-sm font-bold tracking-wide">
          St. Joseph's College of Engineering &mdash; AI Interview Agent &mdash; Placement Preparation Platform
        </div>
        <div className="bg-black/70 text-white/25 text-center py-4 px-6 text-xs border-t border-white/5">
          &copy; 2026 AI Interview Agent. All rights reserved.
        </div>
      </footer>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0F] text-white relative overflow-hidden font-sans">
      {state !== 'interviewing' && state !== 'post_interview' && (
        <Header showReset={state === 'completed'} onReset={actions.resetInterview} />
      )}

      <main className="flex-1 flex flex-col">
        {isAutoStarting && (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-4 shadow-[0_0_30px_rgba(220,38,38,0.2)] animate-pulse">
              <Mic className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Preparing Voice Interview Session</h2>
            <p className="text-sm text-white/40 max-w-md">
              Initializing AI interviewer audio session &amp; loading examination protocol...
            </p>
          </div>
        )}

        {state === 'configuring' && !isAutoStarting && (
          <>
            {renderHeroSection()}
            {renderConfigurationForm()}
            {renderFooter()}
          </>
        )}

        {state === 'interviewing' && (
          <InterviewSession
            interviewDurationMinutes={interviewDuration}
            messages={messages}
            isLoading={isLoading}
            onSendMessage={actions.sendMessage}
            onEndInterview={actions.endInterview}
            onVoiceSelect={actions.setSelectedVoice}
            coachFeedbackStates={coachFeedbackStates}
            sessionId={sessionId}
            showSessionWarning={showSessionWarning}
            sessionTimeRemaining={sessionTimeRemaining}
            onExtendSession={actions.extendSession}
            onSessionTimeout={actions.handleSessionTimeout}
          />
        )}

        {state === 'post_interview' && postInterviewState && (
          <PostInterviewReport
            perTurnFeedback={postInterviewState.perTurnFeedback}
            finalSummary={postInterviewState.finalSummary}
            resources={postInterviewState.resources}
            onStartNewInterview={actions.resetInterview}
            onGoHome={actions.resetInterview}
          />
        )}
      </main>

      <BackendDownNotification isOpen={showBackendNotification} onClose={() => setShowBackendNotification(false)} />

      <style dangerouslySetInnerHTML={{
        __html: `
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          @keyframes gentle-shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          .animate-gentle-shake { animation: gentle-shake 0.5s ease-in-out; }
        `
      }} />
    </div>
  );
};

export default Index;

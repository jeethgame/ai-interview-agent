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
  Sparkles, BarChart3, Building2, FileText, UploadCloud,
  Settings, ArrowRight, Target, CheckCircle,
  Clock, MessageSquare,
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
  const featuresSectionRef = useRef<HTMLDivElement>(null);

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
    { title: 'Software Engineer', icon: '💻', gradient: 'from-blue-500 to-cyan-500' },
    { title: 'Backend Developer', icon: '⚙️', gradient: 'from-slate-500 to-gray-600' },
    { title: 'Frontend Developer', icon: '🎨', gradient: 'from-orange-500 to-red-500' },
    { title: 'Full Stack Developer', icon: '🔗', gradient: 'from-indigo-500 to-purple-500' },
    { title: 'Data Scientist', icon: '📈', gradient: 'from-green-500 to-teal-500' },
    { title: 'ML Engineer', icon: '🧠', gradient: 'from-purple-500 to-pink-500' },
    { title: 'DevOps Engineer', icon: '🚀', gradient: 'from-yellow-500 to-orange-500' },
    { title: 'Product Manager', icon: '📊', gradient: 'from-cyan-500 to-blue-500' },
  ];

  const interviewStyles = [
    { value: 'formal', label: 'Professional', description: 'Traditional corporate interview style', color: 'blue' },
    { value: 'casual', label: 'Conversational', description: 'Relaxed and friendly approach', color: 'green' },
    { value: 'technical', label: 'Technical Deep-dive', description: 'Focus on technical skills and problem-solving', color: 'purple' },
    { value: 'aggressive', label: 'Challenging', description: 'High-pressure scenario simulation', color: 'red' },
  ];

  const difficultyLevels = [
    { value: 'easy', label: 'Beginner', description: 'Basic questions, gentle pace', bars: 1, color: 'green' },
    { value: 'medium', label: 'Intermediate', description: 'Standard interview complexity', bars: 2, color: 'orange' },
    { value: 'hard', label: 'Advanced', description: 'Complex scenarios and follow-ups', bars: 3, color: 'red' },
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
      className="relative text-center pt-12 pb-12 sm:pt-16 sm:pb-16 px-4 sm:px-10 bg-white border-b border-gray-100"
    >
      <div className="container mx-auto max-w-4xl relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200/60 text-xs font-bold text-[#DC2626] mb-4">
          <Sparkles className="w-3.5 h-3.5 text-[#DC2626]" />
          <span>St. Joseph's College of Engineering &bull; Placement Assessment Portal</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] leading-[1.2] mb-3 tracking-tight">
          AI Voice Interview Assessment
        </h1>

        <p className="text-sm sm:text-base text-[#4B5563] max-w-2xl mx-auto mb-6 leading-relaxed">
          {isAdminOrFaculty
            ? 'Administrative mode: Configure evaluation criteria, interview styles, and technical difficulty parameters for campus recruitment drives.'
            : 'Live conversational placement simulation with real-time feedback and evaluation.'}
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={scrollToConfig}
            className="btn-theme-primary text-sm sm:text-base font-bold shadow-md px-6 py-2.5"
          >
            {isAdminOrFaculty ? 'Configure Assessment' : 'Setup & Launch'}
          </button>
        </div>
      </div>
    </section>
  );

  // ── Config Form ──
  const renderConfigurationForm = () => (
    <div ref={configSectionRef} id="config-section" className="py-12 sm:py-20 bg-[#FAFAFA] relative overflow-hidden border-t border-gray-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-6xl mx-auto">

          {/* Section Header */}
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FEF3C7] border border-amber-300 shadow-sm mb-3">
              <Settings className="w-3.5 h-3.5 text-[#92400E]" />
              <span className="text-xs font-bold text-[#92400E] tracking-wider uppercase">
                {isAdminOrFaculty ? 'Faculty & Admin Controls' : 'Placement Assessment Setup'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#111827] mb-2 tracking-tight">
              {isAdminOrFaculty ? 'Configure Examination Parameters' : 'Setup Your Placement Interview'}
            </h2>
            <p className="text-[#4B5563] text-xs sm:text-sm lg:text-base max-w-2xl mx-auto leading-relaxed">
              {isAdminOrFaculty
                ? 'Manage test rubrics, difficulty calibration, interview styles, and candidate evaluation quotas.'
                : 'Select your target placement track and review your credentials before launching the live AI interview.'}
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
            {/* Job Role */}
            <div
              ref={jobRoleSectionRef}
              className={`lg:col-span-8 bg-white border rounded-2xl p-6 lg:p-7 border-b-[3px] border-b-[#EAB308] shadow-sm transition-all duration-300 ${
                showRequiredError ? 'border-red-500 shadow-red-500/20' : 'border-gray-200 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className={`p-2.5 rounded-xl shadow-sm text-white ${showRequiredError ? 'bg-red-600' : 'bg-[#DC2626]'}`}>
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className={`text-lg sm:text-xl font-bold ${showRequiredError ? 'text-red-600' : 'text-[#111827]'}`}>
                    Target Role
                  </h3>
                  <p className="text-[#4B5563] text-xs">What position or track are you being evaluated for?</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full font-bold text-xs bg-red-50 text-red-600 border border-red-200">
                  Required
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
                {popularRoles.map((role) => (
                  <button
                    key={role.title}
                    type="button"
                    onClick={() => setJobRole(role.title)}
                    className={`relative p-3 rounded-xl border text-left transition-all duration-200 flex items-center justify-between ${
                      jobRole === role.title
                        ? 'border-2 border-[#DC2626] bg-[#FEF3C7] text-[#92400E] font-bold shadow-sm'
                        : 'border-gray-200 bg-white hover:border-[#DC2626]/40 hover:bg-red-50/20 text-[#111827]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{role.icon}</span>
                      <span className="text-xs font-semibold">{role.title}</span>
                    </div>
                    {jobRole === role.title && <CheckCircle className="w-3.5 h-3.5 text-[#DC2626]" />}
                  </button>
                ))}
              </div>

              <Input
                placeholder="Or enter custom role (e.g., Cloud Architect, AI Systems Engineer)..."
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                className={`bg-white text-[#111827] placeholder-gray-400 border rounded-xl px-4 py-3 text-sm focus:border-[#DC2626] focus:ring-2 focus:ring-red-500/20 shadow-sm ${
                  showRequiredError && !jobRole.trim() ? 'border-red-500' : 'border-gray-300'
                }`}
              />
            </div>

            {/* Right column */}
            <div className="lg:col-span-4 space-y-6">
              {/* Company */}
              <div className="bg-white border border-gray-200 border-b-[3px] border-b-[#EAB308] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-2 rounded-lg bg-[#DC2626] text-white shadow-sm">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#111827]">Company / Hiring Drive</h3>
                  </div>
                  <div className="ml-auto">
                    <span className="px-2 py-0.5 rounded-full font-medium text-[10px] bg-gray-100 text-gray-600">Optional</span>
                  </div>
                </div>
                <Input
                  placeholder="e.g. Amazon, Zoho, TCS, Cisco..."
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="bg-white border-gray-300 text-[#111827] rounded-xl focus:border-[#DC2626] focus:ring-2 focus:ring-red-500/20 text-xs"
                />
              </div>

              {/* Duration (admin only) */}
              {isAdminOrFaculty && (
                <div className="bg-white border border-gray-200 border-b-[3px] border-b-[#EAB308] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="p-2 rounded-lg bg-[#EAB308] text-[#111827] shadow-sm">
                      <Clock className="w-4 h-4 text-[#111827]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#111827]">Duration (Admin Control)</h3>
                      <p className="text-xs font-semibold text-[#DC2626]">{interviewDuration} minutes</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2">
                    <input
                      type="range"
                      min="5"
                      max="30"
                      value={interviewDuration}
                      onChange={(e) => setInterviewDuration(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#DC2626]"
                    />
                    <div className="flex justify-between text-[11px] text-[#6B7280] font-medium">
                      <span>5m • Quick</span>
                      <span>15m • Standard</span>
                      <span>30m • Deep</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Admin-only: Style + Difficulty */}
          {isAdminOrFaculty && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Interview Style */}
              <div className="bg-white border border-gray-200 border-b-[3px] border-b-[#EAB308] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-[#DC2626] text-white shadow-sm">
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#111827]">Interview Style (Admin Control)</h3>
                    <p className="text-[#4B5563] text-xs">Configure questioning persona</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {interviewStyles.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStyle(s.value as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        style === s.value
                          ? 'border-2 border-[#DC2626] bg-[#FEF3C7] text-[#92400E] font-bold shadow-sm'
                          : 'border-gray-200 bg-white hover:border-[#DC2626]/40 text-[#111827]'
                      }`}
                    >
                      <div className="text-xs font-bold mb-0.5">{s.label}</div>
                      <div className="text-[10px] text-[#4B5563] leading-relaxed">{s.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="bg-white border border-gray-200 border-b-[3px] border-b-[#EAB308] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-[#DC2626] text-white shadow-sm">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#111827]">Difficulty Level (Admin Control)</h3>
                    <p className="text-[#4B5563] text-xs">Adjust problem complexity and probing depth</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {difficultyLevels.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setDifficulty(level.value as any)}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                        difficulty === level.value
                          ? 'border-2 border-[#DC2626] bg-[#FEF3C7] text-[#92400E] font-bold shadow-sm'
                          : 'border-gray-200 bg-white hover:border-[#DC2626]/40 text-[#111827]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">{level.label}</div>
                        <div className="text-[10px] text-[#4B5563] mt-0.5">{level.description}</div>
                      </div>
                      <div className="flex space-x-1">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className={`w-1.5 h-4 rounded-full ${i < level.bars ? 'bg-[#DC2626]' : 'bg-gray-200'}`} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Candidate: Institutional Protocol */}
          {!isAdminOrFaculty && (
            <div className="bg-white border border-gray-200 border-b-[3px] border-b-[#EAB308] rounded-2xl p-6 shadow-sm mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-red-50 text-[#DC2626] border border-red-100">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#111827]">Institutional Examination Protocol</h3>
                  <p className="text-xs text-[#6B7280]">St. Joseph's College of Engineering Placement Standards</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-bold text-gray-700">
                  <Lock className="w-3.5 h-3.5 text-gray-500" />
                  <span>Locked Parameters</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 pb-2">
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Evaluation Style</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">Professional Technical</p>
                  <p className="text-[10px] text-gray-500">Corporate placement standard</p>
                </div>
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Complexity</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">Adaptive Assessment</p>
                  <p className="text-[10px] text-gray-500">Dynamically calibrates to answers</p>
                </div>
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Time Quota</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">{interviewDuration} Minutes</p>
                  <p className="text-[10px] text-gray-500">Timed placement quota</p>
                </div>
              </div>
              <p className="text-[11px] text-[#6B7280] italic mt-3">
                * Note: Test parameters, duration sliders, questioning persona, and scoring rubrics are managed strictly by faculty and placement administration. Candidate controls are read-only.
              </p>
            </div>
          )}

          {/* Job Description + Resume Upload */}
          <div className={`grid grid-cols-1 ${isAdminOrFaculty ? 'lg:grid-cols-2' : ''} gap-6 mb-8`}>
            {isAdminOrFaculty && (
              <div className="bg-white border border-gray-200 border-b-[3px] border-b-[#EAB308] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-[#DC2626] text-white shadow-sm">
                    <ScrollText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#111827]">Job Description (Admin Focus)</h3>
                    <p className="text-[#4B5563] text-xs">Paste target role requirements for customized prompts</p>
                  </div>
                </div>
                <Textarea
                  placeholder="Paste the full job description or key requirements here to focus interview questions..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  className="w-full bg-white border-gray-300 text-[#111827] placeholder-gray-400 rounded-xl focus:border-[#DC2626] focus:ring-2 focus:ring-red-500/20 text-xs leading-relaxed"
                />
              </div>
            )}

            {/* Resume Upload */}
            <div className="bg-white border border-gray-200 border-b-[3px] border-b-[#EAB308] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-[#DC2626] text-white shadow-sm">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#111827]">Resume Upload</h3>
                  <p className="text-[#4B5563] text-xs">Attach resume for dynamic, experience-grounded questioning</p>
                </div>
                <div className="ml-auto">
                  <span className="px-2 py-0.5 rounded-full font-medium text-[10px] bg-gray-100 text-gray-600">Optional</span>
                </div>
              </div>

              <div className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
                resumeContent ? 'border-green-500 bg-green-50/50' : 'border-gray-300 bg-gray-50/60 hover:bg-red-50/10'
              }`}>
                {resumeContent ? (
                  <div className="space-y-2">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto" />
                    <p className="text-green-800 font-bold text-xs">Resume extracted successfully!</p>
                    <p className="text-[#4B5563] text-[11px]">AI agent will dynamically probe based on your project and work history.</p>
                    <button type="button" onClick={() => setResumeContent('')} className="text-[#DC2626] hover:text-[#B91C1C] text-xs font-semibold underline">
                      Upload a different resume
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <UploadCloud className="w-8 h-8 text-[#DC2626] mx-auto" />
                    <div>
                      <p className="text-[#111827] font-semibold text-xs">Drag &amp; drop resume or click to browse</p>
                      <p className="text-[#6B7280] text-[10px] mt-0.5">Supports PDF, DOCX, and TXT files</p>
                    </div>
                    <input type="file" accept=".txt,.pdf,.docx" onChange={handleFileUpload} className="hidden" id="resume-upload" disabled={isUploading} />
                    <label htmlFor="resume-upload" className="inline-flex items-center gap-1.5 btn-theme-primary text-xs py-2 px-4 cursor-pointer shadow-sm">
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
              className={`btn-theme-primary text-sm sm:text-base py-3.5 px-10 rounded-xl shadow-lg transition-all duration-300 font-bold ${
                isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                {isLoading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Initializing Voice Session...</span></>
                ) : (
                  <><span>{isAdminOrFaculty ? 'Launch Interview (Admin Preview)' : 'Start Placement Voice Interview'}</span><ArrowRight className="w-4 h-4 ml-1" /></>
                )}
              </div>
            </button>
            {!jobRole.trim() && (
              <p className="mt-2.5 text-xs text-[#DC2626] font-medium">* Please select or enter a target role above to begin.</p>
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
        <div className="bg-[#DC2626] text-white text-center py-5 px-6 text-sm sm:text-base font-bold tracking-wide">
          St. Joseph's College of Engineering &mdash; AI Interview Agent &mdash; Placement Preparation Platform
        </div>
        <div className="bg-[#111827] text-[#9CA3AF] text-center py-4 px-6 text-xs">
          <span>&copy; 2026 AI Interview Agent. All rights reserved.</span>
        </div>
      </footer>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#111827] relative overflow-hidden font-sans">
      {state !== 'interviewing' && state !== 'post_interview' && (
        <Header showReset={state === 'completed'} onReset={actions.resetInterview} />
      )}

      <main className="flex-1 flex flex-col">
        {isAutoStarting && (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-[#DC2626] mb-4 shadow-sm animate-pulse">
              <Mic className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Preparing Voice Interview Session</h2>
            <p className="text-sm text-gray-500 max-w-md">
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

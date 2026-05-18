import { Github, Brain, Sparkles, Shield, Zap, ArrowRight, GitBranch, FileText, MessageSquare, Network, CheckCircle2, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { dashboardService, BASE_URL } from '../api';

/* ─── 타이핑 애니메이션 ─── */
const TYPING_TEXTS = [
  'https://github.com/your-org/backend-api',
  'https://github.com/user/react-dashboard',
  'https://github.com/team/ml-pipeline',
];

function TypingDemo() {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState(0); // 0=typing, 1=pause, 2=deleting
  const [idx, setIdx] = useState(0);
  const ref = useRef({ phase: 0, idx: 0, charIdx: 0 });

  useEffect(() => {
    let timeout;
    const tick = () => {
      const { phase, idx, charIdx } = ref.current;
      const target = TYPING_TEXTS[idx];

      if (phase === 0) {
        // Typing
        if (charIdx <= target.length) {
          setText(target.slice(0, charIdx));
          ref.current.charIdx = charIdx + 1;
          timeout = setTimeout(tick, 40);
        } else {
          ref.current.phase = 1;
          timeout = setTimeout(tick, 1800);
        }
      } else if (phase === 1) {
        ref.current.phase = 2;
        tick();
      } else {
        // Deleting
        if (charIdx > 0) {
          setText(target.slice(0, charIdx - 1));
          ref.current.charIdx = charIdx - 1;
          timeout = setTimeout(tick, 20);
        } else {
          ref.current.idx = (idx + 1) % TYPING_TEXTS.length;
          ref.current.phase = 0;
          timeout = setTimeout(tick, 400);
        }
      }
    };
    timeout = setTimeout(tick, 600);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 rounded-lg border border-white/10 text-[12px] font-mono text-slate-300 overflow-hidden">
      <GitBranch className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      <span className="truncate">{text}</span>
      <span className="w-0.5 h-4 bg-blue-400 animate-pulse flex-shrink-0" />
    </div>
  );
}

/* ─── Progress 분석 시뮬레이션 ─── */
const STEPS = [
  { label: 'Fetching repository files', color: '#22d3ee', done: true },
  { label: 'Parsing 42 source files', color: '#818cf8', done: true },
  { label: 'Building dependency graph', color: '#a78bfa', done: true },
  { label: 'Generating AI embeddings', color: '#f472b6', progress: 72 },
];

function AnalysisProgress() {
  const [prog, setProg] = useState(72);
  useEffect(() => {
    const id = setInterval(() => {
      setProg(p => {
        if (p >= 100) return 0;
        return p + 0.8;
      });
    }, 60);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-2.5">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {step.done ? (
              <CheckCircle2 className="w-4 h-4" style={{ color: step.color }} />
            ) : (
              <Clock className="w-4 h-4 animate-spin" style={{ color: step.color }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-slate-300 truncate">{step.label}</span>
              {!step.done && <span className="text-[10px] font-mono ml-2 flex-shrink-0" style={{ color: step.color }}>{Math.round(prog)}%</span>}
            </div>
            {!step.done && (
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-none"
                  style={{ width: `${prog}%`, background: `linear-gradient(90deg, ${step.color}88, ${step.color})` }}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Chat mock ─── */
const CHAT_MSGS = [
  { role: 'user', text: '이 프로젝트의 인증 로직은 어디 있어?' },
  { role: 'ai', text: '`backend/auth/oauth.py` (L23-L67)에 GitHub OAuth 플로우가 구현되어 있습니다. `get_current_user` 미들웨어는 `main.py` L44에서 JWT를 검증합니다.' },
  { role: 'user', text: 'RAG 엔진 구조 설명해줘' },
];

function ChatMock() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    if (visible >= CHAT_MSGS.length) return;
    const t = setTimeout(() => setVisible(v => v + 1), visible === 0 ? 800 : 1200);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div className="space-y-3 max-h-[150px] overflow-hidden relative">
      {CHAT_MSGS.slice(0, visible).map((msg, i) => (
        <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'ai' && (
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Brain className="w-2.5 h-2.5 text-white" />
            </div>
          )}
          <div
            className="max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed"
            style={{
              background: msg.role === 'user' ? '#3730a3' : '#1e293b',
              color: msg.role === 'user' ? '#e0e7ff' : '#cbd5e1',
              border: msg.role === 'ai' ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}
          >
            {msg.text}
          </div>
        </div>
      ))}
      {/* fade out */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-900/90 to-transparent pointer-events-none" />
    </div>
  );
}

/* ─── Stat chips ─── */
const STATS_CONFIG = [
  { key: 'total_projects', label: 'Repos Analyzed', color: '#60a5fa', suffix: '+' },
  { key: 'total_answers', label: 'AI Answers', color: '#a78bfa', suffix: '+' },
  { key: 'avg_analysis_time', label: 'Avg. Analysis', color: '#34d399', prefix: '< ' },
];

/* ─── Main ─── */
function Login() {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const [stats, setStats] = useState({
    total_projects: 0,
    total_answers: 0,
    avg_analysis_time: '60s'
  });

  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/');
    
    // 글로벌 통계 가져오기
    dashboardService.getGlobalStats()
      .then(data => {
        setStats({
          total_projects: data.total_projects || 0,
          total_answers: data.total_answers || 0,
          avg_analysis_time: data.avg_analysis_time || '60s'
        });
      })
      .catch(err => console.error("Failed to fetch stats:", err));
  }, [navigate]);

  const statsToDisplay = STATS_CONFIG.map(config => {
    const rawValue = stats[config.key];
    const formattedValue = typeof rawValue === 'number' 
      ? rawValue.toLocaleString() 
      : rawValue;
      
    return {
      label: config.label,
      value: `${config.prefix || ''}${formattedValue}${config.suffix || ''}`,
      color: config.color
    };
  });

  const handleGithubLogin = () => {
    window.location.href = `${BASE_URL}/auth/github/login`;
  };

  return (
    <div className="min-h-screen bg-[#07091180] flex overflow-hidden font-sans" style={{ background: '#07091180', backgroundColor: '#07091180' }}>
      <style>{`
        body { background: #070911; margin: 0; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .float { animation: float 4s ease-in-out infinite; }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .shimmer {
          background: linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>

      {/* ── LEFT ── */}
      <div className="hidden lg:flex flex-1 flex-col p-10 relative overflow-hidden" style={{ background: '#070911' }}>
        {/* bg blobs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-700/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-700/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-900/10 blur-[80px] rounded-full pointer-events-none" />
        {/* grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-extrabold text-xl tracking-tight">ChatFolio</span>
          <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-[9px] font-bold uppercase tracking-widest">Beta</span>
        </div>

        {/* Hero */}
        <div className="relative z-10 mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400 text-[10px] font-bold uppercase tracking-widest mb-4">
            <Sparkles className="w-2.5 h-2.5" /> AI Repository Intelligence
          </div>
          <h2 className="text-4xl font-black text-white leading-tight mb-3">
            당신의 코드를<br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              AI가 설명합니다
            </span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md">
            GitHub URL 하나로 전체 코드베이스를 분석. 아키텍처, 의존성 그래프, AI 채팅까지 한 번에.
          </p>
        </div>

        {/* ── MOCK APP UI ── */}
        <div className="relative z-10 flex-1 flex flex-col gap-4 min-h-0">
          {/* Row 1: Input + Stats */}
          <div className="grid grid-cols-5 gap-4">
            {/* Repo input card */}
            <div className="col-span-3 bg-slate-900/80 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-slate-500 ml-2 font-mono">analyze.chatfolio.app</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-widest font-bold">Repository URL</p>
              <TypingDemo />
              <button className="mt-3 w-full py-2 rounded-lg text-[11px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
                🚀 Analyze Repository
              </button>
            </div>
            {/* Stats */}
            <div className="col-span-2 flex flex-col gap-3">
              {statsToDisplay.map(s => (
                <div key={s.label} className="flex-1 bg-slate-900/80 border border-white/5 rounded-xl p-3 backdrop-blur-sm flex flex-col justify-center">
                  <p className="text-[18px] font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Row 2: Analysis Progress + Chat */}
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
            {/* Progress */}
            <div className="bg-slate-900/80 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Analysis in Progress</span>
              </div>
              <AnalysisProgress />
            </div>

            {/* Chat */}
            <div className="bg-slate-900/80 border border-white/5 rounded-2xl p-4 backdrop-blur-sm flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">AI Chat</span>
              </div>
              <div className="flex-1 min-h-0">
                <ChatMock />
              </div>
              <div className="mt-2 flex gap-2">
                <div className="flex-1 shimmer rounded-lg h-7" />
                <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/20 flex items-center justify-center">
                  <ArrowRight className="w-3 h-3 text-blue-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Feature pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: Network, label: 'Dependency Graph', color: '#60a5fa' },
              { icon: FileText, label: 'README Generator', color: '#34d399' },
              { icon: GitBranch, label: 'Pipeline View', color: '#f472b6' },
              { icon: Brain, label: 'Context Memory', color: '#a78bfa' },
              { icon: MessageSquare, label: 'Multi-language', color: '#fb923c' },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 border border-white/5 rounded-full hover:border-white/10 transition-colors cursor-default">
                <Icon className="w-3 h-3" style={{ color }} />
                <span className="text-[10px] text-slate-400 font-bold">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT ── */}
      <div className="flex flex-col items-center justify-center w-full lg:w-[400px] lg:flex-shrink-0 relative p-10"
        style={{ background: 'linear-gradient(180deg, #0d1117 0%, #0a0d14 100%)', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-600/8 blur-[80px] rounded-full pointer-events-none" />

        <div className="w-full max-w-xs relative z-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-extrabold text-xl tracking-tight">ChatFolio</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-black text-white mb-2">시작하기</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              GitHub 계정으로 로그인하고<br />첫 번째 레포지토리를 분석해보세요.
            </p>
          </div>

          {/* GitHub Button */}
          <button
            id="github-login-btn"
            onClick={handleGithubLogin}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl font-bold text-sm transition-all duration-300 relative overflow-hidden mb-4"
            style={{
              background: hover ? '#161b22' : '#0d1117',
              border: `1px solid ${hover ? '#6366f1' : '#30363d'}`,
              boxShadow: hover ? '0 0 24px rgba(99,102,241,0.25), 0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.3)',
              transform: hover ? 'translateY(-2px)' : 'translateY(0)',
              color: '#fff',
            }}
          >
            <Github className="w-5 h-5" />
            <span>Continue with GitHub</span>
          </button>

          {/* Trust */}
          <div className="flex items-center justify-center gap-5 mb-8">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>OAuth 2.0</span>
            </div>
            <div className="w-px h-3 bg-slate-700" />
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <Zap className="w-3 h-3 text-yellow-500" />
              <span>즉시 분석</span>
            </div>
            <div className="w-px h-3 bg-slate-700" />
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-blue-400" />
              <span>무료 시작</span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/5 mb-6" />

          {/* Links */}
          <div className="flex justify-center gap-4 text-[11px] text-slate-500 mb-8">
            <button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">이용약관</button>
            <span className="opacity-20">|</span>
            <button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors">개인정보처리방침</button>
            <span className="opacity-20">|</span>
            <button onClick={() => navigate('/faq')} className="hover:text-white transition-colors">FAQ</button>
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-slate-600 space-y-0.5">
            <p>CEO: Jaehee Lee &nbsp;|&nbsp; 02-529-4237</p>
            <p>ChatFolio@chatfolio.com</p>
            <p className="pt-1">&copy; 2026 ChatFolio. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;

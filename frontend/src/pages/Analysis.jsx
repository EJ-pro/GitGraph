import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, Github, Loader2, GitBranch, FileCode2, Share2, Sparkles, MessageSquare, BookOpen, Layers, CheckCircle2, Activity, Globe, Cpu, Zap, ArrowRight, Terminal, Users, Crown, Database, Trophy, Brain } from 'lucide-react';
import UserProfile from '../components/UserProfile';
import './Analysis.css';
import { authService, projectService, dashboardService, BASE_URL } from '../api';

function Analysis() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState('huggingface');
  const [modelName, setModelName] = useState('Qwen/Qwen2.5-Coder-32B-Instruct');
  const [logs, setLogs] = useState([]);
  const [currentLog, setCurrentLog] = useState('');
  const [projects, setProjects] = useState([]);
  const [searchParams] = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [bufferedPhase, setBufferedPhase] = useState(1);
  const [platformStats, setPlatformStats] = useState({
    total_projects: 0,
    total_users: 0,
    total_lines: 0,
    total_nodes: 0,
    ai_health: 99.9
  });
  const [user, setUser] = useState(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyData, setSurveyData] = useState({ country: '', job: '' });
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [loadingMessage, setLoadingMessage] = useState('Analyzing');

  const formatStat = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  useEffect(() => {
    fetchUserData();
    fetchProjectsData();
    fetchGlobalStats();
    const repoUrl = searchParams.get('repo_url');
    const forceUpdate = searchParams.get('force_update') === 'true';
    if (repoUrl) {
      setUrl(repoUrl);
      if (forceUpdate) {
        handleAnalyze(null, repoUrl, forceUpdate);
      }
    }
  }, [searchParams]);

  const fetchUserData = async () => {
    try {
      const userData = await authService.me();
      setUser(userData);
      if (!userData.country || !userData.job) {
        setShowSurvey(true);
      }
      if (userData.country === 'South Korea') setSelectedLanguage('Korean');
      else setSelectedLanguage('English');
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  const handleSurveySubmit = async (skipped = false) => {
    try {
      const body = skipped ? { country: 'Other', job: 'Other' } : surveyData;
      await authService.updateProfile(body);
      setShowSurvey(false);
      fetchUserData(); 
    } catch (err) {
      console.error('Failed to update profile:', err);
    }
  };

  const fetchProjectsData = async () => {
    try {
      const data = await projectService.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const fetchGlobalStats = async () => {
    try {
      const data = await dashboardService.getGlobalStats();
      setPlatformStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleAnalyze = async (e, overrideUrl = null, forceUpdate = false) => {
    if (e) e.preventDefault();
    const targetUrl = overrideUrl || url;
    if (!targetUrl) return;

    setIsLoading(true);
    setError('');
    setResult(null);
    setLogs([]);
    setCurrentLog('Initializing analysis...');
    setProgress(0);

    try {
      const response = await fetch(`${BASE_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          repo_url: targetUrl,
          provider: provider,
          model_name: modelName,
          force_update: forceUpdate,
          language: selectedLanguage
        })
      });

      if (response.status === 401 || response.status === 403 || response.status === 404) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const msg = line.replace('data: ', '').trim();

            if (msg.startsWith('RESULT:')) {
              const resultData = JSON.parse(msg.replace('RESULT:', ''));
              setResult(resultData);
              setIsLoading(false);
              return;
            } else if (msg.startsWith('ERROR:')) {
              throw new Error(msg.replace('ERROR:', ''));
            } else if (msg.startsWith('PROGRESS:')) {
              setProgress(parseInt(msg.replace('PROGRESS:', '')));
            } else {
              setCurrentLog(msg);
              setLogs(prev => [...prev.slice(-4), msg]); 
            }
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const getActivePhase = () => {
    const log = currentLog.toLowerCase();
    if (log.includes('final') || log.includes('success') || log.includes('complete')) return 7;
    if (log.includes('review') || log.includes('verify') || log.includes('validate')) return 6;
    if (log.includes('readme') || log.includes('generating') || log.includes('architecture') || log.includes('summary')) return 5;
    if (log.includes('database') || log.includes('postgresql') || log.includes('storing') || log.includes('saving')) return 4;
    if (log.includes('vector') || log.includes('embedding') || log.includes('chunking') || log.includes('indexing')) return 3;
    if (log.includes('parsing') || log.includes('analyzing') || log.includes('ast') || log.includes('extracting')) return 2;
    if (log.includes('clone') || log.includes('repository') || log.includes('collect') || log.includes('fetch') || log.includes('initializing')) return 1;
    return 1;
  };

  useEffect(() => {
    if (isLoading) {
      // 1. Loading Message Cycle
      const messagesList = [
        'Cloning repository...', 
        'Parsing code structure...', 
        'Extracting dependencies...', 
        'Generating vector index...', 
        'Summarizing final report...'
      ];
      let i = 0;
      setLoadingMessage(messagesList[0]);
      const msgInterval = setInterval(() => {
        i = (i + 1) % messagesList.length;
        setLoadingMessage(messagesList[i]);
      }, 3000);

      // 2. Buffered Phase Logic (for visual progress)
      const targetPhase = getActivePhase();
      if (targetPhase > bufferedPhase) {
        const timer = setTimeout(() => {
          setBufferedPhase(prev => prev + 1);
        }, 800); 
        return () => {
          clearInterval(msgInterval);
          clearTimeout(timer);
        };
      }
      
      return () => clearInterval(msgInterval);
    } else {
      setBufferedPhase(1);
    }
  }, [isLoading, selectedLanguage, currentLog, bufferedPhase]);

  const phases = [
    { id: 1, name: "Collection", icon: <Github size={16} /> },
    { id: 2, name: "Parsing", icon: <FileCode2 size={16} /> },
    { id: 3, name: "Vectorize", icon: <Cpu size={16} /> },
    { id: 4, name: "Storage", icon: <Database size={16} /> },
    { id: 5, name: "Generation", icon: <Sparkles size={16} /> },
    { id: 6, name: "Review", icon: <Search size={16} /> },
    { id: 7, name: "Finalize", icon: <Trophy size={16} /> }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col relative overflow-hidden font-sans">
      <div className="mesh-background">
        <div className="mesh-blob mesh-blob-blue animate-pulse-slow"></div>
        <div className="mesh-blob mesh-blob-purple animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        <div className="absolute inset-0 opacity-[0.15]">
          {[ '{ }', '( )', '[ ]', ';', '=>', 'import', 'const' ].map((token, i) => (
            <div key={i} className="token-particle animate-float-slow" 
              style={{ top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animationDelay: `${i * 2}s` }}>{token}</div>
          ))}
        </div>
        <div className="dot-grid"></div>
      </div>

      <header className="w-full px-8 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md border-b border-white/5 bg-slate-900/50">
        <div className="flex items-center gap-3 select-none group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-black tracking-tighter text-xl text-white">ChatFolio</span>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/doc')}
            className="text-slate-400 hover:text-white text-sm font-bold transition-colors hidden md:block"
          >
            Documentation
          </button>
          <UserProfile />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 w-full max-w-5xl mx-auto mt-10">
        <div className="text-center mb-12 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-blue-400 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            <span>ChatFolio AI Beta</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
            Start a Conversation<br />with Your Code.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Visualize complex repository dependencies, chat with AI, and explore your code in depth.
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 mb-10 animate-fade-in-up delay-100">
          <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md shadow-inner">
            <button
              onClick={() => { setProvider('huggingface'); setModelName('mistralai/Mistral-7B-Instruct-v0.2'); }}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${provider === 'huggingface' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
              Standard AI (Free)
            </button>
            <button
              onClick={() => { 
                if (user?.tier !== 'pro') {
                  alert('Standard AI (Pro) 모델은 Pro 등급 전용입니다. 상단 버튼을 통해 업그레이드 해주세요.');
                  return;
                }
                setProvider('groq'); 
                setModelName('llama-3.3-70b-versatile'); 
              }}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${provider === 'groq' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
              Standard AI (Pro)
              <Crown className={`w-3.5 h-3.5 ${user?.tier === 'pro' ? 'text-yellow-400' : 'text-slate-400'}`} />
            </button>
          </div>
        </div>

        <div className="w-full max-w-3xl animate-fade-in-up delay-100">
          <form onSubmit={handleAnalyze} className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
            <div className="relative flex items-center glass-panel rounded-2xl p-2 shadow-2xl bg-slate-950/50 border border-slate-700/50">
              <div className="pl-4 flex items-center pointer-events-none">
                <Search className="h-6 w-6 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
              </div>
              <input
                type="text"
                className="w-full pl-4 pr-32 py-4 bg-transparent border-none text-white placeholder-slate-400 focus:outline-none focus:ring-0 text-lg font-medium"
                placeholder="https://github.com/username/repository"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !url}
                className="absolute right-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> {loadingMessage}
                  </span>
                ) : (
                  'Start Analysis'
                )}
              </button>
            </div>
          </form>

          {!result && !error && !isLoading && (
            <div className="mt-8 mb-6 w-full animate-fade-in space-y-6">
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-px flex-1 bg-slate-700/50"></div>
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Supported Languages</span>
                  <div className="h-px flex-1 bg-slate-700/50"></div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    { name: "Python", icon: "python/python-original.svg" },
                    { name: "JavaScript", icon: "javascript/javascript-original.svg" },
                    { name: "TypeScript", icon: "typescript/typescript-original.svg" },
                    { name: "Java", icon: "java/java-original.svg" },
                    { name: "Kotlin", icon: "kotlin/kotlin-original.svg" },
                    { name: "C", icon: "c/c-original.svg" },
                    { name: "C++", icon: "cplusplus/cplusplus-original.svg" },
                    { name: "C#", icon: "csharp/csharp-original.svg" },
                    { name: "Go", icon: "go/go-original.svg" },
                    { name: "Rust", icon: "rust/rust-original.svg" },
                    { name: "Swift", icon: "swift/swift-original.svg" },
                    { name: "PHP", icon: "php/php-original.svg" },
                    { name: "Ruby", icon: "ruby/ruby-original.svg" },
                    { name: "Dart", icon: "dart/dart-original.svg" },
                  ].map((lang) => (
                    <div key={lang.name} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/60 rounded-lg border border-white/5 hover:border-blue-500/50 hover:bg-slate-800 transition-all cursor-default shadow-sm">
                      <img src={`https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${lang.icon}`} alt={lang.name} className="w-4 h-4" onError={(e) => { e.target.style.display = 'none' }} />
                      <span className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">{lang.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-px flex-1 bg-slate-700/50"></div>
                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Config Formats</span>
                  <div className="h-px flex-1 bg-slate-700/50"></div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    { name: "JSON", icon: "json/json-original.svg" },
                    { name: "YAML", icon: "yaml/yaml-original.svg" },
                    { name: "XML", icon: "xml/xml-original.svg" },
                    { name: "Gradle", icon: "gradle/gradle-original.svg" },
                    { name: "SQL", icon: "mysql/mysql-original.svg" },
                  ].map((lang) => (
                    <div key={lang.name} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/60 rounded-lg border border-white/5 hover:border-purple-500/50 hover:bg-slate-800 transition-all cursor-default shadow-sm">
                      <img src={`https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${lang.icon}`} alt={lang.name} className="w-4 h-4" onError={(e) => { e.target.style.display = 'none' }} />
                      <span className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">{lang.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {projects.length > 0 && !result && !error && !isLoading && (
            <div className="mt-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recent Analysis History</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {projects.slice(0, 5).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => { setUrl(project.repo_url); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-white/5 rounded-xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                  >
                    <Github className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" />
                    <span className="text-xs font-medium text-slate-400 group-hover:text-white truncate max-w-[150px]">
                      {project.repo_url.split('/').slice(-1)}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => navigate(`/${username}`)}
                  className="px-3 py-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View All
                </button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="mt-8 w-full animate-fade-in-up space-y-6">
              <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative flex items-center justify-between">
                  {phases.map((phase, idx) => {
                    const isCompleted = bufferedPhase > phase.id;
                    const isActive = bufferedPhase === phase.id;
                    const isUpcoming = bufferedPhase < phase.id;
                    
                    return (
                      <div key={phase.id} className="flex-1 flex flex-col items-center relative group/phase">
                        {/* Connecting Line */}
                        {idx < phases.length - 1 && (
                          <div className="absolute top-6 left-1/2 w-full h-[3px] bg-slate-800">
                            <div className={`h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-in-out ${isCompleted ? 'w-full' : 'w-0'}`}></div>
                          </div>
                        )}
                        
                        {/* Phase Icon Node */}
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center z-10 transition-all duration-700 border-2 ${
                          isCompleted ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 rotate-[360deg]' : 
                          isActive ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-110' : 
                          'bg-slate-900 border-slate-700 text-slate-500 group-hover/phase:border-slate-500'
                        }`}>
                          {isCompleted ? <CheckCircle2 size={20} /> : phase.icon}
                        </div>
                        
                        {/* Phase Label */}
                        <div className="mt-4 flex flex-col items-center gap-1">
                          <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${
                            isActive ? 'text-blue-400 scale-105' : isCompleted ? 'text-emerald-400' : 'text-slate-500'
                          }`}>
                            {phase.name}
                          </span>
                          {isActive && (
                            <div className="flex gap-1">
                              <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"></span>
                              <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]"></span>
                              <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:0.4s]"></span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl">
                <div className="h-1 w-full bg-slate-800">
                  <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 shadow-[0_0_10px_rgba(37,99,235,0.5)] transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    Analysis Engine Terminal
                    <span className="text-blue-400 font-bold">[{progress}%]</span>
                  </span>
                </div>
                <div className="p-6 font-mono text-sm space-y-2 terminal-scrollbar overflow-y-auto max-h-[200px]">
                  <div className="flex items-center gap-3 text-blue-400">
                    <span className="shrink-0 opacity-50">➜</span>
                    <span className="font-bold animate-pulse">{currentLog}</span>
                  </div>
                  <div className="space-y-1 opacity-40">
                    {logs.map((log, i) => (
                      <div key={i} className="flex items-center gap-3 text-slate-300">
                        <span className="shrink-0 opacity-30">#</span>
                        <span className="truncate">{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!result && !error && !isLoading && (
            <div className="flex items-center justify-center gap-3 mt-6 text-sm text-slate-300 font-medium animate-fade-in delay-300">
              <span>Try with:</span>
              <button onClick={() => setUrl('https://github.com/square/okhttp')} className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-600 text-white">square/okhttp</button>
              <button onClick={() => setUrl('https://github.com/JetBrains/kotlin')} className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-600 text-white">JetBrains/kotlin</button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-8 p-4 bg-red-900/40 border border-red-500/50 text-red-100 rounded-xl max-w-2xl w-full text-center animate-fade-in font-medium">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-12 w-full max-w-3xl glass-panel rounded-3xl p-8 animate-fade-in-up shadow-2xl border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-blue-500"></div>
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-400 mb-6 border border-emerald-500/20">
                <Sparkles className="w-10 h-10" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-3 tracking-tight">{result.message}</h3>
              <p className="text-slate-300 text-lg">Successfully understood the repository structure.</p>
            </div>
            <div className="grid grid-cols-3 gap-6 mb-10">
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center group hover:bg-slate-800 transition-all duration-300 hover:border-white/10 shadow-inner">
                <FileCode2 className="w-10 h-10 text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-4xl font-black text-white mb-1 tracking-tighter">{result.file_count}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kotlin Files</span>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center group hover:bg-slate-800 transition-all duration-300 hover:border-white/10 shadow-inner">
                <Layers className="w-10 h-10 text-emerald-400 mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-4xl font-black text-white mb-1 tracking-tighter">{result.node_count}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Classes/Funcs</span>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center group hover:bg-slate-800 transition-all duration-300 hover:border-white/10 shadow-inner">
                <GitBranch className="w-10 h-10 text-purple-400 mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-4xl font-black text-white mb-1 tracking-tighter">{result.edge_count}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dependencies</span>
              </div>
            </div>
            <button
              className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-black text-xl shadow-[0_0_30px_rgba(79,70,229,0.4)] transition-all transform hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(79,70,229,0.5)] active:scale-95"
              onClick={() => navigate(`/${username}/dashboard/chat`, { state: { sessionId: result.session_id } })}
            >
              Enter Dashboard ✨
            </button>
          </div>
        )}

        {!isLoading && !result && !error && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-24 animate-fade-in-up delay-400">
            <div className="p-6 rounded-2xl bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
                <GitBranch className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Dependency Graph</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Visually analyze calling relationships between complex classes and functions to quickly understand the overall architecture.</p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4 text-purple-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Contextual AI Chat</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Go beyond simple code search and engage in deep technical conversations with an AI that fully understands the project context.</p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Automated Documentation</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Let AI automatically generate READMEs, portfolio summaries, and even pressure-cooker interview questions.</p>
            </div>
          </div>
        )}

        {!isLoading && !result && !error && (
          <div className="w-full max-w-5xl mt-32 mb-32 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
            <div className="stats-banner-glass rounded-[2.5rem] p-4 md:p-1 w-full relative overflow-hidden group">
              <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex flex-col md:flex-row items-center justify-between px-8 py-6 gap-8 md:gap-0">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="live-pulse-dot"></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Network Pulse</span>
                    <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-tight">Active & Syncing</span>
                  </div>
                </div>
                <div className="hidden md:block stat-divider mx-8"></div>
                <div className="flex flex-1 flex-col md:flex-row items-center justify-around w-full gap-8 md:gap-4">
                  {[
                    { label: "Analyzed Repos", value: formatStat(platformStats.total_projects), icon: <Layers className="w-4 h-4 text-blue-400" />, unit: "Repos" },
                    { label: "Active Innovators", value: formatStat(platformStats.total_users), icon: <Users className="w-4 h-4 text-purple-400" />, unit: "Users" },
                    { label: "Synthesized Lines", value: formatStat(platformStats.total_lines), icon: <Cpu className="w-4 h-4 text-emerald-400" />, unit: "Lines" },
                    { label: "System Fidelity", value: platformStats.ai_health + "%", icon: <Zap className="w-4 h-4 text-amber-400" />, unit: "Sync" }
                  ].map((stat, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row items-center">
                      <div className="flex flex-col items-center md:items-start group/stat">
                        <div className="flex items-center gap-2 mb-1">
                          {stat.icon}
                          <span className="stat-label-premium group-hover/stat:text-white transition-colors">{stat.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1.5 group-hover/stat:translate-x-1 transition-transform">
                          <span className="text-3xl font-black text-white tracking-tighter glow-text origin-left">{stat.value}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.unit}</span>
                        </div>
                      </div>
                      {idx < 3 && <div className="hidden md:block stat-divider mx-4"></div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-center mt-6">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.3em] opacity-50">Real-time database synthesis active across 14+ languages</p>
            </div>
          </div>
        )}
      </main>

      {showSurvey && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-slate-950/60 transition-all animate-fade-in">
          <div className="glass-panel w-full max-w-lg rounded-[2.5rem] p-10 border border-white/10 shadow-2xl relative overflow-hidden animate-scale-in">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[60px] -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-6 mx-auto">
                <Sparkles size={32} className="animate-pulse" />
              </div>
              <h2 className="text-3xl font-black text-white text-center mb-2 tracking-tight">Welcome to ChatFolio!</h2>
              <p className="text-slate-400 text-center mb-8">Short survey to enhance your analysis experience.</p>
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Country</label>
                  <select 
                    value={surveyData.country}
                    onChange={(e) => setSurveyData({...surveyData, country: e.target.value})}
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                  >
                    <option value="" disabled>Select your country</option>
                    <option value="South Korea">South Korea</option>
                    <option value="USA">USA</option>
                    <option value="UK">UK</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Your Occupation</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Developer', 'Student', 'Designer', 'PM', 'Recruiter', 'Other'].map(job => (
                      <button
                        key={job}
                        onClick={() => setSurveyData({...surveyData, job})}
                        type="button"
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all border ${surveyData.job === job ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}
                      >
                        {job}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => handleSurveySubmit(true)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-bold rounded-2xl transition-all">Maybe Later</button>
                  <button onClick={() => handleSurveySubmit(false)} disabled={!surveyData.country || !surveyData.job} className="flex-[2] py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black rounded-2xl shadow-xl shadow-blue-500/20 transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:transform-none">Get Started</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="w-full text-center p-4 text-slate-500 text-sm animate-fade-in delay-500 relative z-10 flex flex-col items-center gap-6 border-t border-white/5 bg-slate-950">
        <div className="flex gap-8 font-bold text-slate-400">
          <button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">Terms of Service</button>
          <button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors">Privacy Policy</button>
          <button onClick={() => navigate('/faq')} className="hover:text-white transition-colors">Support (FAQ)</button>
        </div>
        <div className="text-xs text-slate-600 space-y-2">
          <p>CEO : Jaehee Lee | TEL : 02-529-4237 | Mail : ChatFolio@chatfolio.com</p>
          <p>&copy; 2026 ChatFolio. Designed for the Next Generation of Developers.</p>
        </div>
      </footer>
    </div>
  );
}

export default Analysis;
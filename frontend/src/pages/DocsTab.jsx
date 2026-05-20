import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FileText, Loader2, Copy, Sparkles, CheckCircle2, Eye, Code, Clock, ChevronRight, Settings, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { docsService, chatService } from '../api';

const DEFAULT_EXAMPLE = `# 🚀 AwesomeProject\n> "개발자를 위한 최고의 생산성 도구" <br/>\n> 업무 효율을 200% 끌어올려주는 실시간 협업 플랫폼입니다.\n\n![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)\n![React](https://img.shields.io/badge/React-18.0-61DAFB.svg?logo=react)\n![FastAPI](https://img.shields.io/badge/FastAPI-0.95-009688.svg?logo=fastapi)\n![License](https://img.shields.io/badge/license-MIT-green.svg)\n\n<br/>\n\n## 📝 목차\n1. [프로젝트 소개](#-프로젝트-소개)\n2. [주요 기능](#-주요-기능-key-features)\n3. [기술 스택](#-기술-스택-tech-stack)\n4. [화면 구성 및 사용법](#-화면-구성-및-사용법-usage)\n5. [시작하기](#-시작하기-getting-started)\n6. [폴더 구조](#-폴더-구조-directory-structure)\n\n<br/>\n\n## 💡 프로젝트 소개\n기존의 협업 툴들이 가진 [어떤 문제점/불편함]을 해결하기 위해 기획되었습니다. \n단순한 텍스트 공유를 넘어, 실시간 동기화와 직관적인 UX를 통해 팀의 커뮤니케이션 비용을 최소화하는 것이 목표입니다.\n\n<br/>\n\n## ✨ 주요 기능 (Key Features)\n- ⚡ **0.1초 실시간 동기화:** WebSocket(Socket.io)을 활용한 지연 없는 데이터 통신 및 상태 공유\n- 🎨 **완벽한 다크모드 지원:** TailwindCSS 기반의 테마 시스템으로 사용자의 눈 피로도 최소화\n- 🔒 **안전한 인증 시스템:** JWT 기반의 토큰 발급 및 OAuth 2.0 (Google, Github) 소셜 로그인 지원\n- 📊 **대시보드 통계:** 사용자 활동 데이터를 차트(Chart.js)로 시각화하여 제공\n\n<br/>\n\n## 🛠 기술 스택 (Tech Stack)\n### Frontend\n- **Framework:** React 18\n- **Styling:** TailwindCSS, Framer Motion (애니메이션)\n- **State Management:** Zustand / React Query\n\n### Backend\n- **Framework:** FastAPI (Python 3.10+)\n- **Database:** PostgreSQL, SQLAlchemy (ORM)\n- **Real-time:** WebSockets\n\n### Infra & Tools\n- **Deployment:** Docker, AWS EC2, Vercel\n- **Version Control:** Git, Github Actions (CI/CD)\n\n<br/>\n\n## 📱 화면 구성 및 사용법 (Usage)\n> 💡 실제 구현된 화면 캡처나 GIF(움짤)를 추가하면 신뢰도가 대폭 상승합니다.\n\n| 메인 대시보드 | 실시간 채팅 화면 |\n| :---: | :---: |\n| <img src="https://via.placeholder.com/400x250.png?text=Dashboard+Screenshot" width="400"/> | <img src="https://via.placeholder.com/400x250.png?text=Chat+Screenshot" width="400"/> |\n| 대시보드에서 프로젝트 전체 진행률을 확인합니다. | 웹소켓을 통한 실시간 채팅 및 파일 공유 화면입니다. |\n\n<br/>\n\n## 🚀 시작하기 (Getting Started)\n프로젝트를 로컬에서 직접 실행해보기 위한 가이드입니다.\n\n### 1. 요구 사항 (Prerequisites)\n- Node.js 18.0 이상\n- Python 3.10 이상\n- PostgreSQL 14 이상\n\n### 2. 설치 및 실행 (Installation)\n\`\`\`bash\n# 1. 저장소 클론\n$ git clone [https://github.com/username/AwesomeProject.git](https://github.com/username/AwesomeProject.git)\n\n# 2. 프론트엔드 종속성 설치 및 실행\n$ cd frontend\n$ npm install\n$ npm run dev\n\n# 3. 백엔드 환경 설정 및 실행 (새 터미널)\n$ cd backend\n$ pip install -r requirements.txt\n$ uvicorn main:app --reload\n\`\`\`\n\n<br/>\n\n## 📂 폴더 구조 (Directory Structure)\n\`\`\`text\n📦 AwesomeProject\n ┣ 📂 frontend\n ┃ ┣ 📂 src\n ┃ ┃ ┣ 📂 components   # 공통으로 사용되는 UI 컴포넌트\n ┃ ┃ ┣ 📂 pages        # 라우팅되는 페이지 단위 컴포넌트\n ┃ ┃ ┣ 📂 hooks        # 커스텀 훅 모음\n ┃ ┃ ┗ 📂 utils        # 유틸리티 함수 (날짜 변환, 포맷팅 등)\n ┃ ┗ 📜 package.json\n ┣ 📂 backend\n ┃ ┣ 📂 api            # 라우터 및 엔드포인트 정의\n ┃ ┣ 📂 core           # 인증, 설정 등 핵심 로직\n ┃ ┣ 📂 models         # DB 모델 (SQLAlchemy)\n ┃ ┗ 📜 main.py\n ┗ 📜 README.md\n\`\`\`\n\n<br/>\n\n## 👨‍💻 팀원 및 기여 (Contact)\n홍길동 - Frontend & UI/UX - Github 링크\n김개발 - Backend & Infra - Github 링크\n`;

function DocsTab() {
  const location = useLocation();
  const [sessionId, setSessionId] = useState(location.state?.sessionId || sessionStorage.getItem('last_session_id'));
  
  const [readmeContent, setReadmeContent] = useState('');
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('code'); // 'code' or 'md'
  const [readmes, setReadmes] = useState([]);
  const [activeReadmeId, setActiveReadmeId] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const viewerRef = useRef(null);
  const [agentStep, setAgentStep] = useState(0); // 0: Idle, 1: Analyzer, 2: Router, 3: Writer, 4: Reviewer
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [userInputs, setUserInputs] = useState({
    "Project Name": "",
    "One-line Intro": "",
    "Problem Solved": "",
    "Key Features": "",
    "Target Users": "",
    "Tech Stack Details": "",
    "Future Roadmap": "",
    "Project Logo/Image URL": ""
  });
  const [selectedLanguages, setSelectedLanguages] = useState(['English']);
  const availableLanguages = ['English', 'Korean'];

  const [provider, setProvider] = useState('groq');
  const [modelName, setModelName] = useState('llama-3.3-70b-versatile');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  const models = {
    huggingface: [
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: '코딩 특화 답변 (Qwen Coder)', desc: '레포지토리 분석 최적화 32B 모델' },
      { id: 'meta-llama/Meta-Llama-3-8B-Instruct', name: '일반 답변 (Llama)', desc: '균형 잡힌 오픈소스 엔진' }
    ],
    groq: [
      { id: 'llama-3.1-8b-instant', name: '빠른 답변', desc: '초고속 기술 문서 초안 생성' },
      { id: 'llama-3.3-70b-versatile', name: '심층 답변', desc: '정교한 아키텍처 및 상세 분석' }
    ]
  };

  const currentModel = models[provider].find(m => m.id === modelName) || models[provider][0];

  const handleInputChange = (field, value) => {
    setUserInputs(prev => ({ ...prev, [field]: value }));
  };


  // location.state.sessionId가 변경되면 상태 동기화 및 데이터 재요청
  useEffect(() => {
    const newSessionId = location.state?.sessionId || sessionStorage.getItem('last_session_id');
    if (newSessionId && newSessionId !== sessionId) {
      setSessionId(newSessionId);
      // 데이터 초기화 후 재요청
      setReadmeContent('');
      setReadmes([]);
      setCurrentProjectId(null);
    }
  }, [location.state?.sessionId]);

  useEffect(() => {
    if (sessionId) {
      fetchInitialData(sessionId);
    }
  }, [sessionId]);

  const fetchInitialData = async (sid) => {
    setIsInitialLoading(true);
    try {
      // 1. Get Session Info to get project_id
      const infoData = await chatService.getSessionInfo(sid);
      setCurrentProjectId(infoData.project_id);

      // 2. Fetch all readmes for this project and get history
      const history = await docsService.getProjectReadmes(infoData.project_id);
      setReadmes(history);

      if (history.length > 0) {
        // 3. If history exists, use the latest one immediately
        setReadmeContent(history[0].content);
        setActiveReadmeId(history[0].id);
      } else {
        // 4. No history? Reset content so UI shows empty/initial state
        setReadmeContent('');
        setActiveReadmeId(null);
      }
    } catch (err) {
      console.error('Failed to fetch initial data:', err);
    } finally {
      setIsInitialLoading(false);
    }
  };


  const fetchReadmesHistory = async (projectId) => {
    try {
      const data = await docsService.getProjectReadmes(projectId);
      setReadmes(data);
      if (data.length > 0 && !activeReadmeId) {
        setActiveReadmeId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch readmes history:', err);
    }
  };

  const handleGenerateReadme = async () => {
    if (!sessionId) return;
    
    setIsGenerating(true);
    setAgentStep(1); // Start with Analyzer
    setError('');
    setReadmeContent('');
    setCopied(false);
    
    // Simulate agent steps during generation
    const timer = setInterval(() => {
      setAgentStep(prev => (prev < 4 ? prev + 1 : prev));
    }, 4000); // Progress every 4 seconds

    try {
      const data = await docsService.generateReadme({ 
        session_id: sessionId,
        force_regenerate: true,
        user_inputs: userInputs,
        provider: provider,
        model_name: modelName,
        languages: selectedLanguages
      });

      setReadmeContent(data.readme_content);
      setActiveReadmeId(data.id || 'latest');
      
      // 새로 생성되었으므로 히스토리 갱신
      if (currentProjectId) {
        fetchReadmesHistory(currentProjectId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(timer);
      setIsGenerating(false);
      setAgentStep(0);
    }
  };

  const handleVersionSelect = (readme) => {
    setReadmeContent(readme.content);
    setActiveReadmeId(readme.id);
    if (viewerRef.current) {
      viewerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };


  const copyToClipboard = () => {
    navigator.clipboard.writeText(readmeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Initial Loading Overlay */}
      {isInitialLoading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <p className="text-slate-400 font-bold animate-pulse">Loading Document Library...</p>
        </div>
      )}

      {/* Left Panel: Controls */}
      <div className="w-1/3 min-w-[350px] p-8 bg-slate-900/30 border-r border-white/5 overflow-y-auto">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold mb-4 border border-blue-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Auto-Docs</span>
          </div>
          <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Documentation</h2>
          <p className="text-slate-400 text-sm leading-relaxed">Analyze project architecture and core code to generate high-quality documents.</p>
        </header>

        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
          <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">README Generator</h3>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Automatically writes a README.md that can be uploaded to GitHub based on the total number of files, Top 5 most referenced core files, and directory structure.
          </p>

          {/* User Inputs Form (Accordion) */}
          <div className="mb-6">
            <button 
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="w-full flex items-center justify-between p-3 bg-slate-900/50 hover:bg-slate-800/80 border border-white/5 hover:border-white/10 rounded-xl transition-all"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-slate-300">Custom Settings (Optional)</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isFormOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isFormOpen && (
              <div className="mt-3 space-y-3 max-h-80 overflow-y-auto custom-scrollbar p-1 pr-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {Object.keys(userInputs).map((field) => (
                  <div key={field} className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-400">{field}</label>
                    {field.includes("URL") || field.includes("이름") || field.includes("소개") ? (
                      <input 
                        type="text" 
                        value={userInputs[field]}
                        onChange={(e) => handleInputChange(field, e.target.value)}
                        placeholder={`Enter ${field}...`}
                        className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-slate-900 transition-all"
                      />
                    ) : (
                      <textarea 
                        value={userInputs[field]}
                        onChange={(e) => handleInputChange(field, e.target.value)}
                        placeholder={`Provide a detailed description of ${field}...`}
                        rows={2}
                        className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-slate-900 transition-all resize-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Language Selection */}
          <div className="mb-6">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">Output Languages (Multi-select)</label>
            <div className="flex flex-wrap gap-2">
              {availableLanguages.map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    if (selectedLanguages.includes(lang)) {
                      if (selectedLanguages.length > 1) {
                        setSelectedLanguages(selectedLanguages.filter(l => l !== lang));
                      }
                    } else {
                      setSelectedLanguages([...selectedLanguages, lang]);
                    }
                  }}
                  className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all border ${selectedLanguages.includes(lang) ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-950/50 border-white/5 text-slate-500 hover:border-white/10'}`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
          
          {/* Model Selector */}
          <div className="mb-4 relative">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">AI Model Engine</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setProvider('huggingface');
                  setModelName('Qwen/Qwen2.5-Coder-32B-Instruct');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  provider === 'huggingface' 
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.1)]' 
                  : 'bg-slate-900/50 border-white/5 text-slate-500 hover:border-white/10'
                }`}
              >
                Standard AI (Free)
              </button>
              <button
                onClick={() => {
                  setProvider('groq');
                  setModelName('llama-3.3-70b-versatile');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  provider === 'groq' 
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.1)]' 
                  : 'bg-slate-900/50 border-white/5 text-slate-500 hover:border-white/10'
                }`}
              >
                Standard AI (Pro)
              </button>
            </div>
            
            <div className="mt-2 group">
              <button 
                onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl hover:bg-slate-900 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <div className="text-left">
                    <div className="text-[11px] font-black text-white leading-none mb-0.5">{currentModel.name}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{provider === 'groq' ? 'Standard AI (Free)' : 'Standard AI (Pro)'}</div>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelMenuOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  {models[provider].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModelName(m.id);
                        setIsModelMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-all group/item"
                    >
                      <div className="text-left">
                        <div className={`text-xs font-bold ${modelName === m.id ? 'text-blue-400' : 'text-slate-300'}`}>{m.name}</div>
                        <div className="text-[9px] text-slate-500">{m.desc}</div>
                      </div>
                      {modelName === m.id && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={handleGenerateReadme}
            disabled={isGenerating || isInitialLoading || !sessionId}
            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating README...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generate README 🚀</span>
              </>
            )}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg text-center font-medium">
              {error}
            </div>
          )}
        </div>

        {/* History List */}
        {readmes.length > 0 && (
          <div className="mt-8 animate-fade-in-up">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Generated History
            </h3>
            <div className="space-y-2">
              {readmes.map((readme, idx) => (
                <button
                  key={readme.id}
                  onClick={() => handleVersionSelect(readme)}
                  className={`w-full text-left p-4 rounded-2xl flex items-center justify-between group transition-all border ${
                    activeReadmeId === readme.id 
                    ? 'bg-blue-500/10 border-blue-500/30' 
                    : 'bg-slate-900/40 hover:bg-slate-800/60 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div>
                    <div className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
                      <FileText className={`w-4 h-4 ${activeReadmeId === readme.id ? 'text-blue-400' : 'text-slate-500'}`} />
                      Version {readmes.length - idx}
                      {idx === 0 && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full uppercase">Latest</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(readme.created_at).toLocaleString()}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-colors ${activeReadmeId === readme.id ? 'text-blue-400' : 'text-slate-600 group-hover:text-blue-400'}`} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Viewer */}

      <div className="flex-1 bg-slate-950 overflow-hidden flex flex-col relative">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 blur-[100px] rounded-full pointer-events-none"></div>

        {isGenerating ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 z-10">
            <div className="max-w-md w-full">
              <div className="flex flex-col items-center mb-12">
                <div className="relative mb-6">
                  <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-blue-400 animate-pulse" />
                </div>
                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">AI Agent Working...</h2>
                <p className="text-slate-400 text-sm">Deeply analyzing project architecture to generate the optimal README.</p>
              </div>

              {/* Agent Workflow Steps */}
              <div className="space-y-4">
                {[
                  { id: 1, name: "Analyzer", desc: "Scan project structure and tech stack", icon: "🔍" },
                  { id: 2, name: "Router", desc: "Establish optimal strategy based on archetype", icon: "🔀" },
                  { id: 3, name: "Writer", desc: "Write technical draft based on markdown", icon: "✍️" },
                  { id: 4, name: "Reviewer", desc: "Quality review and feedback loop", icon: "🕵️" }
                ].map((s, idx) => (
                  <div key={s.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 ${
                    agentStep === s.id 
                    ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/5' 
                    : agentStep > s.id 
                    ? 'bg-emerald-500/5 border-emerald-500/20 opacity-60' 
                    : 'bg-slate-900/50 border-white/5 opacity-40'
                  }`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      agentStep === s.id ? 'bg-blue-500 text-white animate-pulse' : 
                      agentStep > s.id ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {agentStep > s.id ? <CheckCircle2 size={20} /> : s.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${agentStep >= s.id ? 'text-white' : 'text-slate-500'}`}>{s.name}</span>
                        {agentStep === s.id && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-black animate-pulse uppercase">Working</span>}
                      </div>
                      <p className="text-[11px] text-slate-500">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : readmeContent ? (
          <>
            <div ref={viewerRef} className="flex-1 overflow-y-auto p-10 custom-scrollbar z-10">
              <div className="max-w-4xl mx-auto bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden min-h-full border border-white/10">
                <div className="bg-white/5 border-b border-white/10 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-bold text-white tracking-tight">README.md (Generated)</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* View Toggle */}
                    <div className="flex items-center bg-slate-900/50 rounded-lg p-1 border border-white/10">
                      <button
                        onClick={() => setViewMode('code')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                          viewMode === 'code' ? 'bg-blue-600/20 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Code className="w-3.5 h-3.5" />
                        Code
                      </button>
                      <button
                        onClick={() => setViewMode('md')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                          viewMode === 'md' ? 'bg-indigo-600/20 text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        MD
                      </button>
                    </div>

                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl border border-white/10 transition-all text-xs font-bold"
                    >
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">AI Optimized</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-10">
                  {viewMode === 'md' ? (
                    <div className="prose prose-invert max-w-none prose-headings:text-white prose-headings:font-black prose-a:text-blue-400 prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-2xl">
                      <ReactMarkdown>{readmeContent}</ReactMarkdown>
                    </div>
                  ) : (
                    <pre className="p-6 bg-slate-950/80 rounded-2xl border border-white/10 text-slate-300 text-sm font-mono overflow-x-auto custom-scrollbar shadow-inner leading-relaxed whitespace-pre-wrap break-all">
                      <code>{readmeContent}</code>
                    </pre>
                  )}
                </div>
              </div>
            </div>

          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar relative z-10">
            <div className="max-w-4xl mx-auto bg-slate-900/40 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden min-h-full border border-white/5 relative opacity-60 hover:opacity-100 transition-all duration-500 group/preview">
              <div className="bg-white/5 border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-slate-300 tracking-tight">Style Preview</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 bg-white/5 px-2 py-1 rounded-lg border border-white/5 uppercase tracking-widest">
                  Standard Professional
                </span>
              </div>
              
              <div className="p-10 prose prose-invert prose-slate max-w-none opacity-50 grayscale group-hover/preview:grayscale-0 group-hover/preview:opacity-100 transition-all duration-700">
                <ReactMarkdown>{DEFAULT_EXAMPLE}</ReactMarkdown>
              </div>
              
              {/* Preview Watermark */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
                <span className="transform -rotate-12 text-8xl font-black text-white/[0.03] uppercase tracking-[2em] select-none">
                  Preview
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocsTab;

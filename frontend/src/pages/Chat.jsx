import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Plus, MessageSquare, Menu, X, FileText, Link, Check, ExternalLink, ChevronDown, Zap, Sparkles, Crown, ShieldCheck, AlertCircle, ShieldAlert } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { chatService, authService, BASE_URL } from '../api';
import ReactMarkdown from 'react-markdown';

function Chat() {
  const location = useLocation();
  const navigate = useNavigate();
  // We manage sessionId in state so we can change it without unmounting the whole component
  const currentSessionId = location.state?.sessionId || sessionStorage.getItem('last_session_id');
  const [sessionId, setSessionId] = useState(currentSessionId);

  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! Feel free to ask anything about the analyzed code.' }
  ]);
  const [sessions, setSessions] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [provider, setProvider] = useState('huggingface');
  const [modelName, setModelName] = useState('Qwen/Qwen2.5-Coder-32B-Instruct');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const availableLanguages = ['English', 'Korean'];
  const messagesEndRef = useRef(null);
  const [loadingMessage, setLoadingMessage] = useState('Thinking...');

  const models = {
    huggingface: [
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: '코딩 특화 답변 (Qwen Coder)', desc: '레포지토리 분석 최적화 32B 모델' },
      { id: 'meta-llama/Meta-Llama-3-8B-Instruct', name: '일반 답변 (Llama)', desc: '균형 잡힌 오픈소스 엔진' }
    ],
    groq: [
      { id: 'llama-3.1-8b-instant', name: '초고속 답변', desc: '실시간에 가까운 분석 속도 (Pro)', pro: true },
      { id: 'llama-3.3-70b-versatile', name: '심층 사고 답변', desc: '가장 정교한 추론 및 분석 (Pro)', pro: true }
    ]
  };


  useEffect(() => {
    if (currentSessionId && currentSessionId !== sessionId) {
      setSessionId(currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (!sessionId) {
      alert("No valid session found. Please perform an analysis first.");
      navigate('/');
    }
  }, [sessionId, navigate]);

  const loadSessionData = async (sid) => {
    try {
      // 1. Get session info
      const infoData = await chatService.getSessionInfo(sid);
      setCurrentProjectId(infoData.project_id);

      // 2. Get history
      const histData = await chatService.getHistory(sid);
      if (histData.length > 0) {
        setMessages(histData);
      } else {
        setMessages([{ role: 'assistant', content: 'Hello! Feel free to ask anything about the analyzed code.' }]);
      }

      // 3. Get sibling sessions
      if (infoData.project_id) {
        const siblingData = await chatService.getProjectSessions(infoData.project_id);
        setSessions(siblingData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadSessionData(sessionId);
      fetchUser();
    }
  }, [sessionId]);

  const fetchUser = async () => {
    try {
      const userData = await authService.me();
      setUser(userData);
      // 기본 언어 설정 (국가 기반 자동 매핑)
      if (userData.country === 'South Korea') setSelectedLanguage('Korean');
      else setSelectedLanguage('English');
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isLoading) {
      // 1. Loading Message Cycle
      const messagesList = [
        'Analyzing codebase...', 
        'Tracing dependency graph...', 
        'Composing detailed response...', 
        'Verifying technical facts...'
      ];
      let i = 0;
      setLoadingMessage(messagesList[0]);
      const interval = setInterval(() => {
        i = (i + 1) % messagesList.length;
        setLoadingMessage(messagesList[i]);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isLoading, selectedLanguage]);

  const handleNewSession = async () => {
    if (!currentProjectId) return;
    setIsLoading(true);
    try {
      const data = await chatService.createSession({
        project_id: currentProjectId,
        provider: provider,
        model_name: modelName
      });
      setSessionId(data.session_id);
      navigate('.', { state: { ...location.state, sessionId: data.session_id }, replace: true });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  const handleDeleteSession = async (e, sid) => {
    e.stopPropagation(); // Prevent session selection click
    if (!window.confirm("Do you want to delete this chat from the list?")) return;

    try {
      await chatService.deleteSession(sid);
      {
        // 현재 열려있는 세션이면 다른 세션으로 이동하거나 초기화
        if (sid === sessionId) {
          setMessages([{ role: 'assistant', content: 'Hello! Feel free to ask anything about the analyzed code.' }]);
          setSessionId(null);
          sessionStorage.removeItem('last_session_id');
          navigate('.', { state: { ...location.state, sessionId: null }, replace: true });
        }
        // 리스트 새로고침
        if (currentProjectId) {
          const siblingData = await chatService.getProjectSessions(currentProjectId);
          setSessions(siblingData);
        }
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred during deletion.");
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !sessionId) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          query: input,
          provider: provider,
          model_name: modelName,
          language: selectedLanguage
        })
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // 일단 빈 답변 메시지를 추가해 둡니다.
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '',
        sources: [],
        evaluation: null,
        graph_trace: []
      }]);

      let assistantText = '';
      let assistantSources = [];
      let assistantGraphTrace = [];
      let assistantEvaluation = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.replace('data: ', '').trim();
              if (!dataStr) continue;
              const parsed = JSON.parse(dataStr);

              if (parsed.sources) {
                assistantSources = parsed.sources;
                assistantGraphTrace = parsed.graph_trace;
              }
              if (parsed.token) {
                assistantText += parsed.token;
              }
              if (parsed.evaluation) {
                assistantEvaluation = parsed.evaluation;
                // [자가검증 경고창 구현] 환각 감지 시 경고 팝업
                if (parsed.evaluation.checks?.hallucination_detected || parsed.evaluation.verdict === 'CRITICAL HALLUCINATION') {
                  alert(`⚠️ [AI 자가검증 위험 알림]\n답변에서 사실과 다른 환각(Hallucination) 가능성이 감지되었습니다.\n\n사유: ${parsed.evaluation.reason}`);
                }
              }

              // 마지막 assistant 메시지 상태 갱신
              setMessages(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.content = assistantText;
                  lastMsg.sources = assistantSources;
                  lastMsg.graph_trace = assistantGraphTrace;
                  lastMsg.evaluation = assistantEvaluation;
                }
                return updated;
              });
            } catch (e) {
              // 불완전한 JSON 버퍼 발생 시 파싱 무시 (다음 청크와 연결됨)
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, an error occurred: ' + err.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar for Chat History */}
      <div className={`${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full'} transition-all duration-300 ease-in-out shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col z-20 absolute lg:relative h-full lg:h-auto`}>
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <button 
            onClick={handleNewSession}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-transparent border border-slate-700 hover:bg-slate-800 text-slate-200 rounded-xl transition-all font-medium text-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Start New Chat
          </button>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden ml-2 p-2 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Model Selector in Sidebar */}
        <div className="p-4 border-b border-slate-800">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">AI Engine</div>
          <div className="relative">
            <button 
              onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
              className="w-full flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-800 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                  <Zap size={14} />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-200">{models[provider].find(m => m.id === modelName)?.name}</div>
                  <div className="text-[10px] text-slate-500">{provider === 'groq' ? 'Standard AI (Pro)' : 'Standard AI (Free)'}</div>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isModelMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-2 border-b border-slate-800 flex gap-1">
                  {['huggingface', 'groq'].map(p => (
                    <button
                      key={p}
                      onClick={(e) => { e.stopPropagation(); setProvider(p); setModelName(models[p][0].id); }}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${provider === p ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-800'}`}
                    >
                      {p === 'groq' ? 'PRO' : 'FREE'}
                    </button>
                  ))}
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {models[provider].map(m => (
                    <button
                      key={m.id}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (m.pro && user?.tier !== 'pro') {
                          alert('Standard AI (Pro) 모델은 Pro 등급 전용입니다. 상단 버튼을 통해 업그레이드 해주세요.');
                          return;
                        }
                        setModelName(m.id); 
                        setIsModelMenuOpen(false); 
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between group ${modelName === m.id ? 'bg-blue-600/10' : 'hover:bg-slate-800'}`}
                    >
                      <div>
                        <div className={`text-xs font-bold flex items-center gap-2 ${modelName === m.id ? 'text-blue-400' : 'text-slate-300'}`}>
                          {m.name}
                          {m.pro && <Crown className={`w-3 h-3 ${user?.tier === 'pro' ? 'text-yellow-400' : 'text-slate-500'}`} />}
                        </div>
                        <div className="text-[10px] text-slate-500">{m.desc}</div>
                      </div>
                      {modelName === m.id && <Check size={12} className="text-blue-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          <div className="text-xs font-black text-slate-500 uppercase px-3 py-2 tracking-widest">
            Recent Chats
          </div>
          {sessions.map((s) => (
            <div key={s.session_id} className="group relative">
              <button
                onClick={() => {
                  setSessionId(s.session_id);
                  navigate('.', { state: { ...location.state, sessionId: s.session_id }, replace: true });
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-3 rounded-xl flex items-start gap-3 transition-colors ${
                  s.session_id === sessionId 
                    ? 'bg-blue-600/10 text-blue-400' 
                    : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="overflow-hidden pr-6">
                  <div className="text-sm truncate font-medium">{s.title || "New Chat"}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {new Date(s.created_at).toLocaleDateString()}
                  </div>
                </div>
              </button>
              
              <button 
                onClick={(e) => handleDeleteSession(e, s.session_id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-400/10"
                title="Delete"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative w-full h-full min-w-0">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none"></div>

        {/* Mobile Header for Sidebar Toggle */}
        <div className="lg:hidden p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center gap-3 relative z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-slate-200">ChatFolio AI</span>
        </div>

        {/* Language Strip */}
        <div className="px-6 py-3 border-b border-white/5 bg-slate-900/40 backdrop-blur-md sticky top-0 md:top-auto z-20 overflow-x-auto custom-scrollbar no-scrollbar flex items-center gap-3">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">AI Speaking:</span>
          <div className="flex gap-2">
            {availableLanguages.map(lang => (
              <button
                key={lang}
                onClick={() => setSelectedLanguage(lang)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border whitespace-nowrap ${selectedLanguage === lang ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-950/30 border-white/5 text-slate-500 hover:border-white/10'}`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* 메시지 영역 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 relative z-10 custom-scrollbar scroll-smooth">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md ${
                msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'
              }`}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
              <div className={`p-4 rounded-2xl shadow-md text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-slate-800/80 backdrop-blur-sm text-slate-200 border border-slate-700/50 rounded-tl-none'
              }`}>
                <ReactMarkdown 
                  className="markdown-content text-slate-200"
                >
                  {msg.content}
                </ReactMarkdown>
                
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                      <Link className="w-3 h-3" /> References
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((src, sidx) => (
                        <div 
                          key={sidx}
                          className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-[11px] text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-all cursor-default group"
                        >
                          <FileText className="w-3 h-3 text-slate-500 group-hover:text-blue-400" />
                          <span className="max-w-[150px] truncate">
                            {src.path.split('/').pop()}
                            {src.lines && <span className="ml-1 text-blue-500/70">({src.lines})</span>}
                          </span>
                          <span className="text-[9px] px-1 bg-slate-800 rounded text-slate-600 group-hover:text-blue-500/50">
                            {src.reason.includes('Context') ? 'RAG' : 'Graph'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Verification Section */}
                {msg.role === 'assistant' && msg.evaluation && (
                  <div className="mt-4 pt-3 border-t border-slate-700/50">
                    <div className={`flex items-center justify-between text-[10px] font-black uppercase tracking-widest ${
                      msg.evaluation.score >= 80 ? 'text-emerald-500' : 
                      msg.evaluation.score >= 50 ? 'text-amber-500' : 'text-rose-500'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {msg.evaluation.score >= 80 ? <ShieldCheck size={12} /> : 
                         msg.evaluation.score >= 50 ? <AlertCircle size={12} /> : <ShieldAlert size={12} />}
                        AI Confidence: {msg.evaluation.score}%
                      </div>
                      <span className="opacity-70">{msg.evaluation.verdict}</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500 italic leading-relaxed">
                      &quot;{msg.evaluation.reason}&quot;
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow-md">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-slate-800/80 backdrop-blur-sm p-4 rounded-2xl shadow-md border border-slate-700/50 rounded-tl-none flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                <span className="text-xs text-slate-400 font-medium animate-pulse">{loadingMessage}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </main>

        {/* 입력 영역 */}
        <footer className="bg-slate-900/80 backdrop-blur-md border-t border-slate-800 p-4 pb-8 relative z-10">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto relative">
            <input
              type="text"
              className="w-full p-4 pr-14 border border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-slate-800 text-slate-100 placeholder-slate-500"
              placeholder="Ask about code structure or features..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-2 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}

export default Chat;

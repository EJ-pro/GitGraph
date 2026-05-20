import React, { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import { 
  Database, Github, Braces, Layers, Link2, 
  Cpu, FileCode2, Code, ArrowRight, Share2, Info, CheckCircle2,
  Lock, Search, CloudDownload, Terminal, BarChart3, Binary, RefreshCw, Sparkles, MessageSquare,
  Scissors, Fingerprint, ShieldCheck, Brain, Bot, FileText, Settings, Users, Zap, Layout, Activity, Award
} from "lucide-react";
import { useNavigate } from 'react-router-dom';

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: true,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#fff',
    primaryBorderColor: '#3b82f6',
    lineColor: '#64748b',
    secondaryColor: '#10b981',
    tertiaryColor: '#1f2937',
    mainBkg: '#0f172a',
    nodeBorder: '#1e293b',
    clusterBkg: '#1e293b',
    clusterBorder: '#334155',
    defaultLinkColor: '#64748b',
    titleColor: '#e2e8f0',
    edgeLabelBackground: '#0f172a',
    actorBkg: '#1e293b',
    actorBorder: '#3b82f6',
    actorTextColor: '#e2e8f0',
    actorLineColor: '#3b82f6',
    signalColor: '#10b981',
    signalTextColor: '#e2e8f0',
    labelBoxBkgColor: '#1e293b',
    labelBoxBorderColor: '#10b981',
    loopTextColor: '#e2e8f0',
    noteBkgColor: '#1e293b',
    noteBorderColor: '#eab308',
    noteTextColor: '#e2e8f0'
  }
});

const MermaidDiagram = ({ chart }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.removeAttribute("data-processed");
      mermaid.render("mermaid-svg-" + Math.random().toString(36).slice(2, 11), chart).then((result) => {
        ref.current.innerHTML = result.svg;
      });
    }
  }, [chart]);

  return <div ref={ref} className="flex justify-center w-full bg-slate-900/30 p-8 rounded-3xl border border-white/5 shadow-2xl overflow-x-auto" />;
};

const SectionHeader = ({ icon: Icon, title, subtitle, color }) => (
  <div className="mb-12">
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4 bg-slate-800/50 border border-slate-700`} style={{ color }}>
      <Icon size={14} /> Documentation
    </div>
    <h2 className="text-4xl font-black text-white tracking-tight mb-2">{title}</h2>
    <p className="text-slate-400 text-lg">{subtitle}</p>
  </div>
);

const Doc = () => {
  const [activeTab, setActiveTab] = useState("requirements");
  const navigate = useNavigate();

  const tabs = [
    { id: "requirements", label: "요구사항 명세서", icon: <FileText size={18} />, color: "#3b82f6" },
    { id: "functions", label: "기능 정의서", icon: <Settings size={18} />, color: "#10b981" },
    { id: "userflow", label: "유저 플로우", icon: <Share2 size={18} />, color: "#8b5cf6" },
    { id: "erd", label: "ERD (데이터 구조)", icon: <Database size={18} />, color: "#f59e0b" },
    { id: "api", label: "API 명세서", icon: <Braces size={18} />, color: "#ec4899" },
    { id: "models", label: "모델 분석 전략", icon: <Brain size={18} />, color: "#6366f1" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "requirements":
        return (
          <div className="animate-fade-in space-y-12">
            <SectionHeader icon={FileText} title="요구사항 명세서" subtitle="프로젝트의 비전과 핵심 기능 요구사항을 정의합니다." color="#3b82f6" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass-panel p-8 rounded-3xl border border-white/5 bg-slate-900/40">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Award className="text-blue-400" /> 1. 프로젝트 개요</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-black/40 rounded-2xl border border-white/5">
                    <span className="text-slate-400">프로젝트명</span>
                    <span className="text-white font-bold">GitGraph</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    AI 기반 분석, 아키텍처 시각화, 그리고 대화형 인터페이스를 통해 개발자가 복잡한 GitHub 저장소를 빠르게 이해할 수 있도록 돕는 서비스입니다.
                  </p>
                </div>
              </div>
              
              <div className="glass-panel p-8 rounded-3xl border border-white/5 bg-slate-900/40">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Users className="text-purple-400" /> 2. 타겟 유저</h3>
                <div className="flex flex-wrap gap-3">
                  {["개발자", "기술 채용 담당자", "CS 전공 학생", "프로젝트 매니저"].map(t => (
                    <span key={t} className="px-4 py-2 bg-slate-800 rounded-xl text-sm font-bold text-slate-300 border border-white/5">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-panel p-10 rounded-[2.5rem] border border-white/5 bg-slate-900/20">
              <h3 className="text-2xl font-black text-white mb-8">3. 핵심 기능 요구사항</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { id: "R1", title: "저장소 분석", desc: "공개 GitHub URL을 통해 기술 스택 및 의존성 추출.", color: "blue" },
                  { id: "R2", title: "AI 채팅 (RAG)", desc: "컨텍스트 기반의 정확한 코드 질문 답변 및 소스 추적.", color: "emerald" },
                  { id: "R3", title: "구독 시스템", desc: "고성능 AI 모델 접근을 위한 등급별 권한 관리.", color: "amber" },
                  { id: "R4", title: "개인 대시보드", desc: "분석 이력 관리 및 유저 프로필 맞춤형 설정.", color: "purple" }
                ].map(req => (
                  <div key={req.id} className="p-6 bg-black/40 rounded-3xl border border-white/5 border-l-4" style={{ borderLeftColor: `var(--tw-gradient-from)` }}>
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{req.id}</div>
                    <h4 className="text-lg font-bold text-white mb-2">{req.title}</h4>
                    <p className="text-sm text-slate-400 leading-relaxed">{req.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "functions":
        return (
          <div className="animate-fade-in space-y-12">
            <SectionHeader icon={Settings} title="기능 정의서" subtitle="시스템 역량 및 분석 엔진의 세부 기능을 기술합니다." color="#10b981" />
            
            <div className="space-y-8">
              {[
                { 
                  title: "1. 분석 엔진 (Analysis Engine)", 
                  items: [
                    { name: "레포지토리 수집기", desc: "Generator 패턴을 활용하여 대규모 파일을 메모리 효율적으로 클론 및 탐색." },
                    { name: "다국어 파서", desc: "Python, JS, TS, Java, Kotlin 등 다양한 언어의 AST 및 메타데이터 추출." },
                    { name: "벡터화 (RAG)", desc: "코드 청크 분할 및 임베딩을 통한 시맨틱 검색 최적화." }
                  ],
                  icon: <Zap className="text-emerald-400" />
                },
                { 
                  title: "2. AI 자동 문서화", 
                  items: [
                    { name: "README 자동 생성", desc: "프로젝트 아키타입을 분석하여 구조화된 마크다운 가이드 생성." },
                    { name: "아키텍처 시각화", desc: "Mermaid.js를 활용한 코드 간 의존성 그래프 자동 생성." }
                  ],
                  icon: <Sparkles className="text-blue-400" />
                },
                { 
                  title: "3. 커뮤니케이션 (Chat)", 
                  items: [
                    { name: "컨텍스트 기반 Q&A", desc: "검색된 코드 조각을 LLM에 주입하여 정확한 기술 답변 제공." },
                    { name: "멀티 티어 모델 선택", desc: "Eco(HF), Fast(Groq) 모델 선택 지원." }
                  ],
                  icon: <MessageSquare className="text-purple-400" />
                }
              ].map((group, idx) => (
                <div key={idx} className="glass-panel p-10 rounded-[2.5rem] border border-white/5 bg-slate-900/40">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-black rounded-2xl border border-white/10">{group.icon}</div>
                    <h3 className="text-2xl font-black text-white">{group.title}</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {group.items.map((item, i) => (
                      <div key={i} className="group p-6 bg-black/40 rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all">
                        <h4 className="text-lg font-bold text-white mb-3 flex items-center justify-between">
                          {item.name}
                          <ArrowRight size={16} className="text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                        </h4>
                        <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "userflow":
        return (
          <div className="animate-fade-in space-y-12">
            <SectionHeader icon={Share2} title="유저 플로우 및 여정" subtitle="분석 파이프라인과 유저의 주요 상호작용 경로를 매핑합니다." color="#8b5cf6" />
            
            <div className="glass-panel p-10 rounded-[2.5rem] border border-white/5 bg-slate-900/20">
              <h3 className="text-2xl font-black text-white mb-8 flex items-center gap-3"><Activity className="text-purple-400" /> 메인 분석 저니 (Main Journey)</h3>
              <MermaidDiagram chart={`
                graph TD
                  A[시작: 랜딩 페이지] --> B{로그인 여부?}
                  B -- 미로그인 --> C[로그인: GitHub/Google]
                  C --> D[분석 대시보드]
                  B -- 로그인됨 --> D
                  
                  D --> E[GitHub URL 입력]
                  E --> F[AI 티어 선택: Standard/Premium]
                  F --> G[분석 파이프라인 실행]
                  
                  subgraph Analysis_Pipeline [분석 파이프라인]
                      G1[수집] --> G2[파싱]
                      G2 --> G3[벡터화]
                      G3 --> G4[저장]
                      G4 --> G5[생성]
                      G5 --> G6[검토]
                  end
                  
                  G6 --> H[분석 완료: README/아키텍처 확인]
                  H --> I[채팅 인터페이스 진입]
                  I --> J[코드 관련 질문하기]
                  J --> K[AI 응답 및 소스 추적]
                  
                  H --> L[마이페이지: 이력 확인]
                  L --> M[Pro 업그레이드]
                  M --> D
              `} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: "인증 (Auth)", desc: "GitHub/Google 계정을 통한 심리스한 소셜 로그인 제공.", icon: <Lock /> },
                { title: "심층 분석 (Pipeline)", desc: "실시간 피드백을 포함한 자동화된 7단계 분석 파이프라인.", icon: <Cpu /> },
                { title: "인게이지먼트 (Chat)", icon: <MessageSquare />, desc: "RAG 기반 대화형 인터페이스를 통한 코드베이스 탐색." }
              ].map((f, i) => (
                <div key={i} className="p-8 bg-slate-900/50 rounded-3xl border border-white/5 flex flex-col items-center text-center">
                  <div className="p-4 bg-purple-500/10 text-purple-400 rounded-2xl mb-4">{f.icon}</div>
                  <h4 className="text-lg font-bold text-white mb-2">{f.title}</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case "erd":
        return (
          <div className="animate-fade-in space-y-12">
            <SectionHeader icon={Database} title="데이터베이스 ERD" subtitle="시스템 엔티티 관계 및 PostgreSQL 스키마를 정의합니다." color="#f59e0b" />
            
            <div className="glass-panel p-10 rounded-[2.5rem] border border-white/5 bg-slate-900/20 overflow-hidden">
              <h3 className="text-2xl font-black text-white mb-8 flex items-center gap-3"><Layout className="text-amber-400" /> 엔티티 관계 다이어그램</h3>
              <MermaidDiagram chart={`
                erDiagram
                  USERS ||--o{ PROJECTS : owns
                  USERS ||--o{ CHAT_SESSIONS : has
                  USERS ||--o{ TOKEN_USAGES : records
                  USERS ||--o{ INQUIRIES : creates

                  PROJECTS ||--o{ PROJECT_FILES : contains
                  PROJECTS ||--o{ GENERATED_READMES : has_history
                  PROJECTS ||--o{ CHAT_SESSIONS : linked_to
                  PROJECTS ||--|| PROJECT_INSIGHTS : provides

                  CHAT_SESSIONS ||--o{ CHAT_MESSAGES : contains

                  USERS {
                      int id PK
                      string provider "제공자"
                      string email "이메일"
                      string name "이름"
                      string github_username "깃허브명"
                      string tier "등급 (free/pro)"
                      datetime pro_expires_at "만료일"
                      jsonb persona_data "성향 데이터"
                      datetime created_at "생성일"
                  }

                  PROJECTS {
                      int id PK
                      int user_id FK
                      string repo_url "저장소 URL"
                      int file_count "파일 수"
                      jsonb graph_data "의존성 그래프"
                      text mermaid_code "머메이드 코드"
                      string status "상태 (PENDING/COMPLETED)"
                      jsonb languages "사용 언어"
                      datetime created_at "생성일"
                  }

                  PROJECT_FILES {
                      int id PK
                      int project_id FK
                      string file_path "경로"
                      text content "내용"
                      text content_summary "요약"
                      int line_count "라인 수"
                  }

                  GENERATED_READMES {
                      int id PK
                      int project_id FK
                      text content "마크다운 내용"
                      string template_type "템플릿 종류"
                      datetime created_at "생성일"
                  }

                  TOKEN_USAGES {
                      int id PK
                      int user_id FK
                      string model_name "모델명"
                      string feature_name "기능명"
                      int token_count "사용 토큰"
                      datetime created_at "생성일"
                  }
              `} />
            </div>
          </div>
        );

      case "models":
        return (
          <div className="animate-fade-in space-y-12">
            <SectionHeader icon={Brain} title="모델 분석 및 AI 전략" subtitle="각 파이프라인 단계별 최적화된 LLM 활용 전략을 정의합니다." color="#6366f1" />
            
            <div className="glass-panel p-10 rounded-[2.5rem] border border-white/5 bg-slate-900/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><Fingerprint size={120} /></div>
              <h3 className="text-2xl font-black text-white mb-8 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400"><Fingerprint size={20} /></div>
                1. 벡터 임베딩 (Embedding)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="p-6 bg-black/40 rounded-3xl border border-white/5">
                    <div className="text-xs font-bold text-blue-400 mb-2">USED MODEL</div>
                    <div className="text-xl font-black text-white">HuggingFace all-MiniLM-L6-v2</div>
                    <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                      서버 리소스를 효율적으로 사용하기 위해 로컬에서 동작하는 경량 임베딩 모델을 사용합니다. 384차원의 벡터 공간에서 코드의 의미론적 유사성을 계산합니다.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-800/30 rounded-2xl border border-white/5 text-center">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Dimensions</div>
                    <div className="text-lg font-black text-white">384 dim</div>
                  </div>
                  <div className="p-4 bg-slate-800/30 rounded-2xl border border-white/5 text-center">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Context</div>
                    <div className="text-lg font-black text-white">512 Tokens</div>
                  </div>
                  <div className="p-4 bg-slate-800/30 rounded-2xl border border-white/5 text-center">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Execution</div>
                    <div className="text-lg font-black text-emerald-400">Local (CPU/GPU)</div>
                  </div>
                  <div className="p-4 bg-slate-800/30 rounded-2xl border border-white/5 text-center">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Cost</div>
                    <div className="text-lg font-black text-blue-400">Free</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="glass-panel p-10 rounded-[2.5rem] border border-white/5 bg-slate-900/40">
                <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400"><Search size={20} /></div>
                  2. 분석 및 리랭킹 (Cheap LLM)
                </h3>
                <div className="p-6 bg-black/40 rounded-3xl border border-white/5 mb-6">
                  <div className="text-xs font-bold text-purple-400 mb-2">MODEL: Groq Llama-3.1-8B-Instant</div>
                  <p className="text-sm text-slate-400">
                    빠른 추론 속도가 필요한 단계에 투입됩니다. 검색된 코드 청크 중 실제 질문과 가장 밀접한 것을 골라내거나(Re-ranking), 프로젝트의 아키타입을 분류하는 역할을 수행합니다.
                  </p>
                </div>
                <ul className="space-y-3">
                  {["벡터 검색 결과 재정렬 (Re-ranking)", "프로젝트 언어 및 아키타입 식별", "간단한 코드 요약 및 설명"].map(t => (
                    <li key={t} className="flex items-center gap-3 text-sm text-slate-300">
                      <CheckCircle2 size={14} className="text-emerald-500" /> {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="glass-panel p-10 rounded-[2.5rem] border border-white/5 bg-slate-900/40">
                <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400"><Bot size={20} /></div>
                  3. 문서 생성 및 추론 (Pro LLM)
                </h3>
                <div className="p-6 bg-black/40 rounded-3xl border border-white/5 mb-6">
                  <div className="text-xs font-bold text-amber-400 mb-2">MODEL: Groq Llama-3.3-70B-Versatile</div>
                  <p className="text-sm text-slate-400">
                    최고 사양의 오픈소스 모델을 사용하여 복잡한 코드 관계를 추론합니다. 고품질의 README 작성, 심층 기술 답변 생성 등 높은 지능이 필요한 과업을 담당합니다.
                  </p>
                </div>
                <ul className="space-y-3">
                  {["멀티 에이전트 기반 README 자동 생성", "복잡한 아키텍처 질문 답변 (RAG)", "디자인 패턴 및 코드 개선 제안"].map(t => (
                    <li key={t} className="flex items-center gap-3 text-sm text-slate-300">
                      <CheckCircle2 size={14} className="text-emerald-500" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="glass-panel p-8 rounded-[2rem] border border-white/5 bg-slate-900/40">
              <h3 className="text-xl font-bold text-white mb-6 px-2">기능별 모델 매핑 요약</h3>
              <div className="overflow-hidden rounded-2xl border border-white/5">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 text-slate-400 font-black uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Task Area</th>
                      <th className="px-6 py-4">Selected Model</th>
                      <th className="px-6 py-4">Key Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { area: "Vector Embedding", model: "HF all-MiniLM-L6", reason: "Zero Cost, Local Execution" },
                      { area: "Initial Scan / Classifier", model: "Llama-3.1-8B (Groq)", reason: "Ultra-low Latency" },
                      { area: "Search Result Re-ranking", model: "Llama-3.1-8B (Groq)", reason: "Cost Efficiency" },
                      { area: "Main Q&A (Standard Fast)", model: "Llama-3.3-70B (Groq)", reason: "High Reasoning Performance" },
                      { area: "README Writer / Reviewer", model: "Llama-3.3-70B (Groq)", reason: "Instruction Following" },
                      { area: "Main Q&A (Standard Eco)", model: "Mistral-7B (HF)", reason: "Open Source Standard" },
                    ].map((m, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-bold text-white">{m.area}</td>
                        <td className="px-6 py-4 text-blue-400 font-mono">{m.model}</td>
                        <td className="px-6 py-4 text-slate-400">{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
        return (
          <div className="animate-fade-in space-y-12">
            <SectionHeader icon={Braces} title="API 명세서" subtitle="FastAPI 엔드포인트 문서 및 연동 가이드를 제공합니다." color="#ec4899" />
            
            <div className="space-y-10">
              {[
                { 
                  title: "1. 인증 및 프로필 (Auth)", 
                  routes: [
                    { method: "GET", path: "/auth/me", desc: "현재 로그인된 유저의 프로필 및 등급 정보 조회." },
                    { method: "POST", path: "/auth/upgrade", desc: "모의 결제를 통한 유저 등급 'pro' 업그레이드." }
                  ] 
                },
                { 
                  title: "2. 분석 및 프로젝트 (Analysis)", 
                  routes: [
                    { method: "POST", path: "/analyze", desc: "저장소 분석 시작 및 실시간 로그 스트리밍." },
                    { method: "GET", path: "/projects", desc: "유저의 전체 프로젝트 목록 조회." },
                    { method: "DELETE", path: "/projects/{id}", desc: "특정 프로젝트 데이터 영구 삭제." }
                  ] 
                },
                { 
                  title: "3. 채팅 및 지능형 기능 (AI)", 
                  routes: [
                    { method: "POST", path: "/chat", desc: "RAG 기반의 대화형 AI 응답 생성." },
                    { method: "POST", path: "/analyze-architecture", desc: "심층 아키텍처 분석 리포트 생성." }
                  ] 
                }
              ].map((section, idx) => (
                <div key={idx} className="glass-panel p-8 rounded-[2rem] border border-white/5 bg-slate-900/40">
                  <h3 className="text-xl font-bold text-white mb-6 px-2">{section.title}</h3>
                  <div className="overflow-hidden rounded-2xl border border-white/5">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/5 text-slate-400 font-black uppercase tracking-widest text-[10px]">
                        <tr>
                          <th className="px-6 py-4">Method</th>
                          <th className="px-6 py-4">Endpoint</th>
                          <th className="px-6 py-4">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {section.routes.map((route, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-md font-black text-[10px] ${route.method === 'POST' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                {route.method}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-pink-400">{route.path}</td>
                            <td className="px-6 py-4 text-slate-400">{route.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-[#e2e8f0] flex flex-col" style={{ fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/10 blur-[150px] rounded-full -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-emerald-600/5 blur-[150px] rounded-full translate-y-1/2 -translate-x-1/4"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]"></div>
      </div>

      <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-white/5 bg-slate-950/50 px-8 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-white">GitGraph <span className="text-blue-500">Docs</span></span>
          </div>
          <nav className="hidden md:flex gap-6 items-center">
            <button onClick={() => navigate('/doc/pipeline')} className="text-slate-400 hover:text-white font-bold transition-colors">심층 파이프라인</button>
            <button onClick={() => navigate('/')} className="px-5 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold border border-white/10 transition-all">홈으로</button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-12 relative z-10">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Navigation Sidebar */}
          <aside className="lg:w-64 shrink-0">
            <div className="sticky top-32 space-y-2">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 ml-2">설계 명세서</div>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${
                    activeTab === tab.id 
                    ? "bg-slate-800 text-white shadow-xl border border-white/10 translate-x-2" 
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  }`}
                  style={{ color: activeTab === tab.id ? tab.color : '' }}
                >
                  <span style={{ color: activeTab === tab.id ? tab.color : 'inherit' }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
              
              <div className="pt-8 mt-8 border-t border-white/5">
                <button 
                  onClick={() => navigate('/doc/pipeline')} 
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-emerald-400/70 hover:text-emerald-400 font-bold transition-all hover:bg-emerald-500/5 rounded-2xl"
                >
                  <Binary size={18} /> 심층 파이프라인
                </button>
              </div>
            </div>
          </aside>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {renderContent()}
          </div>
        </div>
      </main>

      <footer className="mt-20 border-t border-white/5 bg-slate-950/80 p-12 relative z-10">
        <div className="max-w-7xl mx-auto text-center">
          <div className="text-slate-500 text-sm mb-4 font-medium">GitGraph 프로젝트 문서화 시스템 v1.0</div>
          <div className="text-xs text-slate-600">&copy; 2026 GitGraph. Designed for the Next Generation of Developers.</div>
        </div>
      </footer>
    </div>
  );
};

export default Doc;

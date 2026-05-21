import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Loader2, Network, HelpCircle, Layers, Info } from 'lucide-react';
import { BASE_URL, projectService } from '../api';

function ObsidianTab() {
  const location = useLocation();
  const [sessionId, setSessionId] = useState(location.state?.sessionId || sessionStorage.getItem('last_session_id'));
  const [isDownloading, setIsDownloading] = useState(false);
  const [projectInfo, setProjectInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const newSessionId = location.state?.sessionId || sessionStorage.getItem('last_session_id');
    if (newSessionId && newSessionId !== sessionId) {
      setSessionId(newSessionId);
    }
  }, [location.state?.sessionId]);

  useEffect(() => {
    if (sessionId) {
      fetchProjectInfo();
    }
  }, [sessionId]);

  const fetchProjectInfo = async () => {
    setIsLoading(true);
    try {
      const projects = await projectService.getProjects();
      const currentProj = projects.find(p => p.latest_session_id === sessionId);
      if (currentProj) {
        setProjectInfo(currentProj);
      }
    } catch (err) {
      console.error("Failed to fetch project info:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!sessionId) return;
    setIsDownloading(true);
    try {
      const response = await fetch(`${BASE_URL}/generate/obsidian-vault?session_id=${sessionId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to export Obsidian Vault');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const repoName = projectInfo?.repo_url ? projectInfo.repo_url.split('/').pop() : 'project';
      a.download = `${repoName}_obsidian_vault.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Obsidian Vault export failed: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const steps = [
    {
      num: "01",
      title: "Obsidian 보관소 다운로드",
      desc: "왼쪽의 다운로드 버튼을 눌러 코드베이스의 의존성 구조가 포함된 ZIP 파일을 다운로드합니다.",
      tip: "파일 요약, 주요 클래스/메서드, 그리고 파일 간 import 의존성이 [[위키 링크]] 형태로 변환되어 포함되어 있습니다."
    },
    {
      num: "02",
      title: "다운로드 파일 압축 해제",
      desc: "다운로드된 ZIP 파일(예: `프로젝트명_obsidian_vault.zip`)을 로컬 PC의 원하는 위치에 압축 해제합니다.",
      tip: "압축을 풀면 개별 파일들이 마크다운(.md) 문서로 생성되어 있는 것을 확인할 수 있습니다."
    },
    {
      num: "03",
      title: "Obsidian에서 보관소(Vault) 열기",
      desc: "Obsidian 앱을 실행하고, '폴더를 보관소로 열기(Open folder as vault)' 메뉴에서 [열기] 버튼을 누른 뒤 압축을 푼 폴더를 선택합니다.",
      tip: "새 보관소로 등록하면 Obsidian이 폴더 내부 마크다운 문서를 읽어 로컬 위키 시스템을 구축합니다."
    },
    {
      num: "04",
      title: "그래프 뷰(Graph View) 탐색",
      desc: "Obsidian 단축키인 Ctrl + G (Mac은 Cmd + G)를 누르면 전체 코드베이스의 의존성 맵이 시각적으로 연결되어 나타납니다.",
      tip: "각 노드를 클릭해 요약 정보를 확인하고, 링크 연결선들을 통해 코드 간 수입/수출 관계를 직관적으로 추적할 수 있습니다."
    }
  ];

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden relative">
      {/* Background neon gradients */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[130px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[130px] rounded-full pointer-events-none"></div>

      <div className="flex-1 flex flex-col md:flex-row gap-8 p-10 overflow-y-auto custom-scrollbar z-10">
        
        {/* Left Column: Download and Repo Summary Card */}
        <div className="w-full md:w-5/12 flex flex-col gap-6">
          <header className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold mb-4 border border-purple-500/20">
              <Network className="w-3.5 h-3.5" />
              <span>Obsidian Integration</span>
            </div>
            <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Obsidian Vault</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              분석된 코드베이스 의존성 그래프를 로컬 Obsidian 노트 보관소로 변환하여 소스 코드의 관계를 시각적으로 탐색해보세요.
            </p>
          </header>

          <div className="bg-slate-900/40 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
            
            <div className="w-14 h-14 bg-purple-500/10 text-purple-400 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/20">
              <Layers className="w-7 h-7" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">보관소 패키지 내보내기</h3>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              현재 분석된 리포지토리의 소스 코드 구조를 Obsidian 로컬 보관소용 압축 파일로 빌드합니다.
            </p>

            {projectInfo && (
              <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Repository</span>
                  <span className="text-slate-200 font-mono truncate max-w-[200px]" title={projectInfo.repo_url}>
                    {projectInfo.repo_url.replace('https://github.com/', '')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Total Code Files</span>
                  <span className="text-slate-200 font-bold">{projectInfo.file_count} files</span>
                </div>
              </div>
            )}

            <button
              onClick={handleDownload}
              disabled={isDownloading || isLoading || !sessionId}
              className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-purple-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>보관소 빌드 중...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Obsidian Vault 다운로드 🕸️</span>
                </>
              )}
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/20 border border-white/5 text-xs text-slate-400 flex gap-3">
            <Info className="w-5 h-5 text-purple-400 shrink-0" />
            <div className="leading-relaxed">
              <span className="font-bold text-slate-300 block mb-1">참고사항</span>
              내보낸 보관소 파일은 로컬 컴퓨터에서 완전히 오프라인으로 작동하며, Obsidian 이외의 다른 마크다운 뷰어에서도 잘 열립니다.
            </div>
          </div>
        </div>

        {/* Right Column: Step-by-Step Guide */}
        <div className="flex-1 flex flex-col gap-6">
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-purple-400" />
            Obsidian 등록 & 활용 가이드
          </h3>

          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div key={idx} className="bg-slate-900/30 border border-white/5 hover:border-purple-500/20 rounded-2xl p-6 transition-all duration-300 flex gap-5 group">
                <div className="text-2xl font-black text-purple-500/30 group-hover:text-purple-400/80 transition-colors shrink-0">
                  {step.num}
                </div>
                <div className="space-y-2">
                  <h4 className="text-base font-bold text-slate-100 group-hover:text-white transition-colors">{step.title}</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
                  <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5 text-xs text-slate-500 font-medium">
                    💡 <span className="text-slate-400">꿀팁:</span> {step.tip}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default ObsidianTab;

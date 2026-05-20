import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Analysis from './pages/Analysis';
import Chat from './pages/Chat';
import DocsTab from './pages/DocsTab';
import ObsidianTab from './pages/ObsidianTab';
import InterviewTab from './pages/InterviewTab';
import ArchitectureTab from './pages/ArchitectureTab';
import AuthCallback from './pages/AuthCallback';
import { Search, Github, Loader2, GitBranch, FileCode2, Share2, Sparkles, MessageSquare, BookOpen, Layers } from 'lucide-react';
import { useEffect } from 'react';
import { authService } from './api';
import { useNavigate } from 'react-router-dom';
import MyPage from './pages/MyPage';
import DashboardLayout from './components/DashboardLayout';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import FAQ from './pages/FAQ';
import DocDeepPipeline from './pages/DocDeepPipeline/DocDeepPipeline.jsx';
import PipelineTab from './pages/PipelineTab';
import Doc from './pages/Doc';

// 인증 가드 컴포넌트
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// 홈 리다이렉트 컴포넌트 (루트 / 접속 시 처리)
function Home() {
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    // 토큰이 있으면 유저 정보를 가져와서 해당 유저의 경로로 이동
    authService.me()
    .then(user => {
      const username = user.github_username || user.name;
      navigate(`/${username}/analysis`, { replace: true });
    })
    .catch(() => {
      localStorage.removeItem('token');
      navigate('/login', { replace: true });
    });
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
        {/* 모든 주요 경루에 :username 포함 */}
        <Route path="/:username" element={
          <ProtectedRoute>
            <MyPage />
          </ProtectedRoute>
        } />
        
        <Route path="/:username/analysis" element={
          <ProtectedRoute>
            <Analysis />
          </ProtectedRoute>
        } />
        
        <Route path="/:username/dashboard" element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route path="chat" element={<Chat />} />
          <Route path="architecture" element={<ArchitectureTab />} />
          <Route path="pipeline" element={<PipelineTab />} />
          <Route path="docs" element={<DocsTab />} />
          <Route path="obsidian" element={<ObsidianTab />} />
          <Route path="interview" element={<InterviewTab />} />
        </Route>

        {/* 기본 경로는 로그인 상태에 따라 리다이렉트 */}
        <Route path="/" element={<Home />} />
        
        {/* 법적 고지 페이지 */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/faq" element={<FAQ />} />
        
        {/* 문서 페이지 */}
        <Route path="/doc" element={<Doc />} />
        <Route path="/doc/pipeline" element={<DocDeepPipeline />} />
      </Routes>
    </Router>
  );
}

export default App;
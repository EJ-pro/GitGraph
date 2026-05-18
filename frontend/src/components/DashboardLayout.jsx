import { Outlet, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, FileText, Target, Github, Share2, GitBranch, ChevronDown, PanelLeftClose, PanelLeft, Brain } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import UserProfile from './UserProfile';
import { projectService } from '../api';



function DashboardLayout() {
  const { username } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  // URL state에서 가져오거나 sessionStorage에서 복구
  const sessionId = location.state?.sessionId || sessionStorage.getItem('last_session_id');

  const [projects, setProjects] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const dropdownRef = useRef(null);
  
  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await projectService.getProjects();
        setProjects(data);
      } catch (err) {
        console.error("Failed to fetch projects:", err);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (location.state?.sessionId) {
      sessionStorage.setItem('last_session_id', location.state.sessionId);
    }
  }, [location.state?.sessionId]);

  // 세션이 없으면 홈으로 (Analysis)
  useEffect(() => {
    if (!sessionId) {
      alert("No valid session found. Please perform an analysis first.");
      navigate(`/${username}/analysis`);
    }
  }, [sessionId, navigate, username]);

  const navItems = [
    { path: `/${username}/dashboard/chat`, icon: MessageSquare, label: 'General Chat' },
    { path: `/${username}/dashboard/architecture`, icon: Share2, label: 'Architecture' },
    { path: `/${username}/dashboard/pipeline`, icon: GitBranch, label: 'Pipeline' },
    { path: `/${username}/dashboard/docs`, icon: FileText, label: 'Documentation' },
    { path: `/${username}/dashboard/interview`, icon: Target, label: 'Mock Interview' },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-0 opacity-0 invisible pointer-events-none' : 'w-64 opacity-100 visible'} transition-all duration-300 ease-in-out bg-slate-900/50 backdrop-blur-xl text-slate-300 flex flex-col border-r border-white/5 z-30 relative shrink-0`}>
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <div 
            onClick={() => navigate(`/${username}/analysis`)}
            className="flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors group"
          >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tighter">ChatFolio</h1>
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
            title="Collapse Sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              state={{ sessionId }} // 세션 ID 유지
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'hover:bg-white/5 text-slate-400 hover:text-white'
                }`
              }
            >
              <item.icon className={`w-5 h-5 transition-transform duration-300 ${location.pathname === item.path ? '' : 'group-hover:scale-110'}`} />
              <span className="font-bold text-sm tracking-tight">{item.label}</span>
            </NavLink>
          ))}
        </nav>


      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 relative">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none"></div>

        {/* Header Bar */}
        <header className="h-16 bg-slate-950 border-b border-white/5 flex items-center justify-between px-8 shrink-0 z-[100]">
          <div className="flex items-center gap-4">
            {isSidebarCollapsed && (
              <button 
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-blue-500/30 transition-all mr-2 animate-in fade-in zoom-in duration-200"
                title="Expand Sidebar"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 hover:border-blue-500/30 hover:bg-white/10 transition-all min-w-[280px] group"
              >
                <GitBranch className={`w-4 h-4 ${isDropdownOpen ? 'text-blue-400' : 'text-slate-500'} group-hover:text-blue-400 transition-colors`} />
                <span className="flex-1 text-left text-sm text-slate-200 font-medium truncate">
                  {projects.find(p => p.latest_session_id === sessionId)?.repo_url.replace('https://github.com/', '') || 'Select Project...'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180 text-blue-400' : ''}`} />
              </button>

              {/* Custom Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-full bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[110] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {projects.filter(p => p.latest_session_id).map(p => {
                      const isActive = p.latest_session_id === sessionId;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            navigate(location.pathname, { state: { sessionId: p.latest_session_id }, replace: true });
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-xl flex flex-col gap-0.5 transition-all mb-1 last:mb-0 ${
                            isActive 
                              ? 'bg-blue-600 text-white' 
                              : 'hover:bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span className="text-sm font-bold truncate">
                            {p.repo_url.split('/').pop()}
                          </span>
                          <span className={`text-[10px] truncate opacity-60 ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                            {p.repo_url.replace('https://github.com/', '')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>


          
          <div className="flex items-center gap-6">
            <UserProfile />
          </div>
        </header>

        <div className="flex-1 overflow-auto relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default DashboardLayout;

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Github, Mail, Calendar, MapPin, Link as LinkIcon,
  ExternalLink, MessageSquare, Share2, FileText,
  Sparkles, ShieldCheck, Trophy, GitBranch,
  Clock, CheckCircle2, AlertCircle, Loader2, ChevronRight,
  ArrowLeft, RefreshCw, Crown, Copy, Download, Check, Eye
} from 'lucide-react';
import UserProfile from '../components/UserProfile';
import { authService, projectService } from '../api';

function MyPage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [githubRepos, setGithubRepos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projects');

  useEffect(() => {
    fetchProfileData();
    fetchGithubRepos();
  }, [username]);

  const fetchProfileData = async () => {
    try {
      const data = await authService.getProfile(username);
      setProfile(data);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGithubRepos = async () => {
    try {
      const data = await authService.getGithubRepos();
      setGithubRepos(data);
    } catch (err) {
      console.error('Failed to fetch github repos:', err);
    }
  };

  const handleViewAllGithub = () => {
    if (profile?.user?.github_username) {
      window.open(`https://github.com/${profile.user.github_username}?tab=repositories`, '_blank');
    }
  };

  const handleAnalyzeRepo = (repoUrl) => {
    navigate(`/?repo_url=${encodeURIComponent(repoUrl)}`);
  };


  const [updatingProjectId, setUpdatingProjectId] = useState(null);

  const handleUpdateProject = async (projectId, repoUrl) => {
    setUpdatingProjectId(projectId);
    try {
      const data = await projectService.checkUpdate(projectId);
      if (data.is_updated) {
        if (confirm(`New commits discovered!\n\n"${data.latest_commit.message}"\n\nWould you like to update now?`)) {
          navigate(`/?repo_url=${encodeURIComponent(repoUrl)}&force_update=true`);
        }
      } else {
        alert('Already up to date.');
      }
    } catch (err) {
      console.error('Failed to update project:', err);
      alert('An error occurred: ' + err.message);
    } finally {
      setUpdatingProjectId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (filename, content) => {
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
        <h2 className="text-3xl font-bold text-white mb-2">User Not Found</h2>
        <p className="text-slate-400 mb-8">The requested user profile does not exist or is private.</p>
        <button onClick={() => navigate('/')} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors">
          Return to Home
        </button>
      </div>
    );
  }

  // Radar Chart Data Calculation
  const skillEntries = Object.entries(profile.skills);
  const totalSkillCount = skillEntries.reduce((sum, [_, count]) => sum + count, 0);

  const radarData = skillEntries.map(([lang, count], i) => {
    const angle = (i / skillEntries.length) * 2 * Math.PI - Math.PI / 2;
    const value = (count / totalSkillCount) * 100 + 30; // Min scale
    return {
      lang,
      x: 150 + Math.cos(angle) * value,
      y: 150 + Math.sin(angle) * value
    };
  });



  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative font-sans overflow-x-hidden">
      {/* Background Orbs - Changed to fixed to stay in viewport and not affect scroll height */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="w-full px-8 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md border-b border-white/5 bg-slate-950/50">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold">GitGraph</span>
        </button>
        <UserProfile />
      </header>

      <main className="flex-grow w-full max-w-7xl mx-auto p-6 md:p-10 pb-20 md:pb-32 space-y-10 relative z-10">

        {/* Profile Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Identity Card */}
          <div className="lg:col-span-1 glass-panel rounded-3xl p-8 border border-white/10 relative overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>

            <div className="relative mb-6">
              <img
                src={profile.user.avatar_url}
                alt={profile.user.name}
                className="w-32 h-32 rounded-3xl border-4 border-white/10 object-cover shadow-2xl"
              />
              <div className="absolute -bottom-2 -right-2 bg-blue-600 p-2 rounded-xl shadow-lg border-4 border-slate-900">
                <Github className="w-5 h-5 text-white" />
              </div>
            </div>

            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">{profile.user.name}</h1>
            <p className="text-blue-400 font-mono text-sm mb-6">@{profile.user.github_username}</p>

            <div className="w-full space-y-3 pt-6 border-t border-white/5">
              <div className="flex items-center gap-3 text-slate-400 text-sm">
                <Crown className={`w-4 h-4 ${profile.user.tier === 'pro' ? 'text-yellow-500' : 'text-slate-600'}`} />
                <span className="flex items-center gap-2">
                  Plan: <b className={`uppercase ${profile.user.tier === 'pro' ? 'text-yellow-500' : 'text-slate-300'}`}>{profile.user.tier}</b>
                </span>
              </div>
              {profile.user.tier === 'pro' && profile.user.pro_expires_at && (
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  Expires: {new Date(profile.user.pro_expires_at).toLocaleDateString()}
                </div>
              )}
            </div>

          </div>

          {/* Right: Skill Track (Radar Chart) */}
          <div className="lg:col-span-2 glass-panel rounded-3xl p-8 border border-white/10 relative flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 text-center md:text-left">

              <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">AI Tech Stack Analysis</h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Analyzed your tech stack based on recently analyzed repositories. You show strong performance primarily in the <span className="text-white font-bold">{skillEntries[0]?.[0]} environment</span>!
              </p>

              <div className="grid grid-cols-2 gap-4">
                {skillEntries.slice(0, 4).map(([lang, count]) => (
                  <div key={lang} className="p-3 rounded-2xl bg-slate-900/50 border border-white/5">
                    <div className="text-xs text-slate-500 font-bold uppercase mb-1">{lang}</div>
                    <div className="text-xl font-black text-white">{Math.round((count / totalSkillCount) * 100)}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative w-[300px] h-[300px] shrink-0">
              {/* SVG Radar Chart */}
              <svg viewBox="0 0 300 300" className="w-full h-full drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                {/* Background Circles */}
                {[0.2, 0.4, 0.6, 0.8, 1].map(r => (
                  <circle key={r} cx="150" cy="150" r={r * 100} fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
                ))}

                {/* Axis lines */}
                {radarData.map(d => (
                  <line key={d.lang} x1="150" y1="150" x2={d.x} y2={d.y} stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
                ))}

                {/* The Data Shape */}
                <polygon
                  points={radarData.map(d => `${d.x},${d.y}`).join(' ')}
                  fill="url(#radarGradient)"
                  fillOpacity="0.6"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />

                {/* Labels */}
                {radarData.map(d => {
                  const labelX = 150 + (d.x - 150) * 1.25;
                  const labelY = 150 + (d.y - 150) * 1.25;
                  return (
                    <text
                      key={d.lang}
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-[10px] font-bold fill-slate-400 uppercase tracking-tighter"
                    >
                      {d.lang}
                    </text>
                  );
                })}

                <defs>
                  <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-6 border-b border-white/5 pb-4">
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-2 font-bold transition-all relative ${activeTab === 'projects' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Project Hub
            {activeTab === 'projects' && <div className="absolute bottom-[-17px] left-0 w-full h-1 bg-blue-500 rounded-full"></div>}
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-4 py-2 font-bold transition-all relative ${activeTab === 'assets' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Asset Library
            {activeTab === 'assets' && <div className="absolute bottom-[-17px] left-0 w-full h-1 bg-blue-500 rounded-full"></div>}
          </button>
        </div>

        {/* Tab Content: Project Hub */}
        {activeTab === 'projects' && (
          <section className="space-y-8 animate-fade-in">
            {/* Analyzed Projects */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Analyzed Projects</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profile.projects.map(project => (
                  <div key={project.id} className="group glass-panel rounded-2xl p-6 border border-white/5 hover:border-blue-500/50 transition-all hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-blue-400 border border-white/5">
                        <Github className="w-6 h-6" />
                      </div>
                      <div className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center gap-1 uppercase tracking-widest border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Analyzed
                      </div>
                    </div>
                    <h4 className="text-lg font-bold text-white truncate mb-1 group-hover:text-blue-400 transition-colors">
                      {project.repo_url.split('/').slice(-1)}
                    </h4>
                    <p className="text-slate-500 text-sm mb-4 truncate">{project.repo_url}</p>

                    {project.last_commit_message && (
                      <div className="mb-4 p-2.5 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Last Commit
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2 italic">"{project.last_commit_message}"</p>
                      </div>
                    )}

                    <div className="flex items-center gap-4 mb-6 text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {project.file_count} files</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(project.created_at).toLocaleDateString()}</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/${username}/dashboard/chat`, { state: { sessionId: project.latest_session_id } })}
                        className="flex-1 py-2.5 bg-slate-800 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Enter Chat
                      </button>
                      <button
                        onClick={() => navigate(`/${username}/dashboard/architecture`, { state: { sessionId: project.latest_session_id } })}
                        className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
                        title="View Architecture"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleUpdateProject(project.id, project.repo_url)}
                        disabled={updatingProjectId === project.id}
                        className={`px-3 py-2.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-xl transition-all ${updatingProjectId === project.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Check for Updates"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${updatingProjectId === project.id ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sync with GitHub (All repos) */}
            {githubRepos.length > 0 && (
              <div className="pt-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">My GitHub Repositories</h3>
                  </div>
                  <button
                    onClick={handleViewAllGithub}
                    className="text-slate-400 hover:text-white text-sm flex items-center gap-1.5 font-bold transition-colors"
                  >
                    View All <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {githubRepos.map(repo => {
                    const isAnalyzed = profile.projects.some(p => p.repo_url.includes(repo.full_name));
                    return (
                      <div key={repo.full_name} className="p-5 rounded-2xl bg-slate-900/30 border border-white/5 hover:border-white/10 transition-all group relative overflow-hidden">
                        <div className="text-blue-400 mb-3 opacity-50 group-hover:opacity-100 transition-opacity">
                          <Github className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-white truncate mb-1">{repo.name}</h4>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{repo.language || 'Plain'}</span>
                          {isAnalyzed ? (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">Done</span>
                          ) : (
                            <button
                              onClick={() => handleAnalyzeRepo(repo.html_url)}
                              className="text-[10px] text-blue-400 font-bold hover:underline"
                            >
                              Analyze
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Tab Content: Asset Library */}
        {activeTab === 'assets' && (
          <section className="space-y-12 animate-fade-in">
            {/* README Gallery */}
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-1.5 h-6 bg-purple-500 rounded-full"></div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Generated READMEs</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {profile.assets.readmes.map(readme => (
                  <div key={readme.id} className="group glass-panel rounded-3xl p-6 border border-white/5 flex flex-col h-full relative overflow-hidden transition-all hover:border-purple-500/30">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-50"></div>
                    
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-white truncate text-sm">{readme.repo_url.split('/').slice(-1)}</h4>
                          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{new Date(readme.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleCopy(readme.content, readme.id)}
                          className="p-2 rounded-lg bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-purple-400 transition-all"
                          title="Copy Content"
                        >
                          {copiedId === readme.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                          onClick={() => handleDownload(`${readme.repo_url.split('/').pop()}_README.md`, readme.content)}
                          className="p-2 rounded-lg bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-purple-400 transition-all"
                          title="Download README"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 bg-slate-950/80 rounded-2xl p-4 mb-4 border border-white/5 relative group/preview">
                      <div className="text-[11px] text-slate-400 font-mono line-clamp-[8] whitespace-pre-wrap leading-relaxed">
                        {readme.content || "No content generated yet."}
                      </div>
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-60"></div>
                      
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity bg-slate-950/60 backdrop-blur-[2px]">
                        <button
                          onClick={() => navigate(`/${username}/dashboard/docs`, { state: { sessionId: readme.latest_session_id } })}
                          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-xl transform scale-90 group-hover/preview:scale-100 transition-all flex items-center gap-2"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Full View
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                      <Sparkles className="w-3 h-3" />
                      AI Generated Documentation
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="w-full text-center p-4 text-slate-600 text-sm border-t border-white/5 relative z-10 flex flex-col items-center gap-8 bg-slate-950/50">
        <div className="flex gap-10 font-black text-slate-500 uppercase tracking-widest text-[10px]">
          <button onClick={() => navigate('/terms')} className="hover:text-white transition-all">Terms of Service</button>
          <button onClick={() => navigate('/privacy')} className="hover:text-white transition-all">Privacy Policy</button>
          <button onClick={() => navigate('/faq')} className="hover:text-white transition-all">Support (FAQ)</button>
        </div>
        <div className="space-y-2 opacity-60">
          <p className="font-bold">CEO : Jaehee Lee | TEL : 02-529-4237 | Mail : GitGraph@gitgraph.com</p>
          <p className="text-[10px]">&copy; 2026 GitGraph. Designed for the Next Generation of Developers.</p>
        </div>
      </footer>
    </div>
  );
}

export default MyPage;

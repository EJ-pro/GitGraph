import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Github, Brain } from 'lucide-react';
import UserProfile from '../components/UserProfile';

function Privacy() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative font-sans overflow-x-hidden">
      {/* Background Orbs - Fixed to prevent scrolling issues */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full"></div>
      </div>

      <header className="w-full px-8 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md border-b border-white/5 bg-slate-950/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold">Back</span>
        </button>
        <div className="flex items-center gap-3" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-black tracking-tighter text-xl">GitGraph</span>
        </div>
        <UserProfile />
      </header>

      <main className="flex-grow w-full max-w-4xl mx-auto p-6 md:p-10 relative z-10 pb-20">
        <div className="glass-panel rounded-3xl p-8 md:p-12 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
          
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight">Privacy Policy</h1>
          </div>

          <div className="space-y-8 text-slate-400 leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Article 1 (Personal Information Items Collected)
              </h2>
              <p>The service collects the following information for smooth service provision.</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><span className="text-slate-200">When integrating GitHub:</span> GitHub ID, email, name, avatar URL, GitHub access token.</li>
                <li><span className="text-slate-200">Service use process:</span> Repository URL requested for analysis, code content (for analysis), and chat history with AI.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Article 2 (Purpose of Using Personal Information)
              </h2>
              <p>The collected information is used for the following purposes:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Service provision and user identity verification</li>
                <li>Tailored code dependency analysis and tech stack identification</li>
                <li>Developer persona (MBTI) definition and visualization data generation</li>
                <li>Statistical analysis for service improvement</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Article 3 (GitHub Access Token Management)
              </h2>
              <p>
                The user's <span className="text-blue-400 font-mono">GitHub Access Token</span> is used only for reading code from private repositories and is securely stored encrypted within the server. If the user disconnects the service or deletes their account, the token and related information are immediately destroyed in an unrecoverable manner.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Article 4 (Disclosure to Third Parties)
              </h2>
              <p>
                GitGraph does not disclose personal information to third parties without the user's prior consent. However, code data used for AI analysis may be processed through API providers (OpenAI, Groq, etc.), and personally identifiable information is excluded during this process.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-white/5 text-sm text-slate-500">
            Effective Date: April 20, 2026
          </div>
        </div>
      </main>

      <footer className="w-full text-center p-10 text-slate-600 text-sm border-t border-white/5 mt-20">
        &copy; 2026 GitGraph. Designed for the Next Generation of Developers.
      </footer>
    </div>
  );
}

export default Privacy;

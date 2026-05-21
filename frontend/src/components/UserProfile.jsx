import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Github, Mail, ShieldCheck, ChevronDown, LayoutDashboard, Crown, Loader2 } from 'lucide-react';
import { authService } from '../api';

function UserProfile() {
  const [user, setUser] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUser();
    
    // Click outside to close
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUser = async () => {
    try {
      const data = await authService.me();
      setUser(data);
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  const [isUpgrading, setIsUpgrading] = useState(false);
  const handleUpgrade = async () => {
    if (!confirm('Upgrade to Pro plan? (30 days validity)')) return;
    setIsUpgrading(true);
    try {
      await authService.upgradeTier();
      alert('Congratulations! You are now a Pro member.');
      fetchUser();
    } catch (err) {
      console.error('Failed to upgrade:', err);
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleLogout = async () => {
    await authService.logout().catch(() => {});
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-4" ref={dropdownRef}>
      {/* Tier Badge / Upgrade Button */}
      {user.tier === 'pro' ? (
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-yellow-500/5">
          <Crown className="w-3 h-3" />
          Pro Member
        </div>
      ) : (
        <button
          onClick={handleUpgrade}
          disabled={isUpgrading}
          className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
        >
          {isUpgrading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3 h-3" />}
          Upgrade to Pro
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-1 rounded-full hover:bg-white/10 transition-all duration-300 border border-transparent hover:border-white/10"
        >
          <div className="relative">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-10 h-10 rounded-full border-2 border-blue-500/50 shadow-lg object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center border-2 border-white/20 shadow-lg">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></div>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 mt-3 w-72 glass-panel rounded-2xl shadow-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl z-[100] overflow-hidden animate-fade-in-up origin-top-right">
            <div className="p-5 border-b border-white/5 bg-gradient-to-br from-blue-600/10 to-transparent">
              <div className="flex items-center gap-4">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-14 h-14 rounded-2xl border border-white/20 object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center border border-white/10">
                    <User className="w-8 h-8 text-blue-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white truncate text-lg">{user.name}</h4>
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="capitalize">{user.provider} account</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-2">
              <button
                onClick={() => {
                  navigate(`/${user.github_username || user.name}`);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <LayoutDashboard className="w-4 h-4 text-blue-400" />
                </div>
                <span className="font-bold text-sm">My Profile</span>
              </button>

              <div className="h-px bg-white/5 my-1 mx-2"></div>

              <div className="px-4 py-3 flex items-center gap-3 text-slate-300">
                <div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Email Address</p>
                  <p className="text-sm truncate font-medium text-slate-200">{user.email}</p>
                </div>
              </div>
              
              {user.provider === 'github' && (
                <div className="px-4 py-3 flex items-center gap-3 text-slate-300">
                  <div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center shrink-0">
                    <Github className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Provider</p>
                    <p className="text-sm truncate font-medium text-slate-200">GitHub Verified</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-2 border-t border-white/5 bg-slate-950/30">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="font-bold">Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfile;

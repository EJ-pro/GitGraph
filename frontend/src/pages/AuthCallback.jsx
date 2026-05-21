import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authService } from '../api';

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // 쿠키는 백엔드 리다이렉트 시 자동 설정됨 — /auth/me로 유저 확인
    authService.me()
      .then(user => {
        const username = user.github_username || user.name;
        navigate(`/${username}/analysis`);
      })
      .catch(() => {
        navigate('/login');
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
      <h2 className="text-xl font-bold text-slate-800">Signing in...</h2>
      <p className="text-slate-500 mt-2">Please wait a moment.</p>
    </div>
  );
}

export default AuthCallback;

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authService } from '../api';

function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('token', token);
      
      // 사용자 정보를 가져와서 해당 유저의 메인으로 이동
      authService.me()
      .then(user => {
        const username = user.github_username || user.name;
        navigate(`/${username}/analysis`);
      })
      .catch(() => {
        navigate('/');
      });
    } else {
      alert("Authentication failed. Please try again.");
      navigate('/login');
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
      <h2 className="text-xl font-bold text-slate-800">Signing in...</h2>
      <p className="text-slate-500 mt-2">Please wait a moment.</p>
    </div>
  );
}

export default AuthCallback;

import { useState, useEffect } from 'react';
import { AuthHeader } from '../../components/auth/AuthHeader';
import { AuthFooter } from '../../components/auth/AuthFooter';
import { LoginForm } from '../../components/auth/LoginForm';
import { ResetPasswordForm } from '../../components/auth/ResetPasswordForm';
import { RequestAccessForm } from '../../components/auth/RequestAccessForm';

interface Props {
  onLogin?: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [view, setView] = useState<'login' | 'reset' | 'request'>('login');
  
  // Theme state initialization 
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false; // Safest default for enterprise
  });

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans transition-colors duration-200">
      <AuthHeader isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />
      
      <main className="flex-1 flex items-center justify-center p-4 w-full">
        <div className="w-full max-w-[420px]">
          {view === 'login' && <LoginForm setView={setView} onLogin={onLogin} />}
          {view === 'reset' && <ResetPasswordForm setView={setView} />}
          {view === 'request' && <RequestAccessForm setView={setView} />}
        </div>
      </main>
      
      <AuthFooter />
    </div>
  );
}

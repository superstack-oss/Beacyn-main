import { useState } from 'react';
import { User, Lock, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { apiUrl } from '../../lib/api';
import { setStoredUser } from '../../lib/auth';

interface Props {
  setView: (view: 'login' | 'reset' | 'request') => void;
  onLogin?: () => void;
}

export function LoginForm({ setView, onLogin }: Props) {
  const [username, setUsername] = useState('root@beacyn.com');
  const [password, setPassword] = useState('Root@Beacyn#26');
  const [error, setError] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPendingMessage('');
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'pending_approval') {
          setPendingMessage(data?.error || 'Your registration is pending admin approval.');
          return;
        }
        if (data?.code === 'suspended') {
          setPendingMessage(data?.error || 'Your account has been suspended. Contact an administrator.');
          return;
        }
        setError(data?.error || 'Invalid username or password');
        return;
      }
      setStoredUser({ username: data.username, role: data.role, token: data.token });
      onLogin?.();
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold">Sign in to Beacyn</CardTitle>
        <CardDescription>Please enter your details to continue.</CardDescription>
      </CardHeader>
      
      <CardContent>
        <form className="space-y-4" onSubmit={handleLogin}>
          {pendingMessage && (
            <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm p-3 rounded-md border border-amber-200 dark:border-amber-800/50">
              {pendingMessage}
            </div>
          )}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-md border border-red-200 dark:border-red-800/50">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Email or Employee ID</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-zinc-400" />
              </div>
              <Input 
                id="username"
                type="text" 
                className="pl-9 bg-transparent"
                placeholder="you@company.com or EMP-12345"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline underline-offset-4 transition-colors"
                onClick={() => setView('reset')}
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-zinc-400" />
              </div>
              <Input 
                id="password"
                type="password" 
                className="pl-9 bg-transparent"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          
          <div className="pt-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</> : 'Sign In'}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center">
        <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Need access?{' '}
          <button
            type="button"
            className="font-medium text-zinc-900 dark:text-zinc-50 hover:underline underline-offset-4"
            onClick={() => setView('request')}
          >
            Request Access
          </button>
        </div>
      </CardFooter>
    </Card>
  );
}


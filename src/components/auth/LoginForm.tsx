import { useState } from 'react';
import { User, Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';

interface Props {
  setView: (view: 'login' | 'reset' | 'request') => void;
  onLogin?: () => void;
}

export function LoginForm({ setView, onLogin }: Props) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      setError('');
      onLogin?.();
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <Card className="w-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold">Sign in to PulseIQ</CardTitle>
        <CardDescription>Please enter your details to continue.</CardDescription>
      </CardHeader>
      
      <CardContent>
        <form className="space-y-4" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-md border border-red-200 dark:border-red-800/50">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-zinc-400" />
              </div>
              <Input 
                id="username"
                type="text" 
                className="pl-9 bg-transparent"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Button 
                variant="link" 
                type="button"
                className="px-0 py-0 h-auto text-xs font-medium text-zinc-600 dark:text-zinc-400"
                onClick={() => setView('reset')}
              >
                Forgot password?
              </Button>
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
              />
            </div>
          </div>
          
          <div className="pt-4">
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center">
        <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Need access?{' '}
          <Button 
            variant="link" 
            type="button"
            className="px-0 py-0 h-auto font-medium text-zinc-900 dark:text-zinc-50"
            onClick={() => setView('request')}
          >
            Request Access
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

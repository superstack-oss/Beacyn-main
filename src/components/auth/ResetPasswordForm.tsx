import { Mail, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';

interface Props {
  setView: (view: 'login' | 'reset' | 'request') => void;
}

export function ResetPasswordForm({ setView }: Props) {
  return (
    <Card className="w-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold">Reset Password</CardTitle>
        <CardDescription>Enter your email to receive recovery instructions.</CardDescription>
      </CardHeader>
      
      <CardContent>
        <form className="space-y-4" onSubmit={e => e.preventDefault()}>
          <div className="space-y-2">
            <Label htmlFor="email-reset">Email address</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-zinc-400" />
              </div>
              <Input 
                id="email-reset"
                type="email" 
                className="pl-9 bg-transparent"
                placeholder="you@example.com"
              />
            </div>
          </div>
          
          <div className="pt-4">
            <Button className="w-full">
              Send Reset Link
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center">
        <div className="text-center">
          <Button 
            variant="ghost" 
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400"
            onClick={() => setView('login')}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

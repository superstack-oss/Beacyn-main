import { User, Mail, Briefcase, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';

interface Props {
  setView: (view: 'login' | 'reset' | 'request') => void;
}

export function RequestAccessForm({ setView }: Props) {
  return (
    <Card className="w-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold">Request Access</CardTitle>
        <CardDescription>Fill out the form below to request an account.</CardDescription>
      </CardHeader>
      
      <CardContent>
        <form className="space-y-4" onSubmit={e => e.preventDefault()}>
          <div className="space-y-2">
            <Label htmlFor="req-name">Full Name</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-zinc-400" />
              </div>
              <Input 
                id="req-name"
                type="text" 
                className="pl-9 bg-transparent"
                placeholder="John Doe"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="req-email">Work Email</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-zinc-400" />
              </div>
              <Input 
                id="req-email"
                type="email" 
                className="pl-9 bg-transparent"
                placeholder="john@company.com"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="req-company">Company</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Briefcase className="h-4 w-4 text-zinc-400" />
              </div>
              <Input 
                id="req-company"
                type="text" 
                className="pl-9 bg-transparent"
                placeholder="Company Name"
              />
            </div>
          </div>
          
          <div className="pt-4">
            <Button className="w-full">
              Submit Request
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

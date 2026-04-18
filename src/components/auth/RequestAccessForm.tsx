import { useMemo, useState } from 'react';
import { User, Mail, Briefcase, ArrowLeft, Phone, BadgeCheck, Users, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { apiUrl } from '../../lib/api';

interface Props {
  setView: (view: 'login' | 'reset' | 'request') => void;
}

export function RequestAccessForm({ setView }: Props) {
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [company, setCompany] = useState('');
  const [roleType, setRoleType] = useState('staff');
  const [team, setTeam] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const passwordChecks = useMemo(() => {
    return {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
      match: password.length > 0 && confirmPassword.length > 0 && password === confirmPassword,
    };
  }, [password, confirmPassword]);

  const passwordValid = passwordChecks.length
    && passwordChecks.upper
    && passwordChecks.lower
    && passwordChecks.number
    && passwordChecks.special;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (!passwordValid) {
      setError('Password policy is not satisfied.');
      return;
    }
    if (!passwordChecks.match) {
      setError('Passwords do not match.');
      return;
    }
    if (!team) {
      setError('Please select a team.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          employeeId,
          contactNumber,
          email,
          password,
          confirmPassword,
          company,
          roleType,
          team,
          managerName,
          managerEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Registration failed.');
        return;
      }
      setSuccessMessage(data?.message || 'Registration submitted. Waiting for admin approval.');
      setFullName('');
      setEmployeeId('');
      setContactNumber('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setCompany('');
      setRoleType('staff');
      setTeam('');
      setManagerName('');
      setManagerEmail('');
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold">Create Account Request</CardTitle>
        <CardDescription>Submit your details. An admin must approve before you can log in.</CardDescription>
      </CardHeader>
      
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-md border border-red-200 dark:border-red-800/50">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm p-3 rounded-md border border-emerald-200 dark:border-emerald-800/50 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}
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
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-employee-id">Employee ID</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <BadgeCheck className="h-4 w-4 text-zinc-400" />
              </div>
              <Input
                id="req-employee-id"
                type="text"
                className="pl-9 bg-transparent"
                placeholder="EMP-12345"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-contact">Contact Number</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-4 w-4 text-zinc-400" />
              </div>
              <Input
                id="req-contact"
                type="tel"
                className="pl-9 bg-transparent"
                placeholder="+1 555 0100"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                required
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-password">Password</Label>
            <Input
              id="req-password"
              type="password"
              className="bg-transparent"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-1 text-xs">
              <p className={passwordChecks.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}>At least 8 characters</p>
              <p className={passwordChecks.upper ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}>One uppercase letter</p>
              <p className={passwordChecks.lower ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}>One lowercase letter</p>
              <p className={passwordChecks.number ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}>One number</p>
              <p className={passwordChecks.special ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}>One special character</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-confirm-password">Confirm Password</Label>
            <Input
              id="req-confirm-password"
              type="password"
              className="bg-transparent"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {confirmPassword.length > 0 && (
              <p className={`text-xs ${passwordChecks.match ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {passwordChecks.match ? 'Passwords match' : 'Passwords do not match'}
              </p>
            )}
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
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role Type</Label>
            <Select value={roleType} onValueChange={setRoleType}>
              <SelectTrigger className="bg-transparent">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="superuser">Super-user</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Team</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Users className="h-4 w-4 text-zinc-400" />
              </div>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="pl-9 bg-transparent">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Storage Team">Storage Team</SelectItem>
                  <SelectItem value="Platform Team">Platform Team</SelectItem>
                  <SelectItem value="Database Team">Database Team</SelectItem>
                  <SelectItem value="Network Team">Network Team</SelectItem>
                  <SelectItem value="Incident Manager">Incident Manager</SelectItem>
                  <SelectItem value="Stakeholders">Stakeholders</SelectItem>
                  <SelectItem value="Monitoring Team">Monitoring Team</SelectItem>
                  <SelectItem value="Application Team">Application Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-manager-name">Manager Name</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <ShieldAlert className="h-4 w-4 text-zinc-400" />
              </div>
              <Input
                id="req-manager-name"
                type="text"
                className="pl-9 bg-transparent"
                placeholder="Manager Name"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-manager-email">Manager Email</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-zinc-400" />
              </div>
              <Input
                id="req-manager-email"
                type="email"
                className="pl-9 bg-transparent"
                placeholder="manager@company.com"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="pt-4">
            <Button className="w-full" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Registration'}
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

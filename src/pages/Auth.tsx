import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Eye, EyeOff, Mail, Lock, User, ArrowRight, Sparkles, Shield, Zap } from 'lucide-react';

const emailSchema = z.string().trim().email('Please enter a valid email address').max(255);
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters').max(100);
const displayNameSchema = z.string().trim().min(1, 'Display name is required').max(50);

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, signIn, signUp, resetPassword, loading } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<AuthMode>(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'signup') return 'signup';
    if (urlMode === 'forgot') return 'forgot';
    if (urlMode === 'reset') return 'reset';
    return 'login';
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; displayName?: string }>({});

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const validateForm = (): boolean => {
    const newErrors: { email?: string; password?: string; displayName?: string } = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    if (mode !== 'forgot') {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) {
        newErrors.password = passwordResult.error.errors[0].message;
      }
    }

    if (mode === 'signup') {
      const displayNameResult = displayNameSchema.safeParse(displayName);
      if (!displayNameResult.success) {
        newErrors.displayName = displayNameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          toast({
            title: 'Login failed',
            description: error.message.includes('Invalid login credentials') 
              ? 'Invalid email or password. Please try again.'
              : error.message,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Welcome back!', description: 'You have successfully logged in.' });
          navigate('/');
        }
      } else if (mode === 'signup') {
        const { error } = await signUp(email.trim(), password, displayName.trim());
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: 'Account exists',
              description: 'This email is already registered. Please log in instead.',
              variant: 'destructive',
            });
            setMode('login');
          } else {
            toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
          }
        } else {
          toast({ title: 'Account created!', description: 'Welcome to the community.' });
          navigate('/');
        }
      } else if (mode === 'forgot') {
        const { error } = await resetPassword(email.trim());
        if (error) {
          toast({ title: 'Reset failed', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Check your email', description: 'Password reset instructions have been sent.' });
          setMode('login');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background bg-dots">
        <div className="relative animate-fade-in">
          <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
            <MessageCircle className="h-8 w-8 text-primary-foreground animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const features = [
    { icon: Shield, title: 'Secure', desc: 'End-to-end encryption' },
    { icon: Zap, title: 'Fast', desc: 'Real-time messaging' },
    { icon: Sparkles, title: 'Smart', desc: 'Group collaboration' },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10" />
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-foreground/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary-foreground/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16 w-full">
          <div className="max-w-lg">
            {/* Logo */}
            <div className="flex items-center gap-4 mb-12">
              <div className="h-14 w-14 rounded-2xl bg-primary-foreground/20 flex items-center justify-center backdrop-blur-sm border border-primary-foreground/10">
                <MessageCircle className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary-foreground">ChatConnect</h1>
                <p className="text-primary-foreground/60 text-sm">Secure team messaging</p>
              </div>
            </div>
            
            {/* Headline */}
            <h2 className="text-4xl xl:text-5xl font-bold text-primary-foreground leading-tight mb-6">
              Connect with your team,{' '}
              <span className="text-primary-foreground/70">anywhere, anytime</span>
            </h2>
            
            <p className="text-lg text-primary-foreground/80 mb-10 leading-relaxed">
              Experience seamless real-time communication with enterprise-grade security. 
              Built for teams who value privacy and productivity.
            </p>

            {/* Features */}
            <div className="grid grid-cols-3 gap-4">
              {features.map((feature) => (
                <div 
                  key={feature.title} 
                  className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10"
                >
                  <feature.icon className="h-6 w-6 text-primary-foreground mb-2" />
                  <p className="font-semibold text-primary-foreground text-sm">{feature.title}</p>
                  <p className="text-xs text-primary-foreground/60">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-dots">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <MessageCircle className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">ChatConnect</span>
          </div>

          <div className="glass-card rounded-2xl p-8 shadow-elevated border-gradient animate-scale-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">
                {mode === 'login' && 'Welcome back'}
                {mode === 'signup' && 'Create account'}
                {mode === 'forgot' && 'Reset password'}
                {mode === 'reset' && 'New password'}
              </h2>
              <p className="text-muted-foreground text-sm">
                {mode === 'login' && 'Sign in to continue to your messages'}
                {mode === 'signup' && 'Join the community today'}
                {mode === 'forgot' && "We'll send you reset instructions"}
                {mode === 'reset' && 'Enter your new password'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-sm font-medium">Display Name</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="John Doe"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="pl-10 h-12 rounded-xl input-premium"
                      autoComplete="name"
                    />
                  </div>
                  {errors.displayName && (
                    <p className="text-sm text-destructive">{errors.displayName}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 rounded-xl input-premium"
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              {mode !== 'forgot' && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 rounded-xl input-premium"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
              )}

              {mode === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl btn-send text-sm font-semibold gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
                    {mode === 'login' && 'Signing in...'}
                    {mode === 'signup' && 'Creating account...'}
                    {mode === 'forgot' && 'Sending...'}
                  </span>
                ) : (
                  <>
                    {mode === 'login' && 'Sign In'}
                    {mode === 'signup' && 'Create Account'}
                    {mode === 'forgot' && 'Send Reset Link'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-4 text-xs text-muted-foreground">or</span>
                </div>
              </div>

              <div className="text-center text-sm">
                {mode === 'login' && (
                  <span className="text-muted-foreground">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('signup')}
                      className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                      Sign up free
                    </button>
                  </span>
                )}
                {mode === 'signup' && (
                  <span className="text-muted-foreground">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                      Sign in
                    </button>
                  </span>
                )}
                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors"
                  >
                    ← Back to login
                  </button>
                )}
              </div>
            </form>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}

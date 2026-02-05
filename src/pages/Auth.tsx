import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Zap, Mail, Lock, User, Loader2, ArrowRight, 
  Gift, KeyRound, ArrowLeft, Send, CheckCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Background3D } from '@/components/Background3D';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { toast } from 'sonner';
import { isSignInWithEmailLink } from 'firebase/auth';
import { auth } from '@/integrations/firebase/config';

type AuthView = 'main' | 'forgot-password' | 'magic-link' | 'magic-link-sent';

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    user, 
    isLoading: authLoading, 
    signIn, 
    signUp, 
    resetPassword,
    sendMagicLink,
    completeMagicLinkSignIn,
    redeemCode 
  } = useFirebaseAuth();
  
  const [view, setView] = useState<AuthView>('main');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [magicLinkEmail, setMagicLinkEmail] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/');
    }
  }, [authLoading, user, navigate]);

  // Handle magic link sign-in
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const handleMagicLink = async () => {
        setIsLoading(true);
        const { error } = await completeMagicLinkSignIn();
        
        if (error) {
          toast.error(error);
        } else {
          toast.success('Successfully signed in!');
          navigate('/');
        }
        setIsLoading(false);
      };
      
      handleMagicLink();
    }
  }, [location]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter email and password');
      return;
    }
    
    setIsLoading(true);
    const { error } = await signIn(email, password);
    
    if (error) {
      toast.error(error);
    } else {
      toast.success('Welcome back!');
      navigate('/');
    }
    
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      toast.error('Username is required');
      return;
    }
    
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter email and password');
      return;
    }
    
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setIsLoading(true);
    const { error } = await signUp(email, password, username);
    
    if (error) {
      toast.error(error);
    } else {
      toast.success('Account created successfully!');
      navigate('/');
    }
    
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    
    setIsLoading(true);
    const { error } = await resetPassword(email);
    
    if (error) {
      toast.error(error);
    } else {
      toast.success('Password reset email sent! Check your inbox.');
      setView('main');
    }
    
    setIsLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!magicLinkEmail.trim()) {
      toast.error('Please enter your email');
      return;
    }
    
    setIsLoading(true);
    const { error } = await sendMagicLink(magicLinkEmail);
    
    if (error) {
      toast.error(error);
    } else {
      setView('magic-link-sent');
    }
    
    setIsLoading(false);
  };

  const handleRedeemCode = async () => {
    if (!code.trim()) {
      toast.error('Please enter a code');
      return;
    }
    
    if (!user) {
      toast.error('Please sign in first to redeem codes');
      return;
    }
    
    setIsLoading(true);
    const { error, services } = await redeemCode(code);
    
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Code redeemed! You now have access to: ${services?.join(', ')}`);
      setCode('');
    }
    
    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Forgot Password View
  if (view === 'forgot-password') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative">
        <Background3D />
        
        <div className="w-full max-w-md p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex p-4 rounded-2xl gradient-primary shadow-glow mb-4">
              <KeyRound className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-gradient">Reset Password</h1>
            <p className="text-muted-foreground mt-2">Enter your email to receive a reset link</p>
          </div>
          
          <div className="glass-card p-6 rounded-2xl">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full gradient-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Send Reset Link
                    <Send className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
              
              <Button 
                type="button"
                variant="ghost" 
                className="w-full"
                onClick={() => setView('main')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Magic Link View
  if (view === 'magic-link') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative">
        <Background3D />
        
        <div className="w-full max-w-md p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex p-4 rounded-2xl gradient-primary shadow-glow mb-4">
              <Mail className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-gradient">Magic Link</h1>
            <p className="text-muted-foreground mt-2">Sign in with a link sent to your email</p>
          </div>
          
          <div className="glass-card p-6 rounded-2xl">
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="magic-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@example.com"
                    value={magicLinkEmail}
                    onChange={(e) => setMagicLinkEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full gradient-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Send Magic Link
                    <Send className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
              
              <Button 
                type="button"
                variant="ghost" 
                className="w-full"
                onClick={() => setView('main')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Magic Link Sent View
  if (view === 'magic-link-sent') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative">
        <Background3D />
        
        <div className="w-full max-w-md p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex p-4 rounded-2xl bg-success/20 mb-4">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h1 className="text-3xl font-bold text-gradient">Check Your Email</h1>
            <p className="text-muted-foreground mt-2">
              We sent a magic link to <strong>{magicLinkEmail}</strong>
            </p>
          </div>
          
          <div className="glass-card p-6 rounded-2xl text-center">
            <p className="text-muted-foreground mb-4">
              Click the link in the email to sign in. The link will expire in 1 hour.
            </p>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                setMagicLinkEmail('');
                setView('main');
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Main Auth View
  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative">
      <Background3D />
      
      <div className="w-full max-w-md p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex p-4 rounded-2xl gradient-primary shadow-glow mb-4">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-gradient">Code Checker</h1>
          <p className="text-muted-foreground mt-2">Sign in to access all features</p>
        </div>
        
        <div className="glass-card p-6 rounded-2xl">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <Button 
                    type="button" 
                    variant="link" 
                    className="p-0 h-auto text-primary"
                    onClick={() => setView('forgot-password')}
                  >
                    Forgot password?
                  </Button>
                  <Button 
                    type="button" 
                    variant="link" 
                    className="p-0 h-auto text-primary"
                    onClick={() => setView('magic-link')}
                  >
                    Sign in with link
                  </Button>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full gradient-primary"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-username"
                      type="text"
                      placeholder="cooluser123"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full gradient-primary"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          
          {user && (
            <div className="mt-6 pt-6 border-t border-border/50">
              <div className="space-y-2">
                <Label htmlFor="redeem-code">Have a redeem code?</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Gift className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="redeem-code"
                      type="text"
                      placeholder="XXXX-XXXX-XXXX"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="pl-10"
                    />
                  </div>
                  <Button 
                    onClick={handleRedeemCode}
                    variant="secondary"
                    disabled={isLoading}
                  >
                    Redeem
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

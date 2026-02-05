 import { useState } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { Zap, Mail, Lock, User, Loader2, ArrowRight, Gift } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { Background3D } from '@/components/Background3D';
 import { useAuth } from '@/hooks/useAuth';
 import { toast } from 'sonner';
 
 export default function Auth() {
   const navigate = useNavigate();
   const { signIn, signUp, redeemCode } = useAuth();
   
   const [isLoading, setIsLoading] = useState(false);
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [username, setUsername] = useState('');
   const [code, setCode] = useState('');
 
   const handleSignIn = async (e: React.FormEvent) => {
     e.preventDefault();
     setIsLoading(true);
     
     const { error } = await signIn(email, password);
     
     if (error) {
       toast.error(error.message);
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
     
     setIsLoading(true);
     
     const { error } = await signUp(email, password, username);
     
     if (error) {
       toast.error(error.message);
     } else {
       toast.success('Account created! Please check your email to verify.');
     }
     
     setIsLoading(false);
   };
 
   const handleRedeemCode = async () => {
     if (!code.trim()) {
       toast.error('Please enter a code');
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
         </div>
       </div>
     </div>
   );
 }
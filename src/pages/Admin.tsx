 import { useState, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { 
   Shield, Users, Gift, History, Plus, Trash2, 
   ToggleLeft, ToggleRight, Copy, Loader2, ArrowLeft,
   CheckCircle, XCircle
 } from 'lucide-react';
 import { Header } from '@/components/Header';
 import { Background3D } from '@/components/Background3D';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { Checkbox } from '@/components/ui/checkbox';
 import { useAuth } from '@/hooks/useAuth';
 import { supabase } from '@/integrations/supabase/client';
 import { toast } from 'sonner';
 
 interface RedeemCode {
   id: string;
   code: string;
   services: string[];
   max_uses: number;
   current_uses: number;
   is_active: boolean;
   expires_at: string | null;
   created_at: string;
 }
 
 interface UserProfile {
   id: string;
   user_id: string;
   username: string;
   email: string;
   created_at: string;
   user_roles: { role: string }[];
   user_services: { service: string; expires_at: string | null }[];
 }
 
 interface CheckHistory {
   id: string;
   username: string;
   service: string;
   input_count: number;
   stats: any;
   created_at: string;
 }
 
 const ALL_SERVICES = [
   'codes_checker',
   'wlid_claimer', 
   'xbox_fetcher',
   'manus_checker',
   'hotmail_validator',
 ];
 
 export default function Admin() {
   const navigate = useNavigate();
   const { user, isAdmin, isLoading: authLoading, session } = useAuth();
   
   const [isLoading, setIsLoading] = useState(false);
   const [codes, setCodes] = useState<RedeemCode[]>([]);
   const [users, setUsers] = useState<UserProfile[]>([]);
   const [history, setHistory] = useState<CheckHistory[]>([]);
   
   // New code form
   const [newCodeServices, setNewCodeServices] = useState<string[]>([]);
   const [newCodeMaxUses, setNewCodeMaxUses] = useState(1);
 
   useEffect(() => {
     if (!authLoading && (!user || !isAdmin)) {
       navigate('/');
       return;
     }
     
     if (isAdmin && session) {
       fetchData();
     }
   }, [authLoading, user, isAdmin, session]);
 
   const fetchData = async () => {
     setIsLoading(true);
     try {
       const token = session?.access_token;
       if (!token) return;
 
       // Fetch codes
       const codesRes = await supabase.functions.invoke('admin', {
         body: { action: 'list_codes' },
       });
       if (codesRes.data?.codes) setCodes(codesRes.data.codes);
 
       // Fetch users
       const usersRes = await supabase.functions.invoke('admin', {
         body: { action: 'list_users' },
       });
       if (usersRes.data?.users) setUsers(usersRes.data.users);
 
       // Fetch history
       const historyRes = await supabase.functions.invoke('admin', {
         body: { action: 'list_history' },
       });
       if (historyRes.data?.history) setHistory(historyRes.data.history);
 
     } catch (e) {
       console.error('Error fetching data:', e);
       toast.error('Failed to load data');
     }
     setIsLoading(false);
   };
 
   const generateCode = async () => {
     if (newCodeServices.length === 0) {
       toast.error('Select at least one service');
       return;
     }
 
     setIsLoading(true);
     try {
       const { data, error } = await supabase.functions.invoke('admin', {
         body: { 
           action: 'generate_code',
           services: newCodeServices,
           maxUses: newCodeMaxUses,
         },
       });
 
       if (error || data.error) {
         toast.error(data?.error || error?.message);
       } else {
         toast.success(`Code generated: ${data.code.code}`);
         setCodes([data.code, ...codes]);
         setNewCodeServices([]);
         setNewCodeMaxUses(1);
       }
     } catch (e) {
       toast.error('Failed to generate code');
     }
     setIsLoading(false);
   };
 
   const toggleCode = async (codeId: string, isActive: boolean) => {
     try {
       await supabase.functions.invoke('admin', {
         body: { action: 'toggle_code', codeId, isActive },
       });
       setCodes(codes.map(c => c.id === codeId ? { ...c, is_active: isActive } : c));
       toast.success(isActive ? 'Code activated' : 'Code deactivated');
     } catch (e) {
       toast.error('Failed to toggle code');
     }
   };
 
   const deleteCode = async (codeId: string) => {
     if (!confirm('Delete this code?')) return;
     
     try {
       await supabase.functions.invoke('admin', {
         body: { action: 'delete_code', codeId },
       });
       setCodes(codes.filter(c => c.id !== codeId));
       toast.success('Code deleted');
     } catch (e) {
       toast.error('Failed to delete code');
     }
   };
 
   const copyCode = (code: string) => {
     navigator.clipboard.writeText(code);
     toast.success('Code copied!');
   };
 
   const toggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
     try {
       await supabase.functions.invoke('admin', {
         body: { action: 'set_admin', userId, isAdmin: !isCurrentlyAdmin },
       });
       fetchData();
       toast.success(isCurrentlyAdmin ? 'Admin removed' : 'Admin granted');
     } catch (e) {
       toast.error('Failed to update admin status');
     }
   };
 
   if (authLoading) {
     return (
       <div className="min-h-screen bg-background flex items-center justify-center">
         <Loader2 className="w-8 h-8 animate-spin text-primary" />
       </div>
     );
   }
 
   return (
     <div className="min-h-screen bg-background flex flex-col relative">
       <Background3D />
       <Header username={user?.email || 'Admin'} onLogout={() => navigate('/')} />
       
       <main className="flex-1 container mx-auto px-4 py-8 space-y-8 relative z-10">
         <div className="flex items-center gap-4 mb-6">
           <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
             <ArrowLeft className="w-4 h-4 mr-2" />
             Back
           </Button>
           <div className="flex items-center gap-2">
             <Shield className="w-6 h-6 text-primary" />
             <h1 className="text-2xl font-bold">Admin Panel</h1>
           </div>
         </div>
 
         <Tabs defaultValue="codes" className="w-full">
           <TabsList className="grid w-full max-w-lg grid-cols-3 glass-card mb-8">
             <TabsTrigger value="codes">
               <Gift className="w-4 h-4 mr-2" />
               Codes
             </TabsTrigger>
             <TabsTrigger value="users">
               <Users className="w-4 h-4 mr-2" />
               Users
             </TabsTrigger>
             <TabsTrigger value="history">
               <History className="w-4 h-4 mr-2" />
               History
             </TabsTrigger>
           </TabsList>
 
           <TabsContent value="codes" className="space-y-6">
             {/* Generate New Code */}
             <div className="glass-card p-6 rounded-xl">
               <h3 className="font-semibold mb-4 flex items-center gap-2">
                 <Plus className="w-5 h-5" />
                 Generate New Code
               </h3>
               
               <div className="grid md:grid-cols-2 gap-4 mb-4">
                 <div className="space-y-2">
                   <Label>Services</Label>
                   <div className="space-y-2">
                     {ALL_SERVICES.map(service => (
                       <div key={service} className="flex items-center gap-2">
                         <Checkbox
                           id={service}
                           checked={newCodeServices.includes(service)}
                           onCheckedChange={(checked) => {
                             if (checked) {
                               setNewCodeServices([...newCodeServices, service]);
                             } else {
                               setNewCodeServices(newCodeServices.filter(s => s !== service));
                             }
                           }}
                         />
                         <Label htmlFor={service} className="text-sm font-normal">
                           {service.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                         </Label>
                       </div>
                     ))}
                   </div>
                 </div>
                 
                 <div className="space-y-2">
                   <Label htmlFor="maxUses">Max Uses</Label>
                   <Input
                     id="maxUses"
                     type="number"
                     min={1}
                     value={newCodeMaxUses}
                     onChange={(e) => setNewCodeMaxUses(parseInt(e.target.value) || 1)}
                   />
                 </div>
               </div>
               
               <Button onClick={generateCode} disabled={isLoading} className="gradient-primary">
                 {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                 Generate Code
               </Button>
             </div>
 
             {/* Codes List */}
             <div className="glass-card p-6 rounded-xl">
               <h3 className="font-semibold mb-4">All Codes ({codes.length})</h3>
               
               <div className="space-y-3 max-h-[400px] overflow-auto">
                 {codes.map(code => (
                   <div 
                     key={code.id} 
                     className={`p-4 rounded-lg bg-secondary/30 border ${code.is_active ? 'border-success/30' : 'border-destructive/30'}`}
                   >
                     <div className="flex items-center justify-between flex-wrap gap-2">
                       <div className="flex items-center gap-3">
                         <code className="font-mono text-lg font-bold">{code.code}</code>
                         <Button variant="ghost" size="sm" onClick={() => copyCode(code.code)}>
                           <Copy className="w-4 h-4" />
                         </Button>
                       </div>
                       
                       <div className="flex items-center gap-2">
                         <span className="text-sm text-muted-foreground">
                           {code.current_uses}/{code.max_uses} uses
                         </span>
                         <Button 
                           variant="ghost" 
                           size="sm"
                           onClick={() => toggleCode(code.id, !code.is_active)}
                         >
                           {code.is_active ? 
                             <ToggleRight className="w-5 h-5 text-success" /> : 
                             <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                           }
                         </Button>
                         <Button 
                           variant="ghost" 
                           size="sm"
                           onClick={() => deleteCode(code.id)}
                         >
                           <Trash2 className="w-4 h-4 text-destructive" />
                         </Button>
                       </div>
                     </div>
                     
                     <div className="mt-2 flex flex-wrap gap-1">
                       {code.services?.map(s => (
                         <span key={s} className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                           {s.replace(/_/g, ' ')}
                         </span>
                       ))}
                     </div>
                   </div>
                 ))}
                 
                 {codes.length === 0 && (
                   <p className="text-center text-muted-foreground py-8">No codes yet</p>
                 )}
               </div>
             </div>
           </TabsContent>
 
           <TabsContent value="users" className="space-y-6">
             <div className="glass-card p-6 rounded-xl">
               <h3 className="font-semibold mb-4">All Users ({users.length})</h3>
               
               <div className="space-y-3 max-h-[500px] overflow-auto">
                 {users.map(userProfile => {
                   const isUserAdmin = userProfile.user_roles?.some(r => r.role === 'admin');
                   
                   return (
                     <div key={userProfile.id} className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                       <div className="flex items-center justify-between flex-wrap gap-2">
                         <div>
                           <div className="font-medium">{userProfile.username}</div>
                           <div className="text-sm text-muted-foreground">{userProfile.email}</div>
                         </div>
                         
                         <div className="flex items-center gap-2">
                           {isUserAdmin && (
                             <span className="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                               Admin
                             </span>
                           )}
                           <Button 
                             variant="ghost" 
                             size="sm"
                             onClick={() => toggleAdmin(userProfile.user_id, isUserAdmin)}
                           >
                             {isUserAdmin ? 
                               <XCircle className="w-4 h-4 text-destructive" /> : 
                               <CheckCircle className="w-4 h-4 text-success" />
                             }
                           </Button>
                         </div>
                       </div>
                       
                       <div className="mt-2 flex flex-wrap gap-1">
                         {userProfile.user_services?.map(s => (
                           <span key={s.service} className="px-2 py-0.5 text-xs rounded-full bg-secondary text-foreground">
                             {s.service.replace(/_/g, ' ')}
                           </span>
                         ))}
                       </div>
                     </div>
                   );
                 })}
                 
                 {users.length === 0 && (
                   <p className="text-center text-muted-foreground py-8">No users yet</p>
                 )}
               </div>
             </div>
           </TabsContent>
 
           <TabsContent value="history" className="space-y-6">
             <div className="glass-card p-6 rounded-xl">
               <h3 className="font-semibold mb-4">Recent Activity ({history.length})</h3>
               
               <div className="space-y-3 max-h-[500px] overflow-auto">
                 {history.map(h => (
                   <div key={h.id} className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                     <div className="flex items-center justify-between flex-wrap gap-2">
                       <div>
                         <span className="font-medium">{h.username}</span>
                         <span className="mx-2 text-muted-foreground">•</span>
                         <span className="text-sm">{h.service?.replace(/_/g, ' ')}</span>
                       </div>
                       <div className="text-sm text-muted-foreground">
                         {new Date(h.created_at).toLocaleString()}
                       </div>
                     </div>
                     <div className="mt-1 text-sm text-muted-foreground">
                       Checked {h.input_count} items
                     </div>
                   </div>
                 ))}
                 
                 {history.length === 0 && (
                   <p className="text-center text-muted-foreground py-8">No history yet</p>
                 )}
               </div>
             </div>
           </TabsContent>
         </Tabs>
       </main>
     </div>
   );
 }
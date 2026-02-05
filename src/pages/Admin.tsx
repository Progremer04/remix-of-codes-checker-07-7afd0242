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
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { ref, set, get, push, remove, onValue } from 'firebase/database';
import { database } from '@/integrations/firebase/config';
import { toast } from 'sonner';

interface RedeemCode {
  id: string;
  code: string;
  services: string[];
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  services: string[];
  createdAt: string;
}

interface CheckHistoryItem {
  id: string;
  userId: string;
  username: string;
  service: string;
  inputCount: number;
  stats: any;
  createdAt: string;
}

const ALL_SERVICES = [
  'codes_checker',
  'wlid_claimer', 
  'xbox_fetcher',
  'manus_checker',
  'hotmail_validator',
  'psn_checker',
];

export default function Admin() {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading, userData } = useFirebaseAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [history, setHistory] = useState<CheckHistoryItem[]>([]);
  
  // New code form
  const [newCodeServices, setNewCodeServices] = useState<string[]>([]);
  const [newCodeMaxUses, setNewCodeMaxUses] = useState(1);
  const [newCodeExpiry, setNewCodeExpiry] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/');
      return;
    }
    
    if (isAdmin && user) {
      fetchData();
      subscribeToData();
    }
  }, [authLoading, user, isAdmin]);

  const subscribeToData = () => {
    // Subscribe to codes
    const codesRef = ref(database, 'redeemCodes');
    onValue(codesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const codesList: RedeemCode[] = Object.entries(data).map(([id, value]: [string, any]) => ({
          id,
          code: id,
          ...value
        }));
        setCodes(codesList.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      } else {
        setCodes([]);
      }
    });

    // Subscribe to users
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const usersList: UserProfile[] = Object.values(data);
        setUsers(usersList.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      } else {
        setUsers([]);
      }
    });

    // Subscribe to history
    const historyRef = ref(database, 'checkHistory');
    onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const historyList: CheckHistoryItem[] = Object.entries(data).map(([id, value]: [string, any]) => ({
          id,
          ...value
        }));
        setHistory(historyList.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ).slice(0, 100));
      } else {
        setHistory([]);
      }
    });
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Initial fetch is handled by subscriptions
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
      // Generate random code
      const code = Array.from({ length: 16 }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
      ).join('');
      
      const codeData: Omit<RedeemCode, 'id' | 'code'> = {
        services: newCodeServices,
        maxUses: newCodeMaxUses,
        currentUses: 0,
        isActive: true,
        expiresAt: newCodeExpiry || null,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || ''
      };
      
      await set(ref(database, `redeemCodes/${code}`), codeData);
      
      toast.success(`Code generated: ${code}`);
      setNewCodeServices([]);
      setNewCodeMaxUses(1);
      setNewCodeExpiry('');
      
      // Copy to clipboard
      navigator.clipboard.writeText(code);
      toast.success('Code copied to clipboard!');
      
    } catch (e) {
      console.error('Generate code error:', e);
      toast.error('Failed to generate code');
    }
    setIsLoading(false);
  };

  const toggleCode = async (codeId: string, isActive: boolean) => {
    try {
      await set(ref(database, `redeemCodes/${codeId}/isActive`), isActive);
      toast.success(isActive ? 'Code activated' : 'Code deactivated');
    } catch (e) {
      toast.error('Failed to toggle code');
    }
  };

  const deleteCode = async (codeId: string) => {
    if (!confirm('Delete this code?')) return;
    
    try {
      await remove(ref(database, `redeemCodes/${codeId}`));
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
      await set(ref(database, `users/${userId}/isAdmin`), !isCurrentlyAdmin);
      toast.success(isCurrentlyAdmin ? 'Admin removed' : 'Admin granted');
    } catch (e) {
      toast.error('Failed to update admin status');
    }
  };

  const grantService = async (userId: string, service: string) => {
    try {
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        const userData = snapshot.val();
        const currentServices = userData.services || [];
        
        if (!currentServices.includes(service)) {
          await set(ref(database, `users/${userId}/services`), [...currentServices, service]);
          toast.success(`Granted ${service} to user`);
        } else {
          // Remove service
          await set(ref(database, `users/${userId}/services`), currentServices.filter((s: string) => s !== service));
          toast.success(`Removed ${service} from user`);
        }
      }
    } catch (e) {
      toast.error('Failed to update services');
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
      <Header username={userData?.displayName || user?.email || 'Admin'} onLogout={() => navigate('/')} />
      
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
              
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Services</Label>
                  <div className="space-y-2 max-h-48 overflow-auto">
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
                
                <div className="space-y-2">
                  <Label htmlFor="expiry">Expiry Date (optional)</Label>
                  <Input
                    id="expiry"
                    type="datetime-local"
                    value={newCodeExpiry}
                    onChange={(e) => setNewCodeExpiry(e.target.value)}
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
                    className={`p-4 rounded-lg bg-secondary/30 border ${code.isActive ? 'border-success/30' : 'border-destructive/30'}`}
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
                          {code.currentUses}/{code.maxUses} uses
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => toggleCode(code.id, !code.isActive)}
                        >
                          {code.isActive ? 
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
                    
                    {code.expiresAt && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Expires: {new Date(code.expiresAt).toLocaleString()}
                      </div>
                    )}
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
                {users.map(userProfile => (
                  <div key={userProfile.uid} className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-medium">{userProfile.displayName}</div>
                        <div className="text-sm text-muted-foreground">{userProfile.email}</div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {userProfile.isAdmin && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                            Admin
                          </span>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => toggleAdmin(userProfile.uid, userProfile.isAdmin)}
                        >
                          {userProfile.isAdmin ? 
                            <XCircle className="w-4 h-4 text-destructive" /> : 
                            <CheckCircle className="w-4 h-4 text-success" />
                          }
                        </Button>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">Services:</Label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ALL_SERVICES.map(service => {
                          const hasService = userProfile.services?.includes(service);
                          return (
                            <button
                              key={service}
                              onClick={() => grantService(userProfile.uid, service)}
                              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                                hasService 
                                  ? 'bg-success/20 text-success hover:bg-success/30' 
                                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                              }`}
                            >
                              {service.replace(/_/g, ' ')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                
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
                        {new Date(h.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Checked {h.inputCount} items
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

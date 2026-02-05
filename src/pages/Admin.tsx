import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, Users, Gift, History, Plus, Trash2, 
  ToggleLeft, ToggleRight, Copy, Loader2, ArrowLeft,
  CheckCircle, XCircle, Download, Eye, Search, UserPlus,
  FileText, Filter, Bell, Send
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Background3D } from '@/components/Background3D';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { ref, set, get, push, remove, onValue } from 'firebase/database';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { database, auth } from '@/integrations/firebase/config';
import { toast } from 'sonner';
import { sendNotification } from '@/components/NotificationBell';

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
  oderId: string;
  userId: string;
  username: string;
  service: string;
  inputCount: number;
  stats: any;
  results: any[];
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

const SERVICE_LABELS: Record<string, string> = {
  codes_checker: 'Codes Checker',
  wlid_claimer: 'WLID Claimer',
  xbox_fetcher: 'Xbox Fetcher',
  manus_checker: 'Manus Checker',
  hotmail_validator: 'Hotmail Validator',
  psn_checker: 'PSN Checker',
};

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

  // New user form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserServices, setNewUserServices] = useState<string[]>([]);
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);

  // History filters
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistory, setSelectedHistory] = useState<CheckHistoryItem | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  // User search
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/');
      return;
    }
    
    if (isAdmin && user) {
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

    // Subscribe to history with full results
    const historyRef = ref(database, 'checkHistory');
    onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const historyList: CheckHistoryItem[] = [];
        
        for (const [oderId, item] of Object.entries(data)) {
          const historyItem = item as any;
          historyList.push({
            id: oderId,
            oderId: oderId,
            userId: historyItem.userId,
            username: historyItem.username || 'Unknown',
            service: historyItem.service,
            inputCount: historyItem.inputCount,
            stats: historyItem.stats,
            results: historyItem.results || [],
            createdAt: historyItem.createdAt
          });
        }
        
        setHistory(historyList.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      } else {
        setHistory([]);
      }
    });
  };

  const generateCode = async () => {
    if (newCodeServices.length === 0) {
      toast.error('Select at least one service');
      return;
    }

    setIsLoading(true);
    try {
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
          await set(ref(database, `users/${userId}/services`), currentServices.filter((s: string) => s !== service));
          toast.success(`Removed ${service} from user`);
        }
      }
    } catch (e) {
      toast.error('Failed to update services');
    }
  };

  const grantAllServices = async (userId: string) => {
    try {
      await set(ref(database, `users/${userId}/services`), ALL_SERVICES);
      toast.success('Granted all services');
    } catch (e) {
      toast.error('Failed to grant services');
    }
  };

  const removeAllServices = async (userId: string) => {
    try {
      await set(ref(database, `users/${userId}/services`), []);
      toast.success('Removed all services');
    } catch (e) {
      toast.error('Failed to remove services');
    }
  };

  const createUser = async () => {
    if (!newUserEmail || !newUserPassword || !newUserDisplayName) {
      toast.error('Please fill all required fields');
      return;
    }

    setIsCreatingUser(true);
    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, newUserEmail, newUserPassword);
      const newUser = userCredential.user;
      
      // Create user profile in Realtime Database
      await set(ref(database, `users/${newUser.uid}`), {
        uid: newUser.uid,
        email: newUserEmail,
        displayName: newUserDisplayName,
        isAdmin: newUserIsAdmin,
        services: newUserServices,
        createdAt: new Date().toISOString()
      });
      
      toast.success(`User ${newUserEmail} created successfully`);
      
      // Reset form
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserDisplayName('');
      setNewUserServices([]);
      setNewUserIsAdmin(false);
      setShowUserDialog(false);
      
    } catch (e: any) {
      console.error('Create user error:', e);
      if (e.code === 'auth/email-already-in-use') {
        toast.error('Email already in use');
      } else if (e.code === 'auth/weak-password') {
        toast.error('Password should be at least 6 characters');
      } else {
        toast.error(e.message || 'Failed to create user');
      }
    }
    setIsCreatingUser(false);
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user? This only removes their data, not their auth account.')) return;
    
    try {
      await remove(ref(database, `users/${userId}`));
      toast.success('User data deleted');
    } catch (e) {
      toast.error('Failed to delete user');
    }
  };

  const viewHistoryDetails = (item: CheckHistoryItem) => {
    setSelectedHistory(item);
    setShowHistoryDialog(true);
  };

  const exportResults = (item: CheckHistoryItem, type: 'all' | 'hits' | 'valid') => {
    if (!item.results || item.results.length === 0) {
      toast.error('No results to export');
      return;
    }

    let dataToExport: string[] = [];
    const serviceName = item.service;

    if (serviceName === 'codes_checker') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.code}|${r.status}${r.title ? `|${r.title}` : ''}`);
      } else if (type === 'valid' || type === 'hits') {
        dataToExport = item.results
          .filter(r => r.status === 'valid')
          .map(r => r.title ? `${r.code}|${r.title}` : r.code);
      }
    } else if (serviceName === 'xbox_fetcher') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.email}|${r.status}|${r.codes?.join(',') || ''}`);
      } else if (type === 'hits') {
        dataToExport = item.results
          .filter(r => r.status === 'success' && r.codes?.length > 0)
          .flatMap(r => r.codes);
      }
    } else if (serviceName === 'hotmail_validator') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.email}:${r.password}|${r.status}`);
      } else if (type === 'hits' || type === 'valid') {
        dataToExport = item.results
          .filter(r => r.status === 'valid' || r.psn?.status === 'HAS_ORDERS' || r.steam?.status === 'HAS_PURCHASES')
          .map(r => {
            let line = `${r.email}:${r.password}`;
            if (r.psn?.status === 'HAS_ORDERS') line += ` | PSN: ${r.psn.orders} orders`;
            if (r.steam?.status === 'HAS_PURCHASES') line += ` | Steam: ${r.steam.count}`;
            if (r.supercell?.status === 'LINKED') line += ` | Supercell: ${r.supercell.games?.join(',')}`;
            return line;
          });
      }
    } else if (serviceName === 'manus_checker') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.email}|${r.status}|${r.membership || ''}|Credits: ${r.totalCredits || 0}`);
      } else if (type === 'hits' || type === 'valid') {
        dataToExport = item.results
          .filter(r => r.status === 'success')
          .map(r => `${r.email}|${r.name}|${r.membership}|Credits: ${r.totalCredits}`);
      }
    } else if (serviceName === 'wlid_claimer') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.email}|${r.success ? 'SUCCESS' : 'FAILED'}|${r.token || r.error || ''}`);
      } else if (type === 'hits' || type === 'valid') {
        dataToExport = item.results
          .filter(r => r.success && r.token)
          .map(r => r.token);
      }
    } else {
      // Generic export
      dataToExport = item.results.map(r => JSON.stringify(r));
    }

    const blob = new Blob([dataToExport.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serviceName}_${type}_${new Date(item.createdAt).toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported successfully!');
  };

  const deleteHistory = async (historyId: string) => {
    if (!confirm('Delete this history entry?')) return;
    
    try {
      await remove(ref(database, `checkHistory/${historyId}`));
      toast.success('History deleted');
      setShowHistoryDialog(false);
    } catch (e) {
      toast.error('Failed to delete history');
    }
  };

  // Filter history
  const filteredHistory = history.filter(h => {
    const matchesFilter = historyFilter === 'all' || h.service === historyFilter;
    const matchesSearch = historySearch === '' || 
      h.username.toLowerCase().includes(historySearch.toLowerCase()) ||
      h.service.toLowerCase().includes(historySearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Filter users
  const filteredUsers = users.filter(u => {
    return userSearch === '' ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(userSearch.toLowerCase());
  });

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
          <TabsList className="grid w-full max-w-xl grid-cols-4 glass-card mb-8">
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
            <TabsTrigger value="hits">
              <FileText className="w-4 h-4 mr-2" />
              Hits
            </TabsTrigger>
          </TabsList>

          {/* Codes Tab */}
          <TabsContent value="codes" className="space-y-6">
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
                          {SERVICE_LABELS[service] || service}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => setNewCodeServices(ALL_SERVICES)}
                  >
                    Select All
                  </Button>
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
                          {SERVICE_LABELS[s] || s}
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

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
                <DialogTrigger asChild>
                  <Button className="gradient-primary">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Min 6 characters"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name *</Label>
                      <Input
                        id="displayName"
                        value={newUserDisplayName}
                        onChange={(e) => setNewUserDisplayName(e.target.value)}
                        placeholder="Username"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="isAdmin"
                        checked={newUserIsAdmin}
                        onCheckedChange={(checked) => setNewUserIsAdmin(checked as boolean)}
                      />
                      <Label htmlFor="isAdmin">Make Admin</Label>
                    </div>
                    <div className="space-y-2">
                      <Label>Services</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {ALL_SERVICES.map(service => (
                          <div key={service} className="flex items-center gap-2">
                            <Checkbox
                              id={`new-${service}`}
                              checked={newUserServices.includes(service)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewUserServices([...newUserServices, service]);
                                } else {
                                  setNewUserServices(newUserServices.filter(s => s !== service));
                                }
                              }}
                            />
                            <Label htmlFor={`new-${service}`} className="text-xs font-normal">
                              {SERVICE_LABELS[service] || service}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mt-2"
                        onClick={() => setNewUserServices(ALL_SERVICES)}
                      >
                        Select All Services
                      </Button>
                    </div>
                    <Button 
                      onClick={createUser} 
                      disabled={isCreatingUser} 
                      className="w-full gradient-primary"
                    >
                      {isCreatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="glass-card p-6 rounded-xl">
              <h3 className="font-semibold mb-4">All Users ({filteredUsers.length})</h3>
              
              <div className="space-y-3 max-h-[500px] overflow-auto">
                {filteredUsers.map(userProfile => (
                  <div key={userProfile.uid} className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-medium">{userProfile.displayName}</div>
                        <div className="text-sm text-muted-foreground">{userProfile.email}</div>
                        <div className="text-xs text-muted-foreground">
                          Joined: {new Date(userProfile.createdAt).toLocaleDateString()}
                        </div>
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
                          title={userProfile.isAdmin ? 'Remove Admin' : 'Make Admin'}
                        >
                          {userProfile.isAdmin ? 
                            <XCircle className="w-4 h-4 text-destructive" /> : 
                            <CheckCircle className="w-4 h-4 text-success" />
                          }
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteUser(userProfile.uid)}
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Services:</Label>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs"
                            onClick={() => grantAllServices(userProfile.uid)}
                          >
                            All
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs"
                            onClick={() => removeAllServices(userProfile.uid)}
                          >
                            None
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
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
                              {SERVICE_LABELS[service] || service}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                
                {filteredUsers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No users found</p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search history..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Select value={historyFilter} onValueChange={setHistoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {ALL_SERVICES.map(service => (
                    <SelectItem key={service} value={service}>
                      {SERVICE_LABELS[service] || service}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="glass-card p-6 rounded-xl">
              <h3 className="font-semibold mb-4">Recent Activity ({filteredHistory.length})</h3>
              
              <div className="space-y-3 max-h-[500px] overflow-auto">
                {filteredHistory.slice(0, 100).map(h => (
                  <div key={h.id} className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-medium">{h.username}</span>
                        <span className="mx-2 text-muted-foreground">•</span>
                        <span className="text-sm px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                          {SERVICE_LABELS[h.service] || h.service}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {new Date(h.createdAt).toLocaleString()}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => viewHistoryDetails(h)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteHistory(h.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Checked: <span className="font-medium text-foreground">{h.inputCount}</span> items
                      </span>
                      {h.stats && Object.entries(h.stats).map(([key, value]) => (
                        <span key={key} className="text-muted-foreground">
                          {key}: <span className="font-medium text-foreground">{String(value)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                
                {filteredHistory.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No history found</p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Hits Tab - Detailed Results View */}
          <TabsContent value="hits" className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <Select value={historyFilter} onValueChange={setHistoryFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {ALL_SERVICES.map(service => (
                    <SelectItem key={service} value={service}>
                      {SERVICE_LABELS[service] || service}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="glass-card p-6 rounded-xl">
              <h3 className="font-semibold mb-4">All Hits & Results</h3>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.slice(0, 50).map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.username}</TableCell>
                      <TableCell>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                          {SERVICE_LABELS[h.service] || h.service}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{h.inputCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {h.stats && Object.entries(h.stats).slice(0, 3).map(([key, value]) => (
                            <span key={key} className="text-xs px-1.5 py-0.5 rounded bg-secondary">
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => viewHistoryDetails(h)}
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => exportResults(h, 'hits')}
                            title="Export Hits"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredHistory.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No hits found</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* History Details Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Check Results - {selectedHistory?.username}</DialogTitle>
          </DialogHeader>
          
          {selectedHistory && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Service:</span>{' '}
                  <span className="font-medium">{SERVICE_LABELS[selectedHistory.service] || selectedHistory.service}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>{' '}
                  <span className="font-medium">{new Date(selectedHistory.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Items:</span>{' '}
                  <span className="font-medium">{selectedHistory.inputCount}</span>
                </div>
              </div>

              {selectedHistory.stats && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedHistory.stats).map(([key, value]) => (
                    <span key={key} className="px-3 py-1 rounded-full bg-secondary text-sm">
                      {key}: <span className="font-bold">{String(value)}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportResults(selectedHistory, 'all')}>
                  <Download className="w-4 h-4 mr-2" />
                  Export All
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportResults(selectedHistory, 'hits')}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Hits Only
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => deleteHistory(selectedHistory.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>

              <div className="border rounded-lg max-h-[400px] overflow-auto">
                {selectedHistory.results && selectedHistory.results.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {selectedHistory.service === 'codes_checker' && (
                          <>
                            <TableHead>Code</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Title</TableHead>
                          </>
                        )}
                        {selectedHistory.service === 'xbox_fetcher' && (
                          <>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Codes</TableHead>
                          </>
                        )}
                        {selectedHistory.service === 'hotmail_validator' && (
                          <>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>PSN</TableHead>
                            <TableHead>Steam</TableHead>
                          </>
                        )}
                        {selectedHistory.service === 'manus_checker' && (
                          <>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Membership</TableHead>
                            <TableHead>Credits</TableHead>
                          </>
                        )}
                        {selectedHistory.service === 'wlid_claimer' && (
                          <>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Token/Error</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedHistory.results.slice(0, 100).map((r, i) => (
                        <TableRow key={i}>
                          {selectedHistory.service === 'codes_checker' && (
                            <>
                              <TableCell className="font-mono text-xs">{r.code}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  r.status === 'valid' ? 'bg-success/20 text-success' :
                                  r.status === 'used' ? 'bg-warning/20 text-warning' :
                                  'bg-destructive/20 text-destructive'
                                }`}>
                                  {r.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">{r.title || '-'}</TableCell>
                            </>
                          )}
                          {selectedHistory.service === 'xbox_fetcher' && (
                            <>
                              <TableCell className="text-xs">{r.email}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  r.status === 'success' ? 'bg-success/20 text-success' :
                                  'bg-destructive/20 text-destructive'
                                }`}>
                                  {r.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {r.codes?.join(', ') || '-'}
                              </TableCell>
                            </>
                          )}
                          {selectedHistory.service === 'hotmail_validator' && (
                            <>
                              <TableCell className="text-xs">{r.email}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  r.status === 'valid' ? 'bg-success/20 text-success' :
                                  'bg-destructive/20 text-destructive'
                                }`}>
                                  {r.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.psn?.status === 'HAS_ORDERS' ? `${r.psn.orders} orders` : '-'}
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.steam?.status === 'HAS_PURCHASES' ? `${r.steam.count}` : '-'}
                              </TableCell>
                            </>
                          )}
                          {selectedHistory.service === 'manus_checker' && (
                            <>
                              <TableCell className="text-xs">{r.email}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  r.status === 'success' ? 'bg-success/20 text-success' :
                                  'bg-destructive/20 text-destructive'
                                }`}>
                                  {r.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">{r.membership || '-'}</TableCell>
                              <TableCell className="text-xs">{r.totalCredits || '-'}</TableCell>
                            </>
                          )}
                          {selectedHistory.service === 'wlid_claimer' && (
                            <>
                              <TableCell className="text-xs">{r.email}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  r.success ? 'bg-success/20 text-success' :
                                  'bg-destructive/20 text-destructive'
                                }`}>
                                  {r.success ? 'SUCCESS' : 'FAILED'}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs font-mono truncate max-w-[200px]">
                                {r.token || r.error || '-'}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No detailed results available</p>
                )}
              </div>
              
              {selectedHistory.results && selectedHistory.results.length > 100 && (
                <p className="text-sm text-muted-foreground text-center">
                  Showing first 100 of {selectedHistory.results.length} results. Export for full data.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

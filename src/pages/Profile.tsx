import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Mail, Calendar, Clock, Package, Shield, 
  ArrowLeft, Key, CheckCircle, XCircle, Edit2, Save, X
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/Header';
import { Background3D } from '@/components/Background3D';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { ref, update, onValue } from 'firebase/database';
import { database } from '@/integrations/firebase/config';
import { toast } from 'sonner';
import { LiveChat } from '@/components/LiveChat';

interface ServiceExpiry {
  service: string;
  expiresAt?: string;
  grantedAt?: string;
}

const SERVICE_LABELS: Record<string, string> = {
  codes_checker: 'Codes Checker',
  wlid_claimer: 'WLID Claimer',
  xbox_fetcher: 'Xbox Fetcher',
  manus_checker: 'Manus Checker',
  hotmail_validator: 'Hotmail Validator',
  psn_checker: 'PSN Checker',
};

export default function Profile() {
  const navigate = useNavigate();
  const { user, userData, userServices, isLoading: authLoading, signOut } = useFirebaseAuth();
  const [serviceExpiries, setServiceExpiries] = useState<ServiceExpiry[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    if (userData) {
      setDisplayName(userData.displayName || '');
    }
  }, [authLoading, user, userData]);

  useEffect(() => {
    if (!user) return;

    // Subscribe to service expiry info
    const userRef = ref(database, `users/${user.uid}`);
    const unsub = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const expiries: ServiceExpiry[] = [];
        
        if (data.serviceExpiry) {
          for (const [service, dateStr] of Object.entries(data.serviceExpiry)) {
            expiries.push({
              service,
              expiresAt: dateStr as string,
              grantedAt: data.createdAt
            });
          }
        } else if (data.services) {
          for (const service of data.services) {
            expiries.push({
              service,
              grantedAt: data.createdAt
            });
          }
        }
        
        setServiceExpiries(expiries);
      }
    });

    return () => unsub();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      await update(ref(database, `users/${user.uid}`), {
        displayName: displayName.trim() || user.email?.split('@')[0] || 'User'
      });
      toast.success('Profile updated!');
      setIsEditing(false);
    } catch (e) {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <Background3D />
      <Header username={userData?.displayName || user.email || 'User'} onLogout={handleLogout} />
      
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6 relative z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <User className="w-6 h-6 text-primary" />
            My Profile
          </h1>
        </div>

        {/* Profile Info */}
        <div className="glass-card p-6 rounded-xl space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-48"
                      placeholder="Display name"
                    />
                    <Button size="sm" onClick={handleSaveProfile} disabled={isSaving}>
                      <Save className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{userData?.displayName || 'User'}</h2>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                <p className="text-muted-foreground flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {user.email}
                </p>
              </div>
            </div>
            
            {userData?.isAdmin && (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm">
                <Shield className="w-4 h-4" />
                Admin
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Member since:</span>
              <span>{userData?.createdAt ? format(new Date(userData.createdAt), 'PPP') : 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Key className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">User ID:</span>
              <code className="text-xs bg-secondary px-2 py-0.5 rounded">{user.uid.slice(0, 12)}...</code>
            </div>
          </div>
        </div>

        {/* Services & Expiry */}
        <div className="glass-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            My Services
          </h3>
          
          {userServices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No services activated yet.</p>
              <p className="text-sm mt-1">Redeem a code on the main page to get started!</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userServices.map(service => {
                const expiry = serviceExpiries.find(e => e.service === service);
                const isExpired = expiry?.expiresAt && new Date(expiry.expiresAt) < new Date();
                const hasExpiry = !!expiry?.expiresAt;
                
                return (
                  <div 
                    key={service}
                    className={`p-4 rounded-lg border transition-colors ${
                      isExpired 
                        ? 'bg-destructive/10 border-destructive/50' 
                        : 'bg-primary/5 border-primary/30 hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{SERVICE_LABELS[service] || service}</span>
                      {isExpired ? (
                        <XCircle className="w-5 h-5 text-destructive" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-success" />
                      )}
                    </div>
                    
                    {hasExpiry ? (
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {isExpired ? (
                            <span className="text-destructive">
                              Expired {formatDistanceToNow(new Date(expiry.expiresAt!), { addSuffix: true })}
                            </span>
                          ) : (
                            <span>
                              Expires {formatDistanceToNow(new Date(expiry.expiresAt!), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(expiry.expiresAt!), 'PPp')}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-sm text-success">
                        <CheckCircle className="w-3 h-3" />
                        Lifetime access
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Account Actions */}
        <div className="glass-card p-6 rounded-xl">
          <h3 className="text-lg font-semibold mb-4">Account Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate('/')}>
              Go to Dashboard
            </Button>
            {userData?.isAdmin && (
              <Button variant="outline" onClick={() => navigate('/admin')}>
                <Shield className="w-4 h-4 mr-2" />
                Admin Panel
              </Button>
            )}
            <Button variant="destructive" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </main>

      <LiveChat />
    </div>
  );
}

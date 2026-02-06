import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Filter, Search, Trash2, 
  CheckCircle, XCircle, Shield, Mail, Gamepad2, Cookie, RefreshCw, Clock
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/Header';
import { Background3D } from '@/components/Background3D';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { ref, onValue, remove } from 'firebase/database';
import { database } from '@/integrations/firebase/config';
import { toast } from 'sonner';

interface HistoryEntry {
  id: string;
  service: string;
  inputCount: number;
  stats: any;
  results?: any[];
  createdAt: string;
  duration?: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  hotmail_validator: <Mail className="w-4 h-4" />,
  xbox_fetcher: <Gamepad2 className="w-4 h-4" />,
  manus_checker: <Cookie className="w-4 h-4" />,
  codes_checker: <CheckCircle className="w-4 h-4" />,
  wlid_claimer: <Shield className="w-4 h-4" />,
};

const SERVICE_LABELS: Record<string, string> = {
  hotmail_validator: 'Hotmail Validator',
  xbox_fetcher: 'Xbox Fetcher',
  manus_checker: 'Manus Checker',
  codes_checker: 'Codes Checker',
  wlid_claimer: 'WLID Claimer',
};

export default function HitsDashboard() {
  const navigate = useNavigate();
  const { user, userData, signOut } = useFirebaseAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterService, setFilterService] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setIsLoading(true);
    const historyRef = ref(database, `users/${user.uid}/checkHistory`);
    
    const unsub = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const entries: HistoryEntry[] = Object.entries(data).map(([id, entry]: [string, any]) => ({
          id,
          ...entry
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setHistory(entries);
      } else {
        setHistory([]);
      }
      setIsLoading(false);
    });

    return () => unsub();
  }, [user]);

  const filteredHistory = useMemo(() => {
    return history.filter(entry => {
      const matchesService = filterService === 'all' || entry.service === filterService;
      const matchesSearch = !searchQuery || 
        entry.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.createdAt.includes(searchQuery);
      return matchesService && matchesSearch;
    });
  }, [history, filterService, searchQuery]);

  const handleExport = (entry: HistoryEntry, format: 'txt' | 'json') => {
    let content = '';
    let filename = `${entry.service}_${entry.id.slice(0, 8)}`;

    if (format === 'json') {
      content = JSON.stringify(entry, null, 2);
      filename += '.json';
    } else {
      // Format as text based on service type
      const lines: string[] = [
        `# ${SERVICE_LABELS[entry.service] || entry.service} Results`,
        `# Date: ${entry.createdAt}`,
        `# Duration: ${entry.duration || 'N/A'}`,
        `# Total: ${entry.inputCount}`,
        `# Stats: ${JSON.stringify(entry.stats)}`,
        '',
      ];

      if (entry.results && Array.isArray(entry.results)) {
        for (const r of entry.results) {
          if (entry.service === 'hotmail_validator') {
            lines.push(`${r.email}:${r.password} | Status: ${r.status}${r.msStatus ? ` | MS: ${r.msStatus}` : ''}`);
          } else if (entry.service === 'xbox_fetcher') {
            lines.push(`${r.email} | Codes: ${r.codes?.length || 0}${r.codes?.length ? ' | ' + r.codes.join(', ') : ''}`);
          } else if (entry.service === 'manus_checker') {
            lines.push(`${r.email} | ${r.plan} | Credits: ${r.totalCredits}`);
          } else {
            lines.push(JSON.stringify(r));
          }
        }
      }

      content = lines.join('\n');
      filename += '.txt';
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  };

  const handleDelete = async (entryId: string) => {
    if (!user) return;
    try {
      await remove(ref(database, `users/${user.uid}/checkHistory/${entryId}`));
      toast.success('Entry deleted');
      setSelectedEntry(null);
    } catch (e) {
      toast.error('Failed to delete entry');
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <Background3D />
      <Header username={userData?.displayName || user.email || 'User'} onLogout={handleLogout} />
      
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6 relative z-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-primary" />
              Hits Dashboard
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{filteredHistory.length} runs</span>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 rounded-xl flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          <Select value={filterService} onValueChange={setFilterService}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All services" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              <SelectItem value="hotmail_validator">Hotmail Validator</SelectItem>
              <SelectItem value="xbox_fetcher">Xbox Fetcher</SelectItem>
              <SelectItem value="manus_checker">Manus Checker</SelectItem>
              <SelectItem value="codes_checker">Codes Checker</SelectItem>
              <SelectItem value="wlid_claimer">WLID Claimer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* History List */}
          <div className="lg:col-span-1 glass-card rounded-xl p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Run History
            </h3>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No history yet.</p>
                <p className="text-sm mt-1">Run a checker to see results here!</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-2 pr-2">
                  {filteredHistory.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedEntry?.id === entry.id
                          ? 'bg-primary/20 border-primary'
                          : 'bg-secondary/50 border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {SERVICE_ICONS[entry.service]}
                        <span className="font-medium text-sm">{SERVICE_LABELS[entry.service] || entry.service}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{entry.inputCount} items</span>
                        <span>{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</span>
                      </div>
                      {entry.stats && (
                        <div className="flex gap-2 mt-2 text-xs">
                          {entry.stats.valid !== undefined && (
                            <span className="text-green-400">✓{entry.stats.valid}</span>
                          )}
                          {entry.stats.success !== undefined && (
                            <span className="text-green-400">✓{entry.stats.success}</span>
                          )}
                          {entry.stats.invalid !== undefined && (
                            <span className="text-red-400">✗{entry.stats.invalid}</span>
                          )}
                          {entry.stats.totalCodes !== undefined && (
                            <span className="text-primary">🎮{entry.stats.totalCodes}</span>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Detail View */}
          <div className="lg:col-span-2 glass-card rounded-xl p-6">
            {selectedEntry ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {SERVICE_ICONS[selectedEntry.service]}
                      <h3 className="text-lg font-semibold">{SERVICE_LABELS[selectedEntry.service]}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedEntry.createdAt), 'PPpp')}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleExport(selectedEntry, 'txt')}>
                      <Download className="w-4 h-4 mr-1" />
                      TXT
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(selectedEntry, 'json')}>
                      <Download className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedEntry.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-secondary/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{selectedEntry.inputCount}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  {selectedEntry.stats?.valid !== undefined && (
                    <div className="bg-green-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">{selectedEntry.stats.valid}</div>
                      <div className="text-xs text-muted-foreground">Valid</div>
                    </div>
                  )}
                  {selectedEntry.stats?.success !== undefined && (
                    <div className="bg-green-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">{selectedEntry.stats.success}</div>
                      <div className="text-xs text-muted-foreground">Success</div>
                    </div>
                  )}
                  {selectedEntry.stats?.invalid !== undefined && (
                    <div className="bg-red-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">{selectedEntry.stats.invalid}</div>
                      <div className="text-xs text-muted-foreground">Invalid</div>
                    </div>
                  )}
                  {selectedEntry.stats?.totalCodes !== undefined && (
                    <div className="bg-primary/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-primary">{selectedEntry.stats.totalCodes}</div>
                      <div className="text-xs text-muted-foreground">Codes</div>
                    </div>
                  )}
                  {selectedEntry.duration && (
                    <div className="bg-secondary/50 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold">{selectedEntry.duration}</div>
                      <div className="text-xs text-muted-foreground">Duration</div>
                    </div>
                  )}
                </div>

                {/* Results */}
                {selectedEntry.results && selectedEntry.results.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Results ({selectedEntry.results.length})</h4>
                    <ScrollArea className="h-[300px] rounded-lg bg-black/40 p-3 font-mono text-xs">
                      <div className="space-y-1">
                        {selectedEntry.results.map((r: any, i: number) => (
                          <div key={i} className={`py-1 px-2 rounded ${
                            r.status === 'valid' || r.status === 'success' 
                              ? 'bg-green-500/10 text-green-400' 
                              : r.status === '2fa'
                              ? 'bg-orange-500/10 text-orange-400'
                              : 'text-muted-foreground'
                          }`}>
                            {selectedEntry.service === 'hotmail_validator' && (
                              <span>{r.email}:{r.password} | {r.status}{r.msStatus ? ` | ${r.msStatus}` : ''}</span>
                            )}
                            {selectedEntry.service === 'xbox_fetcher' && (
                              <span>{r.email} | {r.status} | Codes: {r.codes?.join(', ') || 'none'}</span>
                            )}
                            {selectedEntry.service === 'manus_checker' && (
                              <span>{r.email} | {r.plan} | Credits: {r.totalCredits}</span>
                            )}
                            {selectedEntry.service === 'codes_checker' && (
                              <span>{r.code} | {r.status}{r.title ? ` | ${r.title}` : ''}</span>
                            )}
                            {!['hotmail_validator', 'xbox_fetcher', 'manus_checker', 'codes_checker'].includes(selectedEntry.service) && (
                              <span>{JSON.stringify(r)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <CheckCircle className="w-16 h-16 mb-4 opacity-30" />
                <p>Select a run to view details</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

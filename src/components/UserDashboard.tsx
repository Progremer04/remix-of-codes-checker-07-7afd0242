import { useState, useEffect, useMemo } from 'react';
import { 
  History, Download, Eye, Calendar, Clock, 
  CheckCircle, XCircle, Package, Filter, Search,
  FileText, Gamepad2, Cookie, Mail, Code, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ref, onValue } from 'firebase/database';
import { database } from '@/integrations/firebase/config';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

interface HistoryItem {
  id: string;
  service: string;
  inputCount: number;
  stats: any;
  results: any[];
  createdAt: string;
}

interface ServiceExpiry {
  service: string;
  expiresAt?: string;
  grantedAt: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  codes_checker: <Code className="w-4 h-4" />,
  wlid_claimer: <Users className="w-4 h-4" />,
  xbox_fetcher: <Gamepad2 className="w-4 h-4" />,
  manus_checker: <Cookie className="w-4 h-4" />,
  hotmail_validator: <Mail className="w-4 h-4" />,
};

const SERVICE_LABELS: Record<string, string> = {
  codes_checker: 'Codes Checker',
  wlid_claimer: 'WLID Claimer',
  xbox_fetcher: 'Xbox Fetcher',
  manus_checker: 'Manus Checker',
  hotmail_validator: 'Hotmail Validator',
};

export function UserDashboard() {
  const { user, userData, userServices } = useFirebaseAuth();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [serviceExpiries, setServiceExpiries] = useState<ServiceExpiry[]>([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Subscribe to user's history
    const historyRef = ref(database, 'checkHistory');
    const unsubscribe = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const historyList: HistoryItem[] = [];
        
        for (const [id, item] of Object.entries(data)) {
          const historyItem = item as any;
          if (historyItem.userId === user.uid) {
            historyList.push({
              id,
              service: historyItem.service,
              inputCount: historyItem.inputCount,
              stats: historyItem.stats,
              results: historyItem.results || [],
              createdAt: historyItem.createdAt
            });
          }
        }
        
        setHistory(historyList.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      } else {
        setHistory([]);
      }
    });

    // Get service expiry info
    const userRef = ref(database, `users/${user.uid}`);
    onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const expiries: ServiceExpiry[] = [];
        
        if (data.serviceExpiries) {
          for (const [service, info] of Object.entries(data.serviceExpiries)) {
            expiries.push({
              service,
              expiresAt: (info as any).expiresAt,
              grantedAt: (info as any).grantedAt || new Date().toISOString()
            });
          }
        } else if (data.services) {
          // Create expiry entries for each service
          for (const service of data.services) {
            expiries.push({
              service,
              grantedAt: data.createdAt || new Date().toISOString()
            });
          }
        }
        
        setServiceExpiries(expiries);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      const matchesFilter = historyFilter === 'all' || h.service === historyFilter;
      const matchesSearch = historySearch === '' || 
        h.service.toLowerCase().includes(historySearch.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [history, historyFilter, historySearch]);

  const totalHits = useMemo(() => {
    return history.reduce((sum, h) => {
      if (h.stats) {
        return sum + (h.stats.valid || 0) + (h.stats.success || 0);
      }
      return sum;
    }, 0);
  }, [history]);

  const exportResults = (item: HistoryItem, type: 'all' | 'hits') => {
    if (!item.results || item.results.length === 0) {
      toast.error('No results to export');
      return;
    }

    let dataToExport: string[] = [];
    const serviceName = item.service;

    if (serviceName === 'codes_checker') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.code}|${r.status}${r.title ? `|${r.title}` : ''}`);
      } else {
        dataToExport = item.results
          .filter(r => r.status === 'valid')
          .map(r => r.title ? `${r.code}|${r.title}` : r.code);
      }
    } else if (serviceName === 'xbox_fetcher') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.email}|${r.status}|${r.codes?.join(',') || ''}`);
      } else {
        dataToExport = item.results
          .filter(r => r.status === 'success' && r.codes?.length > 0)
          .flatMap(r => r.codes);
      }
    } else if (serviceName === 'hotmail_validator') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.email}:${r.password}|${r.status}`);
      } else {
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
      } else {
        dataToExport = item.results
          .filter(r => r.status === 'success')
          .map(r => `${r.email}|${r.name}|${r.membership}|Credits: ${r.totalCredits}`);
      }
    } else if (serviceName === 'wlid_claimer') {
      if (type === 'all') {
        dataToExport = item.results.map(r => `${r.email}|${r.success ? 'SUCCESS' : 'FAILED'}|${r.token || r.error || ''}`);
      } else {
        dataToExport = item.results
          .filter(r => r.success && r.token)
          .map(r => r.token);
      }
    } else {
      dataToExport = item.results.map(r => JSON.stringify(r));
    }

    const blob = new Blob([dataToExport.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serviceName}_${type}_${format(new Date(item.createdAt), 'yyyy-MM-dd')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported successfully!');
  };

  return (
    <div className="space-y-6">
      {/* Services Overview */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Your Services
        </h3>
        
        {userServices.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No services activated. Redeem a code to get started!
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {userServices.map(service => {
              const expiry = serviceExpiries.find(e => e.service === service);
              const isExpired = expiry?.expiresAt && new Date(expiry.expiresAt) < new Date();
              
              return (
                <div 
                  key={service}
                  className={`p-4 rounded-lg border ${isExpired ? 'bg-destructive/10 border-destructive' : 'bg-primary/10 border-primary/30'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {SERVICE_ICONS[service]}
                    <span className="text-sm font-medium">{SERVICE_LABELS[service] || service}</span>
                  </div>
                  
                  {expiry?.expiresAt ? (
                    <div className="flex items-center gap-1 text-xs">
                      <Calendar className="w-3 h-3" />
                      {isExpired ? (
                        <span className="text-destructive">Expired</span>
                      ) : (
                        <span className="text-muted-foreground">
                          Expires {formatDistanceToNow(new Date(expiry.expiresAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle className="w-3 h-3" />
                      Lifetime
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-xl text-center">
          <div className="text-3xl font-bold text-primary">{history.length}</div>
          <div className="text-sm text-muted-foreground">Total Checks</div>
        </div>
        <div className="glass-card p-4 rounded-xl text-center">
          <div className="text-3xl font-bold text-success">{totalHits}</div>
          <div className="text-sm text-muted-foreground">Total Hits</div>
        </div>
        <div className="glass-card p-4 rounded-xl text-center">
          <div className="text-3xl font-bold text-primary">{userServices.length}</div>
          <div className="text-sm text-muted-foreground">Active Services</div>
        </div>
        <div className="glass-card p-4 rounded-xl text-center">
          <div className="text-3xl font-bold text-primary">
            {history.reduce((sum, h) => sum + (h.inputCount || 0), 0)}
          </div>
          <div className="text-sm text-muted-foreground">Items Processed</div>
        </div>
      </div>

      {/* History */}
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Your Check History
          </h3>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-9 w-40"
              />
            </div>
            
            <Select value={historyFilter} onValueChange={setHistoryFilter}>
              <SelectTrigger className="w-36">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No check history yet. Start using the tools to see your history here!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Hits</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.slice(0, 50).map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {SERVICE_ICONS[item.service]}
                        <span>{SERVICE_LABELS[item.service] || item.service}</span>
                      </div>
                    </TableCell>
                    <TableCell>{item.inputCount}</TableCell>
                    <TableCell>
                      <span className="text-success font-medium">
                        {item.stats?.valid || item.stats?.success || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedHistory(item);
                            setShowHistoryDialog(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exportResults(item, 'hits')}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* History Detail Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Check Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedHistory && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-3 rounded-lg">
                  <div className="text-sm text-muted-foreground">Service</div>
                  <div className="font-medium flex items-center gap-2">
                    {SERVICE_ICONS[selectedHistory.service]}
                    {SERVICE_LABELS[selectedHistory.service]}
                  </div>
                </div>
                <div className="glass-card p-3 rounded-lg">
                  <div className="text-sm text-muted-foreground">Input Count</div>
                  <div className="font-medium">{selectedHistory.inputCount}</div>
                </div>
                <div className="glass-card p-3 rounded-lg">
                  <div className="text-sm text-muted-foreground">Hits</div>
                  <div className="font-medium text-success">
                    {selectedHistory.stats?.valid || selectedHistory.stats?.success || 0}
                  </div>
                </div>
                <div className="glass-card p-3 rounded-lg">
                  <div className="text-sm text-muted-foreground">Date</div>
                  <div className="font-medium text-sm">
                    {format(new Date(selectedHistory.createdAt), 'PPpp')}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => exportResults(selectedHistory, 'all')} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export All
                </Button>
                <Button onClick={() => exportResults(selectedHistory, 'hits')}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Hits Only
                </Button>
              </div>

              {selectedHistory.results && selectedHistory.results.length > 0 && (
                <div className="glass-card p-4 rounded-lg max-h-64 overflow-y-auto">
                  <h4 className="font-medium mb-2">Results Preview</h4>
                  <div className="font-mono text-xs space-y-1">
                    {selectedHistory.results.slice(0, 50).map((r, i) => (
                      <div key={i} className={r.status === 'valid' || r.status === 'success' ? 'text-success' : 'text-muted-foreground'}>
                        {JSON.stringify(r).slice(0, 100)}...
                      </div>
                    ))}
                    {selectedHistory.results.length > 50 && (
                      <div className="text-muted-foreground">
                        ... and {selectedHistory.results.length - 50} more results
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

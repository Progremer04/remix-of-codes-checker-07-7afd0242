import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { ArrowLeft, Play, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  duration?: number;
}

export default function Test() {
  const { user } = useFirebaseAuth();
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testInput, setTestInput] = useState("test@example.com:password123");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const updateResult = (name: string, update: Partial<TestResult>) => {
    setResults(prev => prev.map(r => r.name === name ? { ...r, ...update } : r));
  };

  const getFirebaseToken = async (): Promise<string | null> => {
    try {
      if (user) {
        return await user.getIdToken();
      }
      return null;
    } catch {
      return null;
    }
  };

  const testEdgeFunction = async (
    name: string, 
    functionName: string, 
    body: Record<string, unknown>
  ): Promise<boolean> => {
    const start = Date.now();
    updateResult(name, { status: 'running' });
    addLog(`Testing ${name}...`);

    try {
      const token = await getFirebaseToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-firebase-token'] = token;

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
        headers
      });

      const duration = Date.now() - start;

      if (error) {
        addLog(`❌ ${name} failed: ${error.message}`);
        updateResult(name, { status: 'error', message: error.message, duration });
        return false;
      }

      addLog(`✅ ${name} success: ${JSON.stringify(data).substring(0, 100)}...`);
      updateResult(name, { 
        status: 'success', 
        message: data?.message || data?.status || 'OK', 
        duration 
      });
      return true;
    } catch (e) {
      const duration = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${name} error: ${msg}`);
      updateResult(name, { status: 'error', message: msg, duration });
      return false;
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setLogs([]);
    
    const accounts = testInput.split('\n').filter(l => l.trim());
    const sessionId = `test-${Date.now()}`;

    // Initialize all tests
    setResults([
      { name: 'Codes Checker', status: 'pending' },
      { name: 'WLID Claimer', status: 'pending' },
      { name: 'Xbox Fetcher', status: 'pending' },
      { name: 'Hotmail Checker', status: 'pending' },
      { name: 'Manus Checker', status: 'pending' },
    ]);

    addLog('Starting all edge function tests...');
    addLog(`Using ${accounts.length} test account(s)`);

    // Test Codes Checker
    await testEdgeFunction('Codes Checker', 'check-codes', {
      codes: ['TEST-CODE-123', 'XBOX-TEST-456'],
      sessionId
    });

    // Test WLID Claimer
    await testEdgeFunction('WLID Claimer', 'claim-wlids', {
      tokens: ['test_token_1', 'test_token_2'],
      sessionId
    });

    // Test Xbox Fetcher (background mode)
    await testEdgeFunction('Xbox Fetcher', 'xbox-fetcher', {
      accounts: accounts.slice(0, 1),
      threads: 1,
      sessionId
    });

    // Test Hotmail Checker (background mode)
    await testEdgeFunction('Hotmail Checker', 'hotmail-checker', {
      accounts: accounts.slice(0, 1),
      checkMode: 'all',
      threads: 1,
      sessionId
    });

    // Test Manus Checker
    await testEdgeFunction('Manus Checker', 'manus-checker', {
      cookies: [{ filename: 'test.txt', content: 'test_cookie_content' }],
      sessionId
    });

    addLog('All tests completed!');
    setIsRunning(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return <div className="w-4 h-4 rounded-full bg-muted" />;
      case 'running': return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Edge Function Test Page</h1>
            <p className="text-muted-foreground">Test all backend functions</p>
          </div>
        </div>

        {/* Auth Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Authentication Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={user ? "default" : "destructive"}>
                {user ? "Authenticated" : "Not Authenticated"}
              </Badge>
              {user && <span className="text-sm text-muted-foreground">{user.email}</span>}
            </div>
            {!user && (
              <p className="text-sm text-yellow-600">
                ⚠️ Some tests may fail without authentication. <Link to="/auth" className="underline">Login first</Link>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Test Input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Test Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="email:password (one per line)"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
            <Button 
              onClick={runAllTests} 
              disabled={isRunning}
              className="w-full"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run All Tests
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Test Results */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {results.map((result) => (
                  <div 
                    key={result.name}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(result.status)}
                      <span className="font-medium">{result.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {result.message && (
                        <span className="max-w-xs truncate">{result.message}</span>
                      )}
                      {result.duration && (
                        <Badge variant="outline">{result.duration}ms</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-card border rounded-lg p-4 max-h-64 overflow-auto m-4">
                <pre className="text-xs text-primary font-mono whitespace-pre-wrap">
                  {logs.join('\n')}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

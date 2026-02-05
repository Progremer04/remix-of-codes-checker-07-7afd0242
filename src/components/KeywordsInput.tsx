import { useState, useCallback } from 'react';
import { Plus, X, Upload, Trash2, Search, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface KeywordsInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  placeholder?: string;
  maxKeywords?: number;
}

// Default keywords like the Python script uses
const SUGGESTED_KEYWORDS = [
  'receipt', 'purchase', 'order', 'invoice', 'payment',
  'paypal', 'amazon', 'steam', 'netflix', 'spotify',
  'apple', 'google', 'microsoft', 'subscription', 'bank',
  'crypto', 'bitcoin', 'wallet', 'verification', 'confirm',
  'playstation', 'xbox', 'nintendo', 'discord', 'twitch'
];

export function KeywordsInput({ 
  keywords, 
  onChange, 
  placeholder = "Add keyword...",
  maxKeywords = 50
}: KeywordsInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const addKeyword = useCallback((keyword: string) => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) return;
    if (keywords.length >= maxKeywords) return;
    
    onChange([...keywords, trimmed]);
    setInputValue('');
  }, [keywords, onChange, maxKeywords]);

  const removeKeyword = useCallback((keyword: string) => {
    onChange(keywords.filter(k => k !== keyword));
  }, [keywords, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue) {
      e.preventDefault();
      addKeyword(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
      removeKeyword(keywords[keywords.length - 1]);
    }
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const fileKeywords = text
        .split('\n')
        .map(line => line.trim().toLowerCase())
        .filter(line => line && !keywords.includes(line))
        .slice(0, maxKeywords - keywords.length);
      
      if (fileKeywords.length > 0) {
        onChange([...keywords, ...fileKeywords]);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [keywords, onChange, maxKeywords]);

  const addSuggestedKeyword = (keyword: string) => {
    if (!keywords.includes(keyword)) {
      addKeyword(keyword);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  const filteredSuggestions = SUGGESTED_KEYWORDS.filter(
    s => !keywords.includes(s) && s.includes(inputValue.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Tag className="w-4 h-4 text-primary" />
          Inboxer Keywords
          {keywords.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {keywords.length}
            </Badge>
          )}
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="h-7 text-xs"
          >
            <Search className="w-3 h-3 mr-1" />
            Suggestions
          </Button>
          <label>
            <input
              type="file"
              accept=".txt"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
              <span>
                <Upload className="w-3 h-3 mr-1" />
                Load File
              </span>
            </Button>
          </label>
          {keywords.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-7 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Keywords display */}
      <div className={cn(
        "min-h-[60px] p-2 rounded-lg border border-input bg-background/50",
        "flex flex-wrap gap-1.5 items-start"
      )}>
        {keywords.map((keyword, idx) => (
          <Badge
            key={keyword}
            variant="secondary"
            className={cn(
              "pl-2 pr-1 py-1 text-xs flex items-center gap-1 animate-fade-in",
              "bg-primary/10 hover:bg-primary/20 text-foreground border border-primary/20"
            )}
          >
            {keyword}
            <button
              onClick={() => removeKeyword(keyword)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        
        {/* Inline input */}
        <div className="flex-1 min-w-[120px]">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={keywords.length === 0 ? placeholder : "Add more..."}
            className="h-7 border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm px-1"
          />
        </div>
      </div>

      {/* Add button for mobile */}
      {inputValue && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => addKeyword(inputValue)}
          className="w-full h-8"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add "{inputValue}"
        </Button>
      )}

      {/* Suggested keywords dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="p-2 rounded-lg border border-border bg-card/95 backdrop-blur">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 font-medium">
            Click to add suggested keywords
          </p>
          <div className="flex flex-wrap gap-1.5">
            {filteredSuggestions.slice(0, 20).map(suggestion => (
              <Badge
                key={suggestion}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-colors text-xs"
                onClick={() => addSuggestedKeyword(suggestion)}
              >
                <Plus className="w-2.5 h-2.5 mr-0.5" />
                {suggestion}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Helper text */}
      <p className="text-[10px] text-muted-foreground">
        Keywords are searched in inbox for premium captures. Press Enter to add, Backspace to remove last.
        Load from .txt file (one keyword per line) or use suggestions.
      </p>
    </div>
  );
}

import { useState, useRef } from 'react';
import { Upload, FileText, Cookie, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface UploadedFile {
  name: string;
  content: string;
}

interface ManusFileUploadProps {
  onFilesLoaded: (cookies: string[]) => void;
  isLoading?: boolean;
}

export function ManusFileUpload({ onFilesLoaded, isLoading }: ManusFileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList) => {
    const newFiles: UploadedFile[] = [];
    
    for (const file of Array.from(fileList)) {
      if (file.name.endsWith('.txt')) {
        try {
          const content = await file.text();
          if (content.trim()) {
            newFiles.push({
              name: file.name,
              content: content.trim()
            });
          }
        } catch (e) {
          console.error('Failed to read file:', file.name, e);
        }
      }
    }
    
    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
      toast.success(`Loaded ${newFiles.length} cookie files`);
    } else {
      toast.error('No valid .txt files found');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
  };

  const processFiles = () => {
    if (files.length === 0) {
      toast.error('No files to process');
      return;
    }
    
    const cookies = files.map(f => f.content);
    onFilesLoaded(cookies);
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          isDragging 
            ? 'border-primary bg-primary/10' 
            : 'border-border hover:border-primary/50'
        }`}
      >
        <Cookie className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">Upload Cookie Files</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Drag & drop .txt cookie files here, or click to browse
        </p>
        
        <div className="flex items-center justify-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            accept=".txt"
            multiple
            // @ts-ignore - webkitdirectory is a valid attribute
            webkitdirectory=""
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Select Files
          </Button>
          
          <Button
            variant="outline"
            onClick={() => folderInputRef.current?.click()}
          >
            <FileText className="w-4 h-4 mr-2" />
            Select Folder
          </Button>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium">{files.length} files loaded</span>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </div>
          
          <div className="max-h-48 overflow-y-auto space-y-2">
            {files.map((file, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-2 bg-accent/50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({file.content.length} chars)
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => removeFile(index)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          
          <Button 
            onClick={processFiles}
            disabled={isLoading}
            className="w-full mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Cookie className="w-4 h-4 mr-2" />
                Check {files.length} Cookies
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

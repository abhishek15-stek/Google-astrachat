import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, File, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  userId: string;
  onFileUploaded: (url: string, type: string) => void;
}

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

export function FileUpload({ userId, onFileUploaded }: FileUploadProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast({
        title: 'File too large',
        description: 'Please select a file smaller than 50MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      const fileType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'file';

      setPreview({ url: publicUrl, type: fileType, name: file.name });
      onFileUploaded(publicUrl, fileType);

      toast({
        title: 'Attachment ready',
        description: 'Press send to share it.',
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: (error as Error)?.message || 'Failed to upload file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearPreview = () => setPreview(null);

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-lg hover:bg-accent"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title="Attach photo, video or file"
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        )}
      </Button>

      {preview && (
        <div className="absolute bottom-12 left-0 z-50 bg-card border border-border rounded-lg p-2 shadow-lg flex items-center gap-2">
          {preview.type === 'image' ? (
            <img src={preview.url} alt="Preview" className="h-12 w-12 object-cover rounded" />
          ) : preview.type === 'video' ? (
            <video src={preview.url} className="h-12 w-12 object-cover rounded" muted />
          ) : (
            <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
              <File className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <span className="text-xs text-muted-foreground max-w-[8rem] truncate">{preview.name}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearPreview}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

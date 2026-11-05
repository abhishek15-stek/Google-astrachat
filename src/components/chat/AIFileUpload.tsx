import React, { useRef, useState } from 'react';
import { Paperclip, Image, FileText, X, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface AIFileUploadProps {
  onFileSelect: (file: { url: string; type: string; name: string }) => void;
  disabled?: boolean;
}

export function AIFileUpload({ onFileSelect, disabled }: AIFileUploadProps) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File, type: 'image' | 'file') => {
    if (!user || !file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/ai_${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(data.path);

      onFileSelect({
        url: publicUrl,
        type: file.type,
        name: file.name,
      });

      setUploadProgress(100);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, type);
    }
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileChange(e, 'file')}
        accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
      />
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileChange(e, 'image')}
        accept="image/*,video/*"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || isUploading}
            className="h-10 w-10 rounded-full"
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="h-4 w-4 mr-2" />
            Photo or Video
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <FileText className="h-4 w-4 mr-2" />
            Document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// File preview component for AI chat
interface AIFilePreviewProps {
  file: { url: string; type: string; name: string };
  onRemove: () => void;
}

export function AIFilePreview({ file, onRemove }: AIFilePreviewProps) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  return (
    <div className="relative inline-block p-2 bg-muted rounded-lg">
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        <X className="h-3 w-3" />
      </Button>

      {isImage ? (
        <img
          src={file.url}
          alt={file.name}
          className="max-h-32 max-w-32 rounded object-cover"
        />
      ) : isVideo ? (
        <video
          src={file.url}
          className="max-h-32 max-w-32 rounded"
          controls
        />
      ) : (
        <div className="flex items-center gap-2 p-2">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm truncate max-w-[100px]">{file.name}</span>
        </div>
      )}
    </div>
  );
}

// Display attached file in message
interface AIMessageAttachmentProps {
  url: string;
  type: string;
  name?: string;
}

export function AIMessageAttachment({ url, type, name }: AIMessageAttachmentProps) {
  const isImage = type.startsWith('image/');
  const isVideo = type.startsWith('video/');
  const isAudio = type.startsWith('audio/');

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img
          src={url}
          alt={name || 'Attached image'}
          className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  if (isVideo) {
    return (
      <video
        src={url}
        controls
        className="max-w-full max-h-64 rounded-lg"
      />
    );
  }

  if (isAudio) {
    return (
      <audio src={url} controls className="w-full max-w-[300px]" />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
    >
      <FileText className="h-8 w-8 text-primary" />
      <span className="text-sm underline">{name || 'Download file'}</span>
    </a>
  );
}

import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Copy, X, RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MediaLightboxProps {
  url: string;
  type: 'image' | 'video';
  open: boolean;
  onClose: () => void;
  onResend?: (url: string, type: 'image' | 'video') => void;
}

export function MediaLightbox({ url, type, open, onClose, onResend }: MediaLightboxProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchBlob = async () => {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw new Error('Fetch failed');
    return r.blob();
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const blob = await fetchBlob();
      const ext = (blob.type.split('/')[1] || (type === 'image' ? 'png' : 'mp4')).split(';')[0];
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `astrachat-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast({ title: 'Downloaded' });
    } catch {
      toast({ title: 'Download failed', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleCopy = async () => {
    setBusy(true);
    try {
      if (type === 'image' && navigator.clipboard && 'write' in navigator.clipboard) {
        const blob = await fetchBlob();
        // Force PNG for clipboard compatibility
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = URL.createObjectURL(blob);
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const pngBlob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png')!);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        toast({ title: 'Image copied' });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copied' });
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copied' });
      } catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 bg-black/95 border-none">
        <div className="relative flex items-center justify-center min-h-[60vh] max-h-[85vh] overflow-hidden">
          {loadFailed ? (
            <div className="flex max-w-sm flex-col items-center gap-4 px-6 py-12 text-center text-white">
              <p className="text-lg font-semibold">Preview unavailable</p>
              <p className="text-sm text-white/70">The file was sent, but this browser could not preview it here.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={handleDownload} disabled={busy}>
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
                  Open
                </Button>
              </div>
            </div>
          ) : type === 'image' ? (
            <img src={url} alt="Media" className="max-h-[85vh] max-w-full object-contain" onError={() => setLoadFailed(true)} />
          ) : (
            <video src={url} controls autoPlay className="max-h-[85vh] max-w-full" onError={() => setLoadFailed(true)} />
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <Button size="icon" variant="secondary" onClick={onClose} className="rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/60 backdrop-blur rounded-full p-1.5">
            <Button size="sm" variant="ghost" onClick={handleDownload} disabled={busy} className="text-white hover:bg-white/20">
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCopy} disabled={busy} className="text-white hover:bg-white/20">
              <Copy className="h-4 w-4 mr-2" /> Copy
            </Button>
            {onResend && (
              <Button size="sm" variant="ghost" onClick={() => { onResend(url, type); onClose(); }} className="text-white hover:bg-white/20">
                <RotateCw className="h-4 w-4 mr-2" /> Resend
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

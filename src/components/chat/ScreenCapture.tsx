import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Monitor, 
  Camera, 
  Square, 
  Circle, 
  Pause, 
  Play, 
  X, 
  Download, 
  Send, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff,
  MousePointer,
  Pencil,
  Eraser,
  Type,
  Image as ImageIcon,
  Settings,
  Cloud,
  HardDrive,
  Share2,
  ScreenShare,
  Maximize,
  AppWindow,
  Chrome
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ScreenCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureSend?: (url: string, type: 'screenshot' | 'video') => void;
  onShareRequest?: () => void;
  recipientName?: string;
  initialMode?: CaptureMode;
}

type CaptureMode = 'screenshot' | 'record' | 'live';
type CaptureSource = 'screen' | 'window' | 'tab' | 'camera';

interface RecordingOptions {
  resolution: '720p' | '1080p' | '1440p';
  saveLocation: 'cloud' | 'local' | 'both';
  autoSave: boolean;
  autoSendToChat: boolean;
  showCursor: boolean;
  captureAudio: boolean;
  captureMic: boolean;
  showCamera: boolean;
  showControlBar: boolean;
}

interface AnnotationTool {
  type: 'pointer' | 'pen' | 'text' | 'shapes' | 'eraser' | 'highlight';
  color: string;
  size: number;
}

const COLORS = ['#ff4444', '#4444ff', '#44ff44', '#ffff44', '#ff44ff', '#44ffff', '#ffffff', '#000000'];

export function ScreenCapture({ isOpen, onClose, onCaptureSend, onShareRequest, recipientName, initialMode = 'screenshot' }: ScreenCaptureProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [source, setSource] = useState<CaptureSource>('screen');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  
  const [options, setOptions] = useState<RecordingOptions>(() => {
    const defaults: RecordingOptions = {
      resolution: '1080p',
      saveLocation: 'cloud',
      autoSave: false,
      autoSendToChat: false,
      showCursor: true,
      captureAudio: true,
      captureMic: false,
      showCamera: false,
      showControlBar: true,
    };
    if (typeof window === 'undefined') return defaults;
    const saved = window.localStorage.getItem('screen-capture-options');
    if (!saved) return defaults;
    try {
      return { ...defaults, ...(JSON.parse(saved) as Partial<RecordingOptions>) };
    } catch {
      return defaults;
    }
  });
  
  const [activeTool, setActiveTool] = useState<AnnotationTool>({
    type: 'pointer',
    color: '#ff4444',
    size: 3,
  });
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('screen-capture-options', JSON.stringify(options));
  }, [options]);

  useEffect(() => {
    if (!previewUrl) return;
    if (options.autoSave) {
      handleSave();
    }
    if (options.autoSendToChat && onCaptureSend) {
      handleSend();
    }
  }, [previewUrl, options.autoSave, options.autoSendToChat]);

  useEffect(() => {
    if (!liveVideoRef.current || !stream || mode !== 'live') return;
    liveVideoRef.current.srcObject = stream;
  }, [stream, mode]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [stream]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDisplayMediaConstraints = () => {
    const resolutions: Record<string, { width: number; height: number }> = {
      '720p': { width: 1280, height: 720 },
      '1080p': { width: 1920, height: 1080 },
      '1440p': { width: 2560, height: 1440 },
    };
    const res = resolutions[options.resolution];
    
    return {
      video: {
        width: { ideal: res.width },
        height: { ideal: res.height },
        cursor: options.showCursor ? 'always' : 'never',
      },
      audio: options.captureAudio,
    };
  };

  const startCapture = async () => {
    if (mode === 'live') {
      await startLiveShare();
      return;
    }
    try {
      let displayStream: MediaStream;
      
      if (source === 'camera') {
        displayStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: options.captureMic,
        });
      } else {
        displayStream = await navigator.mediaDevices.getDisplayMedia(getDisplayMediaConstraints());
      }
      
      // Add microphone if enabled
      if (options.captureMic && source !== 'camera') {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getAudioTracks().forEach(track => {
            displayStream.addTrack(track);
          });
        } catch (e) {
          console.warn('Could not add microphone:', e);
        }
      }
      
      setStream(displayStream);
      
      if (mode === 'screenshot') {
        await captureScreenshot(displayStream);
      } else {
        await startRecording(displayStream);
      }
    } catch (error) {
      console.error('Capture error:', error);
      toast({
        title: 'Capture failed',
        description: 'Could not access screen. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const startLiveShare = async () => {
    try {
      let displayStream: MediaStream;
      if (source === 'camera') {
        displayStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: options.captureMic,
        });
      } else {
        displayStream = await navigator.mediaDevices.getDisplayMedia(getDisplayMediaConstraints());
      }

      if (options.captureMic && source !== 'camera') {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getAudioTracks().forEach(track => {
            displayStream.addTrack(track);
          });
        } catch (e) {
          console.warn('Could not add microphone:', e);
        }
      }

      setStream(displayStream);
      setIsSharing(true);

      toast({
        title: 'Live share started',
        description: 'Your screen is now ready to share.',
      });
    } catch (error) {
      console.error('Live share error:', error);
      toast({
        title: 'Live share failed',
        description: 'Could not access screen. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const stopLiveShare = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    setStream(null);
    setIsSharing(false);
    toast({
      title: 'Live share ended',
      description: 'Your screen share has stopped.',
    });
  };

  const captureScreenshot = async (stream: MediaStream) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    
    const url = canvas.toDataURL('image/png');
    setPreviewUrl(url);
    
    stream.getTracks().forEach(track => track.stop());
    setStream(null);
    
    toast({
      title: 'Screenshot captured!',
      description: 'You can now annotate, save, or send it.',
    });
  };

  const startRecording = async (stream: MediaStream) => {
    chunksRef.current = [];
    
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    const recorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = recorder;
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      
      if (timerRef.current) clearInterval(timerRef.current);
    };
    
    recorder.start(1000);
    setIsRecording(true);
    
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
    
    toast({ title: 'Recording started!', description: 'Click Stop when done.' });
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) clearInterval(timerRef.current);
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
    }
  };

  const handleSave = async () => {
    if (!previewUrl) return;
    
    if (options.saveLocation === 'local' || options.saveLocation === 'both') {
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = `astrachat-${mode}-${Date.now()}.${mode === 'screenshot' ? 'png' : 'webm'}`;
      a.click();
      toast({ title: 'Saved to device!', description: 'File downloaded successfully.' });
    }
    
    if (options.saveLocation === 'cloud' || options.saveLocation === 'both') {
      try {
        const response = await fetch(previewUrl);
        const blob = await response.blob();
        const fileName = `${mode}-${Date.now()}.${mode === 'screenshot' ? 'png' : 'webm'}`;
        
        const { data, error } = await supabase.storage
          .from('chat-files')
          .upload(`captures/${fileName}`, blob);
        
        if (error) throw error;
        
        toast({ title: 'Saved to cloud!', description: 'File uploaded successfully.' });
      } catch (error) {
        console.error('Cloud save error:', error);
        toast({
          title: 'Cloud save failed',
          description: 'Could not upload to cloud storage.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleSend = async () => {
    if (!previewUrl || !onCaptureSend) return;
    
    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();
      const fileName = `${mode}-${Date.now()}.${mode === 'screenshot' ? 'png' : 'webm'}`;
      
      const { data, error } = await supabase.storage
        .from('chat-files')
        .upload(`captures/${fileName}`, blob);
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('chat-files')
        .getPublicUrl(`captures/${fileName}`);
      
      onCaptureSend(publicUrl, mode === 'screenshot' ? 'screenshot' : 'video');
      handleClose();
      
      toast({ title: 'Sent!', description: `${mode === 'screenshot' ? 'Screenshot' : 'Recording'} sent successfully.` });
    } catch (error) {
      console.error('Send error:', error);
      toast({
        title: 'Send failed',
        description: 'Could not send the capture.',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setStream(null);
    setPreviewUrl(null);
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setIsSharing(false);
    onClose();
  };

  const SourceOption = ({ type, icon: Icon, label }: { type: CaptureSource; icon: any; label: string }) => (
    <button
      onClick={() => setSource(type)}
      className={cn(
        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
        source === type 
          ? "border-primary bg-primary/10" 
          : "border-border hover:border-primary/50"
      )}
    >
      <Icon className="h-8 w-8" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScreenShare className="h-5 w-5" />
            Screen Capture & Share
          </DialogTitle>
        </DialogHeader>

        {/* Recording Control Bar */}
        {isRecording && options.showControlBar && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-full px-4 py-2 flex items-center gap-3 shadow-lg">
            <span className="text-sm font-mono bg-destructive/10 text-destructive px-2 py-1 rounded">
              {formatTime(recordingTime)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={pauseRecording}
              className="h-8 w-8"
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={stopRecording}
              className="h-8 w-8"
            >
              <Square className="h-4 w-4" />
            </Button>
            
            <div className="w-px h-6 bg-border" />
            
            {/* Annotation Tools */}
            <div className="flex items-center gap-1">
              <Button
                variant={activeTool.type === 'pointer' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setActiveTool({ ...activeTool, type: 'pointer' })}
                className="h-8 w-8"
              >
                <MousePointer className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool.type === 'pen' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setActiveTool({ ...activeTool, type: 'pen' })}
                className="h-8 w-8"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool.type === 'eraser' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setActiveTool({ ...activeTool, type: 'eraser' })}
                className="h-8 w-8"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="w-px h-6 bg-border" />
            
            {/* Mic/Video Toggle */}
            <Button
              variant={options.captureMic ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setOptions({ ...options, captureMic: !options.captureMic })}
              className="h-8 w-8"
            >
              {options.captureMic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            <Button
              variant={options.showCamera ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setOptions({ ...options, showCamera: !options.showCamera })}
              className="h-8 w-8"
            >
              {options.showCamera ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {/* Preview Area */}
        {previewUrl ? (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              {mode === 'screenshot' ? (
                <img 
                  src={previewUrl} 
                  alt="Screenshot preview" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <video 
                  ref={videoRef}
                  src={previewUrl} 
                  controls 
                  className="w-full h-full"
                />
              )}
            </div>
            
            {/* Annotation Toolbar for Screenshots */}
            {mode === 'screenshot' && (
              <div className="flex items-center justify-center gap-2 p-2 bg-muted rounded-lg">
                {['pointer', 'pen', 'text', 'shapes', 'eraser', 'highlight'].map((tool) => (
                  <Button
                    key={tool}
                    variant={activeTool.type === tool ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setActiveTool({ ...activeTool, type: tool as any })}
                    className="h-10 w-10"
                  >
                    {tool === 'pointer' && <MousePointer className="h-5 w-5" />}
                    {tool === 'pen' && <Pencil className="h-5 w-5" />}
                    {tool === 'text' && <Type className="h-5 w-5" />}
                    {tool === 'shapes' && <Square className="h-5 w-5" />}
                    {tool === 'eraser' && <Eraser className="h-5 w-5" />}
                    {tool === 'highlight' && <Pencil className="h-5 w-5" />}
                  </Button>
                ))}
                
                <div className="w-px h-8 bg-border mx-2" />
                
                {/* Color Picker */}
                <div className="flex gap-1">
                  {COLORS.slice(0, 4).map((color) => (
                    <button
                      key={color}
                      onClick={() => setActiveTool({ ...activeTool, color })}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-transform",
                        activeTool.color === color ? "border-primary scale-110" : "border-border"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Select 
                  value={options.saveLocation} 
                  onValueChange={(v: any) => setOptions({ ...options, saveLocation: v })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloud">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4" />
                        Cloud
                      </div>
                    </SelectItem>
                    <SelectItem value="local">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        Local
                      </div>
                    </SelectItem>
                    <SelectItem value="both">
                      <div className="flex items-center gap-2">
                        <Share2 className="h-4 w-4" />
                        Both
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setPreviewUrl(null)}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button variant="outline" onClick={handleSave}>
                  <Download className="h-4 w-4 mr-2" />
                  Save
                </Button>
                {onCaptureSend && (
                  <Button onClick={handleSend}>
                    <Send className="h-4 w-4 mr-2" />
                    Send{recipientName ? ` to ${recipientName}` : ''}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : !isRecording && !isSharing ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as CaptureMode)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="screenshot" className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Capture
              </TabsTrigger>
              <TabsTrigger value="record" className="flex items-center gap-2">
                <Circle className="h-4 w-4 text-destructive" />
                Record
              </TabsTrigger>
              <TabsTrigger value="live" className="flex items-center gap-2">
                <ScreenShare className="h-4 w-4" />
                Live
              </TabsTrigger>
            </TabsList>

            <TabsContent value="screenshot" className="space-y-4">
              {/* Screenshot Options */}
              <div className="grid grid-cols-3 gap-3">
                <SourceOption type="screen" icon={Maximize} label="Visible Part" />
                <SourceOption type="window" icon={AppWindow} label="Full Page" />
                <SourceOption type="tab" icon={Chrome} label="Selected Area" />
              </div>
              
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <button className="w-full text-left p-3 rounded-lg bg-card hover:bg-accent transition-colors flex items-center gap-3">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <span>Visible Part after Delay</span>
                </button>
                <button className="w-full text-left p-3 rounded-lg bg-card hover:bg-accent transition-colors flex items-center gap-3">
                  <Maximize className="h-5 w-5 text-muted-foreground" />
                  <span>Entire Screen & App Window</span>
                </button>
                <button className="w-full text-left p-3 rounded-lg bg-card hover:bg-accent transition-colors flex items-center gap-3">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <span>Annotate Local & Clipboard Image</span>
                </button>
                <button className="w-full text-left p-3 rounded-lg bg-card hover:bg-accent transition-colors flex items-center gap-3">
                  <Type className="h-5 w-5 text-muted-foreground" />
                  <span>Take Screenshot & Extract Text</span>
                </button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm">Save image to</span>
                <Select 
                  value={options.saveLocation} 
                  onValueChange={(v: any) => setOptions({ ...options, saveLocation: v })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloud">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4" />
                        Cloud
                      </div>
                    </SelectItem>
                    <SelectItem value="local">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        Local
                      </div>
                    </SelectItem>
                    <SelectItem value="both">
                      <div className="flex items-center gap-2">
                        <Share2 className="h-4 w-4" />
                        Both
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label>Always save captures</Label>
                  <Switch
                    checked={options.autoSave}
                    onCheckedChange={(v) => setOptions({ ...options, autoSave: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Always send to chat</Label>
                  <Switch
                    checked={options.autoSendToChat}
                    onCheckedChange={(v) => setOptions({ ...options, autoSendToChat: v })}
                  />
                </div>
              </div>
              
              <Button onClick={startCapture} className="w-full h-12" size="lg">
                <Camera className="h-5 w-5 mr-2" />
                Take Screenshot
              </Button>
            </TabsContent>

            <TabsContent value="record" className="space-y-4">
              {/* Recording Source Options */}
              <div className="grid grid-cols-4 gap-3">
                <SourceOption type="screen" icon={Monitor} label="Desktop" />
                <SourceOption type="camera" icon={Video} label="Camera Only" />
                <SourceOption type="tab" icon={Chrome} label="This Tab" />
                <SourceOption type="window" icon={AppWindow} label="Custom" />
              </div>
              
              {/* Recording Settings */}
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    <Label>Microphone</Label>
                  </div>
                  <Switch 
                    checked={options.captureMic} 
                    onCheckedChange={(v) => setOptions({ ...options, captureMic: v })} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    <Label>System Audio</Label>
                  </div>
                  <Switch
                    checked={options.captureAudio}
                    onCheckedChange={(v) => setOptions({ ...options, captureAudio: v })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <Label>Control Bar</Label>
                  </div>
                  <Switch 
                    checked={options.showControlBar} 
                    onCheckedChange={(v) => setOptions({ ...options, showControlBar: v })} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MousePointer className="h-4 w-4" />
                    <Label>Show Cursor</Label>
                  </div>
                  <Switch
                    checked={options.showCursor}
                    onCheckedChange={(v) => setOptions({ ...options, showCursor: v })}
                  />
                </div>
              </div>

              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label>Always save recordings</Label>
                  <Switch
                    checked={options.autoSave}
                    onCheckedChange={(v) => setOptions({ ...options, autoSave: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Always send to chat</Label>
                  <Switch
                    checked={options.autoSendToChat}
                    onCheckedChange={(v) => setOptions({ ...options, autoSendToChat: v })}
                  />
                </div>
              </div>
              
              {/* More Settings */}
              <div className="flex items-center justify-between gap-4">
                <Select 
                  value={options.resolution} 
                  onValueChange={(v: any) => setOptions({ ...options, resolution: v })}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">HD 720p</SelectItem>
                    <SelectItem value="1080p">FHD 1080p</SelectItem>
                    <SelectItem value="1440p">QHD 1440p</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select 
                  value={options.saveLocation} 
                  onValueChange={(v: any) => setOptions({ ...options, saveLocation: v })}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloud">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4" />
                        Cloud
                      </div>
                    </SelectItem>
                    <SelectItem value="local">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        Local
                      </div>
                    </SelectItem>
                    <SelectItem value="both">
                      <div className="flex items-center gap-2">
                        <Share2 className="h-4 w-4" />
                        Both
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" size="sm">
                  MP4 <Settings className="h-3 w-3 ml-1" />
                </Button>
                
                <Button variant="ghost" size="sm">
                  More
                </Button>
              </div>
              
              <Button onClick={startCapture} className="w-full h-12 bg-primary hover:bg-primary/90" size="lg">
                <Circle className="h-5 w-5 mr-2 text-destructive" />
                Start Recording
              </Button>
            </TabsContent>

            <TabsContent value="live" className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Live Screen Share</h3>
                    <p className="text-sm text-muted-foreground">
                      Request help and start a live share with {recipientName ?? 'this user'}.
                    </p>
                  </div>
                  <Button variant="outline" onClick={onShareRequest} disabled={!onShareRequest}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Send request
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <SourceOption type="screen" icon={Monitor} label="Desktop" />
                <SourceOption type="window" icon={AppWindow} label="Window" />
                <SourceOption type="tab" icon={Chrome} label="Tab" />
                <SourceOption type="camera" icon={Video} label="Camera" />
              </div>

              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    <Label>Microphone</Label>
                  </div>
                  <Switch
                    checked={options.captureMic}
                    onCheckedChange={(v) => setOptions({ ...options, captureMic: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    <Label>System Audio</Label>
                  </div>
                  <Switch
                    checked={options.captureAudio}
                    onCheckedChange={(v) => setOptions({ ...options, captureAudio: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MousePointer className="h-4 w-4" />
                    <Label>Show Cursor</Label>
                  </div>
                  <Switch
                    checked={options.showCursor}
                    onCheckedChange={(v) => setOptions({ ...options, showCursor: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    <Label>Camera overlay</Label>
                  </div>
                  <Switch
                    checked={options.showCamera}
                    onCheckedChange={(v) => setOptions({ ...options, showCamera: v })}
                  />
                </div>
              </div>

              <Button onClick={startLiveShare} className="w-full h-12 bg-primary hover:bg-primary/90" size="lg">
                <ScreenShare className="h-5 w-5 mr-2" />
                Start Live Share
              </Button>
            </TabsContent>
          </Tabs>
        ) : null}

        {isSharing && mode === 'live' && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video ref={liveVideoRef} autoPlay muted playsInline className="w-full h-full object-contain" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ScreenShare className="h-4 w-4" />
                Live share active
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={stopLiveShare}>
                  <X className="h-4 w-4 mr-2" />
                  Stop
                </Button>
                <Button onClick={onShareRequest} disabled={!onShareRequest}>
                  <Send className="h-4 w-4 mr-2" />
                  Notify chat
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

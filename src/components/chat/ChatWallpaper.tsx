import React, { useState, useEffect } from 'react';
import { Check, Image as ImageIcon, Palette, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SOLID_COLORS = [
  { id: 'default', color: 'bg-background', label: 'Default' },
  { id: 'dark', color: 'bg-slate-900', label: 'Dark' },
  { id: 'light', color: 'bg-slate-100', label: 'Light' },
  { id: 'green', color: 'bg-emerald-900', label: 'Emerald' },
  { id: 'blue', color: 'bg-blue-900', label: 'Ocean' },
  { id: 'purple', color: 'bg-purple-900', label: 'Purple' },
  { id: 'rose', color: 'bg-rose-900', label: 'Rose' },
  { id: 'amber', color: 'bg-amber-900', label: 'Amber' },
];

const GRADIENTS = [
  { id: 'gradient-sunset', gradient: 'bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600', label: 'Sunset' },
  { id: 'gradient-ocean', gradient: 'bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600', label: 'Ocean' },
  { id: 'gradient-forest', gradient: 'bg-gradient-to-br from-green-400 via-emerald-500 to-teal-600', label: 'Forest' },
  { id: 'gradient-aurora', gradient: 'bg-gradient-to-br from-green-400 via-purple-500 to-pink-500', label: 'Aurora' },
  { id: 'gradient-night', gradient: 'bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900', label: 'Night' },
  { id: 'gradient-candy', gradient: 'bg-gradient-to-br from-pink-400 via-rose-400 to-red-400', label: 'Candy' },
  { id: 'gradient-mint', gradient: 'bg-gradient-to-br from-teal-400 via-cyan-400 to-sky-500', label: 'Mint' },
  { id: 'gradient-royal', gradient: 'bg-gradient-to-br from-amber-400 via-orange-500 to-red-600', label: 'Royal' },
];

const PATTERNS = [
  { id: 'pattern-dots', pattern: 'bg-dots', label: 'Dots' },
  { id: 'pattern-grid', pattern: 'bg-grid', label: 'Grid' },
];

const WALLPAPER_IMAGES = [
  { id: 'wp-mountains', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', label: 'Mountains' },
  { id: 'wp-beach', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', label: 'Beach' },
  { id: 'wp-forest', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800', label: 'Forest' },
  { id: 'wp-city', url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800', label: 'City' },
  { id: 'wp-stars', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800', label: 'Stars' },
  { id: 'wp-abstract', url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800', label: 'Abstract' },
];

interface ChatWallpaperProps {
  children: React.ReactNode;
}

export function ChatWallpaper({ children }: ChatWallpaperProps) {
  const { user } = useAuth();
  const [wallpaper, setWallpaper] = useState('default');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadWallpaper();
    }
  }, [user]);

  const loadWallpaper = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_preferences')
      .select('chat_wallpaper')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.chat_wallpaper) {
      setWallpaper(data.chat_wallpaper);
    }
  };

  const saveWallpaper = async (wallpaperId: string) => {
    if (!user) return;

    setWallpaper(wallpaperId);

    // Upsert preference
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        chat_wallpaper: wallpaperId,
      }, {
        onConflict: 'user_id',
      });

    if (!error) {
      setIsOpen(false);
    }
  };

  const getWallpaperStyle = () => {
    // Check solid colors
    const solid = SOLID_COLORS.find(c => c.id === wallpaper);
    if (solid) return solid.color;

    // Check gradients
    const gradient = GRADIENTS.find(g => g.id === wallpaper);
    if (gradient) return gradient.gradient;

    // Check patterns
    const pattern = PATTERNS.find(p => p.id === wallpaper);
    if (pattern) return pattern.pattern;

    // Check wallpaper images
    const image = WALLPAPER_IMAGES.find(i => i.id === wallpaper);
    if (image) return '';

    return 'bg-background';
  };

  const getWallpaperImage = () => {
    const image = WALLPAPER_IMAGES.find(i => i.id === wallpaper);
    return image?.url;
  };

  const wallpaperImage = getWallpaperImage();

  return (
    <>
      <div
        className={cn("relative h-full w-full", getWallpaperStyle())}
        style={wallpaperImage ? { 
          backgroundImage: `url(${wallpaperImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        {wallpaperImage && (
          <div className="absolute inset-0 bg-black/30" />
        )}
        <div className="relative h-full">
          {children}
        </div>
      </div>

      {/* Wallpaper Picker Dialog - controlled externally */}
      <WallpaperPickerDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        currentWallpaper={wallpaper}
        onSelectWallpaper={saveWallpaper}
      />
    </>
  );
}

interface WallpaperPickerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentWallpaper: string;
  onSelectWallpaper: (id: string) => void;
}

export function WallpaperPickerDialog({
  isOpen,
  onOpenChange,
  currentWallpaper,
  onSelectWallpaper,
}: WallpaperPickerDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Chat Wallpaper
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="solid" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="solid">Solid</TabsTrigger>
            <TabsTrigger value="gradient">Gradient</TabsTrigger>
            <TabsTrigger value="pattern">Pattern</TabsTrigger>
            <TabsTrigger value="image">Image</TabsTrigger>
          </TabsList>

          <TabsContent value="solid" className="mt-4">
            <div className="grid grid-cols-4 gap-3">
              {SOLID_COLORS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectWallpaper(item.id)}
                  className={cn(
                    "relative h-16 rounded-lg border-2 transition-all",
                    item.color,
                    currentWallpaper === item.id ? "border-primary ring-2 ring-primary/30" : "border-border"
                  )}
                >
                  {currentWallpaper === item.id && (
                    <Check className="absolute top-1 right-1 h-4 w-4 text-primary" />
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] text-white/70 font-medium">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="gradient" className="mt-4">
            <div className="grid grid-cols-4 gap-3">
              {GRADIENTS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectWallpaper(item.id)}
                  className={cn(
                    "relative h-16 rounded-lg border-2 transition-all",
                    item.gradient,
                    currentWallpaper === item.id ? "border-primary ring-2 ring-primary/30" : "border-border"
                  )}
                >
                  {currentWallpaper === item.id && (
                    <Check className="absolute top-1 right-1 h-4 w-4 text-white" />
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] text-white font-medium">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="pattern" className="mt-4">
            <div className="grid grid-cols-4 gap-3">
              {PATTERNS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectWallpaper(item.id)}
                  className={cn(
                    "relative h-16 rounded-lg border-2 transition-all bg-card",
                    item.pattern,
                    currentWallpaper === item.id ? "border-primary ring-2 ring-primary/30" : "border-border"
                  )}
                >
                  {currentWallpaper === item.id && (
                    <Check className="absolute top-1 right-1 h-4 w-4 text-primary" />
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] text-foreground font-medium">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="image" className="mt-4">
            <div className="grid grid-cols-3 gap-3">
              {WALLPAPER_IMAGES.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectWallpaper(item.id)}
                  className={cn(
                    "relative h-20 rounded-lg border-2 transition-all overflow-hidden",
                    currentWallpaper === item.id ? "border-primary ring-2 ring-primary/30" : "border-border"
                  )}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {currentWallpaper === item.id && (
                    <Check className="absolute top-1 right-1 h-4 w-4 text-white drop-shadow-lg" />
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] text-white font-medium drop-shadow-lg">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Export hook for external wallpaper dialog control
export function useWallpaperPicker() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const [wallpaper, setWallpaper] = useState('default');

  useEffect(() => {
    if (user) {
      supabase
        .from('user_preferences')
        .select('chat_wallpaper')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.chat_wallpaper) {
            setWallpaper(data.chat_wallpaper);
          }
        });
    }
  }, [user]);

  const saveWallpaper = async (wallpaperId: string) => {
    if (!user) return;

    setWallpaper(wallpaperId);

    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        chat_wallpaper: wallpaperId,
      }, {
        onConflict: 'user_id',
      });

    setIsOpen(false);
  };

  return {
    isOpen,
    setIsOpen,
    wallpaper,
    saveWallpaper,
  };
}

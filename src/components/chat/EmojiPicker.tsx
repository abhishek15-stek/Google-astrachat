import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';

const EMOJI_CATEGORIES = {
  smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶'],
  gestures: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '✍️', '💅', '🤳', '💪'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  nature: ['🌸', '🌺', '🌻', '🌼', '🌷', '🌹', '🥀', '💐', '🌲', '🌳', '🌴', '🌵', '🍀', '☘️', '🍁', '🍂', '🍃'],
  food: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥒', '🌽', '🥕', '🥔', '🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍩', '🍪'],
  objects: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎮', '🎲', '♠️', '♥️', '♦️', '♣️', '🎯', '🎭', '🎨', '🎬', '🎤', '🎧', '🎵', '🎶', '🔔', '📢', '💬', '💭', '💡', '🔥', '⭐', '✨', '💫', '🎉', '🎊'],
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>('smileys');

  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg hover:bg-accent">
          <Smile className="h-5 w-5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start" side="top">
        {/* Category tabs */}
        <div className="flex gap-1 mb-2 pb-2 border-b border-border overflow-x-auto">
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <Button
              key={category}
              variant={activeCategory === category ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs px-2 h-7 flex-shrink-0"
              onClick={() => setActiveCategory(category as keyof typeof EMOJI_CATEGORIES)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>
        
        {/* Emoji grid */}
        <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
          {EMOJI_CATEGORIES[activeCategory].map((emoji, index) => (
            <button
              key={index}
              className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded text-lg transition-colors"
              onClick={() => handleSelect(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

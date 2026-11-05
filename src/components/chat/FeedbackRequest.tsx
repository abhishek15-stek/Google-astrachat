import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Sparkles, Check, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface FeedbackRequestProps {
  question: string;
  questionType: 'star_rating' | 'options' | 'text' | 'mixed';
  options?: string[];
  onSubmit: (response: { starRating?: number; selectedOption?: string; textResponse?: string }) => void;
  onDismiss?: () => void;
}

export function FeedbackRequest({ 
  question, 
  questionType, 
  options = ['Ok', 'Good', 'Great', 'Excellent', 'Amazing!'],
  onSubmit,
  onDismiss 
}: FeedbackRequestProps) {
  const [starRating, setStarRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [textResponse, setTextResponse] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const handleStarClick = (rating: number) => {
    setStarRating(rating);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1000);
  };

  const handleOptionClick = (option: string) => {
    setSelectedOption(option);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 800);
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    setShowConfetti(true);
    
    setTimeout(() => {
      onSubmit({
        starRating: starRating || undefined,
        selectedOption: selectedOption || undefined,
        textResponse: textResponse || undefined
      });
    }, 1500);
  };

  const canSubmit = starRating > 0 || selectedOption || textResponse.trim();

  const optionColors = [
    'from-amber-400 to-orange-500',
    'from-green-400 to-emerald-500',
    'from-blue-400 to-cyan-500',
    'from-purple-400 to-violet-500',
    'from-pink-400 to-rose-500'
  ];

  if (isSubmitted) {
    return (
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-background rounded-2xl p-6 border border-primary/30 overflow-hidden"
      >
        {/* Celebration animation */}
        <AnimatePresence>
          {showConfetti && (
            <>
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ 
                    x: '50%', 
                    y: '50%', 
                    scale: 0,
                    rotate: 0
                  }}
                  animate={{ 
                    x: `${Math.random() * 100}%`, 
                    y: `${Math.random() * 100}%`,
                    scale: [0, 1, 0],
                    rotate: Math.random() * 360
                  }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={cn(
                    "absolute w-3 h-3 rounded-full",
                    i % 5 === 0 ? "bg-yellow-400" :
                    i % 5 === 1 ? "bg-pink-400" :
                    i % 5 === 2 ? "bg-blue-400" :
                    i % 5 === 3 ? "bg-green-400" : "bg-purple-400"
                  )}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30">
            <Check className="h-8 w-8 text-white" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-foreground">Thank You! 💖</h3>
            <p className="text-sm text-muted-foreground mt-1">Your feedback helps us improve AstraChat</p>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="relative bg-gradient-to-br from-primary/10 via-background to-accent/10 rounded-2xl p-5 border border-primary/20 shadow-lg overflow-hidden"
    >
      {/* Animated background glow */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 3, repeat: Infinity }}
        className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl"
      />
      
      {/* Confetti on interaction */}
      <AnimatePresence>
        {showConfetti && (
          <>
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: '50%', 
                  y: '50%', 
                  scale: 0
                }}
                animate={{ 
                  x: `${20 + Math.random() * 60}%`, 
                  y: `${20 + Math.random() * 60}%`,
                  scale: [0, 1.5, 0]
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute"
              >
                <Sparkles className={cn(
                  "h-4 w-4",
                  i % 3 === 0 ? "text-yellow-400" :
                  i % 3 === 1 ? "text-pink-400" : "text-blue-400"
                )} />
              </motion.div>
            ))}
          </>
        )}
      </AnimatePresence>

      <div className="relative z-10 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-primary font-medium mb-1">AstraChat Feedback</p>
            <p className="text-sm text-foreground font-medium leading-relaxed">{question}</p>
          </div>
        </div>

        {/* Star Rating */}
        {(questionType === 'star_rating' || questionType === 'mixed') && (
          <div className="flex justify-center gap-2 py-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.button
                key={star}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleStarClick(star)}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                className="relative p-1 focus:outline-none"
              >
                <Star 
                  className={cn(
                    "h-8 w-8 transition-all duration-200",
                    (hoveredStar >= star || starRating >= star) 
                      ? "text-yellow-400 fill-yellow-400 drop-shadow-lg" 
                      : "text-muted-foreground/40"
                  )}
                />
                {starRating === star && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.5, 0] }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 bg-yellow-400/30 rounded-full blur-md"
                  />
                )}
              </motion.button>
            ))}
          </div>
        )}

        {/* Clickable Options */}
        {(questionType === 'options' || questionType === 'mixed') && (
          <div className="flex flex-wrap gap-2 justify-center">
            {options.map((option, index) => (
              <motion.button
                key={option}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleOptionClick(option)}
                className={cn(
                  "relative px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 overflow-hidden",
                  selectedOption === option
                    ? `bg-gradient-to-r ${optionColors[index % optionColors.length]} text-white shadow-lg`
                    : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border"
                )}
              >
                {selectedOption === option && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0.8 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 bg-white rounded-full"
                  />
                )}
                <span className="relative z-10">{option}</span>
                {selectedOption === option && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="ml-1.5 inline-block"
                  >
                    ✓
                  </motion.span>
                )}
              </motion.button>
            ))}
          </div>
        )}

        {/* Text Response */}
        {(questionType === 'text' || questionType === 'mixed') && (
          <div className="mt-3">
            <Textarea
              value={textResponse}
              onChange={(e) => setTextResponse(e.target.value)}
              placeholder="Share your thoughts... (optional)"
              className="min-h-[60px] resize-none bg-background/50 border-border/50 focus:border-primary/50"
            />
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-2 pt-2">
          {onDismiss && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onDismiss}
              className="flex-1 text-muted-foreground"
            >
              Maybe Later
            </Button>
          )}
          <motion.div className="flex-1">
            <Button 
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "w-full gap-2 transition-all duration-300",
                canSubmit 
                  ? "bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/30" 
                  : ""
              )}
            >
              <Sparkles className="h-4 w-4" />
              Submit Feedback
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

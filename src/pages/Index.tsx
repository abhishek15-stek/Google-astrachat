import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Chat from './Chat';
import { MessageCircle, Sparkles } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background bg-dots">
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          <div className="relative">
            <div className="h-20 w-20 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
              <MessageCircle className="h-10 w-10 text-primary-foreground animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center border-2 border-background">
              <Sparkles className="h-3 w-3 text-primary-foreground" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-foreground font-semibold text-lg">ChatConnect</p>
            <p className="text-muted-foreground text-sm mt-1">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <Chat />;
};

export default Index;

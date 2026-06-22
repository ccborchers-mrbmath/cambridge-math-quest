import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

interface Props {
  children: ReactNode;
  featureName: string;
}

export function RequireSubscription({ children, featureName }: Props) {
  const navigate = useNavigate();
  const { user, userRole, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Admins always have access.
  if (userRole === "admin" || isActive) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/30 px-4">
      <div className="max-w-md text-center space-y-5 p-8 rounded-2xl border border-border bg-card shadow-elevated">
        <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-serif font-bold">{featureName} is a Pro feature</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Start your 7-day free trial of Math Pro to unlock {featureName.toLowerCase()},
            AI marking, hints and more.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => navigate("/pricing")} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {user ? "View plans" : "Sign in & start trial"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>Back to modules</Button>
        </div>
      </div>
    </div>
  );
}
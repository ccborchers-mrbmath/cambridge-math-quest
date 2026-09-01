import { Sparkles, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
}

export function UpgradePrompt({ open, onOpenChange, featureName }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const signedIn = Boolean(user);
  const title = signedIn
    ? `Unlock ${featureName} with Practice+`
    : `Sign in to use ${featureName}`;
  // Feature names read naturally mid-sentence ("the question finder"), so the
  // sentence they open has to be capitalised rather than the name itself.
  const openingWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const description = signedIn
    ? `${openingWord(featureName)} is powered by AI and included with Practice+. Start your 7-day free trial to unlock AI hints, AI marking, the Test Maker and more.`
    : `${openingWord(featureName)} is an AI-powered feature for Practice+ members. Sign in and start your 7-day free trial to unlock AI hints, AI marking, the Test Maker and more.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-center border-border bg-card p-8">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-serif font-bold mt-2">{title}</h2>
        <p className="text-sm text-muted-foreground -mt-2">{description}</p>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate(signedIn ? "/pricing" : "/auth?redirect=/pricing");
            }}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {signedIn ? "View plans" : "Sign in & start trial"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
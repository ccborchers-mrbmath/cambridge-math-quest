import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FREE_TIER_DAILY_LIMIT } from "@/hooks/useFreeTierCap";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FreeTierCapDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <Sparkles className="h-5 w-5 text-primary" /> You've hit your daily limit
          </DialogTitle>
          <DialogDescription className="pt-2">
            Free accounts can view up to {FREE_TIER_DAILY_LIMIT} questions per day. Upgrade
            to Math Pro for unlimited browsing plus AI marking, AI hints, progress tracking,
            coaching and the Test Maker. Start with a 7-day free trial.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button onClick={() => navigate("/pricing")}>See plans</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
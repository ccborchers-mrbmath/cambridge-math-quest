import { Coins } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";

export const CreditsPill = () => {
  const { user, userRole } = useAuth();
  const { balance, loading } = useCredits();

  if (!user || userRole === "admin") return null;
  if (loading) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-sm font-medium text-foreground"
      title="Credits remaining (1 credit = 1 AI marking or hint)"
    >
      <Coins className="h-4 w-4 text-primary" />
      <span>{balance.toFixed(balance % 1 === 0 ? 0 : 1)}</span>
      <span className="text-muted-foreground">credits</span>
    </div>
  );
};
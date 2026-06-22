import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Sparkles, ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useCredits } from "@/hooks/useCredits";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { toast } from "sonner";

const fmtZAR = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;

export default function Pricing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isActive, status, currentPeriodEnd, refresh: refreshSub } = useSubscription();
  const { balance, refresh: refreshCredits } = useCredits();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [params, setParams] = useSearchParams();
  const pastDue = status === "past_due";

  const openCustomerPortal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: { environment: getPaddleEnvironment() },
      });
      if (error) throw error;
      const url = (data as any)?.subscriptionUrls?.[0]?.cancelSubscription
        || (data as any)?.subscriptionUrls?.[0]?.updateSubscriptionPaymentMethod
        || (data as any)?.overviewUrl;
      if (!url) throw new Error("Portal URL missing");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the customer portal");
    }
  };

  useEffect(() => {
    if (params.get("checkout") === "success") {
      toast.success("Payment received — your account will update shortly.");
      const t = setInterval(() => {
        void refreshSub();
        void refreshCredits();
      }, 2500);
      const stop = setTimeout(() => clearInterval(t), 20000);
      params.delete("checkout");
      setParams(params, { replace: true });
      return () => {
        clearInterval(t);
        clearTimeout(stop);
      };
    }
  }, [params, setParams, refreshSub, refreshCredits]);

  const handleBuy = async (priceId: string) => {
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent("/pricing")}`);
      return;
    }
    try {
      await openCheckout({ priceId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    }
  };

  const planFeatures = [
    "AI marking of your written work",
    "AI hints on every question",
    "My Progress tracking & insights",
    "Test Maker (custom papers + PDFs)",
    "Link with coaches",
    "50 credits per month",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="font-serif font-semibold text-lg">Plans &amp; Credits</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="text-center mb-10 space-y-3">
          <h2 className="text-4xl font-serif font-bold">Unlock AI-powered practice</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Free forever for searching questions and mark schemes. Subscribe to
            unlock AI marking, progress tracking, coaching and the Test Maker.
          </p>
          {user && (
            <p className="text-sm text-muted-foreground">
              Current balance: <span className="font-semibold text-foreground">{balance} credits</span>
              {isActive && status && (
                <>
                  {" "}· Plan: <span className="font-semibold text-foreground capitalize">{status}</span>
                  {currentPeriodEnd && (
                    <> · Renews/ends {new Date(currentPeriodEnd).toLocaleDateString()}</>
                  )}
                </>
              )}
            </p>
          )}
          {pastDue && (
            <div className="max-w-xl mx-auto rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
              Your last payment failed. We're retrying it — please update your payment method to keep your access.
            </div>
          )}
          {isActive && (
            <Button variant="outline" size="sm" onClick={openCustomerPortal} className="gap-2">
              <Settings className="h-4 w-4" /> Manage subscription
            </Button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-serif">Free</CardTitle>
              <p className="text-3xl font-serif font-bold mt-2">R0</p>
              <p className="text-sm text-muted-foreground">Sign in with Google</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Feature>Browse all past-paper questions</Feature>
              <Feature>View official mark schemes</Feature>
              <Feature>Soft daily limit on question views</Feature>
              <div className="text-xs text-muted-foreground pt-2">
                AI marking, hints, progress tracking, coaching and Test Maker require a subscription.
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary shadow-elevated relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> 7-day free trial
            </div>
            <CardHeader>
              <CardTitle className="font-serif">Math Pro</CardTitle>
              <p className="text-3xl font-serif font-bold mt-2">
                {fmtZAR(5000)}<span className="text-base font-normal text-muted-foreground">/month</span>
              </p>
              <p className="text-sm text-muted-foreground">10 credits free during trial, then 50 / month</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {planFeatures.map((f) => (
                <Feature key={f}>{f}</Feature>
              ))}
              <Button
                className="w-full mt-4"
                disabled={checkoutLoading || (isActive && status !== "canceled")}
                onClick={() => handleBuy("math_pro_monthly")}
              >
                {isActive && status !== "canceled"
                  ? "Active"
                  : checkoutLoading
                  ? "Opening checkout…"
                  : "Start 7-day free trial"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-serif font-semibold">Credit top-ups</h3>
            <p className="text-sm text-muted-foreground">
              Top-up credits roll over while your subscription is active. One AI marking uses 1 credit.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <TopUp
              title="Small top-up"
              price={fmtZAR(2500)}
              credits={25}
              disabled={!isActive || checkoutLoading}
              onBuy={() => handleBuy("credit_topup_25")}
            />
            <TopUp
              title="Large top-up"
              price={fmtZAR(5000)}
              credits={75}
              highlight
              disabled={!isActive || checkoutLoading}
              onBuy={() => handleBuy("credit_topup_75")}
            />
          </div>
          {!isActive && (
            <p className="text-xs text-muted-foreground">
              Top-ups are available once you have an active subscription.
            </p>
          )}
        </div>

        {loading && <p className="text-center text-sm text-muted-foreground mt-8">Loading…</p>}
      </main>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function TopUp({
  title,
  price,
  credits,
  highlight,
  disabled,
  onBuy,
}: {
  title: string;
  price: string;
  credits: number;
  highlight?: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="p-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-serif font-semibold text-lg">{title}</p>
          <p className="text-2xl font-bold">{price}</p>
          <p className="text-sm text-muted-foreground">{credits} credits</p>
        </div>
        <Button onClick={onBuy} disabled={disabled} variant={highlight ? "default" : "outline"}>
          Buy
        </Button>
      </CardContent>
    </Card>
  );
}
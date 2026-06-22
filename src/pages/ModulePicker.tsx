import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, User, Settings, FileEdit, GraduationCap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { CreditsPill } from "@/components/CreditsPill";
import { useSubscription } from "@/hooks/useSubscription";
import { useQuestionsVersion } from "@/lib/questionStore";
import {
  MODULES,
  ModuleCode,
  countByModule,
  setStoredModule,
  getStoredModule,
} from "@/lib/modules";

const ModulePicker = () => {
  const navigate = useNavigate();
  const { user, userRole, loading, signOut } = useAuth();
  const { isActive: hasSubscription } = useSubscription();
  // Re-render once DB questions finish loading so counts reflect uploads.
  useQuestionsVersion();
  const counts = countByModule();

  // Keep stored module fresh but don't auto-redirect — the picker is the home.
  useEffect(() => {
    const stored = getStoredModule();
    if (stored) {
      // no-op; user might want to switch
    }
  }, []);

  const chooseModule = (code: ModuleCode) => {
    setStoredModule(code);
    navigate(`/practice?module=${code}`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center justify-between gap-4 w-max min-w-full">
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-bold text-foreground">
                  Cambridge Maths 9709
                </h1>
                <p className="text-sm text-muted-foreground">
                  AS &amp; A Level Practice
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-nowrap whitespace-nowrap [&>*]:shrink-0">
              {loading ? (
                <div className="h-8 w-8 animate-pulse bg-secondary rounded-full" />
              ) : user ? (
                <>
                  <CreditsPill />
                  {!hasSubscription && userRole !== "admin" && (
                    <Button onClick={() => navigate("/pricing")} className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Upgrade
                    </Button>
                  )}
                  {hasSubscription && (
                    <Button variant="outline" onClick={() => navigate("/pricing")}>
                      Plans
                    </Button>
                  )}
                  {userRole === "admin" && (
                    <Button variant="outline" onClick={() => navigate("/admin")}>
                      <Settings className="h-4 w-4 mr-2" />
                      Admin Dashboard
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate("/progress")}>
                    <User className="h-4 w-4 mr-2" />
                    My Progress
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/coaching")}>
                    <GraduationCap className="h-4 w-4 mr-2" />
                    Coaching
                  </Button>
                  <Button variant="outline" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <Button onClick={() => navigate("/auth")}>Sign In</Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-12">
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground leading-tight">
            Choose your module
          </h2>
          <p className="text-lg text-muted-foreground">
            Pick a Cambridge 9709 module to start practising. You can switch
            modules at any time from the header.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {MODULES.map((m) => {
            const count = counts[m.code];
            const ready = count > 0;
            return (
              <Card
                key={m.code}
                onClick={() => chooseModule(m.code)}
                className="cursor-pointer border-border hover:border-primary/50 hover:shadow-elevated transition-all group"
              >
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                      <span className="font-serif font-bold text-primary text-lg">
                        {m.shortLabel}
                      </span>
                    </div>
                    {ready ? (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                        {count} question{count === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif font-semibold text-lg text-foreground">
                      {m.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{m.tagline}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <Button
            variant="outline"
            onClick={() => navigate("/test-maker")}
            className="gap-2"
          >
            <FileEdit className="h-4 w-4" />
            Open Test Maker
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ModulePicker;
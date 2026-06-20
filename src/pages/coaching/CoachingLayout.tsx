import { Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { NavLink } from "@/components/NavLink";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const CoachingLayout = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/auth?redirect=/coaching");
  }, [loading, user, navigate]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Home
            </Button>
            <h1 className="font-serif text-lg font-semibold text-foreground">Coaching</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <NavLink
              to="/coaching"
              end
              className="text-muted-foreground hover:text-foreground"
              activeClassName="text-foreground font-medium"
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/coaching/connections"
              className="text-muted-foreground hover:text-foreground"
              activeClassName="text-foreground font-medium"
            >
              Connections
            </NavLink>
            <NavLink
              to="/coaching/help"
              className="text-muted-foreground hover:text-foreground"
              activeClassName="text-foreground font-medium"
            >
              Requests
            </NavLink>
            <NavLink
              to="/coaching/sessions"
              className="text-muted-foreground hover:text-foreground"
              activeClassName="text-foreground font-medium"
            >
              Sessions
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="container mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default CoachingLayout;
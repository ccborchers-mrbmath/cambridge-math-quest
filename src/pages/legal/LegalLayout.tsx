import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  updated?: string;
  children: ReactNode;
}

export default function LegalLayout({ title, updated, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="font-serif font-semibold text-lg">{title}</h1>
          <div className="w-16" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-10 max-w-3xl prose prose-slate dark:prose-invert">
        {updated && (
          <p className="text-sm text-muted-foreground mb-6">Last updated: {updated}</p>
        )}
        <article className="space-y-5 text-foreground leading-relaxed">{children}</article>
        <div className="mt-12 flex gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:underline">Terms</Link>
          <Link to="/refund" className="hover:underline">Refund Policy</Link>
          <Link to="/privacy" className="hover:underline">Privacy</Link>
        </div>
      </main>
    </div>
  );
}
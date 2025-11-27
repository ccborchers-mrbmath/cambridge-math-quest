import { useState } from "react";
import { Question } from "@/data/questions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Lightbulb, FileText, Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface QuestionDisplayProps {
  question: Question;
}

export const QuestionDisplay = ({ question }: QuestionDisplayProps) => {
  const [showMarkscheme, setShowMarkscheme] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  const handleHint = async () => {
    if (hint) {
      setHint(null);
      return;
    }

    setIsLoadingHint(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-hint', {
        body: { questionUrl: question.questionUrl }
      });

      if (error) throw error;

      if (data?.hint) {
        setHint(data.hint);
        toast.success("Hint generated!");
      } else {
        toast.error("Failed to generate hint");
      }
    } catch (error) {
      console.error("Error generating hint:", error);
      toast.error("Failed to generate hint. Please try again.");
    } finally {
      setIsLoadingHint(false);
    }
  };

  const handleMarkWork = () => {
    setShowCamera(!showCamera);
    if (!showCamera) {
      toast.info("Camera feature coming soon! You'll be able to photograph your work for AI marking.");
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Question metadata */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-foreground">
            Question {question.questionNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {question.year} {question.sitting} • Paper {question.paperNumber}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-primary">{question.topic}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{question.subtopics}</p>
        </div>
      </div>

      {/* Question image */}
      <Card className="overflow-hidden shadow-elevated border-border">
        <img
          src={question.questionUrl}
          alt={`Question ${question.questionNumber}`}
          className="w-full h-auto"
        />
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-4 justify-center">
        <Button
          onClick={handleHint}
          variant="outline"
          disabled={isLoadingHint}
          className="gap-2 h-12 px-6 border-primary/30 hover:bg-primary/5 hover:border-primary transition-all"
        >
          {isLoadingHint ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Lightbulb className="h-5 w-5 text-amber" />
          )}
          {isLoadingHint ? "Generating hint..." : hint ? "Hide hint" : "Give me a hint"}
        </Button>

        <Button
          onClick={() => setShowMarkscheme(!showMarkscheme)}
          variant="outline"
          className="gap-2 h-12 px-6 border-primary/30 hover:bg-primary/5 hover:border-primary transition-all"
        >
          <FileText className="h-5 w-5 text-primary" />
          {showMarkscheme ? "Hide" : "Show"} markscheme
        </Button>

        <Button
          onClick={handleMarkWork}
          className="gap-2 h-12 px-6 bg-accent hover:bg-accent/90 text-accent-foreground shadow-sm transition-all"
        >
          <Camera className="h-5 w-5" />
          Mark my work
        </Button>
      </div>

      {/* Hint display */}
      {hint && (
        <Card className="p-6 shadow-elevated border-border bg-amber/5 border-amber/20 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-6 w-6 text-amber flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-serif font-semibold text-foreground mb-2">Hint</h3>
              <p className="text-foreground/80 leading-relaxed">{hint}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHint(null)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Markscheme display */}
      {showMarkscheme && (
        <Card className="overflow-hidden shadow-elevated border-border animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-4 bg-secondary border-b border-border flex items-center justify-between">
            <h3 className="font-serif font-semibold text-foreground">Markscheme</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMarkscheme(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <img
            src={question.markschemeUrl}
            alt={`Markscheme for Question ${question.questionNumber}`}
            className="w-full h-auto"
          />
        </Card>
      )}

      {/* Camera placeholder */}
      {showCamera && (
        <Card className="p-8 shadow-elevated border-border animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="text-center space-y-4">
            <Camera className="h-16 w-16 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-serif font-semibold text-foreground mb-2">
                Camera Feature
              </h3>
              <p className="text-muted-foreground">
                Camera integration coming soon! You'll be able to take a photo of your work and receive AI-powered marking and feedback.
              </p>
            </div>
            <Button
              onClick={() => setShowCamera(false)}
              variant="outline"
            >
              Close
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Upload, X, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { questionsDatabase, type Question } from "@/data/questions";
import { logger } from "@/lib/logger";
import { filesToWorkImages } from "@/utils/workImages";

export interface Identification {
  year: number | null;
  sitting: string | null;
  paperNumber: number | null;
  questionNumber: number | null;
  questionSnippet: string | null;
  footerReference: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

interface IdentifyWorkPanelProps {
  /** Questions for the active module — searched first, before the whole index. */
  pool: Question[];
  /** Handed the matched question plus the photos already taken, so the student
   *  never re-photographs the same pages. */
  onIdentified: (question: Question, workImages: string[]) => void;
  /** Called with whatever was read when no question could be pinned down, so
   *  the page can pre-fill its dropdowns. */
  onPartial?: (identification: Identification) => void;
  /** Gate for users without AI access; return false to block and prompt. */
  onRequireAi?: () => boolean;
}

const MAX_PAGES = 12;

/** Papers the app holds, as compact lines the model can snap its answer to. */
const paperCatalogue = (pool: Question[]): string[] => {
  const seen = new Set<string>();
  for (const q of pool) {
    seen.add(`${q.year} ${q.sitting} Paper ${q.paperNumber}`);
  }
  return [...seen].sort();
};

const findQuestion = (
  pool: Question[],
  id: Identification,
): Question | null => {
  const { year, sitting, paperNumber, questionNumber } = id;
  if (year === null || !sitting || paperNumber === null || questionNumber === null) {
    return null;
  }
  const matches = (q: Question) =>
    q.year === year &&
    q.sitting === sitting &&
    q.paperNumber === paperNumber &&
    q.questionNumber === questionNumber;

  // The active module first; fall back to the whole index so a student who
  // photographed a P1 paper while P3 is selected still gets their question.
  return pool.find(matches) ?? questionsDatabase.find(matches) ?? null;
};

const describe = (id: Identification): string => {
  const parts = [
    id.year ?? "????",
    id.sitting ?? "?",
    id.paperNumber !== null ? `Paper ${id.paperNumber}` : "Paper ?",
    id.questionNumber !== null ? `Q${id.questionNumber}` : "Q?",
  ];
  return parts.join(" ");
};

export const IdentifyWorkPanel = ({
  pool,
  onIdentified,
  onPartial,
  onRequireAi,
}: IdentifyWorkPanelProps) => {
  const [images, setImages] = useState<string[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsReading(true);
    setProblem(null);
    try {
      const { images: added, skipped } = await filesToWorkImages(files);
      for (const reason of skipped) toast.error(reason);
      if (added.length === 0) return;
      setImages((prev) => {
        const next = [...prev, ...added].slice(0, MAX_PAGES);
        if (prev.length + added.length > MAX_PAGES) {
          toast.error(`Only the first ${MAX_PAGES} pages are used`);
        }
        return next;
      });
    } finally {
      setIsReading(false);
    }
  };

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) await addFiles(Array.from(files));
    event.target.value = "";
  };

  const identify = async () => {
    if (images.length === 0) return;
    if (onRequireAi && !onRequireAi()) return;
    setIsIdentifying(true);
    setProblem(null);
    try {
      const { data, error } = await supabase.functions.invoke("identify-question", {
        body: { images, catalogue: paperCatalogue(pool) },
      });
      if (error) throw error;

      const id = (data as { identification?: Identification })?.identification;
      if (!id) {
        setProblem("The photos couldn't be read. Try again with a clearer shot.");
        return;
      }

      const question = findQuestion(pool, id);
      if (question) {
        toast.success(`Found ${describe(id)}`);
        onIdentified(question, images);
        return;
      }

      // Read something, but nothing that resolves to a question we hold.
      onPartial?.(id);
      const detected = describe(id);
      setProblem(
        id.year === null && id.paperNumber === null
          ? id.notes ??
              "No paper reference was visible. Include a photo showing the footer " +
                "(e.g. 9709/11/M/J/25) or the printed question itself."
          : `Read ${detected}, but that question isn't in the library yet. ` +
              "Check the dropdowns below — they've been filled in with what was found.",
      );
    } catch (err) {
      logger.error("identify-question failed", err);
      setProblem("Couldn't identify the question. Please try again.");
    } finally {
      setIsIdentifying(false);
    }
  };

  const busy = isReading || isIdentifying;

  return (
    <Card className="p-5 text-left bg-card/60 border-primary/20">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
          <ScanLine className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif font-semibold text-foreground">
            Working from a printed paper?
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Photograph your work — include the page footer (e.g.{" "}
            <span className="font-mono text-xs">9709/11/M/J/25</span>) or the printed
            question, and we'll find the question for you. No dropdowns needed.
          </p>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {images.map((src, i) => (
                <div key={i} className="relative">
                  <img
                    src={src}
                    alt={`Page ${i + 1}`}
                    className="h-20 w-16 object-cover rounded border border-border"
                  />
                  <button
                    type="button"
                    aria-label={`Remove page ${i + 1}`}
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {problem && (
            <p className="mt-3 text-sm text-destructive">{problem}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={onPick}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={onPick}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              Take photo
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            {images.length > 0 && (
              <Button size="sm" onClick={identify} disabled={busy}>
                {isIdentifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ScanLine className="h-4 w-4 mr-2" />
                )}
                {isIdentifying ? "Finding question…" : "Find my question"}
              </Button>
            )}
            {isReading && (
              <span className="text-sm text-muted-foreground self-center">
                Reading pages…
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

import { useState, useEffect } from "react";
import { Question, questionsDatabase } from "@/data/questions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Eye, EyeOff, Loader2 } from "lucide-react";
import { processQuestionImage } from "@/utils/imageProcessing";

interface TopicTestProps {
  topic: string;
  onBack: () => void;
}

interface ProcessedQuestion {
  original: Question;
  newNumber: number;
  processedImageUrl: string | null;
  processedMarkschemeUrl: string | null;
}

// Get 3 varied questions for a topic, trying to get different subtopics
const selectVariedQuestions = (topic: string): Question[] => {
  const topicQuestions = questionsDatabase.filter(
    (q) => q.topic.toLowerCase() === topic.toLowerCase()
  );

  if (topicQuestions.length <= 3) {
    return topicQuestions;
  }

  // Group by subtopic to ensure variety
  const subtopicGroups = new Map<string, Question[]>();
  topicQuestions.forEach((q) => {
    // Use first subtopic as key for grouping
    const firstSubtopic = q.subtopics.split(",")[0].trim();
    if (!subtopicGroups.has(firstSubtopic)) {
      subtopicGroups.set(firstSubtopic, []);
    }
    subtopicGroups.get(firstSubtopic)!.push(q);
  });

  const selected: Question[] = [];
  const groups = Array.from(subtopicGroups.values());

  // Shuffle groups for randomness
  groups.sort(() => Math.random() - 0.5);

  // Pick one from each group until we have 3
  let groupIndex = 0;
  while (selected.length < 3) {
    const group = groups[groupIndex % groups.length];
    const unselected = group.filter((q) => !selected.includes(q));
    if (unselected.length > 0) {
      const randomIndex = Math.floor(Math.random() * unselected.length);
      selected.push(unselected[randomIndex]);
    }
    groupIndex++;
    // Safety check to avoid infinite loop
    if (groupIndex > groups.length * 3) break;
  }

  return selected;
};

export const TopicTest = ({ topic, onBack }: TopicTestProps) => {
  const [processedQuestions, setProcessedQuestions] = useState<ProcessedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMarkschemes, setShowMarkschemes] = useState(false);
  const [processingMarkschemes, setProcessingMarkschemes] = useState(false);

  useEffect(() => {
    const generateTest = async () => {
      setLoading(true);
      const questions = selectVariedQuestions(topic);

      // Process each question image with new numbering
      const processed: ProcessedQuestion[] = await Promise.all(
        questions.map(async (q, index) => {
          const newNumber = index + 1;
          try {
            const processedImageUrl = await processQuestionImage(
              q.questionUrl,
              newNumber
            );
            return {
              original: q,
              newNumber,
              processedImageUrl,
              processedMarkschemeUrl: null,
            };
          } catch (error) {
            console.error("Error processing image:", error);
            return {
              original: q,
              newNumber,
              processedImageUrl: null,
              processedMarkschemeUrl: null,
            };
          }
        })
      );

      setProcessedQuestions(processed);
      setLoading(false);
    };

    generateTest();
  }, [topic]);

  // Process markscheme images when toggled on
  const handleToggleMarkschemes = async () => {
    if (showMarkschemes) {
      setShowMarkschemes(false);
      return;
    }

    // Check if markschemes need processing
    const needsProcessing = processedQuestions.some(
      (pq) => !pq.processedMarkschemeUrl
    );

    if (needsProcessing) {
      setProcessingMarkschemes(true);
      const updated = await Promise.all(
        processedQuestions.map(async (pq) => {
          if (pq.processedMarkschemeUrl) return pq;
          try {
            const processedMarkschemeUrl = await processQuestionImage(
              pq.original.markschemeUrl,
              pq.newNumber
            );
            return { ...pq, processedMarkschemeUrl };
          } catch (error) {
            console.error("Error processing markscheme:", error);
            return pq;
          }
        })
      );
      setProcessedQuestions(updated);
      setProcessingMarkschemes(false);
    }

    setShowMarkschemes(true);
  };

  // Download all images as a combined test
  const handleDownload = async () => {
    const images = showMarkschemes
      ? processedQuestions.flatMap((pq) => [
          pq.processedImageUrl,
          pq.processedMarkschemeUrl,
        ])
      : processedQuestions.map((pq) => pq.processedImageUrl);

    // For now, download individual images
    images.forEach((url, index) => {
      if (url) {
        const link = document.createElement("a");
        link.download = `${topic.replace(/\s+/g, "_")}_test_${index + 1}.jpg`;
        link.href = url;
        link.click();
      }
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          Generating your {topic} test...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-serif font-bold text-foreground">
              {topic} Test
            </h2>
            <p className="text-sm text-muted-foreground">
              3 varied questions on {topic.toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleToggleMarkschemes}
            disabled={processingMarkschemes}
          >
            {processingMarkschemes ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : showMarkschemes ? (
              <EyeOff className="h-4 w-4 mr-2" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            {showMarkschemes ? "Hide Markschemes" : "Show Markschemes"}
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-8">
        {processedQuestions.map((pq) => (
          <div key={pq.newNumber} className="space-y-4">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-border bg-secondary/30">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Question {pq.newNumber}</span>
                  <span className="text-sm text-muted-foreground">
                    {pq.original.subtopics}
                  </span>
                </div>
              </div>
              <div className="p-4">
                {pq.processedImageUrl ? (
                  <img
                    src={pq.processedImageUrl}
                    alt={`Question ${pq.newNumber}`}
                    className="w-full rounded-lg"
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Failed to load question image
                  </div>
                )}
              </div>
            </div>

            {/* Markscheme */}
            {showMarkschemes && (
              <div className="bg-card border border-primary/30 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-primary/30 bg-primary/5">
                  <span className="font-medium text-primary">
                    Markscheme - Question {pq.newNumber}
                  </span>
                </div>
                <div className="p-4">
                  {pq.processedMarkschemeUrl ? (
                    <img
                      src={pq.processedMarkschemeUrl}
                      alt={`Markscheme ${pq.newNumber}`}
                      className="w-full rounded-lg"
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Failed to load markscheme image
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Original source info */}
      <div className="border-t border-border pt-6 mt-8">
        <p className="text-sm text-muted-foreground text-center">
          Questions sourced from Cambridge 9709 past papers:
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {processedQuestions.map((pq) => (
            <span
              key={pq.newNumber}
              className="text-xs bg-secondary px-2 py-1 rounded"
            >
              Q{pq.newNumber}: {pq.original.year} {pq.original.sitting} P
              {pq.original.paperNumber} Q{pq.original.questionNumber}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { questionsDatabase, Question } from "@/data/questions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Clock, Award, Loader2 } from "lucide-react";

// Proxy URL for images to bypass CORS
const getProxiedImageUrl = (originalUrl: string): string => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/image-proxy?url=${encodeURIComponent(originalUrl)}`;
};

// Find the vertical baseline of the first line of text by scanning for dark pixels
const findTextBaseline = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number
): number => {
  const defaultBaseline = 105;
  const scanStartX = 260;
  const scanEndX = Math.min(canvasWidth, 500);
  const scanStartY = 20;
  const scanEndY = 150;
  const darkThreshold = 200;

  try {
    for (let y = scanStartY; y < scanEndY; y++) {
      const imageData = ctx.getImageData(scanStartX, y, scanEndX - scanStartX, 1);
      let darkPixelCount = 0;

      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        if (r < darkThreshold && g < darkThreshold && b < darkThreshold) {
          darkPixelCount++;
        }
      }

      if (darkPixelCount > 3) {
        return y + 38;
      }
    }
  } catch (e) {
    console.warn("Text detection failed, using default position");
  }

  return defaultBaseline;
};

// Process image: draw white rectangle and new number
const processQuestionImage = async (
  imageUrl: string,
  newNumber: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const textBaseline = findTextBaseline(ctx, img.width);

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 255, 155);

      ctx.fillStyle = "#000000";
      ctx.font = "bold 48px 'Times New Roman', Times, serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${newNumber}`, 228, textBaseline);

      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };

    img.onerror = () => {
      console.error("Failed to load image:", imageUrl);
      reject(new Error("Failed to load image"));
    };

    img.src = getProxiedImageUrl(imageUrl);
  });
};

interface ProcessedQuestion {
  original: Question;
  newNumber: number;
  processedImageUrl: string | null;
}

const TestMaker = () => {
  const navigate = useNavigate();
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [isCompiled, setIsCompiled] = useState(false);
  const [processedQuestions, setProcessedQuestions] = useState<ProcessedQuestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get unique topics
  const allTopics = useMemo(() => 
    Array.from(new Set(questionsDatabase.map(q => q.topic))).sort(),
    []
  );

  // Get questions for selected topics
  const filteredQuestions = useMemo(() => 
    questionsDatabase.filter(q => selectedTopics.has(q.topic)),
    [selectedTopics]
  );

  // Get selected question objects
  const compiledQuestions = useMemo(() => 
    questionsDatabase.filter(q => selectedQuestions.has(getQuestionId(q))),
    [selectedQuestions]
  );

  // Calculate test stats
  const testStats = useMemo(() => {
    const totalMarks = compiledQuestions.reduce((sum, q) => sum + q.marks, 0);
    // Estimate 1.5 minutes per mark
    const timeMinutes = Math.ceil(totalMarks * 1.5);
    const hours = Math.floor(timeMinutes / 60);
    const minutes = timeMinutes % 60;
    const timeString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} minutes`;

    // Estimate grade thresholds (rough approximation based on typical Cambridge thresholds)
    const gradeThresholds = {
      A: Math.round(totalMarks * 0.80),
      B: Math.round(totalMarks * 0.70),
      C: Math.round(totalMarks * 0.60),
      D: Math.round(totalMarks * 0.50),
      E: Math.round(totalMarks * 0.40),
    };

    return { totalMarks, timeString, gradeThresholds };
  }, [compiledQuestions]);

  function getQuestionId(q: Question) {
    return `${q.year}-${q.sitting}-${q.paperNumber}-${q.questionNumber}`;
  }

  const toggleTopic = (topic: string) => {
    const newTopics = new Set(selectedTopics);
    if (newTopics.has(topic)) {
      newTopics.delete(topic);
      // Remove questions from deselected topic
      const newQuestions = new Set(selectedQuestions);
      questionsDatabase
        .filter(q => q.topic === topic)
        .forEach(q => newQuestions.delete(getQuestionId(q)));
      setSelectedQuestions(newQuestions);
    } else {
      newTopics.add(topic);
    }
    setSelectedTopics(newTopics);
  };

  const toggleQuestion = (questionId: string) => {
    const newQuestions = new Set(selectedQuestions);
    if (newQuestions.has(questionId)) {
      newQuestions.delete(questionId);
    } else {
      newQuestions.add(questionId);
    }
    setSelectedQuestions(newQuestions);
  };

  const selectAllInTopic = (topic: string) => {
    const newQuestions = new Set(selectedQuestions);
    questionsDatabase
      .filter(q => q.topic === topic)
      .forEach(q => newQuestions.add(getQuestionId(q)));
    setSelectedQuestions(newQuestions);
  };

  const deselectAllInTopic = (topic: string) => {
    const newQuestions = new Set(selectedQuestions);
    questionsDatabase
      .filter(q => q.topic === topic)
      .forEach(q => newQuestions.delete(getQuestionId(q)));
    setSelectedQuestions(newQuestions);
  };

  // Process images and compile test
  const handleCompileTest = async () => {
    setIsProcessing(true);
    
    const processed: ProcessedQuestion[] = await Promise.all(
      compiledQuestions.map(async (q, index) => {
        const newNumber = index + 1;
        try {
          const processedImageUrl = await processQuestionImage(q.questionUrl, newNumber);
          return {
            original: q,
            newNumber,
            processedImageUrl,
          };
        } catch (error) {
          console.error("Error processing image:", error);
          return {
            original: q,
            newNumber,
            processedImageUrl: null,
          };
        }
      })
    );

    setProcessedQuestions(processed);
    setIsProcessing(false);
    setIsCompiled(true);
  };

  if (isCompiled) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
        <header className="border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setIsCompiled(false)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Selection
                </Button>
              </div>
              <Button variant="outline" onClick={() => navigate("/")}>
                Return Home
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          {/* Test Info Card */}
          <Card className="mb-8 bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{testStats.totalMarks}</p>
                    <p className="text-sm text-muted-foreground">Total Marks</p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Clock className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{testStats.timeString}</p>
                    <p className="text-sm text-muted-foreground">Suggested Time</p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Award className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Grade Thresholds</p>
                    <p className="text-xs text-muted-foreground">
                      A: {testStats.gradeThresholds.A} | B: {testStats.gradeThresholds.B} | C: {testStats.gradeThresholds.C} | D: {testStats.gradeThresholds.D} | E: {testStats.gradeThresholds.E}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          <div className="space-y-6">
            {processedQuestions.map((pq) => (
              <Card key={getQuestionId(pq.original)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    Question {pq.newNumber} 
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({pq.original.marks} marks) - {pq.original.topic}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {pq.original.year} {pq.original.sitting} Paper {pq.original.paperNumber} Q{pq.original.questionNumber}
                  </p>
                </CardHeader>
                <CardContent>
                  {pq.processedImageUrl ? (
                    <img 
                      src={pq.processedImageUrl} 
                      alt={`Question ${pq.newNumber}`}
                      className="w-full max-w-3xl rounded-lg border"
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Failed to load question image
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => navigate("/")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-serif font-bold text-foreground">Test Maker</h1>
                <p className="text-sm text-muted-foreground">Create your custom practice test</p>
              </div>
            </div>
            <Button 
              onClick={handleCompileTest}
              disabled={selectedQuestions.size === 0 || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Compile Test ({selectedQuestions.size} questions)
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Topic Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Select Topics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {allTopics.map(topic => (
                <div key={topic} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`topic-${topic}`}
                    checked={selectedTopics.has(topic)}
                    onCheckedChange={() => toggleTopic(topic)}
                  />
                  <label 
                    htmlFor={`topic-${topic}`}
                    className="text-sm font-medium cursor-pointer flex-1"
                  >
                    {topic}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    ({questionsDatabase.filter(q => q.topic === topic).length})
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Question Selection */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">2. Select Questions</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedTopics.size === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Select topics to see available questions
                </p>
              ) : (
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                  {Array.from(selectedTopics).sort().map(topic => {
                    const topicQuestions = filteredQuestions.filter(q => q.topic === topic);
                    const selectedInTopic = topicQuestions.filter(q => selectedQuestions.has(getQuestionId(q))).length;
                    
                    return (
                      <div key={topic} className="space-y-2">
                        <div className="flex items-center justify-between sticky top-0 bg-card py-2">
                          <h3 className="font-semibold text-sm">{topic}</h3>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => selectAllInTopic(topic)}
                            >
                              Select All
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => deselectAllInTopic(topic)}
                            >
                              Clear
                            </Button>
                            <span className="text-xs text-muted-foreground self-center">
                              {selectedInTopic}/{topicQuestions.length}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {topicQuestions.map(question => {
                            const qId = getQuestionId(question);
                            return (
                              <div 
                                key={qId}
                                className={`flex items-start space-x-2 p-3 rounded-lg border transition-colors cursor-pointer ${
                                  selectedQuestions.has(qId) 
                                    ? 'bg-primary/10 border-primary/30' 
                                    : 'bg-card hover:bg-secondary/50'
                                }`}
                                onClick={() => toggleQuestion(qId)}
                              >
                                <Checkbox 
                                  checked={selectedQuestions.has(qId)}
                                  onCheckedChange={() => toggleQuestion(qId)}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">
                                    {question.year} {question.sitting} P{question.paperNumber} Q{question.questionNumber}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {question.subtopics}
                                  </p>
                                  <p className="text-xs text-primary font-medium">
                                    {question.marks} marks
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default TestMaker;

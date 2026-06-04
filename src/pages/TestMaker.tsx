import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { questionsDatabase, Question } from "@/data/questions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Clock, Award, Loader2, Download, ChevronUp, ChevronDown, GripVertical, BookOpen, Eye, EyeOff, ImageDown } from "lucide-react";
import { processQuestionImage } from "@/utils/imageProcessing";
import { ensureMarkschemeText } from "@/utils/ensureMarkschemeText";
import { renderLatexToHtml } from "@/utils/renderLatex";
import { LatexRenderer } from "@/components/LatexRenderer";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProcessedQuestion {
  original: Question;
  newNumber: number;
  processedImageUrl: string | null;
  markschemeText: string | null;
}

function getQuestionId(q: Question) {
  return `${q.year}-${q.sitting}-${q.paperNumber}-${q.questionNumber}`;
}

/**
 * Rewrite the original Cambridge question number in the extracted mark-scheme
 * text (e.g. "9(b)", "9(b)(i)") to the test's renumbered value (e.g. "1(b)").
 * Targets a digit run immediately followed by "(letter)" to avoid touching
 * unrelated numbers in the working/guidance cells.
 */
function renumberMarkschemeText(text: string, newNumber: number): string {
  return text.replace(/\b\d+(?=\([a-z]\))/g, String(newNumber));
}

/**
 * Wrap the rendered mark-scheme HTML so that each standard 4-column table
 * gets a <colgroup> with sensible widths (Part / Answer / Marks / Guidance).
 */
function withColgroups(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll("table").forEach((t) => {
    const headCells = t.querySelectorAll("thead th").length;
    if (headCells === 4 && !t.querySelector("colgroup")) {
      const colgroup = document.createElement("colgroup");
      colgroup.innerHTML =
        '<col class="col-part"><col class="col-answer"><col class="col-marks"><col class="col-guidance">';
      t.insertBefore(colgroup, t.firstChild);
    }
  });
  return tmp.innerHTML;
}

const TestMaker = () => {
  const navigate = useNavigate();
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [isCompiled, setIsCompiled] = useState(false);
  const [processedQuestions, setProcessedQuestions] = useState<ProcessedQuestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [includeMarkschemes, setIncludeMarkschemes] = useState(true);
  const [showMarkschemes, setShowMarkschemes] = useState(false);

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

  // Get selected question objects in order
  const compiledQuestions = useMemo(() => 
    selectedQuestionIds
      .map(id => questionsDatabase.find(q => getQuestionId(q) === id))
      .filter((q): q is Question => q !== undefined),
    [selectedQuestionIds]
  );

  // Helper to check if question is selected
  const isQuestionSelected = (questionId: string) => selectedQuestionIds.includes(questionId);

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

  const toggleTopic = (topic: string) => {
    const newTopics = new Set(selectedTopics);
    if (newTopics.has(topic)) {
      newTopics.delete(topic);
      // Remove questions from deselected topic
      const idsToRemove = questionsDatabase
        .filter(q => q.topic === topic)
        .map(q => getQuestionId(q));
      setSelectedQuestionIds(prev => prev.filter(id => !idsToRemove.includes(id)));
    } else {
      newTopics.add(topic);
    }
    setSelectedTopics(newTopics);
  };

  const toggleQuestion = (questionId: string) => {
    setSelectedQuestionIds(prev => {
      if (prev.includes(questionId)) {
        return prev.filter(id => id !== questionId);
      } else {
        return [...prev, questionId];
      }
    });
  };

  const selectAllInTopic = (topic: string) => {
    const topicIds = questionsDatabase
      .filter(q => q.topic === topic)
      .map(q => getQuestionId(q));
    setSelectedQuestionIds(prev => {
      const newIds = [...prev];
      topicIds.forEach(id => {
        if (!newIds.includes(id)) newIds.push(id);
      });
      return newIds;
    });
  };

  const deselectAllInTopic = (topic: string) => {
    const topicIds = questionsDatabase
      .filter(q => q.topic === topic)
      .map(q => getQuestionId(q));
    setSelectedQuestionIds(prev => prev.filter(id => !topicIds.includes(id)));
  };

  // Reorder functions
  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedQuestionIds.length) return;
    
    setSelectedQuestionIds(prev => {
      const newArr = [...prev];
      [newArr[index], newArr[newIndex]] = [newArr[newIndex], newArr[index]];
      return newArr;
    });
  };

  // Process images and compile test
  const handleCompileTest = async () => {
    setIsProcessing(true);
    
    const processed: ProcessedQuestion[] = await Promise.all(
      compiledQuestions.map(async (q, index) => {
        const newNumber = index + 1;
        try {
          const [processedImageUrl, rawMarkschemeText] = await Promise.all([
            processQuestionImage(q.questionUrl, newNumber),
            includeMarkschemes ? ensureMarkschemeText(q) : Promise.resolve(null),
          ]);
          const markschemeText = rawMarkschemeText
            ? renumberMarkschemeText(rawMarkschemeText, newNumber)
            : null;
          return {
            original: q,
            newNumber,
            processedImageUrl,
            markschemeText,
          };
        } catch (error) {
          console.error("Error processing image:", error);
          return {
            original: q,
            newNumber,
            processedImageUrl: null,
            markschemeText: null,
          };
        }
      })
    );

    setProcessedQuestions(processed);
    setIsProcessing(false);
    setIsCompiled(true);
  };

  // Download all renumbered question images individually
  const handleDownloadImages = () => {
    processedQuestions.forEach((pq) => {
      if (pq.processedImageUrl) {
        const link = document.createElement("a");
        link.href = pq.processedImageUrl;
        link.download = `Q${pq.newNumber}_${pq.original.topic.replace(/\s+/g, "_")}_${pq.original.year}_${pq.original.sitting}_P${pq.original.paperNumber}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  };

  // Generate and download PDF
  const handleDownloadPDF = async () => {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    // Cover Page - white background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    // Top accent bar
    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, 0, pageWidth, 8, 'F');

    // Title
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(34);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Custom Practice Test', pageWidth / 2, 60, { align: 'center' });

    // Divider line
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    pdf.line(margin, 70, pageWidth - margin, 70);

    // Test stats
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(71, 85, 105);
    pdf.text(`${processedQuestions.length} Questions  ·  ${testStats.totalMarks} Marks  ·  Time: ${testStats.timeString}`, pageWidth / 2, 82, { align: 'center' });

    // Grade thresholds box
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(margin, 95, contentWidth, 22, 3, 3, 'F');
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.text('Grade Thresholds', margin + 8, 105);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(71, 85, 105);
    const thresholds = `A: ${testStats.gradeThresholds.A}   B: ${testStats.gradeThresholds.B}   C: ${testStats.gradeThresholds.C}   D: ${testStats.gradeThresholds.D}   E: ${testStats.gradeThresholds.E}`;
    pdf.text(thresholds, pageWidth - margin - 8, 105, { align: 'right' });

    // Topics Covered section
    const topics = Array.from(new Set(processedQuestions.map(pq => pq.original.topic)));
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('Topics Covered', margin, 138);

    // Underline for Topics heading
    pdf.setDrawColor(30, 41, 59);
    pdf.setLineWidth(1);
    pdf.line(margin, 142, margin + 62, 142);

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 41, 59);
    topics.forEach((topic, i) => {
      const yPos = 154 + (i * 10);
      // bullet dot
      pdf.setFillColor(30, 41, 59);
      pdf.circle(margin + 2, yPos - 2, 1.2, 'F');
      pdf.text(`${topic}`, margin + 8, yPos);
    });

    // Bottom accent bar + footer
    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, pageHeight - 18, pageWidth, 18, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    pdf.text('Good luck!', pageWidth / 2, pageHeight - 7, { align: 'center' });

    let currentPageNum = 2;

    // Add questions - one per two pages (question page + blank working page)
    for (let i = 0; i < processedQuestions.length; i++) {
      const pq = processedQuestions[i];
      
      // Question page
      pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Question header
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Question ${pq.newNumber}`, margin, margin);
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${pq.original.marks} marks | ${pq.original.topic}`, margin, margin + 6);
      
      // Add image if available
      if (pq.processedImageUrl) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = pq.processedImageUrl!;
          });

          const imgAspectRatio = img.width / img.height;
          // Stretch full page width (edge to edge), no side margins
          const imgWidth = pageWidth;
          const imgHeight = imgWidth / imgAspectRatio;

          pdf.addImage(img, 'PNG', 0, margin + 15, imgWidth, imgHeight);
        } catch (error) {
          console.error('Error adding image to PDF:', error);
          pdf.setTextColor(200, 0, 0);
          pdf.text('Error loading question image', margin, margin + 30);
        }
      }

      // Page number
      pdf.setTextColor(150, 150, 150);
      pdf.setFontSize(10);
      pdf.text(`Page ${currentPageNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      currentPageNum++;

      // Blank working page
      pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Working space header
      pdf.setTextColor(200, 200, 200);
      pdf.setFontSize(12);
      pdf.text(`Working space for Question ${pq.newNumber}`, pageWidth / 2, margin, { align: 'center' });
      
      // Page number
      pdf.setTextColor(150, 150, 150);
      pdf.setFontSize(10);
      pdf.text(`Page ${currentPageNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      currentPageNum++;
    }

    // Add markschemes section if included
    const hasMarkschemes = processedQuestions.some(pq => pq.markschemeText);
    if (includeMarkschemes && hasMarkschemes) {
      // Markscheme cover page
      pdf.addPage();
      pdf.setFillColor(30, 41, 59);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(32);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Mark Schemes', pageWidth / 2, pageHeight / 2 - 20, { align: 'center' });
      
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${processedQuestions.length} Questions`, pageWidth / 2, pageHeight / 2 + 10, { align: 'center' });
      
      pdf.setFontSize(10);
      pdf.text(`Page ${currentPageNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      currentPageNum++;

      // Add each markscheme
      for (let i = 0; i < processedQuestions.length; i++) {
        const pq = processedQuestions[i];
        
        pdf.addPage();
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        
        // Markscheme header
        pdf.setTextColor(30, 41, 59);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Mark Scheme - Question ${pq.newNumber}`, margin, margin);
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(`${pq.original.marks} marks | ${pq.original.topic}`, margin, margin + 6);
        
        // Render markscheme text to canvas, then embed in PDF
        if (pq.markschemeText) {
          try {
            const canvas = await renderMarkschemeToCanvas(pq.markschemeText);
            const imgAspect = canvas.width / canvas.height;
            let imgWidth = contentWidth;
            let imgHeight = imgWidth / imgAspect;
            const maxHeight = pageHeight - margin - 35;
            if (imgHeight > maxHeight) {
              imgHeight = maxHeight;
              imgWidth = imgHeight * imgAspect;
            }
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin + 15, imgWidth, imgHeight);
          } catch (error) {
            console.error('Error rendering markscheme:', error);
            pdf.setTextColor(200, 0, 0);
            pdf.text('Error rendering markscheme', margin, margin + 30);
          }
        } else {
          pdf.setTextColor(150, 150, 150);
          pdf.text('Mark scheme text not yet available', margin, margin + 30);
        }

        // Page number
        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(10);
        pdf.text(`Page ${currentPageNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        currentPageNum++;
      }
    }

    // Download the PDF
    const date = new Date().toISOString().split('T')[0];
    pdf.save(`practice-test-${date}.pdf`);
  };

  if (isCompiled) {
    const hasMarkschemes = processedQuestions.some(pq => pq.markschemeText);
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
        <header className="border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setIsCompiled(false)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Selection
                </Button>
              </div>
              <div className="flex items-center gap-4">
                {hasMarkschemes && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="show-markschemes"
                      checked={showMarkschemes}
                      onCheckedChange={setShowMarkschemes}
                    />
                    <Label htmlFor="show-markschemes" className="text-sm flex items-center gap-1">
                      {showMarkschemes ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      Markschemes
                    </Label>
                  </div>
                )}
                <Button variant="outline" onClick={() => navigate("/")}>
                  Return Home
                </Button>
                <Button variant="outline" onClick={handleDownloadImages}>
                  <ImageDown className="h-4 w-4 mr-2" />
                  Download Images
                </Button>
                <Button onClick={handleDownloadPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          {/* Test Info Card */}
          <Card className="mb-8 bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
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
                <div className="flex flex-col items-center gap-2">
                  <BookOpen className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{hasMarkschemes ? '✓' : '—'}</p>
                    <p className="text-sm text-muted-foreground">Markschemes</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Questions with optional Markschemes */}
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
                  {showMarkschemes && hasMarkschemes ? (
                    <Tabs defaultValue="question" className="w-full">
                      <TabsList className="mb-4">
                        <TabsTrigger value="question">Question</TabsTrigger>
                        <TabsTrigger value="markscheme">Mark Scheme</TabsTrigger>
                      </TabsList>
                      <TabsContent value="question">
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
                      </TabsContent>
                      <TabsContent value="markscheme">
                        {pq.markschemeText ? (
                          <div className="rounded-lg border bg-card p-4 max-w-3xl">
                            <LatexRenderer
                              className="prose prose-sm max-w-none"
                              content={pq.markschemeText}
                            />
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            Mark scheme text not yet available
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  ) : (
                    pq.processedImageUrl ? (
                      <img 
                        src={pq.processedImageUrl} 
                        alt={`Question ${pq.newNumber}`}
                        className="w-full max-w-3xl rounded-lg border"
                      />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        Failed to load question image
                      </div>
                    )
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
              disabled={selectedQuestionIds.length === 0 || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Compile Test ({selectedQuestionIds.length} questions)
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
              
              {/* Markscheme option */}
              <div className="pt-4 mt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="include-markschemes" className="text-sm font-medium flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Include Markschemes
                  </Label>
                  <Switch
                    id="include-markschemes"
                    checked={includeMarkschemes}
                    onCheckedChange={setIncludeMarkschemes}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Add markschemes to compiled test & PDF
                </p>
              </div>
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
                    const selectedInTopic = topicQuestions.filter(q => isQuestionSelected(getQuestionId(q))).length;
                    
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
                                  isQuestionSelected(qId) 
                                    ? 'bg-primary/10 border-primary/30' 
                                    : 'bg-card hover:bg-secondary/50'
                                }`}
                                onClick={() => toggleQuestion(qId)}
                              >
                                <Checkbox 
                                  checked={isQuestionSelected(qId)}
                                  onCheckedChange={() => toggleQuestion(qId)}
                                  onClick={(e) => e.stopPropagation()}
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

          {/* Question Order */}
          {selectedQuestionIds.length > 0 && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GripVertical className="h-4 w-4" />
                  3. Set Question Order
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Arrange questions in the order they should appear in your test
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {compiledQuestions.map((question, index) => {
                    const qId = getQuestionId(question);
                    return (
                      <div 
                        key={qId}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                      >
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveQuestion(index, 'up')}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveQuestion(index, 'down')}
                            disabled={index === compiledQuestions.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <span className="text-lg font-bold text-primary w-8">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {question.year} {question.sitting} Paper {question.paperNumber} Q{question.questionNumber}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {question.subtopics}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {question.topic} • {question.marks} marks
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default TestMaker;

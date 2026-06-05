import { useState, useMemo } from "react";
import { logger } from "@/lib/logger";
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
          logger.error("Error processing image:", error);
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

  // Open a print-ready HTML document in a hidden iframe and trigger the
  // browser's "Save as PDF" dialog. Mark schemes are rendered as real HTML
  // (vector text, selectable, with proper table reflow + page breaks); question
  // images are embedded edge-to-edge as today.
  const handleDownloadPDF = async () => {
    const topics = Array.from(new Set(processedQuestions.map(pq => pq.original.topic)));
    const thresholds = `A: ${testStats.gradeThresholds.A}  ·  B: ${testStats.gradeThresholds.B}  ·  C: ${testStats.gradeThresholds.C}  ·  D: ${testStats.gradeThresholds.D}  ·  E: ${testStats.gradeThresholds.E}`;
    const hasMarkschemes = includeMarkschemes && processedQuestions.some(pq => pq.markschemeText);

    const coverHtml = `
      <section class="page cover">
        <div class="cover-bar-top"></div>
        <h1>Custom Practice Test</h1>
        <hr/>
        <p class="stats">${processedQuestions.length} Questions  ·  ${testStats.totalMarks} Marks  ·  Time: ${testStats.timeString}</p>
        <div class="thresholds"><strong>Grade Thresholds</strong><span>${thresholds}</span></div>
        <h2>Topics Covered</h2>
        <ul class="topics">${topics.map(t => `<li>${t}</li>`).join("")}</ul>
        <div class="cover-bar-bottom">Good luck!</div>
      </section>
    `;

    const questionPages = processedQuestions.map(pq => `
      <section class="page question-page">
        <header class="q-head">
          <div class="q-title">Question ${pq.newNumber}</div>
          <div class="q-meta">${pq.original.marks} marks · ${pq.original.topic}</div>
        </header>
        ${pq.processedImageUrl
          ? `<img class="q-img" src="${pq.processedImageUrl}" alt="Question ${pq.newNumber}"/>`
          : `<p class="err">Question image unavailable</p>`}
      </section>
      <section class="page working-page">
        <div class="working-head">Working space for Question ${pq.newNumber}</div>
      </section>
    `).join("");

    const markschemePages = hasMarkschemes ? `
      <section class="page ms-cover">
        <h1>Mark Schemes</h1>
        <p>${processedQuestions.length} Questions</p>
      </section>
      ${processedQuestions.map(pq => `
        <section class="page ms-page">
          <header class="q-head">
            <div class="q-title">Mark Scheme — Question ${pq.newNumber}</div>
            <div class="q-meta">${pq.original.marks} marks · ${pq.original.topic}</div>
          </header>
          <div class="ms-render">
            ${pq.markschemeText
              ? withColgroups(renderLatexToHtml(renumberMarkschemeText(pq.markschemeText, pq.newNumber)))
              : `<p class="muted">Mark scheme text not yet available</p>`}
          </div>
        </section>
      `).join("")}
    ` : "";

    const date = new Date().toISOString().split("T")[0];
    const docHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>practice-test-${date}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous"/>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    .page { width: 210mm; min-height: 297mm; padding: 18mm 16mm; page-break-after: always; position: relative; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 32pt; margin: 24mm 0 4mm; text-align: center; }
    h2 { font-size: 14pt; margin: 14mm 0 4mm; border-bottom: 1px solid #1e293b; display: inline-block; padding-bottom: 2mm; }
    hr { border: 0; border-top: 1px solid #cbd5e1; margin: 0 0 4mm; }
    .cover .stats { text-align: center; color: #475569; margin: 0 0 8mm; }
    .cover-bar-top { position: absolute; top: 0; left: 0; right: 0; height: 8mm; background: #1e293b; }
    .cover-bar-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 12mm;
      background: #1e293b; color: #fff; font-style: italic; display: flex;
      align-items: center; justify-content: center; }
    .thresholds { background: #f1f5f9; padding: 4mm 6mm; border-radius: 2mm;
      display: flex; justify-content: space-between; align-items: center; color: #1e293b; }
    .topics { list-style: disc; padding-left: 6mm; color: #1e293b; }
    .topics li { margin: 1.5mm 0; }
    .q-head { margin-bottom: 4mm; }
    .q-title { font-size: 14pt; font-weight: 700; color: #1e293b; }
    .q-meta  { font-size: 9pt; color: #64748b; margin-top: 1mm; }
    .question-page { padding: 18mm 0 18mm; }
    .question-page .q-head { padding: 0 16mm; }
    .q-img { display: block; width: 100%; height: auto; }
    .working-head { text-align: center; color: #cbd5e1; font-size: 11pt; }
    .ms-cover { display: flex; flex-direction: column; align-items: center;
      justify-content: center; background: #1e293b; color: #fff; }
    .ms-cover h1 { color: #fff; }
    .ms-cover p { font-size: 14pt; }
    .ms-page .ms-render { font-size: 10.5pt; line-height: 1.45; }
    .ms-render table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0; }
    .ms-render thead { display: table-header-group; }
    .ms-render tr { page-break-inside: avoid; }
    .ms-render th, .ms-render td { border: 1px solid #94a3b8; padding: 2mm 2.5mm;
      vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
    .ms-render th { background: #f1f5f9; font-weight: 600; text-align: left; }
    .ms-render col.col-part     { width: 10%; }
    .ms-render col.col-answer   { width: 45%; }
    .ms-render col.col-marks    { width: 10%; }
    .ms-render col.col-guidance { width: 35%; }
    .ms-render .katex { font-size: 1em; }
    .muted { color: #94a3b8; }
    .err { color: #b91c1c; }
  </style>
</head>
<body>
  ${coverHtml}
  ${questionPages}
  ${markschemePages}
  <script>
    (function () {
      function go() {
        window.focus();
        window.print();
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(go).catch(go);
      } else {
        window.addEventListener('load', go);
      }
    })();
  </script>
</body>
</html>`;

    // Render via a hidden iframe so we don't get blocked by popup blockers.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(docHtml);
    doc.close();
    // Clean up the iframe a little after the print dialog closes.
    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };
    iframe.contentWindow?.addEventListener("afterprint", cleanup);
    // Safety net in case afterprint never fires.
    setTimeout(cleanup, 60000);
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

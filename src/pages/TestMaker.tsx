import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";
import { useNavigate } from "react-router-dom";
import { questionsDatabase, Question } from "@/data/questions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Clock, Award, Loader2, Download, ChevronUp, ChevronDown, GripVertical, BookOpen, Eye, EyeOff, ImageDown } from "lucide-react";
import { processQuestionImage, bakeNumberIntoImage, NUMBER_FONT_FAMILY } from "@/utils/imageProcessing";
import { ensureMarkschemeText } from "@/utils/ensureMarkschemeText";
import { ensureQuestionText } from "@/utils/ensureQuestionText";
import { renderLatexToHtml } from "@/utils/renderLatex";
import { LatexRenderer } from "@/components/LatexRenderer";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveModule, moduleOf, getTopicsInCurriculumOrder, getModuleInfo } from "@/lib/modules";
import { useToast } from "@/hooks/use-toast";
import { ModuleSwitcher } from "@/components/ModuleSwitcher";
import { useQuestionsVersion } from "@/lib/questionStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import JSZip from "jszip";

interface ProcessedQuestion {
  original: Question;
  newNumber: number;
  // Cleaned image with original number erased. The new number is
  // rendered as a draggable HTML overlay in the preview and burnt in
  // at download time using overlayX / overlayY.
  cleanedImageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  overlayX: number;
  overlayY: number;
  fontSize: number;
  markschemeText: string | null;
}

// Draggable HTML overlay of the new question number, positioned in image
// pixel coordinates and scaled to the displayed image size. The user can
// nudge it if the auto-placement is off; the current position is what
// gets baked into the image on download.
interface DraggableNumberOverlayProps {
  cleanedImageUrl: string;
  number: number;
  imageWidth: number;
  imageHeight: number;
  fontSize: number;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  alt: string;
}

const DraggableNumberOverlay = ({
  cleanedImageUrl,
  number,
  imageWidth,
  imageHeight,
  fontSize,
  x,
  y,
  onChange,
  alt,
}: DraggableNumberOverlayProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startPointerX: number; startPointerY: number; startX: number; startY: number; scale: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const scale = rect.width / imageWidth;
    dragState.current = {
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startX: x,
      startY: y,
      scale: scale || 1,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [imageWidth, x, y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s) return;
    const dx = (e.clientX - s.startPointerX) / s.scale;
    const dy = (e.clientY - s.startPointerY) / s.scale;
    const nx = Math.max(0, Math.min(imageWidth - 2, s.startX + dx));
    const ny = Math.max(0, Math.min(imageHeight - 2, s.startY + dy));
    onChange(nx, ny);
  }, [imageWidth, imageHeight, onChange]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current) {
      dragState.current = null;
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-block w-full max-w-3xl rounded-lg border overflow-hidden"
      style={{ containerType: "inline-size" }}
    >
      <img src={cleanedImageUrl} alt={alt} className="block w-full h-auto" draggable={false} />
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to reposition the question number"
        style={{
          position: "absolute",
          left: `${(x / imageWidth) * 100}%`,
          top: `${(y / imageHeight) * 100}%`,
          fontFamily: NUMBER_FONT_FAMILY,
          fontWeight: 700,
          fontSize: `${(fontSize / imageWidth) * 100}cqw`,
          lineHeight: 1,
          color: "#000",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          padding: "0 2px",
          background: "rgba(191, 219, 254, 0.35)",
          outline: "1px dashed hsl(var(--primary) / 0.7)",
          borderRadius: 2,
          whiteSpace: "nowrap",
        }}
      >
        {number}
      </div>
    </div>
  );
};

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
  const { module, setModule } = useActiveModule({ redirectIfMissing: true });
  const questionsVersion = useQuestionsVersion();
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [isCompiled, setIsCompiled] = useState(false);
  const [processedQuestions, setProcessedQuestions] = useState<ProcessedQuestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [includeMarkschemes, setIncludeMarkschemes] = useState(true);
  const [showMarkschemes, setShowMarkschemes] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);

  // Pool of source questions scoped to the active module.
  const pool = useMemo(
    () => questionsDatabase.filter((q) => moduleOf(q) === module),
    [module, questionsVersion]
  );

  // Reset selections when switching modules.
  useEffect(() => {
    setSelectedTopics(new Set());
    setSelectedQuestionIds([]);
    setIsCompiled(false);
    setProcessedQuestions([]);
  }, [module]);

  // Get unique topics in the current module, in curriculum order.
  const allTopics = useMemo(
    () => getTopicsInCurriculumOrder(pool),
    [pool]
  );

  // Get questions for selected topics
  const filteredQuestions = useMemo(() => 
    pool.filter(q => selectedTopics.has(q.topic)),
    [pool, selectedTopics]
  );

  // Get selected question objects in order
  const compiledQuestions = useMemo(() => 
    selectedQuestionIds
      .map(id => pool.find(q => getQuestionId(q) === id))
      .filter((q): q is Question => q !== undefined),
    [selectedQuestionIds, pool]
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
    const topicIds = pool
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
    const topicIds = pool
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
          const [info, rawMarkschemeText] = await Promise.all([
            processQuestionImage(q.questionUrl, newNumber),
            includeMarkschemes ? ensureMarkschemeText(q) : Promise.resolve(null),
          ]);
          const markschemeText = rawMarkschemeText
            ? renumberMarkschemeText(rawMarkschemeText, newNumber)
            : null;
          return {
            original: q,
            newNumber,
            cleanedImageUrl: info.cleanedImageUrl,
            imageWidth: info.width,
            imageHeight: info.height,
            overlayX: info.defaultX,
            overlayY: info.defaultY,
            fontSize: info.fontSize,
            markschemeText,
          };
        } catch (error) {
          logger.error("Error processing image:", error);
          return {
            original: q,
            newNumber,
            cleanedImageUrl: null,
            imageWidth: 0,
            imageHeight: 0,
            overlayX: 0,
            overlayY: 0,
            fontSize: 48,
            markschemeText: null,
          };
        }
      })
    );

    setProcessedQuestions(processed);
    setIsProcessing(false);
    setIsCompiled(true);
  };

  // Update the overlay position for a single question when the user drags.
  const updateOverlayPosition = useCallback((newNumber: number, nx: number, ny: number) => {
    setProcessedQuestions((prev) =>
      prev.map((pq) => (pq.newNumber === newNumber ? { ...pq, overlayX: nx, overlayY: ny } : pq))
    );
  }, []);

  // Bake the new number into every cleaned image at its current overlay
  // position. Returned in the same order as processedQuestions; entries
  // may be null when the source image failed to load.
  const bakeAllImages = async (): Promise<(string | null)[]> => {
    return Promise.all(
      processedQuestions.map(async (pq) => {
        if (!pq.cleanedImageUrl) return null;
        try {
          return await bakeNumberIntoImage(
            pq.cleanedImageUrl,
            pq.newNumber,
            pq.overlayX,
            pq.overlayY,
            pq.fontSize
          );
        } catch (error) {
          logger.error("Error baking number into image:", error);
          return null;
        }
      })
    );
  };

  // Download all renumbered question images as a single ZIP file.
  const handleDownloadImages = async () => {
    const baked = await bakeAllImages();
    const zip = new JSZip();
    for (let i = 0; i < processedQuestions.length; i++) {
      const pq = processedQuestions[i];
      const url = baked[i];
      if (!url) continue;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const filename = `Q${pq.newNumber}_${pq.original.topic.replace(/\s+/g, "_")}_${pq.original.year}_${pq.original.sitting}_P${pq.original.paperNumber}.jpg`;
        zip.file(filename, blob);
      } catch (error) {
        logger.error("Error adding image to zip:", error);
      }
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `test_questions_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Shared helper: render an HTML document into a hidden iframe and trigger
  // the browser's print dialog (user picks "Save as PDF").
  const printHtmlDocument = (docHtml: string) => {
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
    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };
    iframe.contentWindow?.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 60000);
  };

  // Question paper: portrait A4. Cambridge-style — bold question number on the
  // left margin of each question page, no "Question N" header banner.
  const handleDownloadQuestionPaper = async () => {
    const bakedImages = await bakeAllImages();
    const topics = Array.from(new Set(processedQuestions.map(pq => pq.original.topic)));
    const thresholds = `A: ${testStats.gradeThresholds.A}  ·  B: ${testStats.gradeThresholds.B}  ·  C: ${testStats.gradeThresholds.C}  ·  D: ${testStats.gradeThresholds.D}  ·  E: ${testStats.gradeThresholds.E}`;

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

    const linesHtml = Array.from({ length: 40 }).map(() => `<div class="line"></div>`).join("");
    let pageNum = 0;
    const questionPages = processedQuestions.map((pq, i) => {
      pageNum += 1;
      const qPageNo = pageNum;
      pageNum += 1;
      const wPageNo = pageNum;
      const bakedUrl = bakedImages[i];
      return `
      <section class="page question-page">
        <div class="page-number">${qPageNo}</div>
        ${bakedUrl
          ? `<img class="q-img" src="${bakedUrl}" alt="Question ${pq.newNumber}"/>`
          : `<p class="err">Question image unavailable</p>`}
        <div class="lines-wrap"><div class="lines-inner">${linesHtml}</div></div>
      </section>
      <section class="page working-page">
        <div class="page-number">${wPageNo}</div>
        <div class="lines-wrap"><div class="lines-inner">${linesHtml}</div></div>
      </section>
    `;
    }).join("");

    const date = new Date().toISOString().split("T")[0];
    const docHtml = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>practice-test-${date}</title>
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
  .question-page { padding: 24mm 0 0; display: flex; flex-direction: column; }
  .working-page { padding: 24mm 0 0; display: flex; flex-direction: column; }
  .q-img { display: block; width: 210mm; height: auto; margin: 0; flex: 0 0 auto; }
  .lines-wrap { flex: 1 1 auto; position: relative; }
  .lines-inner { position: absolute; top: 6mm; left: 25mm; right: 16mm; bottom: 25mm; overflow: hidden; }
  .line { height: 9mm; border-bottom: 1px dotted #0f172a; }
  .page-number { position: absolute; top: 15mm; left: 0; right: 0; text-align: center;
    font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #0f172a; }
  .err { color: #b91c1c; }
</style></head>
<body>
  ${coverHtml}
  ${questionPages}
  <script>
    (function () {
      function go() { window.focus(); window.print(); }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(go).catch(go);
      } else { window.addEventListener('load', go); }
    })();
  </script>
</body></html>`;
    printHtmlDocument(docHtml);
  };

  // Mark scheme: landscape A4. Wide Answer + Guidance columns, narrow Part +
  // Marks columns. One question's mark scheme per page; rows avoid splitting.
  const handleDownloadMarkScheme = () => {
    const hasMarkschemes = includeMarkschemes && processedQuestions.some(pq => pq.markschemeText);
    if (!hasMarkschemes) return;

    const msPages = processedQuestions.map(pq => `
      <section class="page ms-page">
        <header class="ms-head">
          <div class="ms-title">Mark Scheme — Question ${pq.newNumber}</div>
          <div class="ms-meta">${pq.original.marks} marks · ${pq.original.topic}</div>
        </header>
        <div class="ms-render">
          ${pq.markschemeText
            ? withColgroups(renderLatexToHtml(renumberMarkschemeText(pq.markschemeText, pq.newNumber)))
            : `<p class="muted">Mark scheme text not yet available</p>`}
        </div>
      </section>
    `).join("");

    const date = new Date().toISOString().split("T")[0];
    const docHtml = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>mark-scheme-${date}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous"/>
<style>
  @page { size: A4 landscape; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .ms-head { margin-bottom: 4mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 2mm; }
  .ms-title { font-size: 13pt; font-weight: 700; color: #1e293b; }
  .ms-meta  { font-size: 9pt; color: #64748b; margin-top: 1mm; }
  .ms-render { font-size: 10.5pt; line-height: 1.45; }
  .ms-render table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0; }
  .ms-render thead { display: table-header-group; }
  .ms-render tr { page-break-inside: avoid; }
  .ms-render th, .ms-render td { border: 1px solid #94a3b8; padding: 2mm 2.5mm;
    vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
  .ms-render th { background: #f1f5f9; font-weight: 600; text-align: left; }
  .ms-render col.col-part     { width: 8%; }
  .ms-render col.col-answer   { width: 42%; }
  .ms-render col.col-marks    { width: 7%; }
  .ms-render col.col-guidance { width: 43%; }
  .ms-render .katex { font-size: 1em; }
  .muted { color: #94a3b8; }
</style></head>
<body>
  ${msPages}
  <script>
    (function () {
      function go() { window.focus(); window.print(); }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(go).catch(go);
      } else { window.addEventListener('load', go); }
    })();
  </script>
</body></html>`;
    printHtmlDocument(docHtml);
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
                <Button variant="outline" onClick={handleDownloadQuestionPaper}>
                  <Download className="h-4 w-4 mr-2" />
                  Question Paper
                </Button>
                {hasMarkschemes && (
                  <Button onClick={handleDownloadMarkScheme}>
                    <Download className="h-4 w-4 mr-2" />
                    Mark Scheme
                  </Button>
                )}
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

          <p className="text-xs text-muted-foreground mb-4 text-center">
            Tip: if the question number sits in the wrong place, drag it to reposition. Your adjustment is burnt in when you download.
          </p>

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
                        {pq.cleanedImageUrl ? (
                          <DraggableNumberOverlay
                            cleanedImageUrl={pq.cleanedImageUrl}
                            number={pq.newNumber}
                            imageWidth={pq.imageWidth}
                            imageHeight={pq.imageHeight}
                            fontSize={pq.fontSize}
                            x={pq.overlayX}
                            y={pq.overlayY}
                            onChange={(nx, ny) => updateOverlayPosition(pq.newNumber, nx, ny)}
                            alt={`Question ${pq.newNumber}`}
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
                    pq.cleanedImageUrl ? (
                      <DraggableNumberOverlay
                        cleanedImageUrl={pq.cleanedImageUrl}
                        number={pq.newNumber}
                        imageWidth={pq.imageWidth}
                        imageHeight={pq.imageHeight}
                        fontSize={pq.fontSize}
                        x={pq.overlayX}
                        y={pq.overlayY}
                        onChange={(nx, ny) => updateOverlayPosition(pq.newNumber, nx, ny)}
                        alt={`Question ${pq.newNumber}`}
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
                <p className="text-sm text-muted-foreground">
                  Create your custom practice test
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {module && <ModuleSwitcher module={module} onChange={setModule} />}
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

              {/* Test summary: total marks + grade boundary estimates */}
              {selectedQuestionIds.length > 0 && (
                <div className="pt-4 mt-4 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Award className="h-4 w-4" />
                      Total Marks
                    </span>
                    <span className="text-sm font-semibold text-primary">
                      {testStats.totalMarks}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Estimated Grade Boundaries
                    </p>
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {(["A","B","C","D","E"] as const).map((g) => (
                        <div key={g} className="rounded-md bg-secondary/60 py-1.5">
                          <div className="text-[10px] font-semibold text-muted-foreground">{g}</div>
                          <div className="text-xs font-bold text-foreground">
                            {testStats.gradeThresholds[g]}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 italic leading-snug">
                      These grade boundaries are AI estimates and are not official Cambridge-approved boundaries.
                    </p>
                  </div>
                </div>
              )}
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
                  {getTopicsInCurriculumOrder(pool.filter(q => selectedTopics.has(q.topic))).map(topic => {
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-primary hover:text-primary shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewQuestion(question);
                                  }}
                                  title="Preview question"
                                  aria-label="Preview question"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary shrink-0"
                          onClick={() => setPreviewQuestion(question)}
                          title="Preview question"
                          aria-label="Preview question"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Question image preview dialog */}
      <Dialog open={!!previewQuestion} onOpenChange={(open) => !open && setPreviewQuestion(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {previewQuestion
                ? `${previewQuestion.year} ${previewQuestion.sitting} Paper ${previewQuestion.paperNumber} Q${previewQuestion.questionNumber}`
                : "Question preview"}
            </DialogTitle>
            {previewQuestion && (
              <DialogDescription>
                {previewQuestion.topic} • {previewQuestion.marks} marks — {previewQuestion.subtopics}
              </DialogDescription>
            )}
          </DialogHeader>
          {previewQuestion && (
            <img
              src={previewQuestion.questionUrl}
              alt={`Question ${previewQuestion.questionNumber}`}
              className="w-full rounded-md border"
            />
          )}
          {previewQuestion && (() => {
            const pid = getQuestionId(previewQuestion);
            const added = isQuestionSelected(pid);
            return (
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => {
                    toggleQuestion(pid);
                  }}
                  variant={added ? "outline" : "default"}
                >
                  {added ? "Remove from test" : "Add to test"}
                </Button>
              </div>
            );
          })()}
        </DialogContent>

      </Dialog>
    </div>
  );
};

export default TestMaker;

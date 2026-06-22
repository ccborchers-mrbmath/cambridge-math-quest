import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SearchBar } from "@/components/SearchBar";
import { QuestionDisplay } from "@/components/QuestionDisplay";
import { TopicTest } from "@/components/TopicTest";
import { questionsDatabase, Question } from "@/data/questions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { BookOpen, User, Settings, RefreshCw, FileEdit } from "lucide-react";
import { ModuleSwitcher } from "@/components/ModuleSwitcher";
import { CreditsPill } from "@/components/CreditsPill";
import { useFreeTierCap } from "@/hooks/useFreeTierCap";
import { FreeTierCapDialog } from "@/components/FreeTierCapDialog";
import { useQuestionsVersion } from "@/lib/questionStore";
import { useActiveModule, moduleOf, getModuleInfo, getTopicsInCurriculumOrder } from "@/lib/modules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const POPULAR_TOPICS_BY_MODULE: Record<string, string[]> = {
  P1: ["Quadratics", "Functions", "Coordinate geometry", "Trigonometry", "Differentiation"],
  P2: ["Algebra", "Logarithmic and exponential functions", "Trigonometry", "Differentiation", "Integration"],
  P3: ["Complex numbers", "Differentiation", "Integration", "Vectors", "Differential equations"],
  M1: ["Forces and equilibrium", "Kinematics of motion in a straight line", "Newton's laws of motion", "Momentum", "Energy, work and power"],
  S1: ["Representation of data", "Probability", "Permutations and combinations", "Discrete random variables", "The normal distribution"],
  S2: ["The Poisson distribution", "Hypothesis tests", "Sampling and estimation", "Continuous random variables", "Linear combinations of random variables"],
};

const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userRole, loading, signOut } = useAuth();
  const { module, setModule } = useActiveModule({ redirectIfMissing: true });
  const { recordView, capped } = useFreeTierCap();
  const [showCapDialog, setShowCapDialog] = useState(false);
  // Subscribe to DB question loads so dropdowns/search reflect uploads.
  const questionsVersion = useQuestionsVersion();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSitting, setSelectedSitting] = useState<string>("");
  const [selectedPaper, setSelectedPaper] = useState<string>("");
  const [selectedQuestionNum, setSelectedQuestionNum] = useState<string>("");
  const [currentTopic, setCurrentTopic] = useState<string>("");
  const [viewedQuestionIds, setViewedQuestionIds] = useState<Set<string>>(new Set());
  const [testTopic, setTestTopic] = useState<string>("");

  // Pool of questions scoped to the currently active module.
  const pool = useMemo(
    () => questionsDatabase.filter((q) => moduleOf(q) === module),
    [module, questionsVersion]
  );

  // Get unique main topics for the "Test me on" dropdown, in curriculum order.
  const mainTopics = useMemo(
    () => getTopicsInCurriculumOrder(pool),
    [pool]
  );

  // Reset any current question when switching modules.
  useEffect(() => {
    setSelectedQuestion(null);
    setSelectedYear("");
    setSelectedSitting("");
    setSelectedPaper("");
    setSelectedQuestionNum("");
    setCurrentTopic("");
    setViewedQuestionIds(new Set());
    setTestTopic("");
  }, [module]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Get unique values for dropdowns
  const years = Array.from(new Set(pool.map(q => q.year.toString()))).sort((a, b) => b.localeCompare(a));
  
  const sittingOrder: Record<string, number> = { 'Feb/Mar': 1, 'May/Jun': 2, 'Oct/Nov': 3 };
  const sittings = selectedYear 
    ? Array.from(new Set(pool.filter(q => q.year.toString() === selectedYear).map(q => q.sitting)))
        .sort((a, b) => (sittingOrder[a] || 99) - (sittingOrder[b] || 99))
    : [];
  
  const papers = selectedYear && selectedSitting
    ? Array.from(new Set(pool.filter(q => 
        q.year.toString() === selectedYear && q.sitting === selectedSitting
      ).map(q => q.paperNumber.toString()))).sort()
    : [];
  
  const questionNumbers = selectedYear && selectedSitting && selectedPaper
    ? Array.from(new Set(pool.filter(q => 
        q.year.toString() === selectedYear && 
        q.sitting === selectedSitting && 
        q.paperNumber.toString() === selectedPaper
      ).map(q => q.questionNumber.toString()))).sort((a, b) => parseInt(a) - parseInt(b))
    : [];

  // Auto-select question when all dropdowns are filled
  useEffect(() => {
    if (selectedYear && selectedSitting && selectedPaper && selectedQuestionNum) {
      const question = pool.find(q => 
        q.year.toString() === selectedYear &&
        q.sitting === selectedSitting &&
        q.paperNumber.toString() === selectedPaper &&
        q.questionNumber.toString() === selectedQuestionNum
      );
      if (question) {
        setSelectedQuestion(question);
        setCurrentTopic(question.topic.toLowerCase());
        const questionId = getQuestionId(question);
        setViewedQuestionIds(prev => new Set(prev).add(questionId));
      }
    }
  }, [selectedYear, selectedSitting, selectedPaper, selectedQuestionNum, pool]);

  // Reset dependent dropdowns when parent changes
  useEffect(() => {
    setSelectedSitting("");
    setSelectedPaper("");
    setSelectedQuestionNum("");
  }, [selectedYear]);

  useEffect(() => {
    setSelectedPaper("");
    setSelectedQuestionNum("");
  }, [selectedSitting]);

  useEffect(() => {
    setSelectedQuestionNum("");
  }, [selectedPaper]);

  // Helper to get a unique question ID
  const getQuestionId = (q: Question) => `${q.year}-${q.sitting}-${q.paperNumber}-${q.questionNumber}`;

  // Free-tier daily cap: record each unique question view server-side and
  // pop the upgrade dialog the moment the user is over the limit.
  useEffect(() => {
    if (!selectedQuestion) return;
    void recordView(getQuestionId(selectedQuestion));
  }, [selectedQuestion, recordView]);

  useEffect(() => {
    if (capped) setShowCapDialog(true);
  }, [capped]);

  useEffect(() => {
    const year = searchParams.get("year");
    const sitting = searchParams.get("sitting");
    const paper = searchParams.get("paper");
    const questionNumber = searchParams.get("question");

    if (!year || !sitting || !paper || !questionNumber) return;

    const question = pool.find(q =>
      q.year.toString() === year &&
      q.sitting === sitting &&
      q.paperNumber.toString() === paper &&
      q.questionNumber.toString() === questionNumber
    );

    if (!question) return;

    setTestTopic("");
    setSelectedYear(year);
    setSelectedSitting(sitting);
    setSelectedPaper(paper);
    setSelectedQuestionNum(questionNumber);
    setSelectedQuestion(question);
    setCurrentTopic(question.topic.toLowerCase());
    setViewedQuestionIds(prev => new Set(prev).add(getQuestionId(question)));
    // Preserve the module param when clearing other params.
    const next = new URLSearchParams();
    if (module) next.set("module", module);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, pool, module]);

  // Calculate similarity score between search terms and text
  const calculateSimilarity = (searchTerms: string[], text: string): number => {
    const textLower = text.toLowerCase();
    const words = textLower.split(/[\s,.\-_()^]+/).filter(w => w.length > 2);
    let score = 0;
    
    for (const term of searchTerms) {
      // Exact substring match (highest priority)
      if (textLower.includes(term)) {
        score += 100;
        continue;
      }
      
      // Word-level matching
      for (const word of words) {
        if (word === term) {
          score += 80;
        } else if (word.includes(term) || term.includes(word)) {
          score += 50;
        } else if (word.length > 3 && term.length > 3) {
          // Check for common prefix/suffix (at least 4 chars)
          const minLen = Math.min(word.length, term.length);
          let commonPrefix = 0;
          for (let i = 0; i < minLen; i++) {
            if (word[i] === term[i]) commonPrefix++;
            else break;
          }
          if (commonPrefix >= 4) score += 30;
        }
      }
    }
    
    return score;
  };

  // Get questions matching a topic with fuzzy matching (within active module).
  const getQuestionsForTopic = (topic: string) => {
    const searchTerms = topic.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    
    // Score each question
    const scored = pool.map(q => {
      const topicScore = calculateSimilarity(searchTerms, q.topic);
      const subtopicScore = calculateSimilarity(searchTerms, q.subtopics);
      return { question: q, score: topicScore + subtopicScore };
    });
    
    // Return questions with score above threshold, sorted by score
    const threshold = 30;
    return scored
      .filter(s => s.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .map(s => s.question);
  };

  // Select a random question from topic, preferring unviewed ones
  const selectRandomFromTopic = (topic: string, excludeIds?: Set<string>) => {
    const topicQuestions = getQuestionsForTopic(topic);
    if (topicQuestions.length === 0) return null;

    const idsToExclude = excludeIds || viewedQuestionIds;
    const unviewedQuestions = topicQuestions.filter(q => !idsToExclude.has(getQuestionId(q)));
    
    // If all questions viewed, reset and pick from all
    const pool = unviewedQuestions.length > 0 ? unviewedQuestions : topicQuestions;
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  };

  // Get questions with exact topic match (for "show another" functionality)
  const getQuestionsWithExactTopic = (topic: string) => {
    return pool.filter(q => q.topic.toLowerCase() === topic.toLowerCase());
  };

  // Handle showing another question on the same topic
  const handleShowAnother = () => {
    if (!selectedQuestion) return;
    
    // Always use the currently displayed question's exact topic
    const exactTopic = selectedQuestion.topic;
    const matchingQuestions = getQuestionsWithExactTopic(exactTopic);
    
    if (matchingQuestions.length === 0) return;
    
    // Filter out viewed questions
    const currentQuestionId = getQuestionId(selectedQuestion);
    const unviewedQuestions = matchingQuestions.filter(q => {
      const qId = getQuestionId(q);
      return qId !== currentQuestionId && !viewedQuestionIds.has(qId);
    });
    
    // If all questions viewed, pick from all except current
    const pool = unviewedQuestions.length > 0 
      ? unviewedQuestions 
      : matchingQuestions.filter(q => getQuestionId(q) !== currentQuestionId);
    
    if (pool.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * pool.length);
    const newQuestion = pool[randomIndex];
    const questionId = getQuestionId(newQuestion);
    setViewedQuestionIds(prev => new Set(prev).add(questionId));
    setSelectedQuestion(newQuestion);
    setCurrentTopic(newQuestion.topic.toLowerCase());
  };

  // Handle clicking a topic pill — exact match on q.topic, no fuzzy search
  const handleTopicPillClick = (topic: string) => {
    const exactMatches = pool.filter(
      (q) => q.topic.trim().toLowerCase() === topic.trim().toLowerCase()
    );
    if (exactMatches.length === 0) return;

    const unviewed = exactMatches.filter((q) => !viewedQuestionIds.has(getQuestionId(q)));
    const candidates = unviewed.length > 0 ? unviewed : exactMatches;
    const question = candidates[Math.floor(Math.random() * candidates.length)];

    const questionId = getQuestionId(question);
    setViewedQuestionIds((prev) => new Set(prev).add(questionId));
    setCurrentTopic(question.topic.toLowerCase());
    setSelectedQuestion(question);
    setSearchQuery(topic);
  };

  const handleSearch = (topicOverride?: string) => {
    const queryToUse = topicOverride || searchQuery;
    if (!queryToUse.trim()) return;

    const query = queryToUse.toLowerCase().trim();
    
    // Check if this is a topic-based search (from popular topics or subtopics)
    const topicQuestions = getQuestionsForTopic(query);
    if (topicQuestions.length > 0) {
      setCurrentTopic(query);
      const question = selectRandomFromTopic(query);
      if (question) {
        const questionId = getQuestionId(question);
        setViewedQuestionIds(prev => new Set(prev).add(questionId));
        setSelectedQuestion(question);
        return;
      }
    }
    
    // Enhanced search algorithm with scoring for non-topic searches
    const matches = pool.map((q) => {
      let score = 0;
      
      // Check for question number match (q3, question 3, etc.)
      const questionNumberMatch = query.match(/(?:q|question)\s*(\d+)/i);
      if (questionNumberMatch) {
        const searchQuestionNum = parseInt(questionNumberMatch[1]);
        if (q.questionNumber === searchQuestionNum) {
          score += 100;
        }
      }
      
      // Check for year match
      const yearMatch = query.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        const searchYear = parseInt(yearMatch[1]);
        if (q.year === searchYear) {
          score += 50;
        }
      }
      
      // Check for paper number match (only when "paper" is mentioned)
      const paperMatch = query.match(/paper\s*(\d{1,2})/i);
      if (paperMatch) {
        const searchPaper = parseInt(paperMatch[1]);
        if (q.paperNumber === searchPaper) {
          score += 50;
        }
      }
      
      // Check for month/sitting match (may, june, march, november, etc.)
      const sittingWords = query.split(/\s+/);
      const monthKeywords = ['may', 'june', 'march', 'november', 'feb', 'oct'];
      const hasMonthMatch = monthKeywords.some(month => 
        sittingWords.includes(month) && q.sitting.toLowerCase().includes(month)
      );
      if (hasMonthMatch) {
        score += 40;
      }
      
      // Topic match
      if (q.topic.toLowerCase().includes(query)) {
        score += 30;
      }
      
      // Subtopic match
      if (q.subtopics.toLowerCase().includes(query)) {
        score += 20;
      }
      
      return { question: q, score };
    });

    // Filter out zero scores and sort by score descending
    const rankedMatches = matches
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);

    if (rankedMatches.length > 0) {
      setCurrentTopic("");
      setSelectedQuestion(rankedMatches[0].question);
    } else if (pool.length > 0) {
      // If no match, show a random question
      setCurrentTopic("");
      const randomIndex = Math.floor(Math.random() * pool.length);
      setSelectedQuestion(pool[randomIndex]);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-background to-secondary/30">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center justify-between gap-4 w-max min-w-full">
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary-foreground" />
              </div>
              <button
                onClick={() => navigate("/")}
                className="text-left hover:opacity-80 transition-opacity"
              >
                <h1 className="text-2xl font-serif font-bold text-foreground">
                  Cambridge Maths 9709
                </h1>
                <p className="text-sm text-muted-foreground">
                  {module ? getModuleInfo(module).name : "AS & A Level Practice"}
                </p>
              </button>
            </div>

            <div className="flex items-center gap-3 flex-nowrap whitespace-nowrap [&>*]:shrink-0">
              {module && (
                <ModuleSwitcher module={module} onChange={setModule} />
              )}
              {loading ? (
                <div className="h-8 w-8 animate-pulse bg-secondary rounded-full" />
              ) : user ? (
                <>
                  <CreditsPill />
                  {userRole === 'admin' && (
                    <Button variant="outline" onClick={() => navigate('/admin')}>
                      <Settings className="h-4 w-4 mr-2" />
                      Admin Dashboard
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate('/test-maker')}>
                    <FileEdit className="h-4 w-4 mr-2" />
                    Test Maker
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/progress')}>
                    <User className="h-4 w-4 mr-2" />
                    My Progress
                  </Button>
                  <Button variant="outline" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => navigate('/test-maker')}>
                    <FileEdit className="h-4 w-4 mr-2" />
                    Test Maker
                  </Button>
                  <Button onClick={() => navigate('/auth')}>
                    Sign In
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12">
        {testTopic ? (
          <TopicTest topic={testTopic} onBack={() => setTestTopic("")} module={module ?? undefined} />
        ) : !selectedQuestion ? (
          <div className="space-y-12">
            {/* Hero section */}
            <div className="text-center space-y-6 max-w-3xl mx-auto">
              <div className="space-y-3">
                <h2 className="text-5xl font-serif font-bold text-foreground leading-tight">
                  Master Your Exam Skills
                </h2>
                <p className="text-xl text-muted-foreground">
                  Practice past paper questions with AI-powered hints and instant marking
                </p>
              </div>

              {/* Dropdown filters */}
              <div className="pt-6">
                <p className="text-sm text-muted-foreground mb-4">Select your question:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50">
                      {years.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedSitting} onValueChange={setSelectedSitting} disabled={!selectedYear}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Sitting" />
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50">
                      {sittings.map(sitting => (
                        <SelectItem key={sitting} value={sitting}>{sitting}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedPaper} onValueChange={setSelectedPaper} disabled={!selectedSitting}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Paper" />
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50">
                      {papers.map(paper => (
                        <SelectItem key={paper} value={paper}>Paper {paper}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedQuestionNum} onValueChange={setSelectedQuestionNum} disabled={!selectedPaper}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Question" />
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50">
                      {questionNumbers.map(num => (
                        <SelectItem key={num} value={num}>Question {num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-3">Or search by topic:</p>
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={() => handleSearch()}
                />
              </div>

              {/* Topic suggestions */}
              <div className="pt-8">
                <p className="text-sm text-muted-foreground mb-4">Pick a topic:</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {mainTopics.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => handleTopicPillClick(topic)}
                      className="px-4 py-2 rounded-full bg-secondary hover:bg-primary/10 border border-border hover:border-primary/30 text-sm font-medium transition-all"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Test me on dropdown */}
              <div className="pt-8 border-t border-border mt-8">
                <p className="text-sm text-muted-foreground mb-4">Or generate a 3-question test:</p>
                <div className="max-w-sm mx-auto">
                  <Select value={testTopic || undefined} onValueChange={(value) => setTestTopic(value)}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Test me on..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50 max-h-64">
                      {mainTopics.map(topic => (
                        <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto pt-12">
              {[
                {
                  title: "Smart Hints",
                  description: "Get AI-generated hints to guide you through challenging questions",
                  icon: "💡",
                },
                {
                  title: "Instant Markschemes",
                  description: "View official markschemes to check your answers",
                  icon: "📋",
                },
                {
                  title: "Work Marking",
                  description: "Upload your solutions for AI-powered feedback and marking",
                  icon: "📸",
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="p-6 rounded-xl bg-card border border-border shadow-card hover:shadow-elevated transition-all"
                >
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="font-serif font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedQuestion(null);
                  setSelectedYear("");
                  setSelectedSitting("");
                  setSelectedPaper("");
                  setSelectedQuestionNum("");
                  setCurrentTopic("");
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
              >
                ← Back to search
              </button>
              
              {currentTopic && (
                <Button 
                  variant="outline" 
                  onClick={handleShowAnother}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Show me another on this topic
                </Button>
              )}
            </div>
            <QuestionDisplay question={selectedQuestion} />
          </div>
        )}
      </main>

      <FreeTierCapDialog open={showCapDialog} onOpenChange={setShowCapDialog} />

      {/* Footer */}
      <footer className="border-t border-border mt-24 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Cambridge International AS & A Level Mathematics 9709 Paper 3 Practice Tool</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;

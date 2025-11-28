import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { QuestionDisplay } from "@/components/QuestionDisplay";
import { questionsDatabase, Question } from "@/data/questions";
import { BookOpen } from "lucide-react";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    const query = searchQuery.toLowerCase().trim();
    
    // Enhanced search algorithm with scoring
    const matches = questionsDatabase.map((q) => {
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
      setSelectedQuestion(rankedMatches[0].question);
    } else {
      // If no match, show a random question
      const randomIndex = Math.floor(Math.random() * questionsDatabase.length);
      setSelectedQuestion(questionsDatabase[randomIndex]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-foreground">
                Cambridge Maths 9709
              </h1>
              <p className="text-sm text-muted-foreground">AS & A Level Paper 3 Practice</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12">
        {!selectedQuestion ? (
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

              <div className="pt-4">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                />
              </div>

              {/* Topic suggestions */}
              <div className="pt-8">
                <p className="text-sm text-muted-foreground mb-4">Popular topics:</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {["Complex numbers", "Differentiation", "Integration", "Vectors", "Differential equations"].map((topic) => (
                    <button
                      key={topic}
                      onClick={() => {
                        setSearchQuery(topic);
                        handleSearch();
                      }}
                      className="px-4 py-2 rounded-full bg-secondary hover:bg-primary/10 border border-border hover:border-primary/30 text-sm font-medium transition-all"
                    >
                      {topic}
                    </button>
                  ))}
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
            <button
              onClick={() => setSelectedQuestion(null)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
            >
              ← Back to search
            </button>
            <QuestionDisplay question={selectedQuestion} />
          </div>
        )}
      </main>

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

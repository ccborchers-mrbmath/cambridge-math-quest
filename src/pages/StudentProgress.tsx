import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BookOpen, TrendingUp, Target, CheckCircle, ArrowDownAZ, Trophy, Hash } from 'lucide-react';

interface StudentAttempt {
  id: string;
  year: number;
  sitting: string;
  paper_number: number;
  question_number: number;
  topic: string | null;
  subtopic: string | null;
  attempted: boolean;
  percentage_attained: number | null;
  nature_of_errors: string | null;
  created_at: string;
}

type SortMode = 'recent' | 'reference' | 'topic' | 'score';

const StudentProgress = () => {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [attempts, setAttempts] = useState<StudentAttempt[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchMyAttempts();
    }
  }, [user]);

  const fetchMyAttempts = async () => {
    try {
      const { data, error } = await supabase
        .from('student_attempts')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttempts(data || []);
    } catch (error) {
      console.error('Error fetching attempts:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your progress...</p>
        </div>
      </div>
    );
  }

  const totalAttempts = attempts.length;
  const attemptsWithScores = attempts.filter(a => a.percentage_attained !== null);
  const avgScore = attemptsWithScores.length > 0
    ? attemptsWithScores.reduce((sum, a) => sum + (a.percentage_attained || 0), 0) / attemptsWithScores.length
    : 0;
  const topicsAttempted = new Set(attempts.map(a => a.topic).filter(Boolean)).size;

  const sortedAttempts = [...attempts].sort((a, b) => {
    if (sortMode === 'reference') {
      return (
        a.year - b.year ||
        a.sitting.localeCompare(b.sitting) ||
        a.paper_number - b.paper_number ||
        a.question_number - b.question_number
      );
    }

    if (sortMode === 'topic') {
      return (a.topic || 'zzz').localeCompare(b.topic || 'zzz') || (a.subtopic || '').localeCompare(b.subtopic || '');
    }

    if (sortMode === 'score') {
      return (b.percentage_attained ?? -1) - (a.percentage_attained ?? -1);
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-bold">My Progress</h1>
                <p className="text-sm text-muted-foreground">Track your learning journey</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Questions
              </Button>
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Questions Attempted</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAttempts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgScore.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Topics Covered</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{topicsAttempted}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Your Attempt History</CardTitle>
                <CardDescription>Review your past attempts and identify areas for improvement</CardDescription>
              </div>
              {attempts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button variant={sortMode === 'recent' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('recent')}>
                    Recent
                  </Button>
                  <Button variant={sortMode === 'reference' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('reference')}>
                    <Hash className="h-4 w-4" /> Reference
                  </Button>
                  <Button variant={sortMode === 'topic' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('topic')}>
                    <ArrowDownAZ className="h-4 w-4" /> Topic
                  </Button>
                  <Button variant={sortMode === 'score' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('score')}>
                    <Trophy className="h-4 w-4" /> Best score
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {attempts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No attempts yet. Start practicing!</p>
                <Button onClick={() => navigate('/')}>Browse Questions</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Areas to Improve</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">
                        {attempt.year} {attempt.sitting} P{attempt.paper_number} Q{attempt.question_number}
                      </TableCell>
                      <TableCell>{attempt.topic || '-'}</TableCell>
                      <TableCell>
                        <span className={
                          attempt.percentage_attained === null ? '' :
                          attempt.percentage_attained >= 80 ? 'text-green-600' :
                          attempt.percentage_attained >= 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }>
                          {attempt.percentage_attained !== null ? `${attempt.percentage_attained}%` : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {attempt.nature_of_errors || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(attempt.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default StudentProgress;

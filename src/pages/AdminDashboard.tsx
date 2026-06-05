import { useEffect, useState } from 'react';
import { logger } from "@/lib/logger";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Users, TrendingDown, BarChart } from 'lucide-react';

interface Profile {
  full_name: string | null;
  email: string;
}

interface StudentAttempt {
  id: string;
  user_id: string;
  year: number;
  sitting: string;
  paper_number: number;
  question_number: number;
  topic: string | null;
  subtopic: string | null;
  attempted: boolean;
  percentage_attained: number | null;
  nature_of_errors: string | null;
  image_url: string | null;
  created_at: string;
  profiles: Profile | Profile[] | null;
}

interface ErrorPattern {
  nature_of_errors: string;
  count: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, userRole, loading, signOut } = useAuth();
  const [attempts, setAttempts] = useState<StudentAttempt[]>([]);
  const [errorPatterns, setErrorPatterns] = useState<ErrorPattern[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && (!user || userRole !== 'admin')) {
      navigate('/auth');
    }
  }, [user, userRole, loading, navigate]);

  useEffect(() => {
    if (user && userRole === 'admin') {
      fetchAllAttempts();
      fetchErrorPatterns();
    }
  }, [user, userRole]);

  const fetchAllAttempts = async () => {
    try {
      const { data, error } = await supabase
        .from('student_attempts')
        .select(`
          *,
          profiles (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAttempts(data || []);
    } catch (error) {
      logger.error('Error fetching attempts:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchErrorPatterns = async () => {
    try {
      const { data, error } = await supabase
        .from('student_attempts')
        .select('nature_of_errors')
        .not('nature_of_errors', 'is', null);

      if (error) throw error;

      // Count error patterns
      const patterns: Record<string, number> = {};
      data?.forEach(item => {
        if (item.nature_of_errors) {
          patterns[item.nature_of_errors] = (patterns[item.nature_of_errors] || 0) + 1;
        }
      });

      const sortedPatterns = Object.entries(patterns)
        .map(([nature_of_errors, count]) => ({ nature_of_errors, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setErrorPatterns(sortedPatterns);
    } catch (error) {
      logger.error('Error fetching error patterns:', error);
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
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const totalAttempts = attempts.length;
  const uniqueStudents = new Set(attempts.map(a => a.user_id)).size;
  const avgScore = attempts
    .filter(a => a.percentage_attained !== null)
    .reduce((sum, a) => sum + (a.percentage_attained || 0), 0) / 
    (attempts.filter(a => a.percentage_attained !== null).length || 1);

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
                <h1 className="text-2xl font-serif font-bold">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">Student Performance Analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => navigate('/admin/questions')}>
                Question Manager
              </Button>
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
              <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
              <BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAttempts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Students</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{uniqueStudents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgScore.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="attempts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="attempts">Recent Attempts</TabsTrigger>
            <TabsTrigger value="errors">Common Errors</TabsTrigger>
          </TabsList>

          <TabsContent value="attempts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Student Attempts</CardTitle>
                <CardDescription>Latest 50 question attempts across all students</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attempts.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {Array.isArray(attempt.profiles) 
                                ? attempt.profiles[0]?.full_name || 'Unknown'
                                : attempt.profiles?.full_name || 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {Array.isArray(attempt.profiles)
                                ? attempt.profiles[0]?.email
                                : attempt.profiles?.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {attempt.year} {attempt.sitting} P{attempt.paper_number} Q{attempt.question_number}
                        </TableCell>
                        <TableCell>{attempt.topic || '-'}</TableCell>
                        <TableCell>
                          {attempt.percentage_attained !== null ? `${attempt.percentage_attained}%` : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {attempt.nature_of_errors || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(attempt.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Most Common Error Patterns</CardTitle>
                <CardDescription>Top 10 recurring error types across all students</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {errorPatterns.map((pattern, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{pattern.nature_of_errors}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Occurred {pattern.count} {pattern.count === 1 ? 'time' : 'times'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;

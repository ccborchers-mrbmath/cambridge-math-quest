import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ModulePicker from "./pages/ModulePicker";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
import AdminQuestions from "./pages/AdminQuestions";
import AdminRetag from "./pages/AdminRetag";
import StudentProgress from "./pages/StudentProgress";
import TestMaker from "./pages/TestMaker";
import NotFound from "./pages/NotFound";
import CoachingLayout from "./pages/coaching/CoachingLayout";
import CoachingDashboard from "./pages/coaching/CoachingDashboard";
import Connections from "./pages/coaching/Connections";
import Help from "./pages/coaching/Help";
import SessionsPage from "./pages/coaching/Sessions";
import Call from "./pages/coaching/Call";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { refreshQuestionsFromDb } from "@/lib/questionStore";

const queryClient = new QueryClient();

const AppShell = () => {
  useEffect(() => {
    void supabase.auth.getSession().then(() => {
      void refreshQuestionsFromDb();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refreshQuestionsFromDb();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModulePicker />} />
        <Route path="/practice" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/questions" element={<AdminQuestions />} />
        <Route path="/admin/retag" element={<AdminRetag />} />
        <Route path="/progress" element={<StudentProgress />} />
        <Route path="/test-maker" element={<TestMaker />} />
        <Route path="/coaching" element={<CoachingLayout />}>
          <Route index element={<CoachingDashboard />} />
          <Route path="connections" element={<Connections />} />
          <Route path="help" element={<Help />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="call/:sessionId" element={<Call />} />
        </Route>
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppShell />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

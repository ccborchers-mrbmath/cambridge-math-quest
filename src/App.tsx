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
import StudentProgress from "./pages/StudentProgress";
import TestMaker from "./pages/TestMaker";
import NotFound from "./pages/NotFound";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadQuestionsFromDb, refreshQuestionsFromDb } from "@/lib/questionStore";

// Kick off loading DB questions as soon as the app boots so the practice
// flows, picker counts, dropdowns, search, and Test Maker see admin uploads.
loadQuestionsFromDb();

const queryClient = new QueryClient();

const AppShell = () => {
  useEffect(() => {
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
        <Route path="/progress" element={<StudentProgress />} />
        <Route path="/test-maker" element={<TestMaker />} />
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

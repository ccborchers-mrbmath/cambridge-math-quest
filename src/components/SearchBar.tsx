import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}

export const SearchBar = ({ value, onChange, onSearch }: SearchBarProps) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            type="text"
            placeholder="Search by topic, year, paper, or question number (e.g., 'complex numbers', '2024', 'paper 31', 'question 5')"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-12 h-14 text-base bg-card border-border shadow-sm focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <Button 
          onClick={onSearch}
          className="h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm transition-all"
        >
          Search
        </Button>
      </div>
    </div>
  );
};

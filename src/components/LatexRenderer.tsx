import { useEffect, useRef } from "react";
import "katex/dist/katex.min.css";
import { renderLatexToHtml } from "@/utils/renderLatex";

interface LatexRendererProps {
  content: string;
  className?: string;
}

export const LatexRenderer = ({ content, className = "" }: LatexRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = renderLatexToHtml(content);
  }, [content]);

  return <div ref={containerRef} className={className} />;
};

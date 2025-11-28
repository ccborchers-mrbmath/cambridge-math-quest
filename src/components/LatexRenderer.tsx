import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface LatexRendererProps {
  content: string;
  className?: string;
}

export const LatexRenderer = ({ content, className = "" }: LatexRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Process the content to render LaTeX
    const processedContent = content
      // First handle display math ($$...$$)
      .replace(/\$\$(.*?)\$\$/g, (_, math) => {
        try {
          return `<div class="katex-display">${katex.renderToString(math, {
            displayMode: true,
            throwOnError: false,
          })}</div>`;
        } catch (e) {
          return `<div class="katex-error">$$${math}$$</div>`;
        }
      })
      // Then handle inline math ($...$)
      .replace(/\$([^$]+?)\$/g, (_, math) => {
        try {
          return katex.renderToString(math, {
            displayMode: false,
            throwOnError: false,
          });
        } catch (e) {
          return `<span class="katex-error">$${math}$</span>`;
        }
      });

    containerRef.current.innerHTML = processedContent;
  }, [content]);

  return <div ref={containerRef} className={className} />;
};

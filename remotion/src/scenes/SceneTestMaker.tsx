import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { Word } from "../components/Type";
import { Tag, Card, Chip } from "../components/UI";

const TOPICS = ["Differentiation", "Integration", "Vectors", "Trigonometry", "Series", "Probability"];

export const SceneTestMaker: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pdf = spring({ frame: frame - 110, fps, config: { damping: 16, stiffness: 110 } });
  const pdfY = interpolate(pdf, [0, 1], [80, 0]);
  const pdfRot = interpolate(pdf, [0, 1], [-6, -2]);
  return (
    <AbsoluteFill style={{ padding: 110, gap: 50 }}>
      <Tag n="03" text="BUILD YOUR OWN PAPER" />
      <div style={{ display: "flex", gap: 80, flex: 1, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 108, lineHeight: 1.04, color: colors.ink, fontWeight: 500, letterSpacing: -2 }}>
            <Word text="Pick" delay={6} /> <Word text="topics." delay={12} />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 108, lineHeight: 1.04, color: colors.inkSoft, fontStyle: "italic", fontWeight: 500, letterSpacing: -2, marginTop: 4 }}>
            <Word text="Set" delay={28} /> <Word text="the" delay={34} /> <Word text="length." delay={40} />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 108, lineHeight: 1.04, color: colors.accent, fontWeight: 500, letterSpacing: -2, marginTop: 4 }}>
            <Word text="Get" delay={56} /> <Word text="a" delay={62} /> <Word text="PDF." delay={68} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 40, flexWrap: "wrap", maxWidth: 600 }}>
            {TOPICS.map((t, i) => (
              <Chip key={t} active={[0, 2, 4].includes(i)} delay={90 + i * 8}>{t}</Chip>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, position: "relative", height: 620 }}>
          {/* PDF pages stacked */}
          <div style={{
            position: "absolute", inset: 0, transform: `translateY(${pdfY + 40}px) rotate(4deg)`,
            opacity: pdf * 0.5,
          }}>
            <PaperPage tone={0.4} />
          </div>
          <div style={{
            position: "absolute", inset: 0, transform: `translateY(${pdfY + 20}px) rotate(1deg)`,
            opacity: pdf * 0.75,
          }}>
            <PaperPage tone={0.7} />
          </div>
          <div style={{
            position: "absolute", inset: 0, transform: `translateY(${pdfY}px) rotate(${pdfRot}deg)`,
            opacity: pdf,
          }}>
            <PaperPage tone={1} headline />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PaperPage: React.FC<{ tone: number; headline?: boolean }> = ({ tone, headline }) => (
  <div style={{
    width: "100%", height: "100%", background: `rgba(242,245,250,${tone})`, borderRadius: 14,
    boxShadow: `0 30px 80px -20px rgba(0,0,0,${0.55 * tone})`,
    padding: 50, color: "#0B1220", fontFamily: "Fraunces, serif",
  }}>
    {headline && (
      <>
        <div style={{ fontFamily: "Inter", fontSize: 13, letterSpacing: 3, color: "#5B6B89", fontWeight: 700 }}>CAMBRIDGE MATH QUEST · CUSTOM PAPER</div>
        <div style={{ fontSize: 38, marginTop: 18, fontWeight: 600 }}>Pure Mathematics — Custom</div>
        <div style={{ fontFamily: "Inter", fontSize: 14, color: "#5B6B89", marginTop: 6 }}>12 questions · 1h 30m · 60 marks</div>
        <div style={{ height: 1, background: "#cfd6e3", margin: "26px 0" }} />
        <div style={{ fontSize: 22, lineHeight: 1.5 }}>
          <b style={{ fontFamily: "Inter", fontSize: 16, color: "#0B1220" }}>1</b> &nbsp; Differentiate y = x³ ln(x) with respect to x.<br />
          <span style={{ fontFamily: "Inter", fontSize: 12, color: "#5B6B89", letterSpacing: 1 }}>[4 marks]</span>
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.5, marginTop: 22 }}>
          <b style={{ fontFamily: "Inter", fontSize: 16, color: "#0B1220" }}>2</b> &nbsp; Find ∫ (2x + 1)/(x² + x) dx.<br />
          <span style={{ fontFamily: "Inter", fontSize: 12, color: "#5B6B89", letterSpacing: 1 }}>[5 marks]</span>
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.5, marginTop: 22 }}>
          <b style={{ fontFamily: "Inter", fontSize: 16, color: "#0B1220" }}>3</b> &nbsp; Solve sin(2θ) = cos(θ), 0 ≤ θ ≤ 2π.<br />
          <span style={{ fontFamily: "Inter", fontSize: 12, color: "#5B6B89", letterSpacing: 1 }}>[6 marks]</span>
        </div>
      </>
    )}
  </div>
);
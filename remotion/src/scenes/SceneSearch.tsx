import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { Word } from "../components/Type";
import { Tag, Card, Chip } from "../components/UI";

const RESULTS = [
  { ref: "P1 · 2024 May/Jun · 32 · Q7", topic: "Differentiation" },
  { ref: "P3 · 2023 Oct/Nov · 31 · Q9", topic: "Complex Numbers" },
  { ref: "S1 · 2022 May/Jun · 62 · Q4", topic: "Probability" },
  { ref: "M1 · 2024 Feb/Mar · 42 · Q5", topic: "Kinematics" },
];

export const SceneSearch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const caret = Math.floor(frame / 15) % 2 === 0;
  const typed = "complex numbers loci".slice(0, Math.max(0, Math.floor((frame - 40) / 2)));
  return (
    <AbsoluteFill style={{ padding: 110, gap: 50 }}>
      <Tag n="01" text="SEARCH ANY QUESTION" />
      <div style={{ display: "flex", gap: 70, flex: 1, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 110, lineHeight: 1.05, color: colors.ink, fontWeight: 500, letterSpacing: -2 }}>
            <Word text="Every" delay={6} /> <Word text="question." delay={14} />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 110, lineHeight: 1.05, color: colors.accent, fontStyle: "italic", fontWeight: 500, letterSpacing: -2, marginTop: 4 }}>
            <Word text="Found" delay={36} /> <Word text="in" delay={42} /> <Word text="seconds." delay={48} />
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 28, color: colors.inkSoft, marginTop: 40, maxWidth: 560, lineHeight: 1.4, fontWeight: 500 }}>
            <Word text="P1 · P2 · P3 · M1 · S1 · S2. Every past paper, every variant, every mark scheme." delay={80} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 38, flexWrap: "wrap" }}>
            {["Pure 1", "Pure 3", "Mechanics", "Statistics"].map((c, i) => (
              <Chip key={c} active={i === 1} delay={130 + i * 8}>{c}</Chip>
            ))}
          </div>
        </div>
        <div style={{ flex: 1.05 }}>
          <Card style={{ padding: 28 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 16,
              background: colors.bg, borderRadius: 14, padding: "20px 24px",
              border: `1px solid ${colors.line}`,
            }}>
              <div style={{ width: 22, height: 22, borderRadius: 999, border: `2.5px solid ${colors.accent}`, position: "relative" }}>
                <div style={{ position: "absolute", width: 10, height: 2.5, background: colors.accent, bottom: -4, right: -6, transform: "rotate(45deg)" }} />
              </div>
              <div style={{ fontFamily: "Inter", fontSize: 26, color: colors.ink, fontWeight: 500 }}>
                {typed}
                <span style={{ opacity: caret ? 1 : 0, color: colors.accent }}>|</span>
              </div>
            </div>
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              {RESULTS.map((r, i) => {
                const s = spring({ frame: frame - (90 + i * 16), fps, config: { damping: 20 } });
                return (
                  <div key={i} style={{
                    opacity: s,
                    transform: `translateX(${interpolate(s, [0, 1], [40, 0])}px)`,
                    background: i === 1 ? `${colors.accent}18` : "transparent",
                    border: `1px solid ${i === 1 ? colors.accent : colors.line}`,
                    borderRadius: 12, padding: "16px 20px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 20, color: colors.ink, letterSpacing: 0.5 }}>{r.ref}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 16, color: colors.inkSoft, marginTop: 4 }}>{r.topic}</div>
                    </div>
                    <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, color: colors.accentSoft, fontStyle: "italic" }}>→</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};
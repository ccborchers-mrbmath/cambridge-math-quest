import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { Word } from "../components/Type";

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const outOp = interpolate(frame, [250, 278], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stat = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 22 } });
  const stats = [
    { n: "6", l: "Modules" },
    { n: "2,400+", l: "Past-paper questions" },
    { n: "1", l: "Subscription" },
  ];
  return (
    <AbsoluteFill style={{ padding: 120, justifyContent: "center", opacity: Math.min(inOp, outOp) }}>
      <div style={{ fontFamily: "Inter", fontSize: 22, color: colors.accent, letterSpacing: 8, fontWeight: 700, marginBottom: 36 }}>
        <Word text="CAMBRIDGE  MATH  QUEST" delay={0} blur={false} />
      </div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 158, lineHeight: 1.02, color: colors.ink, fontWeight: 500, letterSpacing: -4 }}>
        <div><Word text="A-Level" delay={6} /> <Word text="Math." delay={14} /></div>
        <div style={{ color: colors.inkSoft, fontStyle: "italic", marginTop: 4 }}>
          <Word text="Whole" delay={36} /> <Word text="syllabus." delay={44} />
        </div>
        <div style={{ color: colors.accent, marginTop: 4 }}>
          <Word text="One" delay={70} /> <Word text="screen." delay={78} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 80, marginTop: 90 }}>
        {stats.map((s, i) => {
          const sp = stat(140 + i * 18);
          return (
            <div key={i} style={{ opacity: sp, transform: `translateY(${interpolate(sp, [0, 1], [24, 0])}px)` }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 88, color: colors.ink, fontWeight: 500, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontFamily: "Inter", fontSize: 20, color: colors.inkSoft, letterSpacing: 3, marginTop: 10, fontWeight: 500, textTransform: "uppercase" }}>{s.l}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { Word } from "../components/Type";

export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t1 = spring({ frame, fps, config: { damping: 22 } });
  const t2 = spring({ frame: frame - 26, fps, config: { damping: 22 } });
  const btn = spring({ frame: frame - 60, fps, config: { damping: 18 } });
  const pulse = 1 + Math.sin(frame / 9) * 0.015;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 120, textAlign: "center" }}>
      <div style={{ fontFamily: "Inter", fontSize: 22, color: colors.accent, letterSpacing: 10, fontWeight: 700, opacity: t1 }}>
        CAMBRIDGE  MATH  QUEST
      </div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 168, lineHeight: 1.02, color: colors.ink, fontWeight: 500, letterSpacing: -5, marginTop: 32, opacity: t1, transform: `translateY(${interpolate(t1, [0, 1], [30, 0])}px)` }}>
          One <em style={{ color: colors.accent, fontStyle: "italic" }}>subscription.</em>
      </div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 168, lineHeight: 1.02, color: colors.ink, fontWeight: 500, letterSpacing: -5, marginTop: 4, opacity: t2, transform: `translateY(${interpolate(t2, [0, 1], [30, 0])}px)` }}>
          Every <em style={{ color: colors.accentSoft, fontStyle: "italic" }}>module.</em>
      </div>
      <div style={{
        marginTop: 70, display: "inline-flex", padding: "26px 64px", borderRadius: 999,
        background: colors.accent, color: colors.bg, fontFamily: "Inter", fontWeight: 700, fontSize: 32,
        transform: `scale(${pulse * interpolate(btn, [0, 1], [0.7, 1])})`,
        opacity: btn, boxShadow: `0 20px 50px -10px ${colors.accent}88`,
        letterSpacing: 1,
      }}>
        cambridge-math-quest.lovable.app
      </div>
    </AbsoluteFill>
  );
};
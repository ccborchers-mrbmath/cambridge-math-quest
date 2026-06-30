import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { Word } from "../components/Type";
import { Tag, Card } from "../components/UI";

export const SceneMarking: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scan = interpolate(frame, [60, 160], [0, 100], { extrapolateRight: "clamp" });
  const fb = spring({ frame: frame - 170, fps, config: { damping: 22 } });
  const score = Math.round(interpolate(frame, [180, 230], [0, 5], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }));
  return (
    <AbsoluteFill style={{ padding: 110, gap: 50 }}>
      <Tag n="02" text="AI MARKS YOUR WORK" />
      <div style={{ display: "flex", gap: 70, flex: 1, alignItems: "center" }}>
        <div style={{ flex: 1.05 }}>
          <Card style={{ padding: 0, position: "relative" }}>
            <div style={{ padding: "28px 32px", borderBottom: `1px solid ${colors.line}`, fontFamily: "Inter", fontWeight: 600, fontSize: 18, color: colors.inkSoft, letterSpacing: 2 }}>
              YOUR SOLUTION  ·  PHOTO UPLOAD
            </div>
            <div style={{ padding: 40, fontFamily: "Fraunces, serif", fontSize: 34, color: colors.ink, lineHeight: 1.6, fontStyle: "italic", minHeight: 360 }}>
              <div>∫ (3x² + 2x) dx</div>
              <div>= x³ + x² + C</div>
              <div style={{ marginTop: 16 }}>at x = 2:</div>
              <div>= 8 + 4 = <span style={{ color: colors.gold }}>12</span></div>
            </div>
            {/* scan line */}
            <div style={{
              position: "absolute", left: 0, right: 0, top: `${scan}%`,
              height: 3, background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
              boxShadow: `0 0 28px ${colors.accent}`,
              opacity: scan > 0 && scan < 100 ? 1 : 0,
            }} />
          </Card>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 104, lineHeight: 1.05, color: colors.ink, fontWeight: 500, letterSpacing: -2 }}>
            <Word text="Snap" delay={6} /> <Word text="it." delay={12} />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 104, lineHeight: 1.05, color: colors.accent, fontStyle: "italic", fontWeight: 500, letterSpacing: -2, marginTop: 4 }}>
            <Word text="We" delay={28} /> <Word text="mark" delay={34} /> <Word text="it." delay={42} />
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 26, color: colors.inkSoft, marginTop: 36, lineHeight: 1.5, maxWidth: 520, fontWeight: 500 }}>
            <Word text="Step-by-step feedback. Spot the error. Get the method. Get the marks." delay={70} />
          </div>
          <div style={{ marginTop: 40, opacity: fb, transform: `translateY(${interpolate(fb, [0, 1], [24, 0])}px)` }}>
            <Card style={{ padding: 24, display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 56, color: colors.gold, fontWeight: 600, lineHeight: 1 }}>{score}<span style={{ color: colors.inkSoft, fontSize: 32 }}>/5</span></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "Inter", fontSize: 16, color: colors.accent, fontWeight: 700, letterSpacing: 2 }}>FULL MARKS</div>
                <div style={{ fontFamily: "Inter", fontSize: 18, color: colors.inkSoft, marginTop: 4 }}>Correct integration · Limits applied · Final answer 12</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
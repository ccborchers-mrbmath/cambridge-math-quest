import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors } from "../theme";
import { Word } from "../components/Type";
import { Tag, Card } from "../components/UI";

export const SceneProgress: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = [62, 78, 45, 88, 70, 92, 55];
  const barProg = interpolate(frame, [40, 130], [0, 1], { extrapolateRight: "clamp" });
  const coach = spring({ frame: frame - 130, fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ padding: 110, gap: 50 }}>
      <Tag n="04" text="TRACK · COACH · MASTER" />
      <div style={{ display: "flex", gap: 70, flex: 1, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 104, lineHeight: 1.04, color: colors.ink, fontWeight: 500, letterSpacing: -2 }}>
            <Word text="See" delay={6} /> <Word text="every" delay={12} /> <Word text="step" delay={20} />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 104, lineHeight: 1.04, color: colors.accent, fontStyle: "italic", fontWeight: 500, letterSpacing: -2, marginTop: 4 }}>
            <Word text="toward" delay={36} /> <Word text="an" delay={44} /> <Word text="A*." delay={50} />
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 24, color: colors.inkSoft, marginTop: 36, lineHeight: 1.5, maxWidth: 520, fontWeight: 500 }}>
            <Word text="Mastery per topic. Share with a coach. Live video lessons, one click away." delay={76} />
          </div>
        </div>
        <div style={{ flex: 1.05, display: "flex", flexDirection: "column", gap: 24 }}>
          <Card style={{ padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
              <div style={{ fontFamily: "Inter", fontSize: 16, color: colors.inkSoft, letterSpacing: 3, fontWeight: 700 }}>TOPIC MASTERY</div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 36, color: colors.accent, fontWeight: 600 }}>72%</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 180 }}>
              {bars.map((b, i) => {
                const h = b * barProg;
                return (
                  <div key={i} style={{
                    flex: 1, height: `${h}%`,
                    background: `linear-gradient(180deg, ${colors.accent} 0%, ${colors.accentSoft} 100%)`,
                    borderRadius: "6px 6px 0 0", opacity: 0.85,
                  }} />
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: "Inter", fontSize: 13, color: colors.inkDim, letterSpacing: 1 }}>
              <span>P1</span><span>P2</span><span>P3</span><span>S1</span><span>S2</span><span>M1</span><span>·</span>
            </div>
          </Card>
          <Card style={{
            padding: 22, opacity: coach,
            transform: `translateY(${interpolate(coach, [0, 1], [20, 0])}px)`,
            display: "flex", alignItems: "center", gap: 18,
          }}>
            <div style={{ width: 54, height: 54, borderRadius: 999, background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentSoft})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Fraunces, serif", fontSize: 24, color: colors.bg, fontWeight: 700 }}>C</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Inter", fontSize: 14, color: colors.accent, letterSpacing: 2, fontWeight: 700 }}>YOUR COACH · LIVE</div>
              <div style={{ fontFamily: "Inter", fontSize: 18, color: colors.ink, marginTop: 4, fontWeight: 500 }}>"Let's go over question 7 together."</div>
            </div>
            <div style={{
              padding: "12px 22px", borderRadius: 999, background: colors.accent,
              color: colors.bg, fontFamily: "Inter", fontWeight: 700, fontSize: 16,
            }}>Join call</div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};
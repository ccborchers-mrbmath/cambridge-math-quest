import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors } from "../theme";

const GLYPHS = [
  { t: "\u222B", x: 8, y: 120, size: 140, s: 0.6, r: -8 },
  { t: "\u2211", x: 88, y: 80, size: 160, s: 0.4, r: 6 },
  { t: "\u03C0", x: 12, y: 720, size: 180, s: 0.3, r: 12 },
  { t: "dx", x: 80, y: 820, size: 110, s: 0.5, r: -4 },
  { t: "f(x)", x: 45, y: 60, size: 90, s: 0.7, r: 0 },
  { t: "\u221A", x: 60, y: 880, size: 150, s: 0.4, r: -10 },
];

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [0, 120]);
  const pulse = (Math.sin(frame / 60) + 1) / 2;
  return (
    <AbsoluteFill style={{ background: colors.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${22 + drift / 6}% ${28 + drift / 8}%, ${colors.accent}22 0%, transparent 50%), radial-gradient(circle at ${78 - drift / 7}% ${72 + drift / 10}%, ${colors.accentSoft}1c 0%, transparent 55%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.07,
          backgroundImage: `linear-gradient(${colors.line} 1px, transparent 1px), linear-gradient(90deg, ${colors.line} 1px, transparent 1px)`,
          backgroundSize: "96px 96px",
          transform: `translate(${-drift}px, ${-drift / 2}px)`,
        }}
      />
      {GLYPHS.map((g, i) => {
        const y = (g.y + drift * g.s) % 1100;
        const op = 0.05 + pulse * 0.04;
        return (
          <div key={i} style={{
            position: "absolute", left: `${g.x}%`, top: y, fontFamily: "Fraunces, serif",
            fontSize: g.size, color: colors.accentSoft, opacity: op, fontStyle: "italic",
            transform: `rotate(${g.r}deg)`,
          }}>{g.t}</div>
        );
      })}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
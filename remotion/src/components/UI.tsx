import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { colors } from "../theme";

export const Tag: React.FC<{ text: string; n: string }> = ({ text, n }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18 } });
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 22,
      fontFamily: "Inter", fontWeight: 700, letterSpacing: 6, fontSize: 22,
      color: colors.accent, opacity: s,
      transform: `translateX(${interpolate(s, [0, 1], [-28, 0])}px)`,
    }}>
      <span style={{ width: 56, height: 2, background: colors.accent, opacity: 0.7 }} />
      <span style={{ color: colors.inkSoft }}>{n}</span>
      <span>{text}</span>
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.bgDeep} 100%)`,
    border: `1px solid ${colors.line}`,
    borderRadius: 24,
    boxShadow: "0 40px 100px -30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
    overflow: "hidden",
    ...style,
  }}>{children}</div>
);

export const Chip: React.FC<{ children: React.ReactNode; active?: boolean; delay?: number }> = ({ children, active, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  return (
    <div style={{
      opacity: s,
      transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)`,
      padding: "10px 22px",
      borderRadius: 999,
      fontFamily: "Inter", fontWeight: 600, fontSize: 22,
      color: active ? colors.bg : colors.inkSoft,
      background: active ? colors.accent : "transparent",
      border: `1px solid ${active ? colors.accent : colors.line}`,
    }}>{children}</div>
  );
};
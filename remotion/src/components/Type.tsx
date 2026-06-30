import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Word: React.FC<{
  text: string;
  delay?: number;
  style?: React.CSSProperties;
  from?: "up" | "down" | "left";
  blur?: boolean;
}> = ({ text, delay = 0, style, from = "up", blur = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 22, stiffness: 140 } });
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const ty = from === "up" ? interpolate(s, [0, 1], [38, 0]) : from === "down" ? interpolate(s, [0, 1], [-38, 0]) : 0;
  const tx = from === "left" ? interpolate(s, [0, 1], [-50, 0]) : 0;
  const b = blur ? interpolate(s, [0, 1], [10, 0]) : 0;
  return (
    <span style={{
      display: "inline-block", opacity,
      transform: `translate(${tx}px, ${ty}px)`,
      filter: blur ? `blur(${b}px)` : undefined,
      ...style,
    }}>{text}</span>
  );
};
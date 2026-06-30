import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { Background } from "./components/Background";
import { SceneHook } from "./scenes/SceneHook";
import { SceneSearch } from "./scenes/SceneSearch";
import { SceneMarking } from "./scenes/SceneMarking";
import { SceneTestMaker } from "./scenes/SceneTestMaker";
import { SceneProgress } from "./scenes/SceneProgress";
import { SceneCTA } from "./scenes/SceneCTA";

loadFraunces("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
loadInter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });

const t = (frames = 10) => springTiming({ config: { damping: 200 }, durationInFrames: frames });

export const MainVideo: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Audio src={staticFile("audio/vo.mp3")} volume={1} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={278}><SceneHook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={t(10)} />
      <TransitionSeries.Sequence durationInFrames={258}><SceneSearch /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={t(10)} />
      <TransitionSeries.Sequence durationInFrames={278}><SceneMarking /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={t(10)} />
      <TransitionSeries.Sequence durationInFrames={238}><SceneTestMaker /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={t(10)} />
      <TransitionSeries.Sequence durationInFrames={238}><SceneProgress /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={t(10)} />
      <TransitionSeries.Sequence durationInFrames={140}><SceneCTA /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
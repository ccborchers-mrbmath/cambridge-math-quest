import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, VolumeX, Sparkles } from "lucide-react";

interface Props {
  onStart: () => void;
  onPricing: () => void;
}

export const PromoHero = ({ onStart, onPricing }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) v.play();
  };

  return (
    <section className="max-w-5xl mx-auto mb-16">
      <div className="text-center space-y-3 mb-8">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Cambridge Math Quest
        </span>
        <h2 className="text-4xl md:text-5xl font-serif font-semibold text-foreground leading-tight">
          A-Level Math. Whole syllabus. <span className="text-primary italic">One screen.</span>
        </h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          See how thousands of past-paper questions, AI marking, custom papers, and live coaching come together in one app.
        </p>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-border shadow-elevated bg-black group">
        <video
          ref={videoRef}
          src="/promo.mp4"
          poster=""
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-auto block"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        <div className="absolute bottom-3 right-3 flex gap-2 opacity-90">
          <button
            onClick={togglePlay}
            className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleMute}
            className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
        <Button size="lg" onClick={onStart} className="gap-2">
          <Sparkles className="h-4 w-4" /> Start free
        </Button>
        <Button size="lg" variant="outline" onClick={onPricing}>
          See pricing
        </Button>
      </div>
    </section>
  );
};

export default PromoHero;
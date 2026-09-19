import { useEffect, useRef, useState } from "react";
import { AlarmClock, Timer } from "lucide-react";
import { formatClock } from "@/lib/exam";

interface ExamTimerProps {
  /** Epoch ms the sitting began. */
  startedAt: number;
  /** Total time allowed. Ignored when `timed` is false. */
  durationMinutes: number;
  timed: boolean;
  /** Fired once, the moment a timed sitting runs out. */
  onTimeUp?: () => void;
}

/**
 * The clock the student sees once they press Start: counting down under timed
 * conditions, counting up when they chose to work untimed.
 */
export const ExamTimer = ({ startedAt, durationMinutes, timed, onTimeUp }: ExamTimerProps) => {
  const [now, setNow] = useState(() => Date.now());
  const firedTimeUp = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const totalSeconds = durationMinutes * 60;
  const remainingSeconds = totalSeconds - elapsedSeconds;
  const expired = timed && remainingSeconds <= 0;

  // Once only: the clock re-renders every second, and `onTimeUp` is usually an
  // inline arrow, so an unguarded effect would re-fire on every tick.
  useEffect(() => {
    if (expired && !firedTimeUp.current) {
      firedTimeUp.current = true;
      onTimeUp?.();
    }
  }, [expired, onTimeUp]);

  if (!timed) {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-lg font-semibold text-foreground">
        <Timer className="h-4 w-4 text-muted-foreground" />
        {formatClock(elapsedSeconds)}
        <span className="font-sans text-xs font-normal text-muted-foreground">untimed</span>
      </span>
    );
  }

  // Under five minutes the clock turns amber, then red once time is up.
  const tone = expired
    ? "text-destructive"
    : remainingSeconds <= 300
      ? "text-amber"
      : "text-foreground";

  return (
    <span className={`inline-flex items-center gap-2 font-mono text-lg font-semibold ${tone}`}>
      <AlarmClock className="h-4 w-4" />
      {expired ? "Time's up" : formatClock(remainingSeconds)}
      {expired && (
        <span className="font-sans text-xs font-normal text-muted-foreground">
          +{formatClock(elapsedSeconds - totalSeconds)} over
        </span>
      )}
    </span>
  );
};

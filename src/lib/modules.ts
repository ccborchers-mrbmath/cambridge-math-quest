import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { questionsDatabase } from "@/data/questions";

export type ModuleCode = "P1" | "P2" | "P3" | "S1" | "S2" | "M1";

export interface ModuleInfo {
  code: ModuleCode;
  shortLabel: string; // e.g. "P3"
  name: string;       // e.g. "Pure Mathematics 3"
  tagline: string;    // e.g. "A Level — Paper 3"
}

export const MODULES: ModuleInfo[] = [
  { code: "P1", shortLabel: "P1", name: "Pure Mathematics 1", tagline: "AS Level — Paper 1" },
  { code: "P2", shortLabel: "P2", name: "Pure Mathematics 2", tagline: "A Level — Paper 2" },
  { code: "P3", shortLabel: "P3", name: "Pure Mathematics 3", tagline: "A Level — Paper 3" },
  { code: "S1", shortLabel: "S1", name: "Probability & Statistics 1", tagline: "AS / A Level — Paper 5" },
  { code: "S2", shortLabel: "S2", name: "Probability & Statistics 2", tagline: "A Level — Paper 6" },
  { code: "M1", shortLabel: "M1", name: "Mechanics", tagline: "AS / A Level — Paper 4" },
];

export const MODULE_CODES: ModuleCode[] = MODULES.map((m) => m.code);

export const isModuleCode = (v: unknown): v is ModuleCode =>
  typeof v === "string" && (MODULE_CODES as string[]).includes(v);

export const getModuleInfo = (code: ModuleCode): ModuleInfo =>
  MODULES.find((m) => m.code === code) ?? MODULES[2];

/** Treat questions without an explicit `module` as P3 (legacy data). */
export const moduleOf = (q: { module?: ModuleCode }): ModuleCode => q.module ?? "P3";

/** Abbreviate Cambridge sitting names, e.g. "Feb/Mar" → "F/M". */
export const abbreviateSitting = (sitting: string): string => {
  const normalized = sitting.trim().toLowerCase();
  if (normalized.includes("feb") || normalized.includes("mar")) return "F/M";
  if (normalized.includes("may") || normalized.includes("jun")) return "M/J";
  if (normalized.includes("oct") || normalized.includes("nov")) return "O/N";
  return sitting;
};


/**
 * Cambridge 9709 paper-number convention:
 *   11/12/13 → P1   21/22/23 → P2   31/32/33 → P3
 *   41/42/43 → M1   51/52/53 → S1   61/62/63 → S2
 */
export const moduleFromPaperNumber = (paperNumber: number | null | undefined): ModuleCode | null => {
  if (paperNumber == null || !Number.isFinite(paperNumber)) return null;
  const tens = Math.floor(paperNumber / 10);
  switch (tens) {
    case 1: return "P1";
    case 2: return "P2";
    case 3: return "P3";
    case 4: return "M1";
    case 5: return "S1";
    case 6: return "S2";
    default: return null;
  }
};

export const questionsInModule = (code: ModuleCode) =>
  questionsDatabase.filter((q) => moduleOf(q) === code);

export const countByModule = (): Record<ModuleCode, number> => {
  const counts = Object.fromEntries(MODULE_CODES.map((c) => [c, 0])) as Record<ModuleCode, number>;
  for (const q of questionsDatabase) counts[moduleOf(q)] += 1;
  return counts;
};

const STORAGE_KEY = "activeModule";

export const getStoredModule = (): ModuleCode | null => {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return isModuleCode(v) ? v : null;
};

export const setStoredModule = (code: ModuleCode) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, code);
};

/**
 * Resolve the active module from the URL `?module=` param, then localStorage.
 * If neither is set and `redirectIfMissing` is true, navigate to the picker.
 * Selecting a module updates both the URL and localStorage.
 */
export function useActiveModule(opts: { redirectIfMissing?: boolean } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlModule = searchParams.get("module");
  const initial: ModuleCode | null = isModuleCode(urlModule)
    ? urlModule
    : getStoredModule();
  const [module, setModuleState] = useState<ModuleCode | null>(initial);

  // Sync URL -> state
  useEffect(() => {
    if (isModuleCode(urlModule) && urlModule !== module) {
      setModuleState(urlModule);
      setStoredModule(urlModule);
    }
  }, [urlModule, module]);

  // If URL has no module but we have a stored one, push it into the URL.
  useEffect(() => {
    if (!isModuleCode(urlModule) && module) {
      const next = new URLSearchParams(searchParams);
      next.set("module", module);
      setSearchParams(next, { replace: true });
    }
  }, [urlModule, module, searchParams, setSearchParams]);

  // Redirect to picker if needed.
  useEffect(() => {
    if (opts.redirectIfMissing && !module) {
      navigate("/", { replace: true });
    }
  }, [opts.redirectIfMissing, module, navigate]);

  const setModule = useCallback(
    (code: ModuleCode) => {
      setModuleState(code);
      setStoredModule(code);
      const next = new URLSearchParams(searchParams);
      next.set("module", code);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  return { module, setModule };
}

/**
 * Returns unique topic labels for a pool of questions ordered by Cambridge
 * 9709 curriculum sequence. Order is derived from the numeric prefix of the
 * `subtopics` field (e.g. "1.4 Division of polynomials" → section 1.4).
 * Topics with no recognisable numeric prefix fall to the end alphabetically.
 */
export function getTopicsInCurriculumOrder(
  pool: Array<{ topic: string; subtopics: string }>
): string[] {
  // Build a map: topic label → lowest numeric section found in subtopics
  const sectionMap = new Map<string, number[]>();
  const codeRe = /^(\d+)\.(\d+)/;

  for (const q of pool) {
    const label = q.topic?.trim();
    if (!label) continue;
    if (sectionMap.has(label)) continue; // only need first match per topic
    const firstSubtopic = q.subtopics?.split(",")[0]?.trim() ?? "";
    const m = firstSubtopic.match(codeRe);
    if (m) {
      sectionMap.set(label, [parseInt(m[1], 10), parseInt(m[2], 10)]);
    }
  }

  const uniqueLabels = Array.from(
    new Set(pool.map((q) => q.topic?.trim()).filter(Boolean))
  ) as string[];

  return uniqueLabels.sort((a, b) => {
    const pa = sectionMap.get(a);
    const pb = sectionMap.get(b);
    if (pa && pb) {
      if (pa[0] !== pb[0]) return pa[0] - pb[0];
      return pa[1] - pb[1];
    }
    if (pa) return -1;
    if (pb) return 1;
    return a.localeCompare(b);
  });
}
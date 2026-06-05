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
  { code: "S2", shortLabel: "S2", name: "Probability & Statistics 2", tagline: "A Level — Paper 7" },
  { code: "M1", shortLabel: "M1", name: "Mechanics", tagline: "AS / A Level — Paper 4" },
];

export const MODULE_CODES: ModuleCode[] = MODULES.map((m) => m.code);

export const isModuleCode = (v: unknown): v is ModuleCode =>
  typeof v === "string" && (MODULE_CODES as string[]).includes(v);

export const getModuleInfo = (code: ModuleCode): ModuleInfo =>
  MODULES.find((m) => m.code === code) ?? MODULES[2];

/** Treat questions without an explicit `module` as P3 (legacy data). */
export const moduleOf = (q: { module?: ModuleCode }): ModuleCode => q.module ?? "P3";

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
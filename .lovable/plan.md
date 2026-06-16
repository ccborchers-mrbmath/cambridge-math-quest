Plan: Fix topic ordering to use Cambridge 9709 curriculum sequence

1. **Add `getTopicsInCurriculumOrder` to `src/lib/modules.ts`**
   Append the helper function provided by the user to the bottom of the file. It derives order from the numeric prefix of the `subtopics` field (e.g. "1.4 Division of polynomials" → section 1.4). Topics without a recognisable numeric prefix fall to the end alphabetically.

2. **Update `src/pages/Index.tsx`**
   - Add `getTopicsInCurriculumOrder` to the import from `@/lib/modules`.
   - Replace the `mainTopics` derivation with `useMemo(() => getTopicsInCurriculumOrder(pool), [pool])`.
   - Remove the now-unused `sortTopicsBySyllabus` import from `@/lib/curriculum`.

3. **Update `src/pages/TestMaker.tsx`**
   - Add `getTopicsInCurriculumOrder` to the import from `@/lib/modules`.
   - Replace the `allTopics` memo with `useMemo(() => getTopicsInCurriculumOrder(pool), [pool])`.
   - In the "2. Select Questions" section, replace the `.sort()` on selected topics with `getTopicsInCurriculumOrder(pool.filter(q => selectedTopics.has(q.topic)))`.
   - Remove the now-unused `sortTopicsBySyllabus` import from `@/lib/curriculum`.

Note: `sortTopicsBySyllabus` in `src/lib/curriculum.ts` will no longer be referenced by these two pages. It can be left in place or removed in a future cleanup.
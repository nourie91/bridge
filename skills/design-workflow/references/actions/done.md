# Action: done

> Archive the CSpec, extract recipes if eligible, and close the work.

---

## Procedure

### 1. Auto-detect pending corrections

Check if the snapshot has been updated since the last `fix` run, or if `fix` was never run:

- If snapshot exists (`specs/active/{name}-snapshot.json`) AND no learnings reference this spec in `learnings.json`:
  - Re-extract current Figma state (same extraction as `fix` step 2)
  - Compare against snapshot
  - If changes detected:
    ```
    Changes detected since last generation/fix.
    Running auto-fix to capture corrections before archiving...
    ```
    -> Execute the full `fix` flow (steps 2-10 from `actions/fix.md`)
  - If no changes: proceed

- If no snapshot exists: skip (design was never generated, spec-only work)

### 2. Final check

- [ ] CSpec exists in `specs/active/`
- [ ] User has validated the design (explicit confirmation)
- [ ] If Figma design exists: matches CSpec intent

### 3. Recipe extraction check

Evaluate if this design qualifies for recipe extraction:

**Eligibility criteria (ALL must be met):**
1. The CSpec is in **screen mode** (`meta.type: screen`)
2. The design was generated and executed in Figma (snapshot exists)
3. Total corrections during the `fix` cycle <= 2

**If eligible:**
```
This design qualifies for recipe extraction.
Creating recipe: {archetype} (from {name})
```

Extract recipe:
1. Take the final scene graph JSON (post-corrections)
2. Templatize: replace concrete text content with `{{ param }}` placeholders
3. Replace component keys with `@lookup:ComponentName` references
4. Define parameters based on variable content (title, items, section count, etc.)
5. Set initial confidence: `0.70 + (0.05 * 1) = 0.75` (first success)
6. Write to `recipes/r-{archetype}-{nnn}.json`
7. Update `recipes/_index.json` with the new recipe metadata

**If not eligible:**
```
Recipe extraction skipped: {reason}
  (screen mode: {yes/no}, corrections: {n}, threshold: <= 2)
```

### 4. Update recipe confidence (if recipe was used)

If a recipe was used during `make` (check `snapshot.meta.recipe`):

1. Increment `successCount`
2. Recalculate confidence:
   ```
   base_score = min(1.0, 0.70 + (successCount * 0.05))
   recency_weight = max(0.50, 1.0 - (days_since_last_use * 0.005))
   correction_decay = max(0.60, 1.0 - (avgCorrections * 0.15))
   confidence = base_score * recency_weight * correction_decay
   ```
3. Update the recipe file and `_index.json`

### 5. Archive

```bash
mv specs/active/{name}.cspec.yaml specs/shipped/{name}.cspec.yaml
```

If a snapshot exists:
```bash
mv specs/active/{name}-snapshot.json specs/shipped/{name}-snapshot.json
```

### 6. Update history log

Append to `specs/history.log`:

```
{date} | {name} | {component|screen} | {figma_url} | {learnings_count} | {recipe_extracted: yes/no}
```

### 7. Persist learnings summary

Report learnings from this cycle:
```
Learnings persisted: {n} learnings, {n} flags from this design.
{n} recipe(s) updated, {n} recipe(s) created.
```

### 8. Brief retro

- **What went well?** (patterns to repeat)
- **What was friction?** (improvements for the workflow)
- **What was learned?** (reusable knowledge captured in learnings.json)

### 9. Cleanup

- Delete temp files: `/tmp/bridge-scene-{name}.json` (if exists)
- Confirm no stale files remain in `specs/active/`

---

## Output

```
## Done: {name}

Figma: {url}
CSpec archived: specs/shipped/{name}.cspec.yaml
Learnings: {n} persisted
Recipe: {extracted as r-{archetype}-{nnn} | updated {recipe} confidence to {score} | none}

Ready for the next design!
```

# Action: drop

> Abandon the current work while preserving learnings.

---

## Procedure

### 1. Confirm

Ask: "Sure you want to drop {name}?"

### 2. Capture learnings

If a snapshot exists (`specs/active/{name}-snapshot.json`), offer to run `fix` first:
```
A snapshot exists. Want to capture any corrections before dropping?
  - Yes -> run fix flow, then proceed with drop
  - No -> proceed without capturing
```

### 3. Document drop reason

Add drop notes to the CSpec:

```yaml
# --- Drop Notes ---
drop:
  date: "{ISO date}"
  reason: "{reason from user}"
  learnings: "{what was discovered, what blocked, what to do differently}"
```

### 4. Archive

```bash
mv specs/active/{name}.cspec.yaml specs/dropped/{name}.cspec.yaml
```

If snapshot exists:
```bash
mv specs/active/{name}-snapshot.json specs/dropped/{name}-snapshot.json
```

### 5. Update history

Append to `specs/history.log`:

```
{date} | {name} | DROPPED | {reason}
```

### 6. Cleanup

- Delete temp files: `/tmp/bridge-scene-{name}.json` (if exists)
- Confirm no stale files remain in `specs/active/`

---

## Output

```
## Dropped: {name}

Reason: {reason}
CSpec archived: specs/dropped/{name}.cspec.yaml
Learnings: {captured | skipped}

Ready for the next design. Run: `make <description>`
```

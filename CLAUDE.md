# Dry Nights

A bedwetting tracker PWA: a scrollable calendar list of nights (today at the top),
each marked wet (blue) or dry (orange) with any number of logged wake-ups (time +
how the sleeper woke), plus streaks and encouragement. Installable to a phone
homescreen; works offline.

## Stack

Vanilla HTML/CSS/JS. No frameworks, no build step, no server — open `index.html`
or serve the folder statically. All asset paths are relative, so it deploys to
GitHub Pages (or any subpath) unchanged.

## Files

- `index.html` — single page: header, stats card, day list, editor sheet,
  reset-confirmation sheet, onboarding sheet, toast. Inline head script applies
  the saved theme before first paint.
- `style.css` — all styling. Theming via CSS variables on `:root` /
  `[data-theme="dark"]`. Status colors: `--wet` (blue #3b82f6), `--dry`
  (orange #f97316).
- `app.js` — all logic in one IIFE: storage (with v1 migration), date helpers,
  stats/streaks, day-list rendering with infinite scroll, editor sheet with
  multi-wake-up rows, reset flow, onboarding, theme toggle, toast,
  service-worker registration.
- `manifest.json` / `sw.js` — PWA install + offline (cache-first app shell).
  Bump the `CACHE` constant in `sw.js` when shipping asset changes.
- `icons/` — generated PNGs (192, 512, apple-touch 180).
- `scripts/make_icons.py` — regenerates icons; pure stdlib, no deps.

## Data model

Everything lives in `localStorage` under `bedwet.v1`:

```json
{
  "user": { "name": "...", "createdAt": "ISO date" },
  "entries": {
    "YYYY-MM-DD": {
      "status": "wet" | "dry",
      "wakeUps": [
        { "time": "HH:MM" | null, "wake": "self" | "helped" | "none" | null }
      ]
    }
  }
}
```

Entry keys are **local** dates (an entry describes the night ending on that
morning). `wake` records how that wake-up went: independently (`self`), with
help (`helped`), or slept through (`none`). Old entries with a single
`alarmTime` are migrated to a one-element `wakeUps` array on load. Theme is
stored separately under `bedwet.theme`.

## Behavior notes

- **Current streak** walks back from today; an unlogged *today* doesn't break
  it (the night isn't over yet), but any other gap or a wet night does.
- **Best streak / totals** scan day-by-day from the earliest entry to today.
- The day list renders 30 days at a time; an `IntersectionObserver` on
  `#load-sentinel` appends more as you scroll. It stops at the user's **day
  one** (signup date, or the earliest entry if older) with an end-cap message —
  no dates before the user started.
- Encouragement messages and save toasts come from pools; the stats-card
  message is seeded by date + streak so it rotates daily without flickering
  between renders.
- Resetting the app (🔄 in the header) requires typing "RESET" in a
  confirmation sheet, then clears `bedwet.v1` and reloads into onboarding.
- Date math uses noon-anchored `Date` objects (`daysAgo`) to dodge DST edges.
- First run shows the onboarding sheet to create the user (name only).

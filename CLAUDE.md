# Dry Nights

A bedwetting tracker PWA: a scrollable calendar list of nights (today at the top),
each marked wet (blue) or dry (orange) with the time the alarm went off, plus
streaks and encouragement. Installable to a phone homescreen; works offline.

## Stack

Vanilla HTML/CSS/JS. No frameworks, no build step, no server — open `index.html`
or serve the folder statically. All asset paths are relative, so it deploys to
GitHub Pages (or any subpath) unchanged.

## Files

- `index.html` — single page: header, stats card, day list, editor sheet,
  onboarding sheet, toast. Inline head script applies the saved theme before
  first paint.
- `style.css` — all styling. Theming via CSS variables on `:root` /
  `[data-theme="dark"]`. Status colors: `--wet` (blue #3b82f6), `--dry`
  (orange #f97316).
- `app.js` — all logic in one IIFE: storage, date helpers, stats/streaks,
  day-list rendering with infinite scroll, editor sheet, onboarding, theme
  toggle, toast, service-worker registration.
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
    "YYYY-MM-DD": { "status": "wet" | "dry", "alarmTime": "HH:MM" | null }
  }
}
```

Entry keys are **local** dates (an entry describes the night ending on that
morning). Theme is stored separately under `bedwet.theme`.

## Behavior notes

- **Current streak** walks back from today; an unlogged *today* doesn't break
  it (the night isn't over yet), but any other gap or a wet night does.
- **Best streak / totals** scan day-by-day from the earliest entry to today.
- The day list renders 30 days at a time; an `IntersectionObserver` on
  `#load-sentinel` appends more as you scroll.
- Date math uses noon-anchored `Date` objects (`daysAgo`) to dodge DST edges.
- First run shows the onboarding sheet to create the user (name only).

# Vitalock design tokens

Semantic design tokens live in `packages/ui/globals.css` as CSS custom
properties (HSL triplets) and are wired into Tailwind via
`packages/ui/tailwind.preset.js`. The rule: **components never reference raw
hex values; they only compose semantic tokens.**

Both apps consume the same preset, so a change here propagates to admin,
installer, and every shared UI component in one commit.

---

## How the layers fit together

1. **`globals.css`** defines every color as an HSL triplet under `:root`
   (light) and `.dark`. Storing hex here breaks the layer — Tailwind emits
   `hsl(#hex)` which the browser drops.
2. **`tailwind.preset.js`** exposes each variable as a Tailwind color
   (`bg-card`, `text-foreground`, `border-border`, `bg-primary`, ...).
3. **Component code** uses semantic classes only. If a designer picks a new
   surface tone, we change ONE variable in `globals.css` — nothing else.

---

## Token map

### Surfaces

| Token | Tailwind class | Purpose |
|---|---|---|
| `--background` | `bg-background` | App shell / page background |
| `--foreground` | `text-foreground` | Primary text |
| `--content` | `bg-content` | Content region (subtle offset in dark) |
| `--card` / `--card-foreground` | `bg-card` / `text-card-foreground` | Cards, panels, sheets |
| `--popover` / `--popover-foreground` | `bg-popover` | Menus, popovers, dropdowns |
| `--secondary` / `--secondary-foreground` | `bg-secondary` | Muted button, subtle background |
| `--muted` / `--muted-foreground` | `bg-muted` / `text-muted-foreground` | Neutral surfaces + helper text |
| `--border` | `border` (default) / `border-border` | Every border |
| `--input` | `border-input` | Form-field borders |
| `--ring` | `ring-ring` | Focus ring |
| `--radius` | `rounded-*` | Corner radius scale |

### Brand

`--primary` is an alias of `brand-500`. Use the `brand-*` scale (50 → 950)
for accents that need depth. `--ring` mirrors `--primary`.

| Token | Tailwind class |
|---|---|
| `--primary` / `--primary-foreground` | `bg-primary` / `text-primary-foreground` |
| `--accent` / `--accent-foreground` | `bg-accent` / `text-accent-foreground` |
| `--brand-{50..950}` | `bg-brand-500`, `text-brand-700`, etc. |

### Semantic status

Use the paired `-foreground` for solid controls; use `bg-<tone>/10 text-<tone>`
for soft badges.

| Token | Solid | Soft |
|---|---|---|
| `--destructive` | `bg-destructive text-destructive-foreground` | `bg-destructive/10 text-destructive` |
| `--info` | `bg-info text-info-foreground` | `bg-info/10 text-info` |
| `--success` | `bg-success text-success-foreground` | `bg-success/10 text-success` |
| `--warning` | `bg-warning text-warning-foreground` | `bg-warning/10 text-warning` |

---

## Adding or changing a token

1. Edit `packages/ui/globals.css`. Add the variable to **both** `:root`
   AND `.dark`.
2. Expose it in `packages/ui/tailwind.preset.js` under `theme.extend.colors`.
3. Reference by name in components. **Never inline a hex.**
4. Run `pnpm --filter @vitalock/ui test` — the tokens smoke test snapshots
   the preset.

---

## Rules

- No hex color literals in component classNames. Enforced socially today,
  will move to an ESLint rule.
- Dark mode is an opt-out adaptation of the same families — never a
  different hue system. Light is the default; `.dark` only overrides what
  must shift.
- New surface? Add a new semantic token (`--panel`, `--overlay`, ...).
  Reusing `--muted` for four unrelated purposes is how design systems rot.

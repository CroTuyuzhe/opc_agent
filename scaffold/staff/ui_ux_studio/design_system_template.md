# Design System — {Project Name}

> Version: v0.1 | Updated: {date}

## 1. Color Tokens

### Background & Surface

| Token | Value | Usage |
|-------|-------|-------|
| color-bg | | Global background |
| color-bg-soft | | Secondary background |
| color-surface | | Card/container surface |
| color-surface-secondary | | Secondary surface |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| color-text-primary | | Headings, body text |
| color-text-secondary | | Subtitles, descriptions |
| color-text-tertiary | | Placeholders, disabled |
| color-text-inverse | | Text on brand/dark bg |

### Brand

| Token | Value | Usage |
|-------|-------|-------|
| color-brand | | Primary action, links |
| color-brand-dark | | Pressed state |
| color-brand-light | | Light brand bg |

### Semantic

| Token | Value | Usage |
|-------|-------|-------|
| color-success | | Success, complete |
| color-warning | | Warning, caution |
| color-error | | Error, destructive |
| color-info | | Info, system notice |

### Border & Divider

| Token | Value | Usage |
|-------|-------|-------|
| color-border | | Input/card border |
| color-border-focus | | Focus state ring |
| color-divider | | List/section divider |

### Overlay

| Token | Value | Usage |
|-------|-------|-------|
| color-overlay | | Modal backdrop |

---

## 2. Typography

### Font Family

```
font-family: {primary}, {fallback-1}, {fallback-2}, sans-serif;
```

### Font Scale

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| display | px | px | 700 | Hero headline |
| heading-lg | px | px | 600 | Section title |
| heading-md | px | px | 600 | Card title |
| heading-sm | px | px | 600 | Nav title, list heading |
| body-lg | px | px | 400 | Primary body |
| body-md | px | px | 400 | Standard body |
| body-sm | px | px | 400 | Secondary text |
| caption | px | px | 400 | Labels, timestamps |
| micro | px | px | 500 | Badges, tab labels |

---

## 3. Spacing

Base grid: **{N}px**

| Token | Value | Usage |
|-------|-------|-------|
| space-1 | | Micro gap |
| space-2 | | Icon-text gap |
| space-3 | | Tight inner padding |
| space-4 | | Component inner padding |
| space-6 | | Card inner element gap |
| space-8 | | Page horizontal margin, card padding |
| space-10 | | Section gap |
| space-12 | | Large section gap |
| space-16 | | Hero/major block gap |

---

## 4. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| radius-none | 0px | Sharp edges |
| radius-sm | | Small tags, badges |
| radius-md | | Buttons, cards, inputs |
| radius-lg | | Modals, sheets |
| radius-full | 9999px | Pills, avatars |

---

## 5. Shadows

| Token | Value | Usage |
|-------|-------|-------|
| shadow-sm | | Cards, list items |
| shadow-md | | Floating menus, popovers |
| shadow-lg | | Modals, bottom sheets |
| shadow-brand | | Brand CTA button |
| shadow-focus | | Focus ring |

Rule: max 2 shadow levels on screen simultaneously.

---

## 6. Components

> All values MUST reference tokens above. Define ALL states: default, pressed, disabled, focus, loading.

### 6.1 Button

**Primary**

| Property | Value |
|----------|-------|
| Height | |
| Radius | |
| Background | |
| Text | color: / size: / weight: |
| Shadow | |

| State | Change |
|-------|--------|
| Default | — |
| Pressed | |
| Disabled | opacity: 0.4, no shadow |
| Loading | Spinner replaces text |

**Secondary** — same structure, outline/light variant.

**Text Button** — transparent bg, brand-color text.

### 6.2 Input

| Property | Value |
|----------|-------|
| Height | |
| Radius | |
| Background | |
| Border | |
| Text | color: / size: / placeholder: |
| Padding | |

| State | Change |
|-------|--------|
| Default | — |
| Focus | border: color-border-focus, shadow-focus |
| Filled | — |
| Error | border: color-error |
| Disabled | opacity: 0.4 |

### 6.3 Card

| Property | Value |
|----------|-------|
| Radius | |
| Background | |
| Shadow | |
| Padding | |
| Border | |

### 6.4 Navigation Bar

| Property | Value |
|----------|-------|
| Height | |
| Background | |
| Title | size: / weight: / color: |
| Icon size | |
| Layout | |

### 6.5 Tab Bar

| Property | Value |
|----------|-------|
| Height | |
| Background | |
| Tabs | {list tab items} |
| Icon size | |
| Label | size: / weight: |

| State | Icon Color | Label Color |
|-------|------------|-------------|
| Inactive | | |
| Active | | |

### 6.6 Toast / Snackbar

| Property | Value |
|----------|-------|
| Background | |
| Text color | |
| Radius | |
| Duration | ms |

### 6.7 Bottom Sheet / Modal

| Property | Value |
|----------|-------|
| Background | |
| Radius | (top-left, top-right) |
| Overlay | color-overlay |
| Shadow | |

---

## 7. Motion

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| duration-press | ms | ease-out | Button tap feedback |
| duration-card | ms | ease-out | Card enter/exit |
| duration-sheet | ms | ease-out | Sheet slide |
| duration-page | ms | ease-out | Page transition |
| duration-toast | ms | ease-out | Toast in/out |

Rules:
- Single animation ≤ 500ms
- Only animate `transform` and `opacity`
- Max 1 active motion focus on screen
- Respect `prefers-reduced-motion`

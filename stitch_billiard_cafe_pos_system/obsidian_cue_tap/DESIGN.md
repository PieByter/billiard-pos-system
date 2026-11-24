---
name: Obsidian Cue & Tap
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-numeric-lg:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  label-numeric-md:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  label-numeric-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-badge:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system embodies the electric, atmospheric energy of an upscale modern billiard hall and night-owl sports lounge merged with high-precision venue operations. It balances the moody ambiance of low-lit hospitality spaces with the critical visual clarity required for rapid point-of-sale (POS) workflows, dynamic table management, and high-frequency kitchen display systems (KDS).

The visual aesthetic operates on **Dark Modernism infused with Tactile Cyber-Lounge cues**:
- **Atmosphere:** Deep obsidian and slate foundations that eliminate screen glare in dim bar environments while maintaining ultra-crisp legibility.
- **Personality:** Authoritative, responsive, kinetic, and sleek. It feels like an illuminated score overlay in a luxury championship lounge.
- **Emotional Response:** Confidence and spatial awareness for staff under pressure; effortless prestige and clarity for guest-facing displays.

## Colors

The color architecture is built for high-contrast visibility against deep environmental shadows. Color serves as immediate tactical telemetry:

- **Primary (`#10B981` Emerald / `#34D399` Lime Highlight / `#059669` Active Surface):** Reserved for live, revenue-generating states, running billiard clocks, completed kitchen tickets, and primary POS settlement actions.
- **Secondary (`#06B6D4` Electric Cyan / `#6366F1` Indigo Tint):** Dedicated to food & bar order streams, KDS routing, customer tabs, and interactive navigation modifiers.
- **Tertiary (`#F59E0B` Amber / `#EF4444` Crimson Alert):** Signals paused match clocks, expiring table reservations, pending split checks, and maintenance/dirty table alerts.
- **Neutral Palette (`#090D16` Void Background, `#0F172A` Canvas Core, `#1E293B` Elevated Cards, `#334155` Borders):** A layered slate foundation calibrated to prevent eye fatigue while making neon status signals stand out instantly.
- **Typography Tones:** Crisp neutral whites (`#F8FAFC`) for primary operational data, paired with subdued slate-400 (`#94A3B8`) for secondary metrics and metadata.

## Typography

Typography prioritizes fast scanning under high pressure:
- **Headlines and UI Interface (`Plus Jakarta Sans`):** Selected for its geometric stance, wide counters, and modern legibility. In uppercase micro-copy and table identifiers, it conveys institutional athletic presence.
- **Operational Data & Numeric Streams (`JetBrains Mono`):** All session timers, live rack rates, split checks, and currency totals are strictly anchored in JetBrains Mono. Tabular figures ensure timers count down without layout shifts.
- **Hierarchy Rules:** 
  - Realtime match durations and billing readouts must always prioritize tabular numeric weights over supplementary descriptions.
  - Table badges and KDS priority labels utilize strict uppercase styling with positive letter-spacing (`0.06em`) for rapid peripheral recognition.

## Layout & Spacing

The layout employs a high-density, modular fluid-grid system structured around fast touch targets and multi-panel operational views.

- **Responsive Adaptations:**
  - **Mobile / Handheld Terminal (360px – 767px):** Single-column stacked order feed or table status list. Touch targets expand to 48px minimum height. Sticky bottom bar for active tab settlements.
  - **Tablet POS & KDS Station (768px – 1024px):** 2-to-3 column split view (Table Grid / Ticket Stack / Current Tab Summary). Collapsible side drawer for service controls.
  - **Desktop / Wall Management Dashboard (> 1024px):** 12-column fluid grid. 4-column live billiard table layout, 4-column active tabs/orders, 4-column kitchen rail or telemetry.
- **Rhythm & Gaps:** Tight internal spacing (`space-xs` to `space-sm`) clusters related controls (e.g., play/pause/settle button groups), while `space-md` separates distinct table cards. Section margins stay uniform to maintain a calm frame around real-time updates.

## Elevation & Depth

Visual hierarchy uses **tonal layer stepping** paired with **ambient optical glow effects**:

- **Layer 0 (Canvas Void - `#090D16`):** The structural viewport backing.
- **Layer 1 (Surface Containers - `#0F172A`):** Master panels, POS cart roots, and KDS column lanes. Outlined with low-contrast borders (`#1E293B`, 1px solid).
- **Layer 2 (Interactive Cards - `#1E293B`):** Individual table nodes, food items, and order cards. 
- **Layer 3 (Modals, Overlays & Flyouts - `#1E293B` with 90% opacity & `backdrop-blur-md`):** High-priority confirmation sheets, payment modals, and manual time adjusters.
- **Glow Signatures:**
  - **Live Table Running:** `box-shadow: 0 0 20px -4px rgba(16, 185, 129, 0.25), inset 0 1px 0 0 rgba(52, 211, 153, 0.2)`.
  - **Hold / Paused Table:** `box-shadow: 0 0 20px -4px rgba(245, 158, 11, 0.2), inset 0 1px 0 0 rgba(245, 158, 11, 0.2)`.
  - **Critical Alert / Past Limit:** `box-shadow: 0 0 24px -2px rgba(239, 68, 68, 0.35)`.
- Shadows are never pure gray or black; they carry deep slate-950 undertones with subtle color bleeding tied directly to the state of the component.

## Shapes

The design system maintains a **Soft Architectural (`1`)** corner geometry:
- Standard buttons, badges, inputs, and table tiles utilize `0.25rem` (`rounded`) to `0.5rem` (`rounded-lg`).
- Container panels, modals, and KDS lanes utilize `0.75rem` (`rounded-xl`).
- Micro status dots and radio controls remain strictly circular.
- This controlled geometry creates an industrial, console-grade hardware aesthetic reminiscent of tournament scoreboards and pro audio consoles, avoiding casual bubble shapes.

## Components

### 1. Billiard Table Status Cards
- **Base:** `#1E293B` surface, 1px border with variable tone matching state. Contains table number, assigned player/tab name, live elapsed time, and accruing amount.
- **Active State:** Vibrant emerald top border accent (2px), `#10B981` text for timers, subtle emerald ambient back-glow.
- **Paused State:** Amber border accent, pulsing `#F59E0B` monospace timer display.
- **Dirty / Turnover State:** `#334155` dashed border, low-contrast text with a high-contrast crimson "NEEDS RESET" chip.

### 2. Status Badges & Chips
- **Geometry:** Height 24px, uppercase `label-badge` font, horizontal padding `space-sm`.
- **Variants:**
  - `RUNNING`: Background `rgba(16, 185, 129, 0.15)`, text `#34D399`, border `1px solid rgba(16, 185, 129, 0.3)`.
  - `PAUSED`: Background `rgba(245, 158, 11, 0.15)`, text `#FBBF24`, border `1px solid rgba(245, 158, 11, 0.3)`.
  - `AVAILABLE`: Background `rgba(148, 163, 184, 0.1)`, text `#94A3B8`, border `1px solid rgba(148, 163, 184, 0.2)`.
  - `DIRTY`: Background `rgba(239, 68, 68, 0.15)`, text `#F87171`, border `1px solid rgba(239, 68, 68, 0.3)`.

### 3. POS Control Buttons
- **Tactile Primary Action:** Height 44px (touch-friendly), solid `#10B981` background, `#090D16` text in heavy weight. Active push state: `transform: scale(0.98)`.
- **Secondary / Operational (Hold, Split, Add Time):** `#1E293B` background with `#334155` border, white text, subtle hover lift with bright cyan outline on focus.
- **Danger / Clear Action:** High-saturation `#EF4444` outline button with transparent background.

### 4. KDS Order Cards (Kitchen & Bar)
- **Header:** Table ID / Tab Name, order time, and elapsed wait timer in `JetBrains Mono`.
- **Body:** High-contrast white item names with indented cyan modifiers (e.g., "Medium Rare", "Extra Lime").
- **Footer:** Full-width tactile bump-action button ("BUMP / READY").

### 5. Input Fields & Search Bars
- **Surface:** Dark background `#0B132B`, inset border `1px solid #334155`.
- **Focus:** Crisp emerald focus ring (`2px solid #10B981`) with zero offset.
- **Typography:** `body-md` in `#F8FAFC`, placeholder in muted `#64748B`.

### 6. Modal Overlays & Quick-Action Drawers
- Deep frosted backdrop blur (`rgba(9, 13, 22, 0.8)` with `backdrop-filter: blur(8px)`).
- Dialogs feature sharp contrasting header dividers, monospace live summary bars, and dual high-priority action footers (e.g., "End Session & Pay" vs "Cancel").
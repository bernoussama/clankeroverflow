---
name: VitePlus Overflow Redesign
colors:
  surface: "hsl(0, 9%, 7%)"
  surface-dim: "hsl(0, 9%, 7%)"
  surface-bright: "#43372f"
  surface-container-lowest: "hsl(0, 10%, 5%)"
  surface-container-low: "hsl(0, 9%, 11%)"
  surface-container: "hsl(0, 9%, 13%)"
  surface-container-high: "hsl(0, 8%, 17%)"
  surface-container-highest: "hsl(0, 8%, 21%)"
  on-surface: "#f2dfd3"
  on-surface-variant: "#dcc2af"
  inverse-surface: "#f2dfd3"
  inverse-on-surface: "#392e26"
  outline: "#a48c7b"
  outline-variant: "#564335"
  surface-tint: "#ffb77c"
  primary: "#ffb77c"
  on-primary: "#4d2600"
  primary-container: "#f08506"
  on-primary-container: "#572c00"
  inverse-primary: "#904d00"
  secondary: "#fab985"
  on-secondary: "#4d2600"
  secondary-container: "#683c13"
  on-secondary-container: "#e6a876"
  tertiary: "#91cdff"
  on-tertiary: "#003350"
  tertiary-container: "#00a9fa"
  on-tertiary-container: "#003b5b"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  primary-fixed: "#ffdcc2"
  primary-fixed-dim: "#ffb77c"
  on-primary-fixed: "#2e1500"
  on-primary-fixed-variant: "#6d3900"
  secondary-fixed: "#ffdcc3"
  secondary-fixed-dim: "#fab985"
  on-secondary-fixed: "#2f1500"
  on-secondary-fixed-variant: "#683c13"
  tertiary-fixed: "#cce5ff"
  tertiary-fixed-dim: "#91cdff"
  on-tertiary-fixed: "#001e31"
  on-tertiary-fixed-variant: "#004b72"
  background: "hsl(0, 9%, 7%)"
  on-background: "#f2dfd3"
  surface-variant: "hsl(0, 8%, 21%)"
typography:
  display-lg:
    fontFamily: JetBrains Mono
    fontSize: 48px
    fontWeight: "700"
    lineHeight: "1.1"
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: "600"
    lineHeight: "1.2"
  headline-lg-mobile:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: "600"
    lineHeight: "1.2"
  headline-md:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: "500"
    lineHeight: "1.3"
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "400"
    lineHeight: "1.6"
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: "1.5"
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: "400"
    lineHeight: "1.5"
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: "600"
    lineHeight: "1.0"
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-page: 40px
  container-max: 1280px
---

## Brand & Style

The design system adopts a **Modern Developer-Centric** aesthetic, merging the high-performance, dark-mode energy of modern build tools with the functional clarity required for a Q&A platform. The personality is precise, technical, and "speed-first."

The style leverages **Minimalism** with a **Technical Edge**. It utilizes deep earthy obsidian backgrounds, high-contrast typography, and vibrant gold-orange and electric-azure accents to signal a state-of-the-art developer environment. Layouts are strictly organized, avoiding unnecessary ornamentation in favor of rapid information scanning and code-centric hierarchy.

## Colors

The palette is anchored in a warm, "Industrial Dark" foundation. The neutral base derived from `#83746A` provides a sophisticated, slightly cooler tinted canvas that reduces eye strain compared to pure black, while maintaining high contrast for code.

- **Primary Gold-Orange (#F08506):** Used for interactive actions, primary buttons, and highlighting "solved" states or active navigation items.
- **Secondary Copper-Tan (#A06B3E):** Retained as a semantic color for alerts, meta-information, or supporting UI accents to provide professional warmth.
- **Tertiary Electric Azure (#00ABFD):** A high-visibility accent used for links and features requiring distinct visual separation.
- **Neutral Tiering:** Backgrounds use a deep, desaturated obsidian-brown, while cards and elevated containers use tonal variations to create subtle depth.

## Typography

Typography is the core of this developer-centric experience. We use **JetBrains Mono** for headlines and labels to emphasize the technical nature of the content. **Inter** is utilized for body text to ensure maximum legibility for long-form explanations and discussions.

- **Headlines:** Always monospaced. Use tight line-heights and slight negative letter-spacing for large titles to create a "locked-in" feel.
- **Body Text:** Standardized on Inter for a neutral, humanist touch that balances the rigidity of the monospaced elements.
- **Data/Meta:** Tags, timestamps, and counts always use JetBrains Mono in uppercase or small-caps for a "system-log" aesthetic.

## Layout & Spacing

The design system uses a **Fixed Grid** model for desktop to ensure code blocks remain readable and don't stretch excessively wide.

- **Grid:** 12-column layout with a 24px gutter.
- **Rhythm:** A 4px baseline grid ensures consistent vertical rhythm.
- **Breakpoints:**
- - **Desktop (1024px+):** 3-column layout (Sidebar | Main Content | Secondary Info).
- - **Tablet (768px-1023px):** 2-column layout (Sidebar hidden in a drawer).
- - **Mobile (<768px):** Single column with reduced page margins (16px).

## Elevation & Depth

Depth is achieved through **Tonal Layers** rather than shadows.

- **Level 0 (Base):** Primary page background.
- **Level 1 (Surface):** Cards, code blocks, and sidebars using elevated surface layers.
- **Level 2 (Active/Hover):** Brighter container states to indicate interactivity.

A **Low-contrast Outline** approach is used for interactive elements. Buttons and inputs feature a subtle border that transitions to the **Primary Gold-Orange** on focus or hover. No drop shadows are used, maintaining a flat, performant look.

## Shapes

The design system uses **Soft (0.25rem)** roundedness to maintain a professional, engineered feel.

- **Standard Elements:** Buttons, inputs, and tags use `0.25rem` (4px).
- **Containers:** Large cards and code blocks use `0.5rem` (8px).
- **Interactive States:** Active indicators or selection markers are sharp vertical bars (0px) to signify a "cursor" or "active line" in an IDE.

## Components

- **Buttons:** Primary buttons are solid `#F08506` with high-contrast text. Secondary buttons are outlined or use the copper-tan secondary accent. No gradients.
- **Code Blocks:** Styled with a dark tinted background, syntax highlighting should favor the new "Industrial" aesthetic (gold-oranges, electric azures, and soft earthy tones).
- **Tags/Chips:** Small, monospaced text with a subtle background. On hover, the text shifts to Tertiary Electric Azure.
- **Input Fields:** Dark tinted backgrounds with a 1px border. Focus state is a sharp Primary Gold-Orange glow.
- **Question Cards:** High-contrast headlines in JetBrains Mono. Voting metrics are stacked vertically to the left, using secondary copper or tertiary azure for high-urgency or "unanswered" states.
- **Navigation:** Vertical sidebar navigation with active states indicated by a solid Primary Gold-Orange left-border "accent" and high-intensity white text.

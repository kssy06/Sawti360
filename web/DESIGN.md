---
name: SAWTI 360
description: Derja-to-French AI dubbing wrapped in consent, licensing and a verifiable Passeport 360°.
colors:
  ember-orange: "#ff4500"
  ember-orange-hover: "#ff6224"
  ember-orange-ink: "#ff7340"
  ember-orange-tint: "#26120a"
  night: "#0a0a0a"
  night-deep: "#070707"
  surface: "#111111"
  surface-raised: "#1c1c1c"
  canvas-raised: "#1a1a1a"
  paper-ink: "#f4f4f5"
  ink-secondary: "#c7c7cc"
  ink-muted: "#8f8f97"
  ink-faint: "#5f5f66"
  on-accent: "#0a0a0a"
  machine-line: "#6a6a72"
  machine-ink: "#b4b4bc"
  rule: "#232323"
  rule-soft: "#1a1a1a"
  rule-strong: "#333336"
  authorized-green: "#3fcf8e"
  authorized-tint: "#0d2219"
  pending-amber: "#f0a63c"
  pending-tint: "#2a1e0a"
  blocked-rose: "#ff3d5e"
  blocked-ink: "#ff7389"
  blocked-tint: "#2b0d14"
  info-sky: "#7cb3ff"
  info-tint: "#0e1726"
  stage: "#000000"
typography:
  display:
    fontFamily: "IBM Plex Sans, IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  headline:
    fontFamily: "IBM Plex Sans, IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.026em"
  title:
    fontFamily: "IBM Plex Sans, IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
  derja:
    fontFamily: "IBM Plex Sans Arabic, IBM Plex Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.7
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.ember-orange}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.ember-orange-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "34px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "34px"
  button-danger-solid:
    backgroundColor: "{colors.blocked-rose}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    height: "34px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.sm}"
    padding: "0 11px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "18px"
  nav-item:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "32px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper-ink}"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.sm}"
    height: "28px"
  callout-blocked:
    backgroundColor: "{colors.blocked-tint}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
---

# Design System: SAWTI 360

## Overview

**Creative North Star: "The Notarized Studio"**

SAWTI 360 is a production tool in which every decision is witnessed. The interface reads like a lit studio at night, matched to the public home page: hairline rules instead of shadows, numerals and identifiers set as facts, and the Passeport 360° seal as the one emblem. It is an Operate surface, so its craft shows as precision and restraint. Controls are the ones a category-fluent user already knows, drawn with care.

The system shows the product's thesis in its line work. Anything a machine proposes is drawn with a neutral dashed hairline. Anything a person has decided is drawn solid, in paper ink, with a check. Colour is never decorative: Ember Orange marks what you can act on or have selected, and green, amber, rose and sky carry authorization and information states. Density is moderate (a 14px body on a 4px spacing grid), and the layout is left-aligned on a firm grid.

The surface is Swiss in structure and dark in material: a near-black page, #111 surfaces, a deeper sidebar, one family (IBM Plex Sans, paired with IBM Plex Sans Arabic so derja sits in the same voice), and Plex Mono only for data that is measured or verified.

**Key Characteristics:**
- Paper ink on night surfaces; hairlines carry structure, shadows only lift overlays.
- Dashed neutral line = AI proposal; solid paper-ink line = human decision.
- One action colour, Ember Orange; status colours only for authorization and information states.
- One type family with an Arabic companion; monospace only for timecodes, hashes and identifiers.
- Every piece of data says what it is: Réel, Simulé, Exemple or Prévu.

## Colors

A night palette matched to the public home page: near-black page, #111 surfaces, paper-white text, one ember orange for action, and status hues re-tuned to read on dark.

### Primary
- **Ember Orange** (ember-orange): primary buttons (with near-black text, which keeps 5.7:1 contrast), links, focus rings, selected choices, completed stepper circles and connectors, progress fills, the text caret and the brand mark. Hover lightens to the hover step; accent text uses the ink step; the tint backs pressed rows and approved timeline segments.

### Neutral
- **Night / Night deep** (night, night-deep): the page behind content; the sidebar, empty states and plain callouts sit one step deeper.
- **Surface / Surface raised** (surface, surface-raised, canvas-raised): cards, inputs, dialogs; the selected segment, active nav item and toasts; hover fills and segmented tracks.
- **Paper ink → faint** (paper-ink, ink-secondary, ink-muted, ink-faint): headings and body, supporting copy, metadata and hints, placeholders and inactive numerals. Muted is the floor for readable text.
- **Machine line / Machine ink** (machine-line, machine-ink): the dashed border and label of anything the AI proposed.
- **Rules** (rule, rule-soft, rule-strong): borders, row dividers, control borders.
- **Stage** (stage): pure black behind video.

### Status
- **Authorized green** (authorized-green + tint): consent given, dossier validated, licence granted, signature verified.
- **Pending amber** (pending-amber + tint): to complete, awaiting payment, timing too long, verification needed.
- **Blocked rose** (blocked-rose, blocked-ink + tint): refused, revoked, expired, inconsistency, invalid passport, destructive actions. A rose red, deliberately apart from the orange accent.
- **Info sky** (info-sky + tint): informational callouts and « in progress / sent » states, so that orange never reads as a status.

### Named Rules
**The One Meaning Rule.** Ember Orange means "you can act on this, or you selected it". It never marks an AI proposal, an informational state, a decoration or an inactive state.

**The Machine Is Grey Rule.** AI proposals are neutral and dashed. They become solid paper ink only once a person confirms them.

**The Rose Is Not Orange Rule.** Errors and blocks use the rose red, never a red-orange that could be mistaken for the accent.

## Typography

**Body Font:** IBM Plex Sans (with IBM Plex Sans Arabic, then system-ui)
**Derja:** IBM Plex Sans Arabic, right to left, with more generous leading (1.7)
**Data Font:** IBM Plex Mono

**Character:** A neutral grotesque with an engineered, slightly humanist voice. Its Arabic companion keeps the derja and the French in the same register.

### Hierarchy
- **Display** (400, 40px, line height 1, -0.035em, tabular figures): counts on stat strips and the generation percentage. Numerals are set as composition, light and large.
- **Headline** (600, 30px, 1.15, -0.026em): one page title per page.
- **Section** (600, 16–19px): section and dialog headings.
- **Title** (600, 15px, -0.01em): card and panel headings.
- **Body** (400, 14px, 1.5): interface copy; page intros run at 15px with a 68ch maximum width.
- **Label** (500, 12–13px): field labels, status words, column headers, step names; hints are 12.5px in ink-muted.
- **Data** (Plex Mono, about 12px): timecodes, SHA-256 hashes, signatures, licence and passport identifiers.

### Named Rules
**The Mono Is Evidence Rule.** Monospace is reserved for values that are measured or verified. Never use it as a "technical" costume on labels, step numbers, initials or the brand.

**The Heading Speaks Alone Rule.** No eyebrow, kicker or label above a heading. Context goes in the breadcrumb or in the line under the title.

## Layout

The app shell is a 248px sidebar on the canvas, then a sticky 56px top bar holding the breadcrumb and notifications, then content capped at 1240px (1480px for the timeline editor) with 32px gutters. Spacing follows a 4px grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Groups sit 8–12px apart, sections 32–40px apart, and there is more space above a heading than below it.

Page structure: title + intro + actions, then the content. Inside a project, a ruled stepper (1px ink top rule, numbered steps with the current one marked by a filled orange circle and a glow that glides between steps) precedes each step's content. Common layouts are a two-column main area with a 340px sticky aside, a 1.65 : 1 dashboard split, and Swiss record layouts (a 188px label column next to the content) for the passport.

Responsive behavior is structural: below 1180px asides stack under the main column; below 1024px the sidebar becomes a drawer and the auth aside hides; below 720px grids collapse to one column, breadcrumbs keep only the current page, and gutters drop to 16px. The timeline stays usable on mobile but is designed for desktop.

**The Hairline Grid Rule.** Structure comes from 1px rules and alignment, not from boxes. Use proximity and a rule before adding a container.

## Elevation & Depth

Flat by default. Surfaces are separated by tone (paper on canvas) and hairlines. Shadows appear only where something floats above the page or needs a touch of lift to read as pressable.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px rgba(11,11,12,0.05)`): secondary buttons, the active nav item, the selected segment.
- **Popover** (`box-shadow: 0 10px 28px rgba(11,11,12,0.12), 0 1px 3px rgba(11,11,12,0.08)`): menus, notifications, toasts.
- **Dialog** (`box-shadow: 0 24px 64px rgba(11,11,12,0.22), 0 2px 8px rgba(11,11,12,0.08)`): modal dialogs over a 36% ink scrim; side sheets use a soft left shadow.

**The Flat-At-Rest Rule.** Nothing on the page casts a shadow except controls that need lift and layers that float.

## Shapes

Crisp, barely softened corners: 3px for tags and small marks, 4px for buttons and inputs, 6px for cards, callouts and tiles, 8px for dialogs. Borders are always 1px, except the 1.5px voice mark. Radio dots and the play button are the only circles. Voice marks are squares with initials. Status is a 7px square before a word, never a pill.

**The Square Status Rule.** States are a small square and a word. No rounded pills, no tinted badges.

## Components

### Buttons
Exact and quiet: familiar shapes, firm press feedback, nothing ornamental.
- **Shape:** gently squared (4px), 34px high (28px small, 42px large), 13px medium label, 16px icon.
- **Primary:** Ember Orange with white text; hover deepens to the deep blue step. Use one primary per view.
- **Secondary:** white with a strong rule border and lift; hover darkens the border.
- **Ghost:** no fill, ink-secondary text; hover fills canvas-deep.
- **Danger:** outline (blocked-ink on a blocked tint at hover) or solid red for the final destructive confirmation.
- **States:** a 2px orange focus ring offset by 2px; press translates by 0.5px and scales to 0.99; disabled at 45% opacity.

### Inputs / Fields
- **Style:** white, 1px rule-strong border, 4px radius, 36px high; placeholder in ink-faint.
- **Focus:** the border turns blue with a 3px orange tint ring. **Error:** the border turns red.
- **Choice tiles:** radio or checkbox options as 6px tiles with a 1px rule; selected adds a 1px orange inset ring and a filled orange dot, with no tinted fill.

### Cards / Containers
- **Corner Style:** 6px. **Background:** paper. **Border:** 1px rule. **Shadow:** none.
- **Header:** 52px minimum, 15px semibold title, with a rule below. Body padding is 18px.
- Never nest a card in a card. Inside a card, separate groups with rules or spacing.

### Navigation
- **Sidebar:** canvas background; 32px items with 13px medium labels and 16px icons; hover fills canvas-deep; active is a white pill with lift in semibold ink. Section labels are 11px ink-muted. Counts are tabular and quiet.
- **Workspace switch and segmented controls:** a canvas-deep track with a white selected segment and lift.
- **Tabs:** text tabs with a 2px ink underline on the active tab.
- **Mobile:** the sidebar becomes a left drawer over a scrim; Escape closes it.

### Proposal and Decision (signature component)
An AI proposal sits in a container with a 1px dashed machine-line border, labelled « Proposé par l’IA » in machine ink on the top edge. Once a person confirms it, the border turns solid notary ink and the label becomes « Confirmé par … » with a check. The same grammar runs through voice marks (dashed = AI-generated voice, solid = licensed person, double = original speaker), the provenance tags and timeline segments (dashed = proposed, tint = approved, solid blue = dubbed, red = refused).

### Passeport 360° seal (signature component)
Concentric circles, an eight-pointed star drawn from two squares, and the verification state around the ring in spaced capitals. The centre mark (check, cross or dot) carries the state, never colour alone. Ink by default; blocked ink when invalid.

### Motto sequence (login)
The motto is told in the product's grammar, in a slow loop of about 12 seconds. Words rise out of a blur one after another (85ms apart). « L’IA propose. » appears in machine ink while its dashed rule draws in. « L’humain décide. » then reveals itself while the rule under the first line closes in solid ink, the first line turns to ink and a check draws. « La confiance accompagne chaque export. » ends with the seal stamping in (a 560ms press with a slight 0.97 dip and a final -6° tilt, followed by a single ink ring). The three principles below follow along: the active one is in ink with a 2px orange progress rule. The loop pauses on hover, focus and hidden tabs, collapses to the motto lines above the form on small screens, and shows the settled state under reduced motion.

### Verification playback (Passeport 360°)
The verification is computed for real, then played back in about 2.3 seconds. The seal starts in its pending state (dashed inner ring, centre dot). Each check shows a spinner and resolves in turn every 640ms. The passport identifier, signature and public key resolve character by character from random glyphs of their own alphabet. Once the last check is in, the seal stamps into its final state. Re-signing a passport replays it, and « Vérifier à nouveau » runs it on demand. Under reduced motion the result is immediate. This is the app's one authored moment; routine screens keep motion to 120–260ms state feedback.

### Animated stepper (signature component)
Every task done in steps uses the AnimatedStepper: a #111 card, numbered circles joined by connectors that fill in Ember Orange as steps complete, a soft orange glow that glides to the current step, and step content that slides in from the direction of travel while the card springs to the new height. « Continuer » stays disabled (with a hint) until the step is valid; completed steps can be revisited, future ones cannot. Used for creating a Voice Passport (owner space and public consent page). The project workflow's navigation uses the same indicator language (circles, connectors, gliding glow) as route-level steps.

### Navigation motion and loading
Moving to another screen fades it in from 8px below (340ms). Project steps slide 18px from the side they come from (forward from the right, back from the left), while the project header and stepper stay put. Tab panels fade in over 260ms, and the tab underline slides to the selected tab (320ms). Heavier screens load on demand: a 2px blue progress line runs at the top with a skeleton of the page (or the brand mark breathing on public pages), and both stay invisible for the first 150ms so fast loads never flash. The passport QR shows a shimmer until it is drawn.

### Callouts and provenance tags
- **Callout:** 6px radius, 1px tinted border all round, tinted background, 16px icon. Never a coloured side stripe.
- **Provenance tag:** 18px high, 11px medium text, 3px radius. « Réel » in green outline, « Simulé » in dashed machine line, « Exemple » on canvas-deep, « Prévu » in a dotted outline.

### Video stage
Dark stage, a white caption bar at 8% from the bottom, a small outlined label in the top-left corner (AI label), the passport QR at the end on a white tile, and a red playhead on the timeline.

## Do's and Don'ts

### Do:
- **Do** draw every AI proposal with the dashed machine line and turn it solid ink when a person confirms it.
- **Do** keep Ember Orange for actions, links, focus and selection only, with near-black text on orange fills.
- **Do** label data provenance (Réel, Simulé, Exemple, Prévu) wherever data is shown.
- **Do** use Plex Mono for timecodes, hashes, signatures and identifiers, and tabular figures for counts and money.
- **Do** separate groups with 1px rules and spacing before reaching for a new container.
- **Do** keep status as a 7px square plus a word, with green, amber and red only for authorization meaning.

### Don't:
- **Don't** put a kicker or eyebrow label above a heading.
- **Don't** use a coloured `border-left` or `border-right` stripe on callouts, list items or nav items.
- **Don't** number sections (01 / 02) unless the order itself is information, such as the project steps or a process.
- **Don't** build page structure from same-size icon + title + text tiles.
- **Don't** nest cards, or wrap form controls in more than one bordered layer.
- **Don't** use monospace, gradients, glass or glows as decoration.
- **Don't** colour an AI-generated voice or proposal in the action blue.

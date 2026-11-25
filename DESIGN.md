---
name: Dansk Daily
description: A friendly Danish-practice app for iPhone, dressed in Dannebrog red and white, with one red button per screen and calm grey for mistakes.
colors:
  bg: "#ffffff"
  surface: "#ffffff"
  sunk: "#f4f5f7"
  ink: "#1f2937"
  muted: "#5b6370"
  line: "#e5e7eb"
  dannebrog-red: "#c8102e"
  dannebrog-edge: "#8e0b20"
  dannebrog-soft: "#fde8eb"
  dannebrog-text: "#b00e28"
  on-primary: "#ffffff"
  correct-green: "#16794c"
  correct-edge: "#0f5c39"
  correct-soft: "#e3f4ea"
  correct-text: "#0f5c39"
  almost-amber: "#e3a12f"
  almost-edge: "#b26a00"
  almost-soft: "#fff1d6"
  almost-text: "#b26a00"
  on-almost: "#1f1300"
  wrong-ink: "#1f2937"
  wrong-edge: "#000000"
  wrong-soft: "#eef0f3"
  streak-amber: "#7a4e0c"
  streak-soft: "#fff4db"
  selection: "#f9c9d0"
typography:
  display:
    fontFamily: "ui-rounded, -apple-system, BlinkMacSystemFont, SF Pro Rounded, SF Pro Text, system-ui, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "ui-rounded, -apple-system, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "ui-rounded, -apple-system, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-rounded, -apple-system, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "ui-rounded, -apple-system, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 800
    letterSpacing: "0.04em"
rounded:
  sm: "10px"
  md: "12px"
  speaker: "14px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  7: "28px"
  8: "32px"
  10: "40px"
components:
  button-primary:
    backgroundColor: "{colors.dannebrog-red}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "54px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "54px"
  button-small:
    rounded: "{rounded.md}"
    height: "44px"
  button-correct:
    backgroundColor: "{colors.correct-green}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    height: "54px"
  button-almost:
    backgroundColor: "{colors.almost-amber}"
    textColor: "{colors.on-almost}"
    rounded: "{rounded.lg}"
    height: "54px"
  button-wrong:
    backgroundColor: "{colors.wrong-ink}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    height: "54px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
  card-goal:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "16px"
  card-intro:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "28px 22px"
  field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    height: "64px"
    padding: "14px 16px"
  choice:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "54px"
  tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "10px 14px"
  key:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "48px"
  speaker:
    backgroundColor: "{colors.dannebrog-red}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.speaker}"
    size: "48px"
  chip:
    backgroundColor: "{colors.sunk}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  sheet-correct:
    backgroundColor: "{colors.correct-soft}"
    textColor: "{colors.correct-text}"
    rounded: "{rounded.2xl}"
  sheet-almost:
    backgroundColor: "{colors.almost-soft}"
    textColor: "{colors.almost-text}"
    rounded: "{rounded.2xl}"
  sheet-wrong:
    backgroundColor: "{colors.wrong-soft}"
    textColor: "{colors.wrong-ink}"
    rounded: "{rounded.2xl}"
  tab-bar:
    backgroundColor: "{colors.bg}"
    height: "86px"
---

# Design System: Dansk Daily

Recorded from the shipped build (`src/styles/tokens.css`, `base.css`, `app.css`, `exercise.css`, `session.css`). Every color, size and radius below is a CSS custom property in `src/styles/tokens.css`. That file is the source of truth; the frontmatter mirrors its light values.

## Overview

**Creative North Star: "The Friendly Flag"**

Dansk Daily is the familiar language-app pattern (goal ring, streak, chunky buttons, answer sheet) built at Duolingo and Apple Fitness polish and dressed in Dannebrog red on white. Convention is the commitment: the learner opens the app, sees where they stand, and starts in one tap. One learner, one iPhone, 15 to 20 minutes a day.

The system is flat and bordered. Cards are white with 2px light-grey outlines, controls carry a solid darker "pressed edge" underneath, and depth never comes from blur. Red is the brand and the one primary action. Everything about being wrong is grey, so a mistake never looks like a button the learner should press. Type is the iOS system rounded face, with tabular figures everywhere.

**Key Characteristics:**
- White ground, near-black ink, one saturated red used for action and progress.
- Feedback has three voices: green (right), amber (almost, slipped), grey (wrong). Never red for wrong.
- Chunky 54px buttons with a pressed edge that drops on tap.
- 20px screen gutter, 16px card radius, 2px borders.
- Light and dark, following the system, with the same red in both.
- Single column capped at 480px; bottom-anchored actions and a three-tab bar.

## Colors

A white, near-neutral ground with one red, one green and one amber. Dark mode swaps the neutrals and lifts the text tones; the red stays.

### Primary
- **Dannebrog Red** (`--color-primary`, #c8102e): primary buttons, speaker buttons, progress bars and rings, switches, current-unit outline, caret. Pressed edge is **Dannebrog Edge** (#8e0b20). **Dannebrog Soft** (#fde8eb) tints the summary ring track. **Dannebrog Text** (#b00e28) is the red used as text on the ground: app name, links, active tab, back button, unit "done" label. Red is never a fill for an error.

### Secondary
- **Correct Green** (#16794c, edge #0f5c39, soft #e3f4ea, text #0f5c39): right answers only. The correct feedback sheet, the correct button, a right choice's border.
- **Almost Amber** (#e3a12f, edge #b26a00, soft #fff1d6, heading text #b26a00, label ink #1f1300): the "almost" sheet and its button, and the small dot after a unit title when words have slipped. The amber heading text is for large text only.

### Tertiary
- **Streak Amber** (#7a4e0c on #fff4db): the streak pill and the summary streak number. A zero streak drops to muted ink and is not celebrated.

### Neutral
- **Ground** (#ffffff) and **Surface** (#ffffff) in light; **Sunk** (#f4f5f7) for tracks, chips, tips, disabled buttons and the nudge.
- **Ink** (#1f2937) body and headings; **Muted** (#5b6370) secondary lines and meta.
- **Line** (#e5e7eb): the 2px card border, dividers, ghost button edge.
- **Wrong** is calm grey: panel **#eef0f3**, ink button #1f2937 with edge #000000, text #1f2937. Used for the wrong sheet, a wrong choice, banners and the destructive settings row.
- **Selection** (#f9c9d0) and focus ring (#b00e28, 3px, 2px offset).

### Dark values
Dark mode lives under `prefers-color-scheme: dark` and `:root[data-theme="dark"]` in the same file. Ground #0f1115, surface #171a21, sunk #1e222b, ink #f2f4f7, muted #a3aab8, line #2a2f3a. Red stays #c8102e; edge #7a0a1b; soft #3a1219; red text and focus #ff9aa7. Correct #1e7f52 (edge #145a39, soft #163527, text #7fdcab). Almost #b8861f (edge #7a5810, soft #3a2c12, text #f0b44c). Wrong inverts to light grey: button #e8eaee, edge #9aa1ae, soft #232832, label #111318. Streak #ffcb6b on #3a2c12.

### Named Rules
**The One Red Rule.** Exactly one red primary action per screen. Red marks brand, the primary action and progress; it never marks a wrong answer.
**The Grey Mistake Rule.** A wrong answer is grey panel plus dark-ink button. Amber is only "almost" and "slipped". Green is only "right".
**The Token Rule.** Components use `var(--...)` tokens only. No raw hex in any stylesheet or component outside `tokens.css`.

## Typography

**Display, Headline, Body, Label:** the iOS system rounded face (`ui-rounded`, then `-apple-system`, SF Pro Rounded, `system-ui`, Segoe UI, Roboto), one family throughout. The platform faces all carry æ, ø and å.

**Character:** round, friendly and heavy. Headings are weight 800 with slightly negative tracking; body is regular at 1.45 leading. Every number is tabular: `font-variant-numeric: tabular-nums` is set on `html, body` and again as `--font-numeric` on counters.

### Hierarchy
- **Display** (800, 40px, 1.2, -0.02em): the new word on the intro card and the Welcome "Hej".
- **Headline** (800, 28px, 1.2, -0.01em): screen titles, Welcome and Settings headings, summary title.
- **Stat** (800, 26px): summary numbers.
- **Title** (800, 20 to 22px, 1.2): the exercise question (22px), feedback heading (22px), app name and section heads (20px), the answer field (20px).
- **Lead** (18px): prompts, answer bubbles, goal line, tiles.
- **Body** (400 or 700, 16px, 1.45): body copy, list titles, choices.
- **Callout / Caption / Meta** (15 / 14 / 13px): tips, secondary lines, small buttons, meta.
- **Tab label** (700, 12px).
- **Button label** (800, 17px, +0.04em, uppercase): primary and ghost buttons only. Small buttons step down to 14px.

### Named Rules
**The Tabular Rule.** Every counter, time, score and percentage uses tabular figures.
**The No-Eyebrow Rule.** Titles are sentence case with no small uppercase label above them. The screen's task title is the `h1`; phase and context ride in the progress bar's name or as a muted sentence-case line.

## Layout

A single phone column: `.screen` is capped at 480px and centered, with a 20px gutter (`--gutter`). Spacing runs on a 4px base (4, 8, 12, 16, 20, 24, 28, 32, 40) with a few 2px-grid values (10, 14, 18, 22) carried over from the approved comp. Safe-area insets are padded once, at `#app`.

Actions anchor to the bottom: the new-word screen, Repeat after me, Summary, Keep going and the placement result push their buttons to the foot of a full-height flex column. The exceptions are typed answers, where CHECK stays in the flow directly under the field and Danish keys so it sits above the keyboard, and word-tile exercises, which fix CHECK at the foot (no keyboard). The feedback sheet is fixed to the bottom, and an answered exercise reserves 320px of scroll room above it.

Home reads top to bottom: header (flag and app name left, streak pill right), goal card, one full-width red button with a muted caption under it, a "Units" section of cards. A fixed 86px tab bar (Learn / Units / Settings) sits at the bottom, capped to the same 480px column. Every control has a tap target of at least `--tap-min` (44px); smaller drawn shapes (the 32px stepper boxes, the close icon) sit inside a 44px hit area.

### Named Rules
**The Foot Rule.** Primary actions are bottom-anchored, except that a typed answer's CHECK stays in flow above the keyboard.
**The 44 Rule.** No tappable element is smaller than `--tap-min`.

## Elevation & Depth

Flat and bordered, with no blurred shadows. Depth is a solid **pressed edge**: a zero-blur offset shadow in a darker tone of the control's own color, 4px under 54px buttons and 3px under small buttons, tiles, keys, choices and speaker buttons. On `:active` the control moves down by the edge height and the edge collapses to nothing, so it reads as a physical key being pressed (90ms, ease-out). Cards and groups have no shadow at all, only the 2px line. The only layered surface is the feedback or report sheet, which slides up (280ms) with rounded top corners; the report sheet sits over a 40% ink scrim.

### Named Rules
**The Pressed Edge Rule.** The solid offset edge belongs to pressable controls only (buttons, choices, tiles, keys, speakers). Cards, groups, sheets and bars stay flat.

## Shapes

Rounded and friendly. Radius steps: 10px (chips), 12px (tiles, keys, small buttons), 14px (speaker buttons), 16px (buttons, cards, fields, groups, nudges), 20px (goal card, big speaker), 24px (intro card, top corners of sheets), pill (streak pill, toast, progress bars). Borders are 2px in `--color-line`; the current unit and a selected choice switch the border to red. Progress is a pill track (10 to 14px) with a red fill and, on unit bars, a 2px ink tick at the 80% mastery line. The goal and summary rings are round-capped strokes. Icons are inline stroked SVG (2.2 to 2.4 stroke, round caps).

## Components

### Buttons
- **Shape:** 16px radius, 54px tall, full width; small variant 44px, 12px radius, auto width.
- **Primary:** Dannebrog Red with white label, edge #8e0b20. The label is uppercase 17px/800 with +0.04em tracking. Home reads "Start today's session" until something is answered today, then "Continue".
- **Ghost:** white, 2px line border, ink label, line-colored edge.
- **Feedback buttons:** green, amber (dark label) or wrong-ink, matching the sheet they sit in.
- **Disabled:** sunk background, muted label, line-colored edge.
- **Focus:** 3px red-tinted outline with 2px offset (`:focus-visible`).

### Cards / Containers
White surface, 2px line border, 16px radius (goal card 20px, intro card 24px), padding 14 to 16px. The current unit card gets a red border. Nudges and tips are sunk-grey with no border. Settings uses grouped lists: a bordered 16px group with 52px rows divided by 2px lines.

### Inputs / Fields
64px tall, 16px radius, 2px line border, 20px text, red caret; focus turns the border red with no outline. Under it, a row of 48px Danish keys (æ ø å) with the pressed edge. Switches are 51 by 31px, sunk when off and red when on. The stepper is two 44px tap targets with a 32px drawn box.

### Choices and word tiles
Choices are 54px, 2px border, bold centered text; selected is red-bordered, right is green, wrong is grey-soft with a dark edge border. Word tiles are 44px, 12px radius, with a used state that fades to a sunk, shadowless placeholder.

### Feedback sheet (signature)
Slides up from the foot with a 24px top radius in the soft tone of its verdict: green "correct", amber "almost", grey "wrong". Heading in the verdict's text tone, correct answer in bold lead size, an optional note beneath, and a full-width button in the verdict color. The wrong sheet shows the correct answer and the item's note; nothing on it is red.

### Goal ring (signature)
72px ring, 10px red stroke on a sunk track, minutes of 15 at the center. It starts drawing at 1 minute so 0m shows no dot. The summary version is 140px with a soft red track and closes with a check at the goal.

### Navigation
Bottom tab bar, 86px, 2px top border, three tabs (icon over a 12px bold label). Active tab uses Dannebrog Text; inactive uses muted. Inner screens use a text back button in red text and a 44px close icon in the exercise progress row.

## Do's and Don'ts

### Do:
- **Do** use only `var(--...)` tokens from `src/styles/tokens.css`; add a token before using a new value.
- **Do** show wrong answers as the grey panel with the dark-ink button; use amber for "almost" and for slipped words.
- **Do** keep one red primary button per screen.
- **Do** keep every tap target at or above `--tap-min` (44px).
- **Do** set numbers in tabular figures.
- **Do** keep the system working in light and dark; check both before shipping a screen.
- **Do** anchor actions at the bottom, except a typed answer's CHECK, which stays in flow above the keyboard.
- **Do** write titles in sentence case with the task as the `h1`.
- **Do** label Home's button "Start today's session" until something is answered today, then "Continue".

### Don't:
- **Don't** use red for wrong answers, error states or destructive rows.
- **Don't** put a second red filled button on a screen.
- **Don't** add raw hex values, one-off radii or shadows in components.
- **Don't** add uppercase eyebrow or kicker labels above titles.
- **Don't** use blurred drop shadows; depth is the solid pressed edge on pressable controls, or nothing.
- **Don't** use glyph or emoji icons; icons are inline stroked SVG.
- **Don't** shrink a control's hit area below 44px to match a smaller drawn shape.

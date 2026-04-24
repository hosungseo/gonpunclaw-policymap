# PolicyMap UI/UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve landing, upload, and public map usability without changing data contracts or backend behavior.

**Architecture:** Keep the current Next.js App Router routes and React component boundaries. Apply focused Tailwind markup changes in existing files, adding small client-side helpers only where needed for UI state and reset controls.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, MapLibre GL.

---

## File Structure

- Modify `src/app/page.tsx`: landing page hierarchy, CTA layout, workflow summary, and non-nested section structure.
- Modify `src/app/upload/page.tsx`: page shell, explanatory workflow strip, and layout width.
- Modify `src/app/upload/UploadForm.tsx`: file picker, optional field grouping, upload/success/error states, action buttons.
- Modify `src/app/m/[slug]/MapClient.tsx`: public map header, sidebar, mobile controls, table empty states, reset affordances.
- Modify `src/components/map/Filters.tsx`: category all/clear controls, value reset, clearer labels.
- Modify `src/components/map/Legend.tsx`: compact visual legend styling.
- Modify `src/app/globals.css`: font stack, focus-visible, map popup polish.

## Tasks

### Task 1: Shared Visual Foundation

**Files:**
- Modify: `src/app/globals.css`

- [ ] Add a system UI font stack, smoother text rendering, accessible focus rings, and MapLibre popup typography.
- [ ] Run `npm run lint` and fix style/type issues introduced by CSS class usage.

### Task 2: Landing Page Refresh

**Files:**
- Modify: `src/app/page.tsx`

- [ ] Replace the framed hero card with a full-width operational landing layout.
- [ ] Add compact stats/trust notes and workflow sections without nested cards.
- [ ] Keep `/upload`, `/template.xlsx`, and guide links unchanged.
- [ ] Run `npm run lint`.

### Task 3: Upload Flow Refresh

**Files:**
- Modify: `src/app/upload/page.tsx`
- Modify: `src/app/upload/UploadForm.tsx`

- [ ] Widen the page shell enough for a two-column desktop form.
- [ ] Group required map details, optional column labels, and file upload.
- [ ] Make the file chooser a prominent drop-style control with selected filename feedback.
- [ ] Improve uploading, error, and success result states.
- [ ] Run `npm run lint`.

### Task 4: Public Map UX Refresh

**Files:**
- Modify: `src/app/m/[slug]/MapClient.tsx`
- Modify: `src/components/map/Filters.tsx`
- Modify: `src/components/map/Legend.tsx`

- [ ] Improve the map header action hierarchy and copy link feedback.
- [ ] Improve sidebar search result cards, filter grouping, reset behavior, and legend.
- [ ] Make mobile map/table controls and count summary easier to scan.
- [ ] Improve table empty state and row actions.
- [ ] Run `npm run lint`.

### Task 5: Verification

**Files:**
- No source changes expected.

- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start `npm run dev`.
- [ ] Inspect `/` and `/upload` in a browser.
- [ ] If a local public map slug is unavailable, document that `/m/[slug]` was build-verified but not data-inspected.

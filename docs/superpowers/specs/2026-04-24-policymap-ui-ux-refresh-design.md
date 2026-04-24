# PolicyMap UI/UX Refresh Design

## Goal

Improve the product experience without changing upload parsing, geocoding, database schema, or public API behavior. The work should make the app easier to understand at first entry, faster to operate during upload, and more useful when viewing a published map.

## Scope

- Landing page: clarify the value proposition, surface the upload/template actions, and replace nested card-heavy presentation with a cleaner workflow-oriented layout.
- Upload page: improve form hierarchy, file selection feedback, upload progress state, success result actions, and token safety messaging.
- Public map page: improve header actions, search/filter layout, category controls, map/table switching, empty states, and mobile ergonomics.
- Shared polish: consistent spacing, stronger focus/hover states, readable Korean UI copy, and accessible labels.

## Out of Scope

- Geocoding provider behavior.
- Supabase schema or migrations.
- Upload file parsing rules.
- Staff dashboard redesign.
- New authentication or ownership features.
- New map tile provider.

## Recommended Approach

Use a focused UI refresh in existing React/Tailwind components. Keep the current route structure and component boundaries:

- `src/app/page.tsx` for the landing page.
- `src/app/upload/page.tsx` and `src/app/upload/UploadForm.tsx` for upload flow.
- `src/app/m/[slug]/MapClient.tsx`, `src/components/map/Filters.tsx`, and `src/components/map/Legend.tsx` for public map usage.
- `src/app/globals.css` for small global rendering improvements only.

This gives the largest UX improvement with the lowest risk because it avoids server logic and data contracts.

## UX Decisions

### Landing Page

The landing page should present the product as a working tool, not a marketing page. The first viewport should show:

- Product name and concrete promise.
- Primary upload action.
- Template download as a secondary action.
- A compact preview of the publish workflow.
- Practical trust notes: geocoder fallback, share/manage links, filters/table view.

Avoid nested cards inside a framed hero. Use full-width sections with constrained content, concise feature rows, and clear calls to action.

### Upload Flow

The upload form should feel like a short workflow:

- Required fields first.
- Optional metadata grouped separately.
- File picker displayed as a prominent drop-style control.
- Uploading state should say that geocoding can take a moment.
- Success screen should prioritize three actions: open public map, open manage page, copy token.
- Token warning should be visually distinct but not alarming.

### Public Map

The public map is the core product surface. It should support quick scanning:

- Header shows title, description, visible marker count, copy link, and map/table switch.
- Sidebar groups search, filters, legend, and report action with clearer separation.
- Search results should be compact but actionable.
- Category filters should have all/clear controls.
- Value range should expose reset behavior.
- Mobile users should get a compact toolbar and usable scroll area without hiding the map behind controls.

## Error, Empty, and Edge States

- Empty search/filter results should show a clear message and reset affordance.
- Upload errors remain inline near the submit action.
- Copy actions should provide temporary success labels.
- Buttons and inputs should retain accessible focus rings.

## Testing

- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Start the dev server and inspect `/`, `/upload`, and a public map route if sample data is available.

If no live local Supabase data exists for a map route, verify the changed components through build/lint and inspect the static routes that do not require data.

const body = `# GonpunClaw PolicyMap

> Upload an Excel file with addresses and publish a shareable policy map.

## What this site does
- Converts address rows into coordinates with a geocoder fallback chain.
- Publishes a public map and a one-time admin link.
- Supports search, category filters, numeric range filters, and table view.
- Lets staff review reports and audit logs.

## Primary entry points
- Home: https://gonpunclaw-policymap.vercel.app/
- Upload: https://gonpunclaw-policymap.vercel.app/upload
- User guide: https://github.com/hosungseo/gonpunclaw-policymap/blob/main/docs/USER-GUIDE-KO.md
- Source repository: https://github.com/hosungseo/gonpunclaw-policymap

## Notes for agents
- Prefer the upload guide before attempting to infer spreadsheet columns.
- Public maps live under /m/[slug].
- Management routes under /manage and staff routes under /staff are not public discovery targets.
- API routes are server-side implementation details, not public agent APIs.
`;

export async function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

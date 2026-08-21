export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_BODY = {
  ok: true,
  kind: "google-session-app-router-probe",
};

function createProbeResponse() {
  return Response.json(PROBE_BODY, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function GET() {
  return createProbeResponse();
}

export function POST() {
  return createProbeResponse();
}

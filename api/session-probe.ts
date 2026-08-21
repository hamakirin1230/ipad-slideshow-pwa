import type { IncomingMessage, ServerResponse } from "node:http";

const NO_STORE = "no-store";
const PROBE_BODY = JSON.stringify({
  ok: true,
  kind: "google-session-hosting-probe",
});

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("Cache-Control", NO_STORE);
    response.end();
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", NO_STORE);
  response.end(PROBE_BODY);
}

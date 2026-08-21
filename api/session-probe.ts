const NO_STORE = "no-store";

const sessionProbe = {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return new Response(null, {
        status: 405,
        headers: {
          "Cache-Control": NO_STORE,
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        kind: "google-session-hosting-probe",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": NO_STORE,
        },
      },
    );
  },
};

export default sessionProbe;

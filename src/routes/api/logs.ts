import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        try {
          const { getErrorLogs } = await import("@/lib/bugfinder-db.server");
          const logs = await getErrorLogs(
            url.searchParams.get("userId") ?? "",
            url.searchParams.get("q") ?? "",
            url.searchParams.get("type") ?? "all",
          );
          return Response.json({ success: true, count: logs.length, logs });
        } catch (err) {
          console.error("[api/logs]", err);
          return Response.json({ error: "Failed to retrieve error logs." }, { status: 500 });
        }
      },
    },
  },
});

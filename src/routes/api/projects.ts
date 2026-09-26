import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        try {
          const { getDebugSessions } = await import("@/lib/bugfinder-db.server");
          const projects = await getDebugSessions(
            url.searchParams.get("userId") ?? "",
            Number(url.searchParams.get("limit") ?? 50),
          );
          return Response.json({ success: true, count: projects.length, projects });
        } catch (err) {
          console.error("[api/projects]", err);
          return Response.json({ error: "Failed to retrieve past projects." }, { status: 500 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/projects/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { getDebugSessionById } = await import("@/lib/bugfinder-db.server");
          const project = await getDebugSessionById(params.id);
          if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
          return Response.json({ success: true, project });
        } catch (err) {
          console.error("[api/projects/:id]", err);
          return Response.json({ error: "Failed to retrieve project details." }, { status: 500 });
        }
      },
      DELETE: async ({ params }) => {
        try {
          const { deleteDebugSession } = await import("@/lib/bugfinder-db.server");
          await deleteDebugSession(params.id);
          return Response.json({ success: true, message: "Project removed." });
        } catch (err) {
          console.error("[api/projects/:id delete]", err);
          return Response.json({ error: "Failed to delete project." }, { status: 500 });
        }
      },
    },
  },
});

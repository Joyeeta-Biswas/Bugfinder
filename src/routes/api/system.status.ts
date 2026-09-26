import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/system/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        try {
          const { getStats } = await import("@/lib/bugfinder-db.server");
          const stats = await getStats(url.searchParams.get("userId") ?? "");

          const model = process.env["OPENAI_MODEL"] ?? "gpt-4o";
          const baseUrl = process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
          const hasKey = !!process.env["OPENAI_API_KEY"];

          return Response.json({
            success: true,
            database: {
              type: "postgresql",
              connected: true,
              message: "Connected to the managed PostgreSQL database.",
              host: "supabase (managed)",
              database: "bugfinder",
            },
            agent: {
              model,
              baseUrl,
              hasApiKey: hasKey,
              provider: "OpenAI-compatible endpoint (key managed server-side)",
            },
            stats,
          });
        } catch (err) {
          console.error("[api/system/status]", err);
          return Response.json({ error: "Failed to read diagnostics." }, { status: 500 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/config")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["SUPABASE_URL"] ?? "";
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        return Response.json({ url, key });
      },
    },
  },
});

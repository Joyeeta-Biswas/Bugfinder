import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const email = String(body["email"] ?? "").trim();
          if (!email) return Response.json({ error: "Email is required." }, { status: 400 });

          const user = {
            id: email.replace(/[^a-zA-Z0-9_-]/g, "_"),
            email,
            name: String(body["name"] ?? "") || email.split("@")[0] || email,
            avatar:
              String(body["avatar"] ?? "") ||
              `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
          };

          const { saveUser } = await import("@/lib/bugfinder-db.server");
          const saved = await saveUser(user);
          return Response.json({ success: true, user: saved });
        } catch (err) {
          console.error("[api/auth/google]", err);
          return Response.json({ error: "Authentication failed." }, { status: 500 });
        }
      },
    },
  },
});

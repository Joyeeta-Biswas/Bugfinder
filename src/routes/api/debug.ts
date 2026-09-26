import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/debug")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const code = String(body["code"] ?? "");
          if (!code.trim()) return json({ error: "Source code is required for debugging." }, 400);

          const fileName = String(body["fileName"] ?? "main");
          const sampleInput = String(body["sampleInput"] ?? "");
          const sampleOutput = String(body["sampleOutput"] ?? "");
          const scopeMode = String(body["scopeMode"] ?? "entire");
          const lineFrom = body["lineFrom"] ? Number(body["lineFrom"]) : null;
          const lineTo = body["lineTo"] ? Number(body["lineTo"]) : null;
          const userId = String(body["userId"] ?? "default_dev_user");

          const { runDebuggingAgent } = await import("@/lib/agent.server");
          const analysis = await runDebuggingAgent({
            code,
            fileName,
            sampleInput,
            sampleOutput,
            scopeMode,
            lineFrom,
            lineTo,
          });

          const db = await import("@/lib/bugfinder-db.server");
          const session = await db.createDebugSession({
            user_id: userId,
            title: analysis.title,
            language: analysis.language,
            original_code: code,
            sample_input: sampleInput,
            sample_output: sampleOutput,
            scope_mode: scopeMode,
            line_from: lineFrom,
            line_to: lineTo,
            target_file: fileName,
            fixed_code: analysis.fixedCode,
            summary: analysis.summary,
            issue_count: analysis.fixes.length,
            status: "completed",
          });

          if (analysis.fixes.length) {
            await db.saveErrorFixes(analysis.fixes, session.id, userId, fileName);
          }

          return json({
            success: true,
            sessionId: session.id,
            session,
            fixes: analysis.fixes,
            summary: analysis.summary,
            fixedCode: analysis.fixedCode,
            language: analysis.language,
            engine: analysis.engine,
            predictedOutput: analysis.predictedOutput,
            outputMatches: analysis.outputMatches,
            targetFile: fileName,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("[api/debug]", message);
          const status = /429/.test(message) ? 429 : /402|403/.test(message) ? 402 : 500;
          return json(
            {
              error: "Debugging agent could not complete the analysis.",
              message:
                status === 429
                  ? "The AI service is busy right now. Please try again in a moment."
                  : status === 402
                    ? "AI usage is currently unavailable for this workspace."
                    : message,
            },
            status,
          );
        }
      },
    },
  },
});

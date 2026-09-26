import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BugFinder — AI Code Debugger & Error Log" },
      {
        name: "description",
        content:
          "Paste your code with sample input and output. BugFinder traces it, finds the real bugs, returns corrected code with inline fix comments, and stores every fix in a searchable error log.",
      },
      { property: "og:title", content: "BugFinder — AI Code Debugger & Error Log" },
      {
        property: "og:description",
        content:
          "Find and fix code errors automatically, with line-by-line explanations and a searchable history of past fixes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/bugfinder/index.html");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading BugFinder…</p>
    </div>
  );
}

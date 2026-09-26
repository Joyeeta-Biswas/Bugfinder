/**
 * BugFinder analysis engine.
 *
 * Uses an OpenAI-compatible chat-completions endpoint so it works with any
 * provider: IBM watsonx, OpenRouter, a local Ollama instance, etc.
 *
 * Required environment variables:
 *   OPENAI_API_KEY   – your API / bearer key
 *
 * Optional environment variables (sensible defaults shown):
 *   OPENAI_BASE_URL  – base URL of the completions API
 *                      default: "https://api.openai.com/v1"
 *   OPENAI_MODEL     – model ID to use
 *                      default: "gpt-4o"
 *
 * For IBM watsonx.ai set:
 *   OPENAI_BASE_URL=https://us-south.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-31
 *   OPENAI_MODEL=ibm/granite-3-3-8b-instruct   (or any deployed model)
 *   OPENAI_API_KEY=<your IBM Cloud IAM bearer token>
 */

export type Fix = {
  lineNumber: number | null;
  errorType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  originalLine: string;
  fixedLine: string;
  why: string;
};

export type AnalysisResult = {
  title: string;
  language: string;
  summary: string;
  fixedCode: string;
  fixes: Fix[];
  engine: string;
  predictedOutput?: string;
  outputMatches?: boolean | null;
};

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export function detectLanguage(code = "", fileName = ""): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "py") return "python";
  if (["js", "mjs", "cjs"].includes(ext ?? "")) return "javascript";
  if (["ts", "tsx"].includes(ext ?? "")) return "typescript";
  if (["cpp", "cc", "cxx", "hpp", "h"].includes(ext ?? "")) return "cpp";
  if (ext === "c") return "c";
  if (ext === "java") return "java";
  if (ext === "go") return "go";
  if (ext === "rs") return "rust";

  if (/def\s+\w+\(.*\):|^\s*import\s+\w+|print\(|elif\b/m.test(code)) return "python";
  if (/#include\s*<|std::cout|int\s+main\s*\(/.test(code)) return "cpp";
  if (/public\s+class\s+\w+|System\.out\.println/.test(code)) return "java";
  if (/package\s+main|func\s+main\(/.test(code)) return "go";
  if (/function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|console\.log/.test(code)) return "javascript";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Cheap structural pre-scan (hints only – model verifies each one)
// ---------------------------------------------------------------------------

function structuralHints(code: string, lang: string): string[] {
  const hints: string[] = [];
  const pairs: Array<[string, string, string]> = [
    ["{", "}", "curly braces"],
    ["(", ")", "parentheses"],
    ["[", "]", "square brackets"],
  ];
  for (const [open, close, label] of pairs) {
    const o = code.split(open).length - 1;
    const c = code.split(close).length - 1;
    if (o !== c) hints.push(`Unbalanced ${label}: ${o} "${open}" vs ${c} "${close}".`);
  }
  code.split("\n").forEach((line, i) => {
    if (/for\s*\([^;]*;\s*[\w$]+\s*<=\s*[\w$.]+(\.length|\.size\(\))\s*;/.test(line)) {
      hints.push(`Line ${i + 1}: loop uses "<=" against a length/size — possible off-by-one.`);
    }
    if (/\bif\s*\(\s*[\w$.]+\s*=\s*[^=]/.test(line)) {
      hints.push(`Line ${i + 1}: assignment "=" used inside an if condition.`);
    }
    if (/range\s*\(\s*[^)]*len\s*\([^)]*\)\s*\+\s*1\s*\)/.test(line)) {
      hints.push(`Line ${i + 1}: range goes one past len() — possible off-by-one.`);
    }
  });
  if (["c", "cpp", "java"].includes(lang)) {
    code.split("\n").forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("#") || /[{};:]$/.test(t) || t.startsWith("*"))
        return;
      if (/^(if|for|while|else|switch|case|do|try|catch)\b/.test(t)) return;
      hints.push(`Line ${i + 1}: statement may be missing a terminating ";".`);
    });
  }
  return hints.slice(0, 25);
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are BugFinder, a rigorous code-debugging agent.

Method (follow strictly, in order):
1. Read the code line by line and build a mental model of what it actually does.
2. MANUALLY TRACE the program with the provided sample input, step by step, and compute the output it really produces. Do not assume the code is right because it looks plausible.
3. Compare that traced output with the expected sample output.
4. Find every defect: wrong algorithm/logic, off-by-one, wrong operator, wrong variable, bad initialisation, wrong condition, wrong loop bound, missing edge-case handling, wrong return value, wrong output format, syntax errors, type errors, null/undefined access, division by zero, infinite loops, unreachable code.
5. Produce a corrected version of the FULL code that, when traced with the same input, produces exactly the expected output.
6. On every line you changed, append an inline comment in the language's own comment syntax:
   BUGFIX (line <N>): <Error Type> — <what changed and why>

Hard rules:
- If your traced output differs from the expected output, there IS at least one bug. You must report it. Never return an empty fixes list in that case.
- Never report cosmetic/style preferences (var vs let, == vs ===, naming, formatting) as bugs unless they actually change behaviour.
- lineNumber must refer to the ORIGINAL code's line numbering.
- fixedCode must be the complete corrected file, never a fragment, and must never contain the "N| " line-number prefixes used in the prompt.

Respond with STRICT JSON only, no markdown fence, no prose:
{
  "title": "short session title",
  "language": "detected language",
  "predictedOutput": "output produced by the ORIGINAL code for the sample input (empty string if no input given)",
  "expectedOutput": "the expected sample output echoed back (empty string if none given)",
  "outputMatches": true | false,
  "summary": "1-3 sentences: what was broken and what you changed",
  "fixedCode": "complete corrected code",
  "fixes": [
    {
      "lineNumber": 3,
      "errorType": "Off-by-one error | Logic Error | Syntax Error | Type Error | Null/Undefined Access | Zero Division | Infinite Loop | Wrong Output Format | Scoping Error",
      "severity": "low | medium | high | critical",
      "description": "what is wrong",
      "originalLine": "the original line text",
      "fixedLine": "the corrected line text",
      "why": "exactly what was changed on that line and why"
    }
  ]
}`;

// ---------------------------------------------------------------------------
// OpenAI-compatible chat completions call
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callLLM(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error("The debugging agent is not configured (missing OPENAI_API_KEY).");
  }

  const baseUrl = (process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );

  const model = process.env["OPENAI_MODEL"] ?? "gpt-4o";

  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1, // low temp → deterministic tracing
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`LLM HTTP ${res.status}: ${body.slice(0, 500)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error?.message) throw new Error(data.error.message);

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Model returned an empty response.");
  return text;
}

// ---------------------------------------------------------------------------
// JSON extraction / normalisation helpers
// ---------------------------------------------------------------------------

function parseAgentJson(raw: string): Record<string, unknown> {
  let clean = raw.trim();
  // Strip any accidental markdown fences
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) clean = fenced[1].trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
}

const normalise = (s: string) =>
  String(s ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runDebuggingAgent(opts: {
  code: string;
  fileName?: string;
  sampleInput?: string;
  sampleOutput?: string;
  scopeMode?: string;
  lineFrom?: number | null;
  lineTo?: number | null;
}): Promise<AnalysisResult> {
  const {
    code,
    fileName = "main",
    sampleInput = "",
    sampleOutput = "",
    scopeMode = "entire",
    lineFrom = null,
    lineTo = null,
  } = opts;

  const model = process.env["OPENAI_MODEL"] ?? "gpt-4o";

  const lang = detectLanguage(code, fileName);
  const numbered = code
    .split("\n")
    .map((l, i) => `${i + 1}| ${l}`)
    .join("\n");

  let scopeInstruction = "Analyse the entire file.";
  if (scopeMode === "lines" && lineFrom) {
    scopeInstruction = `The user asked you to focus on lines ${lineFrom}-${lineTo || lineFrom}. Report fixes primarily in that range, but still return the complete corrected file. If the true cause of a wrong output lies outside that range, report it too and say so.`;
  } else if (scopeMode === "file") {
    scopeInstruction = `Analyse the file "${fileName}" completely.`;
  }

  const hints = structuralHints(code, lang);
  const userContent = `${scopeInstruction}

File name: ${fileName}
Detected language: ${lang}

Sample input:
${sampleInput || "(none provided)"}

Expected sample output:
${sampleOutput || "(none provided)"}

Static pre-scan hints (may be incomplete or wrong — verify each yourself):
${hints.length ? hints.map((h) => `- ${h}`).join("\n") : "- none"}

Source code (the "N| " prefix is line numbering for reference only):
${numbered}

Trace the ORIGINAL code with the sample input, compute its real output, compare with the expected output, then return the JSON object.`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let parsed = parseAgentJson(await callLLM(messages));

  let fixes = toFixes(parsed["fixes"]);
  const predicted = String(parsed["predictedOutput"] ?? "");
  let matches =
    typeof parsed["outputMatches"] === "boolean" ? (parsed["outputMatches"] as boolean) : null;

  if (sampleOutput.trim()) {
    // Trust the compared strings over the model's own boolean.
    matches = normalise(predicted) === normalise(sampleOutput);
  }

  // Guard: mismatching output but nothing reported → force a stricter second pass.
  if (matches === false && fixes.length === 0) {
    const retryContent = `${userContent}

IMPORTANT: a previous analysis concluded the original code outputs "${predicted}" while the expected output is "${sampleOutput}", yet reported no defects. That is contradictory. The code IS wrong. Locate the exact statement(s) responsible for the wrong result and report them with precise line numbers and corrected lines.`;
    try {
      const retryMessages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: retryContent },
      ];
      parsed = parseAgentJson(await callLLM(retryMessages));
      fixes = toFixes(parsed["fixes"]);
    } catch {
      /* keep first-pass result */
    }
  }

  let fixedCode = String(parsed["fixedCode"] ?? "").trim() || code;
  // Strip any accidental "N| " prefixes the model may have echoed back.
  fixedCode = fixedCode.replace(/^\s*\d+\|\s?/gm, "");

  let summary = String(parsed["summary"] ?? "").trim();
  if (matches === false && fixes.length === 0) {
    // Still nothing concrete — never claim the code is correct.
    fixes.push({
      lineNumber: null,
      errorType: "Output mismatch (Logic Error)",
      severity: "high",
      description: `Running the code on the sample input produces "${predicted}" but "${sampleOutput}" was expected.`,
      originalLine: `(program output) ${predicted}`,
      fixedLine: `(expected output) ${sampleOutput}`,
      why: "The program's behaviour does not match the specification for the given sample input.",
    });
  }
  if (!summary) {
    summary = fixes.length
      ? `Detected and corrected ${fixes.length} issue(s) in ${fileName}.`
      : `No defects found in ${fileName}; traced output matches the expected sample output.`;
  }
  if (matches === false) {
    summary = `${summary} Traced output of the original code: "${predicted}"; expected: "${sampleOutput}".`;
  }

  return {
    title: String(parsed["title"] ?? `Debug: ${fileName}`) || `Debug: ${fileName}`,
    language: String(parsed["language"] ?? lang),
    summary,
    fixedCode,
    fixes,
    engine: model,
    predictedOutput: predicted,
    outputMatches: matches,
  };
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function toFixes(value: unknown): Fix[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    const n = Number(f["lineNumber"]);
    const sev = String(f["severity"] ?? "medium").toLowerCase();
    return {
      lineNumber: Number.isFinite(n) && n > 0 ? n : null,
      errorType: String(f["errorType"] ?? "Logic Error"),
      severity: (["low", "medium", "high", "critical"].includes(sev)
        ? sev
        : "medium") as Fix["severity"],
      description: String(f["description"] ?? ""),
      originalLine: String(f["originalLine"] ?? ""),
      fixedLine: String(f["fixedLine"] ?? ""),
      why: String(f["why"] ?? ""),
    };
  });
}

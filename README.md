# BugFinder

Autonomous AI Code Debugger & Error Log Database.

Paste your code with sample input and expected/actual output. BugFinder traces execution, diagnoses bugs, returns corrected code with inline fix explanations, and stores every resolved issue in a searchable error log database.

## Features

- **Autonomous Code Debugging**: Identifies logical errors, syntax issues, and edge-case exceptions, providing clean, working code.
- **Inline Fix Explanations**: Comments embedded directly alongside modified lines highlighting what was fixed and why.
- **Searchable Error Log Database**: Automatically records debugging history with full query support.
- **Interactive Web Interface**: Streamlined UI with live diagnostics, real-time code inspection, and error telemetry.

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or bun

### Installation

```sh
npm install
npm run dev
```

The application will be accessible at `http://localhost:3000`.

## Tech Stack

- TanStack Start & TanStack Router
- React & TypeScript
- Tailwind CSS
- Supabase (PostgreSQL)

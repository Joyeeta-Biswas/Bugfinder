CREATE TABLE public.bf_users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.debug_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  language TEXT DEFAULT 'auto',
  original_code TEXT NOT NULL,
  sample_input TEXT,
  sample_output TEXT,
  scope_mode TEXT DEFAULT 'entire',
  line_from INT,
  line_to INT,
  target_file TEXT DEFAULT 'main',
  fixed_code TEXT,
  summary TEXT,
  issue_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.error_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES public.debug_sessions(id) ON DELETE CASCADE,
  user_id TEXT,
  target_file TEXT DEFAULT 'main',
  line_number INT,
  error_type TEXT,
  severity TEXT DEFAULT 'medium',
  description TEXT,
  original_line TEXT,
  fixed_line TEXT,
  why TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON public.debug_sessions(user_id, created_at DESC);
CREATE INDEX idx_logs_session ON public.error_logs(session_id);
CREATE INDEX idx_logs_user ON public.error_logs(user_id, created_at DESC);

GRANT ALL ON public.bf_users TO service_role;
GRANT ALL ON public.debug_sessions TO service_role;
GRANT ALL ON public.error_logs TO service_role;

ALTER TABLE public.bf_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debug_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
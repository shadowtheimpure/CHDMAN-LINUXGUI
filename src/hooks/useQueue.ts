import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { parseInfo } from '../lib/info';
import type { Job, JobEvent, LogLine } from '../lib/types';

const MAX_LOG_LINES = 4000;

interface ProgressInfo {
  percent: number;
  phase: string;
  ratio: string | null;
}

type Action =
  | { type: 'add'; job: Job; front?: boolean }
  | { type: 'start'; id: string; at: number }
  | { type: 'progress'; id: string; progress: ProgressInfo }
  | { type: 'line'; id: string; line: LogLine }
  | { type: 'stdout'; id: string; text: string }
  | { type: 'exit'; id: string; code: number | null; signal: string | null; error: string | null; durationMs: number }
  | { type: 'cancel-requested'; id: string }
  | { type: 'failed'; id: string; error: string }
  | { type: 'remove'; id: string }
  | { type: 'clear-finished' }
  | { type: 'retry'; id: string; newId: string }
  | { type: 'reorder'; from: number; to: number };

function patch(state: Job[], id: string, fn: (job: Job) => Job): Job[] {
  return state.map((job) => (job.id === id ? fn(job) : job));
}

function reducer(state: Job[], action: Action): Job[] {
  switch (action.type) {
    case 'add': {
      if (!action.front) return [...state, action.job];
      // Insert after the jobs that are already running so it starts next.
      let insertAt = state.length;
      for (let i = 0; i < state.length; i += 1) {
        if (state[i].status === 'running') insertAt = i + 1;
      }
      const next = [...state];
      next.splice(insertAt, 0, action.job);
      return next;
    }
    case 'start':
      return patch(state, action.id, (job) => ({
        ...job,
        status: 'running',
        startedAt: action.at,
        progress: 0,
        phase: 'Starting',
      }));
    case 'progress':
      return patch(state, action.id, (job) => ({
        ...job,
        progress: action.progress.percent,
        phase: action.progress.phase || job.phase,
        ratio: action.progress.ratio ?? job.ratio,
      }));
    case 'line':
      return patch(state, action.id, (job) => {
        const logs = job.logs.length >= MAX_LOG_LINES
          ? [...job.logs.slice(job.logs.length - MAX_LOG_LINES + 1), action.line]
          : [...job.logs, action.line];
        return { ...job, logs };
      });
    case 'stdout':
      return patch(state, action.id, (job) => ({
        ...job,
        stdoutRaw: (job.stdoutRaw + action.text).slice(-2_000_000),
      }));
    case 'exit':
      return patch(state, action.id, (job) => {
        const canceled = job.cancelRequested || (action.signal === 'SIGTERM' || action.signal === 'SIGKILL');
        const success = !canceled && action.code === 0 && !action.error;
        const errorTail = job.logs
          .filter((l) => l.stream === 'err')
          .map((l) => l.text)
          .filter((t) => /error|fatal|cannot|unable|no such|invalid/i.test(t))
          .slice(-3)
          .join(' ');
        return {
          ...job,
          status: success ? 'success' : canceled ? 'canceled' : 'failed',
          progress: success ? 100 : job.progress,
          phase: success ? 'Completed' : canceled ? 'Canceled' : 'Failed',
          exitCode: action.code,
          finishedAt: Date.now(),
          durationMs: action.durationMs,
          error: success ? null : action.error || errorTail || `chdman exited with code ${action.code ?? 'unknown'}`,
          info: success && job.command === 'info' ? parseInfo(job.stdoutRaw) : job.info,
        };
      });
    case 'cancel-requested':
      return patch(state, action.id, (job) => ({ ...job, cancelRequested: true, phase: 'Canceling…' }));
    case 'failed':
      return patch(state, action.id, (job) => ({
        ...job,
        status: 'failed',
        phase: 'Failed',
        error: action.error,
        finishedAt: Date.now(),
      }));
    case 'remove':
      return state.filter((job) => job.id !== action.id);
    case 'clear-finished':
      return state.filter((job) => job.status === 'running' || job.status === 'queued');
    case 'retry': {
      const source = state.find((job) => job.id === action.id);
      if (!source) return state;
      const clone: Job = {
        ...source,
        id: action.newId,
        status: 'queued',
        progress: null,
        phase: 'Queued',
        ratio: null,
        logs: [],
        stdoutRaw: '',
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        exitCode: null,
        error: null,
        cancelRequested: false,
        info: undefined,
      };
      return [...state, clone];
    }
    case 'reorder': {
      const next = [...state];
      if (action.from < 0 || action.from >= next.length) return state;
      if (action.to < 0 || action.to >= next.length) return state;
      const [item] = next.splice(action.from, 1);
      next.splice(action.to, 0, item);
      return next;
    }
    default:
      return state;
  }
}

export function makeJobId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface UseQueueResult {
  jobs: Job[];
  runningCount: number;
  queuedCount: number;
  finishedCount: number;
  addJob: (job: Job, front?: boolean) => void;
  cancelJob: (id: string) => void;
  removeJob: (id: string) => void;
  clearFinished: () => void;
  retryJob: (id: string) => void;
}

export function useQueue(concurrency: number, onJobSuccess?: (job: Job) => void): UseQueueResult {
  const [jobs, dispatch] = useReducer(reducer, []);
  const partials = useRef(new Map<string, { out: string; err: string }>());
  const pending = useRef(new Set<string>());
  const successListener = useRef(onJobSuccess);
  successListener.current = onJobSuccess;

  const pushLine = useCallback((id: string, stream: LogLine['stream'], text: string) => {
    dispatch({ type: 'line', id, line: { stream, text, at: Date.now() } });
  }, []);

  const handleText = useCallback(
    (id: string, stream: 'out' | 'err', text: string) => {
      const buffers = partials.current.get(id) ?? { out: '', err: '' };
      const combined = buffers[stream] + text;
      const parts = combined.split(/\r\n|\r|\n/);
      buffers[stream] = parts.pop() ?? '';
      partials.current.set(id, buffers);

      for (const rawLine of parts) {
        const line = rawLine.replace(/\s+$/, '');
        if (!line.trim()) continue;
        pushLine(id, stream, line);
        if (stream === 'err') {
          const percentMatch = line.match(/([\d.]+)%\s*complete/i);
          if (percentMatch) {
            const percent = Math.min(100, Math.max(0, Number(percentMatch[1])));
            const phase = line.split(',')[0].trim();
            const ratioMatch = line.match(/ratio\s*=\s*([\d.]+%)/i);
            dispatch({
              type: 'progress',
              id,
              progress: { percent, phase, ratio: ratioMatch ? ratioMatch[1] : null },
            });
          } else if (/complete\b/i.test(line) && /ratio/i.test(line)) {
            const ratioMatch = line.match(/ratio\s*=\s*([\d.]+%)/i);
            dispatch({
              type: 'progress',
              id,
              progress: { percent: 100, phase: 'Finalizing', ratio: ratioMatch ? ratioMatch[1] : null },
            });
          }
        }
      }
    },
    [pushLine],
  );

  useEffect(() => {
    const unsubscribe = window.api.onJobEvent((event: JobEvent) => {
      switch (event.type) {
        case 'started':
          dispatch({ type: 'start', id: event.id, at: event.at ?? Date.now() });
          pending.current.delete(event.id);
          pushLine(event.id, 'sys', 'chdman process started');
          break;
        case 'stdout':
          if (event.text) {
            dispatch({ type: 'stdout', id: event.id, text: event.text });
            handleText(event.id, 'out', event.text);
          }
          break;
        case 'stderr':
          if (event.text) handleText(event.id, 'err', event.text);
          break;
        case 'exit': {
          const buffers = partials.current.get(event.id);
          if (buffers) {
            if (buffers.out.trim()) pushLine(event.id, 'out', buffers.out.trim());
            if (buffers.err.trim()) pushLine(event.id, 'err', buffers.err.trim());
            partials.current.delete(event.id);
          }
          pending.current.delete(event.id);
          const code = event.code ?? null;
          const signal = event.signal ?? null;
          if (event.error) pushLine(event.id, 'err', event.error);
          pushLine(
            event.id,
            'sys',
            code === 0
              ? `Process finished successfully in ${Math.round((event.durationMs ?? 0) / 100) / 10}s`
              : `Process exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
          );
          dispatch({
            type: 'exit',
            id: event.id,
            code,
            signal,
            error: event.error ?? null,
            durationMs: event.durationMs ?? 0,
          });
          break;
        }
        default:
          break;
      }
    });
    return unsubscribe;
  }, [handleText, pushLine]);

  // Notify once when a job turns successful.
  const notified = useRef(new Set<string>());
  useEffect(() => {
    for (const job of jobs) {
      if (job.status === 'success' && !notified.current.has(job.id)) {
        notified.current.add(job.id);
        successListener.current?.(job);
      }
      if (job.status !== 'success') notified.current.delete(job.id);
    }
  }, [jobs]);

  // Keep the pipeline full.
  useEffect(() => {
    const capacity = Math.max(1, concurrency);
    const running = jobs.filter((job) => job.status === 'running').length;
    const slots = capacity - running - pending.current.size;
    if (slots <= 0) return;
    const queued = jobs.filter((job) => job.status === 'queued');
    for (const job of queued.slice(0, slots)) {
      pending.current.add(job.id);
      dispatch({ type: 'start', id: job.id, at: Date.now() });
      window.api
        .runJob({ id: job.id, command: job.command, args: job.args, cwd: job.cwd })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          dispatch({ type: 'failed', id: job.id, error: message.replace(/^Error:\s*/, '') });
        })
        .finally(() => {
          pending.current.delete(job.id);
        });
    }
  }, [jobs, concurrency]);

  const addJob = useCallback((job: Job, front = false) => dispatch({ type: 'add', job, front }), []);
  const cancelJob = useCallback((id: string) => {
    dispatch({ type: 'cancel-requested', id });
    void window.api.cancelJob(id);
  }, []);
  const removeJob = useCallback((id: string) => dispatch({ type: 'remove', id }), []);
  const clearFinished = useCallback(() => dispatch({ type: 'clear-finished' }), []);
  const retryJob = useCallback((id: string) => dispatch({ type: 'retry', id, newId: makeJobId() }), []);

  const runningCount = useMemo(() => jobs.filter((j) => j.status === 'running').length, [jobs]);
  const queuedCount = useMemo(() => jobs.filter((j) => j.status === 'queued').length, [jobs]);
  const finishedCount = useMemo(
    () => jobs.filter((j) => j.status === 'success' || j.status === 'failed' || j.status === 'canceled').length,
    [jobs],
  );

  return { jobs, runningCount, queuedCount, finishedCount, addJob, cancelJob, removeJob, clearFinished, retryJob };
}

import type { CommandId } from '../lib/commands';
import { formatDuration, formatTime, shortPath } from '../lib/format';
import type { Job } from '../lib/types';
import { Icon, type IconName } from './Icon';

const ICONS: Record<CommandId, IconName> = {
  info: 'search',
  verify: 'shield',
  createcd: 'disc',
  createdvd: 'dvd',
  createhd: 'hdd',
  createraw: 'archive',
  createld: 'film',
  extractcd: 'download',
  extractdvd: 'download',
  extracthd: 'download',
  extractraw: 'download',
  extractld: 'download',
  copy: 'copy',
  addmeta: 'tag-plus',
  delmeta: 'tag-minus',
  dumpmeta: 'tag-down',
  listtemplates: 'list',
};

interface QueuePanelProps {
  jobs: Job[];
  runningCount: number;
  queuedCount: number;
  finishedCount: number;
  concurrency: number;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onClearFinished: () => void;
  onShowLog: (job: Job, tab: 'output' | 'summary') => void;
  onReveal: (job: Job) => void;
}

export function QueuePanel({
  jobs,
  runningCount,
  queuedCount,
  finishedCount,
  concurrency,
  onCancel,
  onRemove,
  onRetry,
  onClearFinished,
  onShowLog,
  onReveal,
}: QueuePanelProps) {
  return (
    <aside className="queue-panel">
      <header className="queue-header">
        <div>
          <h2>Queue</h2>
          <p>
            {runningCount} running · {queuedCount} waiting · {concurrency} max parallel
          </p>
        </div>
        {finishedCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={onClearFinished}>
            <Icon name="trash" size={14} /> Clear finished
          </button>
        )}
      </header>

      <div className="job-list">
        {jobs.length === 0 ? (
          <div className="queue-empty">
            <Icon name="queue" size={30} />
            <strong>No jobs yet</strong>
            <p>Pick a command, choose your files, then press “Run now”.</p>
          </div>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onCancel={onCancel}
              onRemove={onRemove}
              onRetry={onRetry}
              onShowLog={onShowLog}
              onReveal={onReveal}
            />
          ))
        )}
      </div>
    </aside>
  );
}

interface JobCardProps {
  job: Job;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onShowLog: (job: Job, tab: 'output' | 'summary') => void;
  onReveal: (job: Job) => void;
}

const STATUS_LABEL: Record<Job['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  success: 'Done',
  failed: 'Failed',
  canceled: 'Canceled',
};

function JobCard({ job, onCancel, onRemove, onRetry, onShowLog, onReveal }: JobCardProps) {
  const percent = job.progress === null ? null : Math.round(job.progress);
  return (
    <article className={`job-card status-${job.status}`}>
      <div className="job-top">
        <span className="job-icon">
          <Icon name={ICONS[job.command]} size={16} />
        </span>
        <div className="job-title">
          <strong title={job.label}>{job.label}</strong>
          <span className="job-detail">{job.detail || job.commandTitle}</span>
        </div>
        <span className={`status-chip ${job.status}`}>
          {job.status === 'running' && <span className="spinner" />}
          {STATUS_LABEL[job.status]}
        </span>
      </div>

      {(job.status === 'running' || job.status === 'queued') && (
        <div className="job-progress">
          <div
            className={`progress ${
              job.status === 'running' && (percent === null || percent === 0) ? 'indeterminate' : ''
            }`}
          >
            <span style={{ width: percent === null ? undefined : `${Math.max(2, percent)}%` }} />
          </div>
          <div className="job-progress-text">
            <span>
              {job.phase}
              {job.ratio ? ` · ratio ${job.ratio}` : ''}
            </span>
            <span>{percent === null ? '' : `${percent}%`}</span>
          </div>
        </div>
      )}

      {job.status === 'success' && (
        <div className="job-meta">
          <span>
            <Icon name="clock" size={12} /> {formatDuration(job.durationMs)}
          </span>
          {job.outputs[0] && (
            <span className="mono" title={job.outputs[0]}>
              <Icon name="folder" size={12} /> {shortPath(job.outputs[0], 34)}
            </span>
          )}
        </div>
      )}

      {job.status === 'failed' && (
        <p className="job-error" title={job.error || undefined}>
          {job.error || 'Unknown error'}
        </p>
      )}

      {job.status === 'canceled' && <p className="job-muted">Stopped by user.</p>}

      <div className="job-actions">
        {job.command === 'info' && job.status === 'success' && (
          <button className="link-btn" onClick={() => onShowLog(job, 'summary')}>
            Summary
          </button>
        )}
        <button className="link-btn" onClick={() => onShowLog(job, 'output')}>
          Log
        </button>
        {job.status === 'running' && (
          <button className="link-btn danger" onClick={() => onCancel(job.id)}>
            Cancel
          </button>
        )}
        {job.status === 'success' && job.outputs[0] && (
          <button className="link-btn" onClick={() => onReveal(job)}>
            Open folder
          </button>
        )}
        {(job.status === 'failed' || job.status === 'canceled') && (
          <button className="link-btn" onClick={() => onRetry(job.id)}>
            Retry
          </button>
        )}
        {job.status !== 'running' && (
          <button
            className="link-btn subtle"
            onClick={() => onRemove(job.id)}
            title="Remove from queue"
          >
            <Icon name="x" size={12} />
          </button>
        )}
        <span className="job-time">{job.startedAt ? formatTime(job.startedAt) : ''}</span>
      </div>
    </article>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { detectChdMedia } from '../lib/info';
import { formatBytes, formatDuration, formatTime } from '../lib/format';
import type { Job } from '../lib/types';
import { Icon } from './Icon';

interface JobDialogProps {
  job: Job;
  initialTab: 'output' | 'summary';
  onClose: () => void;
}

const STATUS_LABEL: Record<Job['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  success: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
};

export function JobDialog({ job, initialTab, onClose }: JobDialogProps) {
  const [tab, setTab] = useState<'output' | 'summary'>(
    initialTab === 'summary' && job.info ? 'summary' : 'output',
  );
  const [filter, setFilter] = useState('');
  const [follow, setFollow] = useState(true);
  const [showTime, setShowTime] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const commandLine = useMemo(
    () =>
      ['chdman', job.command, ...job.args]
        .map((part) => (/^[\w@%+=:,./-]+$/.test(part) ? part : `'${part.replace(/'/g, `'\\''`)}'`))
        .join(' '),
    [job],
  );

  const filteredLogs = useMemo(() => {
    if (!filter.trim()) return job.logs;
    const needle = filter.toLowerCase();
    return job.logs.filter((line) => line.text.toLowerCase().includes(needle));
  }, [job.logs, filter]);

  useEffect(() => {
    if (!follow || tab !== 'output') return;
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [job.logs, follow, tab]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
    } catch {
      /* clipboard can be unavailable */
    }
  };

  const saveLog = async () => {
    await window.api.saveLog({
      defaultName: `${job.command}-${job.label.replace(/\.[^.]+$/, '')}.log`,
      content: job.logs.map((l) => `${l.stream === 'err' ? '!' : l.stream === 'sys' ? '#' : ' '} ${l.text}`).join('\n'),
    });
  };

  const info = job.info;
  const media = info ? detectChdMedia(info).label : null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`${job.label} details`}>
        <header className="modal-header">
          <div className="modal-title">
            <span className={`status-dot ${job.status}`} />
            <div>
              <h2>{job.label}</h2>
              <p>
                {job.commandTitle} · {STATUS_LABEL[job.status]}
                {job.durationMs !== null ? ` · ${formatDuration(job.durationMs)}` : ''}
                {job.exitCode !== null ? ` · exit ${job.exitCode}` : ''}
              </p>
            </div>
          </div>
          <div className="modal-header-actions">
            <div className="tabs">
              {job.info && (
                <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>
                  Summary
                </button>
              )}
              <button className={tab === 'output' ? 'active' : ''} onClick={() => setTab('output')}>
                Output
              </button>
            </div>
            <button className="btn icon-btn" onClick={onClose} title="Close">
              <Icon name="x" size={16} />
            </button>
          </div>
        </header>

        <div className="modal-command">
          <Icon name="terminal" size={13} />
          <code title={commandLine}>{commandLine}</code>
          <button className="link-btn" onClick={() => copy(commandLine, 'cmd')}>
            {copied === 'cmd' ? 'Copied' : 'Copy'}
          </button>
        </div>

        {job.status === 'failed' && job.error && (
          <div className="modal-error">
            <Icon name="alert" size={14} /> {job.error}
          </div>
        )}

        {tab === 'summary' && info ? (
          <div className="modal-body summary-body">
            <div className="stat-grid">
              <Stat label="Media" value={media || 'Unknown'} />
              <Stat label="CHD version" value={info.version || '—'} />
              <Stat label="Logical size" value={formatBytes(info.logicalSize)} />
              <Stat label="CHD size" value={formatBytes(info.chdSize)} />
              <Stat label="Compression ratio" value={info.ratio || '—'} />
              <Stat
                label="Duration"
                value={job.durationMs !== null ? formatDuration(job.durationMs) : '—'}
              />
            </div>

            <div className="hash-box">
              <HashRow label="SHA-1" value={info.sha1} onCopy={() => copy(info.sha1 || '', 'sha1')} copied={copied === 'sha1'} />
              <HashRow
                label="Data SHA-1"
                value={info.dataSha1}
                onCopy={() => copy(info.dataSha1 || '', 'dataSha1')}
                copied={copied === 'dataSha1'}
              />
            </div>

            <h3 className="subsection-title">Header fields</h3>
            <dl className="kv-grid">
              {info.fields.map((field) => (
                <div className="kv" key={field.key}>
                  <dt>{field.key}</dt>
                  <dd className="mono">{field.value}</dd>
                </div>
              ))}
            </dl>

            {info.metadata.length > 0 && (
              <>
                <h3 className="subsection-title">Metadata</h3>
                <pre className="metadata-block">{info.metadata.join('\n')}</pre>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="log-toolbar">
              <input
                className="text-input search"
                placeholder="Filter output…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                spellCheck={false}
              />
              <label className="inline-check">
                <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
                Follow
              </label>
              <label className="inline-check">
                <input type="checkbox" checked={showTime} onChange={(event) => setShowTime(event.target.checked)} />
                Times
              </label>
              <button className="btn btn-sm" onClick={() => copy(filteredLogs.map((l) => l.text).join('\n'), 'log')}>
                {copied === 'log' ? 'Copied' : 'Copy'}
              </button>
              <button className="btn btn-sm" onClick={saveLog}>
                <Icon name="save" size={14} /> Save
              </button>
            </div>
            <div className="log-view" ref={logRef}>
              {filteredLogs.length === 0 ? (
                <p className="log-empty">
                  {job.status === 'queued' ? 'Waiting for a free slot…' : 'No output captured.'}
                </p>
              ) : (
                filteredLogs.map((line, index) => (
                  <div className={`log-line ${line.stream}`} key={`${line.at}-${index}`}>
                    {showTime && <span className="log-time">{formatTime(line.at)}</span>}
                    <span className="log-text">{line.text}</span>
                  </div>
                ))
              )}
              {job.status === 'running' && <div className="log-cursor" />}
            </div>
          </>
        )}

        <footer className="modal-footer">
          <span className="modal-footnote">
            {job.startedAt ? `Started ${formatTime(job.startedAt)}` : 'Not started'}
            {job.finishedAt ? ` · finished ${formatTime(job.finishedAt)}` : ''}
          </span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HashRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value?: string;
  onCopy: () => void;
  copied: boolean;
}) {
  if (!value) return null;
  return (
    <div className="hash-row">
      <span className="hash-label">{label}</span>
      <code>{value}</code>
      <button className="link-btn" onClick={onCopy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

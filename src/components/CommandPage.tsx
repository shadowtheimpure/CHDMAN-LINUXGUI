import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildArgs,
  defaultValues,
  formatCommand,
  parseBytes,
  validate,
  type CommandDef,
  type FieldDef,
  type FormValues,
} from '../lib/commands';
import {
  basename,
  dirname,
  filtersFor,
  formatBytes,
  suggestOutput,
} from '../lib/format';
import type { ChdmanDetection, Job, StatResult } from '../lib/types';
import { Icon } from './Icon';
import { makeJobId } from '../hooks/useQueue';

interface CommandPageProps {
  command: CommandDef;
  detection: ChdmanDetection | null;
  prefill?: Record<string, string>;
  onQueue: (job: Job, front: boolean) => void;
  onToast: (message: string) => void;
  onOpenSettings: () => void;
  lastInputDir: string;
}

const EXTRA_HELP: Partial<Record<string, string>> = {};

export function CommandPage({
  command,
  detection,
  prefill,
  onQueue,
  onToast,
  onOpenSettings,
  lastInputDir,
}: CommandPageProps) {
  const [values, setValues] = useState<FormValues>(() => ({
    ...defaultValues(command),
    ...(prefill ?? {}),
  }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stats, setStats] = useState<Record<string, StatResult>>({});
  const [copied, setCopied] = useState(false);
  const autoOutput = useRef<string>('');

  const errors = useMemo(() => validate(command, values), [command, values]);

  /* Track file existence for every path-ish field. */
  const pathFields = command.fields.filter((f) =>
    ['file-in', 'file-out', 'dir'].includes(f.kind),
  );
  const pathSignature = pathFields.map((f) => String(values[f.key] ?? '')).join('\u0000');

  useEffect(() => {
    const paths = pathFields
      .map((f) => String(values[f.key] ?? '').trim())
      .filter(Boolean);
    if (!paths.length) {
      setStats({});
      return;
    }
    let canceled = false;
    const timer = setTimeout(async () => {
      const results = await window.api.statPaths(paths);
      if (canceled) return;
      const map: Record<string, StatResult> = {};
      for (const result of results) map[result.path] = result;
      setStats(map);
    }, 220);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathSignature]);

  const setValue = useCallback(
    (key: string, value: string | boolean, field?: FieldDef) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-fill a sensible output path next to the chosen input.
        if (field && field.kind === 'file-in' && typeof value === 'string' && value) {
          const suggestion = suggestOutput(command.id, value);
          const outputField = command.fields.find((f) => f.key === 'output' || f.key === 'outputbin');
          if (outputField) {
            const current = String(prev[outputField.key] ?? '');
            if (!current || current === autoOutput.current) {
              next[outputField.key] = suggestion;
              autoOutput.current = suggestion;
            }
          }
        }
        return next;
      });
    },
    [command],
  );

  const handleDrop = (field: FieldDef, event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const path = window.api.pathForFile(file);
    if (!path) return;
    if (field.kind === 'file-in' || field.kind === 'file-out') {
      setValue(field.key, path, field);
      setTouched((prev) => ({ ...prev, [field.key]: true }));
    }
  };

  const submit = (front: boolean) => {
    setAttempted(true);
    if (Object.keys(errors).length) {
      onToast('Fill in the required fields first');
      return;
    }
    if (!detection?.found) {
      onToast('chdman was not found — open Settings');
      return;
    }
    const args = buildArgs(command, values);
    const outputPath =
      String(values.output ?? '').trim() || String(values.outputbin ?? '').trim();
    const inputPath = String(values.input ?? '').trim();
    const extra = String(values.tag ?? '').trim();
    const primary = outputPath || inputPath;
    let detail: string;
    if (inputPath && outputPath) {
      detail = `${basename(inputPath)} → ${basename(outputPath)}`;
    } else if (inputPath) {
      detail = basename(dirname(inputPath)) || command.title;
    } else if (extra) {
      detail = `tag ${extra}`;
    } else {
      detail = command.title;
    }

    const job: Job = {
      id: makeJobId(),
      command: command.id,
      commandTitle: command.title,
      label: primary ? basename(primary) : command.title,
      detail,
      args,
      cwd: outputPath ? dirname(outputPath) : inputPath ? dirname(inputPath) : undefined,
      outputs: outputPath ? [outputPath] : [],
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
    };

    onQueue(job, front);
    onToast(front ? 'Job started' : 'Job added to queue');
    if (command.id !== 'info') {
      setValues(defaultValues(command));
      autoOutput.current = '';
      setAttempted(false);
      setTouched({});
    }
  };

  const preview = formatCommand(`chdman ${command.id}`, command, values);

  const basicFields = command.fields.filter((f) => !f.advanced);
  const advancedFields = command.fields.filter((f) => f.advanced);

  const sections: { name: string; fields: FieldDef[] }[] = [];
  for (const field of basicFields) {
    const name = field.group ?? 'Basics';
    const existing = sections.find((s) => s.name === name);
    if (existing) existing.fields.push(field);
    else sections.push({ name, fields: [field] });
  }

  const advancedSections: { name: string; fields: FieldDef[] }[] = [];
  for (const field of advancedFields) {
    const name = field.group ?? 'Advanced';
    const existing = advancedSections.find((s) => s.name === name);
    if (existing) existing.fields.push(field);
    else advancedSections.push({ name, fields: [field] });
  }

  const outputField = command.fields.find((f) => f.key === 'output');
  const outputExists = outputField && stats[String(values[outputField.key] ?? '')]?.exists;
  const forceOn = values.force === true;

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      onToast('Clipboard unavailable');
    }
  };

  const renderField = (field: FieldDef) => (
    <FieldEditor
      key={field.key}
      field={field}
      value={values[field.key]}
      error={(attempted || touched[field.key]) && errors[field.key]}
      stat={stats[String(values[field.key] ?? '')]}
      lastInputDir={lastInputDir}
      onChange={(value) => setValue(field.key, value, field)}
      onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
      onDrop={(event) => handleDrop(field, event)}
    />
  );

  return (
    <div className="page command-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <span>{command.category === 'create' ? 'Create CHD' : command.category === 'extract' ? 'Extract' : command.category === 'inspect' ? 'Inspect' : 'Manage'}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">{command.title}</span>
          </div>
          <h1>{command.title}</h1>
          <p className="page-summary">{command.summary}</p>
        </div>
        <div className="page-header-side">
          {detection?.found ? (
            <span className="chip chip-ok" title={detection.path}>
              <Icon name="check" size={13} /> chdman {detection.version}
              {detection.bundled ? ' · bundled' : ''}
            </span>
          ) : (
            <button className="chip chip-err" onClick={onOpenSettings}>
              <Icon name="alert" size={13} /> chdman missing
            </button>
          )}
        </div>
      </header>

      {!detection?.found && (
        <div className="banner banner-warn">
          <Icon name="alert" />
          <div>
            <strong>chdman is not available.</strong> The app could not find a working chdman
            binary. Open Settings to point at one.
          </div>
          <button className="btn btn-sm" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      )}

      {command.note && (
        <div className="banner banner-info">
          <Icon name="info" />
          <div>{command.note}</div>
        </div>
      )}

      {command.fields.length === 0 ? (
        <div className="empty-state">
          <Icon name="list" size={28} />
          <p>This command has no options.</p>
        </div>
      ) : (
        <form
          className="form card"
          onSubmit={(event) => {
            event.preventDefault();
            submit(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              submit(true);
            }
          }}
        >
          {sections.map((section) => (
            <section className="form-section" key={section.name}>
              {section.name !== 'Basics' && <h2 className="section-title">{section.name}</h2>}
              <div className="field-grid">
                {section.fields.map(renderField)}
              </div>
            </section>
          ))}

          {advancedFields.length > 0 && (
            <section className="form-section">
              <button
                type="button"
                className={`disclosure ${showAdvanced ? 'open' : ''}`}
                onClick={() => setShowAdvanced((prev) => !prev)}
                aria-expanded={showAdvanced}
              >
                <Icon name="chevron" size={16} />
                Advanced options
                <span className="badge">{advancedFields.length}</span>
              </button>
              {showAdvanced && (
                <div className="advanced-body">
                  {advancedSections.map((section) => (
                    <div className="advanced-group" key={section.name}>
                      <h3 className="subsection-title">{section.name}</h3>
                      <div className="field-grid">{section.fields.map(renderField)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {outputExists && !forceOn && command.fields.some((f) => f.key === 'force') && (
            <div className="banner banner-warn compact">
              <Icon name="alert" />
              <div>
                The output file already exists. chdman will refuse to overwrite it unless
                “Overwrite existing output” is enabled.
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setValue('force', true)}
              >
                Enable overwrite
              </button>
            </div>
          )}

          <footer className="form-footer">
            <div className="command-preview" title={preview}>
              <Icon name="terminal" size={14} />
              <code>{preview}</code>
              <button type="button" className="link-btn" onClick={copyPreview}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="btn"
                disabled={!detection?.found}
              >
                <Icon name="plus" size={15} /> Add to queue
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => submit(true)}
                disabled={!detection?.found}
                title="Run immediately (Ctrl+Enter)"
              >
                <Icon name="play" size={15} /> Run now
              </button>
            </div>
          </footer>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field renderer                                                      */
/* ------------------------------------------------------------------ */

interface FieldEditorProps {
  field: FieldDef;
  value: string | boolean | undefined;
  error?: string | false;
  stat?: StatResult;
  lastInputDir: string;
  onChange: (value: string | boolean) => void;
  onBlur: () => void;
  onDrop: (event: React.DragEvent) => void;
}

function FieldEditor({
  field,
  value,
  error,
  stat,
  lastInputDir,
  onChange,
  onBlur,
  onDrop,
}: FieldEditorProps) {
  const [dragOver, setDragOver] = useState(false);

  if (field.kind === 'bool') {
    return (
      <label className={`field field-bool ${field.wide ? 'wide' : ''}`}>
        <span className="switch">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
        </span>
        <span className="bool-text">
          <span className="field-label">{field.label}</span>
          {field.help && <span className="field-help">{field.help}</span>}
        </span>
      </label>
    );
  }

  const text = typeof value === 'string' ? value : '';
  const isPath = field.kind === 'file-in' || field.kind === 'file-out' || field.kind === 'dir';

  const browse = async () => {
    const isOutput = field.kind === 'file-out';
    const paths = await window.api.openDialog({
      title: isOutput ? `Choose ${field.label.toLowerCase()}` : field.label,
      save: isOutput,
      directory: field.kind === 'dir',
      filters: field.accept ? filtersFor(field.accept) : undefined,
      extension: isOutput ? field.accept?.[0] : undefined,
      defaultPath: text || (isOutput ? undefined : lastInputDir || undefined),
    });
    if (paths[0]) onChange(paths[0]);
  };

  return (
    <div
      className={`field ${field.wide ? 'wide' : ''} ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(event) => {
        if (!isPath) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        setDragOver(false);
        if (isPath) onDrop(event);
      }}
    >
      <label className="field-label" htmlFor={`f-${field.key}`}>
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      <div className={`input-row ${error ? 'has-error' : ''}`}>
        <input
          id={`f-${field.key}`}
          className="text-input"
          type="text"
          spellCheck={false}
          value={text}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete="off"
        />
        {isPath && (
          <button type="button" className="btn icon-btn" onClick={browse} title="Browse…">
            <Icon name={field.kind === 'file-out' ? 'save' : 'folder'} size={16} />
          </button>
        )}
        {field.kind === 'bytes' && text && parseBytes(text) !== null && (
          <span className="input-addon">{formatBytes(parseBytes(text) ?? 0)}</span>
        )}
      </div>

      {field.kind === 'codecs' && (
        <div className="chips-row">
          <button
            type="button"
            className={`chip-btn ${!text ? 'active' : ''}`}
            onClick={() => onChange('')}
            title="Use chdman's default codec order"
          >
            default
          </button>
          {field.options?.map((option) => (
            <button
              type="button"
              key={option}
              className={`chip-btn ${text === option ? 'active' : ''}`}
              onClick={() => onChange(text === option ? '' : option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <span className="field-error">{error}</span>
      ) : (
        <span className="field-help">
          {field.help || EXTRA_HELP[field.key] || '\u00A0'}
        </span>
      )}

      {isPath && text && <PathStatus field={field} stat={stat} />}
    </div>
  );
}

function PathStatus({ field, stat }: { field: FieldDef; stat?: StatResult }) {
  if (!stat) return null;
  if (field.kind === 'file-in' || field.kind === 'dir') {
    if (!stat.exists) {
      return (
        <span className="path-status err">
          <Icon name="alert" size={12} /> Path does not exist
        </span>
      );
    }
    return (
      <span className="path-status ok">
        <Icon name="check" size={12} /> {stat.isDirectory ? 'Folder' : formatBytes(stat.size)}
      </span>
    );
  }
  if (stat.exists) {
    return (
      <span className="path-status warn">
        <Icon name="alert" size={12} /> Existing file will be replaced
      </span>
    );
  }
  return (
    <span className="path-status muted">
      <Icon name="check" size={12} /> Will be created
    </span>
  );
}

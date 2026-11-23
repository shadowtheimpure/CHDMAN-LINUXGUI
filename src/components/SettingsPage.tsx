import { useEffect, useState } from 'react';
import type { AppInfo, AppSettings, ChdmanDetection } from '../lib/types';
import { Icon } from './Icon';

interface SettingsPageProps {
  settings: AppSettings;
  detection: ChdmanDetection | null;
  appInfo: AppInfo | null;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onChooseBinary: () => Promise<void>;
  onDetect: () => Promise<void>;
  onToast: (message: string) => void;
}

export function SettingsPage({
  settings,
  detection,
  appInfo,
  onSettingsChange,
  onChooseBinary,
  onDetect,
  onToast,
}: SettingsPageProps) {
  const [pathDraft, setPathDraft] = useState(settings.chdmanPath);
  const [detecting, setDetecting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPathDraft(settings.chdmanPath);
  }, [settings.chdmanPath]);

  const runDetect = async () => {
    setDetecting(true);
    try {
      await onDetect();
    } finally {
      setDetecting(false);
    }
  };

  const applyPath = async () => {
    await window.api.setChdmanPath(pathDraft.trim());
    onSettingsChange({ chdmanPath: pathDraft.trim() });
    await onDetect();
    onToast('chdman setting saved');
  };

  const useBundled = async () => {
    setPathDraft('');
    await window.api.setChdmanPath('');
    onSettingsChange({ chdmanPath: '' });
    await onDetect();
    onToast('Using the bundled chdman');
  };

  const copyDiagnostics = async () => {
    const lines = [
      `CHDMAN GUI ${appInfo?.appVersion ?? '?'}`,
      `Electron ${appInfo?.electron ?? '?'} · Chromium ${appInfo?.chrome ?? '?'} · Node ${appInfo?.node ?? '?'}`,
      `Platform ${appInfo?.platform ?? '?'}/${appInfo?.arch ?? '?'}`,
      `chdman: ${detection?.found ? `${detection.version} (${detection.source}) at ${detection.path}` : 'not found'}`,
      `Data dir: ${appInfo?.userData ?? '?'}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onToast('Clipboard unavailable');
    }
  };

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <span>Application</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Settings</span>
          </div>
          <h1>Settings</h1>
          <p className="page-summary">Engine location, execution behaviour and appearance.</p>
        </div>
      </header>

      <section className="card settings-card">
        <div className="settings-heading">
          <div>
            <h2>chdman engine</h2>
            <p>The MAME CHD manager binary used to run every job.</p>
          </div>
          <span className={`chip ${detection?.found ? 'chip-ok' : 'chip-err'}`}>
            <Icon name={detection?.found ? 'check' : 'alert'} size={13} />
            {detection?.found ? `Working · v${detection.version}` : 'Not found'}
          </span>
        </div>

        {detection?.found ? (
          <dl className="kv-grid compact-grid">
            <div className="kv">
              <dt>Binary</dt>
              <dd className="mono break">{detection.path}</dd>
            </div>
            <div className="kv">
              <dt>Source</dt>
              <dd>
                {detection.bundled
                  ? 'Bundled with the app'
                  : detection.source === 'system'
                    ? 'Found in PATH'
                    : detection.source === 'environment'
                      ? 'CHDMAN_PATH environment variable'
                      : 'Custom path'}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="banner banner-warn compact">
            <Icon name="alert" />
            <div>
              No working chdman binary was found. A bundled copy is normally included — if you
              built the app without it, point to an installed chdman below.
            </div>
          </div>
        )}

        <div className="settings-field">
          <label className="field-label" htmlFor="chdman-path">
            Custom binary path
          </label>
          <div className="input-row">
            <input
              id="chdman-path"
              className="text-input mono"
              value={pathDraft}
              placeholder={detection?.bundled ? 'Using bundled binary — leave empty' : '/usr/bin/chdman'}
              spellCheck={false}
              onChange={(event) => setPathDraft(event.target.value)}
              onBlur={applyPath}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyPath();
              }}
            />
            <button className="btn" onClick={onChooseBinary}>
              <Icon name="folder" size={15} /> Browse
            </button>
            <button className="btn" onClick={useBundled} title="Clear the custom path and use the bundled binary">
              <Icon name="archive" size={15} /> Bundled
            </button>
            <button className="btn" onClick={runDetect} disabled={detecting}>
              <Icon name="retry" size={15} /> {detecting ? 'Checking…' : 'Detect'}
            </button>
          </div>
          <p className="field-help">
            Leave empty to auto-detect: bundled binary first, then <code>CHDMAN_PATH</code> and{' '}
            <code>PATH</code>.
          </p>
        </div>

        {!detection?.found && detection?.attempted?.length ? (
          <details className="attempts">
            <summary>What was tried ({detection.attempted.length})</summary>
            <ul>
              {detection.attempted.map((attempt) => (
                <li key={`${attempt.source}-${attempt.path}`}>
                  <span className="mono break">{attempt.path}</span>
                  <span className="muted"> — {attempt.error || 'unsupported'}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="card settings-card">
        <div className="settings-heading">
          <div>
            <h2>Execution</h2>
            <p>How jobs behave while running.</p>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <strong>Parallel jobs</strong>
            <p className="field-help">Number of chdman processes that may run at once.</p>
          </div>
          <div className="segmented">
            {[1, 2, 3, 4].map((value) => (
              <button
                key={value}
                className={settings.concurrency === value ? 'active' : ''}
                onClick={() => onSettingsChange({ concurrency: value })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div>
            <strong>Open output folder on success</strong>
            <p className="field-help">Reveal the produced file in your file manager when a job finishes.</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.revealOnFinish}
              onChange={(event) => onSettingsChange({ revealOnFinish: event.target.checked })}
            />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
        </div>
      </section>

      <section className="card settings-card">
        <div className="settings-heading">
          <div>
            <h2>Appearance</h2>
            <p>Matches your desktop by default.</p>
          </div>
        </div>
        <div className="theme-options">
          {(['system', 'dark', 'light'] as const).map((theme) => (
            <button
              key={theme}
              className={`theme-option ${settings.theme === theme ? 'active' : ''}`}
              onClick={() => onSettingsChange({ theme })}
            >
              <span className={`theme-swatch ${theme}`} />
              <span>{theme === 'system' ? 'Follow system' : theme === 'dark' ? 'Dark' : 'Light'}</span>
              {settings.theme === theme && <Icon name="check" size={15} />}
            </button>
          ))}
        </div>
      </section>

      <section className="card settings-card">
        <div className="settings-heading">
          <div>
            <h2>About</h2>
            <p>A desktop front-end for MAME’s chdman.</p>
          </div>
          <button className="btn btn-sm" onClick={copyDiagnostics}>
            {copied ? 'Copied' : 'Copy diagnostics'}
          </button>
        </div>
        <dl className="kv-grid compact-grid">
          <div className="kv">
            <dt>App version</dt>
            <dd>{appInfo?.appVersion ?? '—'}</dd>
          </div>
          <div className="kv">
            <dt>Electron</dt>
            <dd>
              {appInfo?.electron ?? '—'} · Chromium {appInfo?.chrome ?? '—'}
            </dd>
          </div>
          <div className="kv">
            <dt>Platform</dt>
            <dd>
              {appInfo?.platform ?? '—'} / {appInfo?.arch ?? '—'}
            </dd>
          </div>
          <div className="kv">
            <dt>Data folder</dt>
            <dd className="mono break">{appInfo?.userData ?? '—'}</dd>
          </div>
        </dl>
        <p className="field-help">
          chdman is part of MAME and is distributed under the GPL-2.0+ license. CHD and MAME are
          trademarks of their respective owners; this front-end is an independent wrapper.
        </p>
      </section>
    </div>
  );
}

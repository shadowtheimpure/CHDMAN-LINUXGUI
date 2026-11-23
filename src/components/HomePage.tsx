import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommandId } from '../lib/commands';
import { analyzeFile, type FileAnalysis } from '../lib/analyze';
import { basename, formatBytes, shortPath } from '../lib/format';
import { detectChdMedia, parseInfo, type ChdMediaInfo } from '../lib/info';
import type { ChdmanDetection, FileProbe, ParsedInfo } from '../lib/types';
import { COMMAND_ICONS } from './commandIcons';
import { Icon } from './Icon';

interface HomePageProps {
  detection: ChdmanDetection | null;
  initialPath?: string | null;
  onNavigate: (id: CommandId, prefill?: Record<string, string>) => void;
  onOpenSettings: () => void;
}

interface ChdReading {
  info: ParsedInfo;
  media: ChdMediaInfo;
}

const SUPPORTED_EXTENSIONS = [
  'chd',
  'cue',
  'gdi',
  'iso',
  'bin',
  'img',
  'raw',
  'avi',
  'toc',
  'nrg',
  'mds',
  'ccd',
  'hdd',
  'vhd',
];

export function HomePage({
  detection,
  initialPath,
  onNavigate,
  onOpenSettings,
}: HomePageProps) {
  const [path, setPath] = useState<string>(initialPath ?? '');
  const [probe, setProbe] = useState<FileProbe | null>(null);
  const [chd, setChd] = useState<ChdReading | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (initialPath) setPath(initialPath);
  }, [initialPath]);

  useEffect(() => {
    if (!path) {
      setProbe(null);
      setChd(null);
      setError(null);
      return;
    }
    let canceled = false;
    setLoading(true);
    setError(null);
    setChd(null);
    setProbe(null);

    (async () => {
      try {
        const result = await window.api.probeFile(path);
        if (canceled) return;
        if (!result?.exists) {
          setError('That file no longer exists. Choose another one.');
          return;
        }
        setProbe(result);

        if (result.ext === 'chd') {
          if (!detection?.found) {
            setError('CHD files need a working chdman engine. Open Settings to configure one.');
            return;
          }
          const infoResult = await window.api.runSync({ command: 'info', args: ['--input', path] });
          if (canceled) return;
          if (!infoResult.ok) {
            const message = infoResult.stderr.trim().split('\n').slice(-2).join(' ');
            setError(message || 'chdman could not read this CHD.');
            return;
          }
          const info = parseInfo(infoResult.stdout);
          setChd({ info, media: detectChdMedia(info) });
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [path, detection?.found]);

  const analysis: FileAnalysis | null = useMemo(
    () => (probe ? analyzeFile(probe, chd) : null),
    [probe, chd],
  );

  const chooseFile = useCallback(async () => {
    const paths = await window.api.openDialog({
      title: 'Choose a file to convert or inspect',
      filters: [
        { name: 'Supported files', extensions: SUPPORTED_EXTENSIONS },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (paths[0]) setPath(paths[0]);
  }, []);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const dropped = window.api.pathForFile(file);
    if (dropped) setPath(dropped);
  };

  const openRecommendation = (id: CommandId, prefill?: Record<string, string>) => {
    onNavigate(id, prefill);
  };

  const extraDetails =
    analysis && probe
      ? analysis.details.filter((detail) => detail && detail !== formatBytes(probe.size))
      : [];

  return (
    <div className="page home-page">
      <header className="page-header home-header">
        <div>
          <div className="breadcrumb">
            <span>Start</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Choose a file</span>
          </div>
          <h1>Convert or inspect a disc image</h1>
          <p className="page-summary">
            Pick a CHD, cue/gdi set, ISO, raw disk image or AVI. The app identifies the file and
            recommends the chdman operations that make sense — no terminal needed.
          </p>
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

      <section
        className={`dropzone ${dragOver ? 'over' : ''} ${path ? 'compact' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span className="dropzone-icon">
          <Icon name="file" size={26} />
        </span>
        <div className="dropzone-text">
          <strong>{path ? 'Choose a different file' : 'Drop a file here'}</strong>
          <span>CHD · CUE/GDI · ISO · BIN/IMG · AVI</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={chooseFile}>
          <Icon name="folder" size={15} /> Choose file…
        </button>
      </section>

      {loading && (
        <div className="home-loading">
          <span className="spinner" /> Reading the file…
        </div>
      )}

      {error && !loading && (
        <div className="banner banner-warn">
          <Icon name="alert" />
          <div>
            <strong>Could not analyse this file.</strong> {error}
          </div>
          <button className="btn btn-sm" onClick={chooseFile}>
            Choose another
          </button>
        </div>
      )}

      {analysis && probe && !loading && (
        <>
          <section className="card file-card">
            <span className="file-icon">
              <Icon name={analysis.icon} size={24} />
            </span>
            <div className="file-info">
              <strong className="file-name">{basename(path)}</strong>
              <span className="file-path" title={path}>
                {shortPath(path, 90)}
              </span>
              <div className="file-tags">
                <span className="chip">{analysis.typeLabel}</span>
                <span className="chip">{formatBytes(probe.size)}</span>
                {analysis.typeDetail && <span className="file-detail">{analysis.typeDetail}</span>}
              </div>
              {extraDetails.length > 0 && (
                <span className="file-detail">{extraDetails.join(' · ')}</span>
              )}
            </div>
            <button className="btn btn-sm" onClick={chooseFile}>
              Change
            </button>
          </section>

          {analysis.warning && (
            <div className={`banner ${analysis.unsupported ? 'banner-warn' : 'banner-info'} compact`}>
              <Icon name={analysis.unsupported ? 'alert' : 'info'} />
              <div>{analysis.warning}</div>
            </div>
          )}

          {analysis.recommendations.length > 0 && (
            <section className="recommendations">
              <h2 className="section-title">Recommended for this file</h2>
              <div className="rec-grid">
                {analysis.recommendations.map((recommendation) => (
                  <button
                    key={recommendation.command}
                    type="button"
                    className={`rec-card ${recommendation.primary ? 'primary' : ''}`}
                    onClick={() => openRecommendation(recommendation.command, recommendation.prefill)}
                  >
                    <span className="rec-icon">
                      <Icon name={COMMAND_ICONS[recommendation.command]} size={20} />
                    </span>
                    <span className="rec-body">
                      <span className="rec-title">
                        {recommendation.title}
                        {recommendation.primary && <span className="rec-badge">Recommended</span>}
                      </span>
                      <span className="rec-desc">{recommendation.description}</span>
                    </span>
                    <Icon name="arrow-right" size={16} className="rec-arrow" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {analysis.recommendations.length === 0 && !analysis.warning && (
            <div className="banner banner-warn compact">
              <Icon name="alert" />
              <div>No operation can be recommended for this file.</div>
            </div>
          )}

          <p className="footnote">
            Recommendations are based on the file contents and chdman metadata. Every operation
            still opens in its normal form, where you can review options and the generated command
            before running it.
          </p>
        </>
      )}

      {!path && !loading && (
        <>
          <section className="home-tips card">
            <h2 className="section-title">What can I open?</h2>
            <div className="home-formats">
              {[
                ['CHD', 'Inspect, verify or extract to cue/bin, ISO, raw or AVI'],
                ['CUE / GDI', 'Compress a CD or Dreamcast image into a CHD'],
                ['ISO', 'Create a DVD or CD CHD from an ISO image'],
                ['BIN / IMG', 'Raw or hard-disk images, with companion cue sheets detected'],
                ['AVI', 'Compress LaserDisc captures into a CHD'],
              ].map(([label, description]) => (
                <div className="home-format" key={label}>
                  <span className="home-format-label">{label}</span>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="home-quick">
            <span className="home-quick-label">Jump straight to a tool:</span>
            {(['createcd', 'createdvd', 'extractcd', 'info'] as CommandId[]).map((id) => (
              <button key={id} className="chip-btn" onClick={() => onNavigate(id)}>
                {COMMAND_ICONS[id] && <Icon name={COMMAND_ICONS[id]} size={13} />}
                {id === 'createcd'
                  ? 'CD → CHD'
                  : id === 'createdvd'
                    ? 'DVD → CHD'
                    : id === 'extractcd'
                      ? 'CHD → CD'
                      : 'Inspect CHD'}
              </button>
            ))}
            <button
              className="chip-btn"
              onClick={() => onNavigate('verify')}
            >
              <Icon name="shield" size={13} />
              Verify CHD
            </button>
          </section>
        </>
      )}
    </div>
  );
}

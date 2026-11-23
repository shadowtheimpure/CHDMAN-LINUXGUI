import { useCallback, useEffect, useMemo, useState } from 'react';
import { COMMANDS_BY_ID } from './lib/commands';
import type { AppInfo, AppSettings, ChdmanDetection, Job } from './lib/types';
import { useQueue } from './hooks/useQueue';
import { Sidebar, type Route } from './components/Sidebar';
import { HomePage } from './components/HomePage';
import { CommandPage } from './components/CommandPage';
import { QueuePanel } from './components/QueuePanel';
import { JobDialog } from './components/JobDialog';
import { SettingsPage } from './components/SettingsPage';
import { TemplatesPage } from './components/TemplatesPage';
import { Icon } from './components/Icon';

interface DialogState {
  jobId: string;
  tab: 'output' | 'summary';
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [detection, setDetection] = useState<ChdmanDetection | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [route, setRoute] = useState<Route>({ kind: 'home' });
  const [homeFile, setHomeFile] = useState<string | null>(null);
  const [homeKey, setHomeKey] = useState(0);
  const [queueVisible, setQueueVisible] = useState(true);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  /* ------------------------------------------------------------------ */
  /* Bootstrap                                                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let canceled = false;
    (async () => {
      const [loadedSettings, detected, info] = await Promise.all([
        window.api.getSettings(),
        window.api.detect(),
        window.api.appInfo(),
      ]);
      if (canceled) return;
      setSettings(loadedSettings);
      setDetection(detected);
      setAppInfo(info);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    let canceled = false;
    window.api
      .takeOpenFile()
      .then((filePath) => {
        if (canceled || !filePath) return;
        setHomeFile(filePath);
        setHomeKey((value) => value + 1);
        setRoute({ kind: 'home' });
      })
      .catch(() => {});
    const unsubscribe = window.api.onOpenFile((filePath) => {
      setHomeFile(filePath);
      setHomeKey((value) => value + 1);
      setRoute({ kind: 'home' });
    });
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, []);

  const resolvedTheme = settings?.theme === 'system' || !settings
    ? systemDark
      ? 'dark'
      : 'light'
    : settings.theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ------------------------------------------------------------------ */
  /* Settings updates                                                   */
  /* ------------------------------------------------------------------ */

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    const next = await window.api.setSettings(patch);
    setSettings(next);
  }, []);

  const redetect = useCallback(async () => {
    const result = await window.api.detect();
    setDetection(result);
  }, []);

  const chooseBinary = useCallback(async () => {
    const result = await window.api.chooseChdmanBinary();
    if (result) {
      setDetection(result);
      setSettings((prev) => (prev ? { ...prev, chdmanPath: result.path || '' } : prev));
      setToast(result.found ? `Using chdman ${result.version}` : 'That binary could not be used');
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Queue                                                              */
  /* ------------------------------------------------------------------ */

  const handleSuccess = useCallback(
    (job: Job) => {
      if (settings?.revealOnFinish && job.outputs[0]) {
        void window.api.reveal(job.outputs[0]);
      }
    },
    [settings?.revealOnFinish],
  );

  const queue = useQueue(settings?.concurrency ?? 1, handleSuccess);

  const openLog = useCallback((job: Job, tab: 'output' | 'summary') => {
    setDialog({ jobId: job.id, tab });
  }, []);

  const dialogJob = useMemo(
    () => (dialog ? queue.jobs.find((job) => job.id === dialog.jobId) ?? null : null),
    [dialog, queue.jobs],
  );

  useEffect(() => {
    if (dialog && !dialogJob) setDialog(null);
  }, [dialog, dialogJob]);

  const revealJob = useCallback((job: Job) => {
    const target = job.outputs[0];
    if (target) void window.api.reveal(target);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  if (!settings) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">CHD</div>
        <span className="spinner" />
        <p>Starting CHDMAN GUI…</p>
      </div>
    );
  }

  const activeCommand = route.kind === 'command' ? COMMANDS_BY_ID[route.id] : null;

  return (
    <div className="app">
      <Sidebar
        route={route}
        detection={detection}
        runningCount={queue.runningCount}
        queuedCount={queue.queuedCount}
        queueVisible={queueVisible}
        onNavigate={setRoute}
        onToggleQueue={() => setQueueVisible((prev) => !prev)}
      />

      <main className="main">
        {route.kind === 'home' && (
          <HomePage
            key={homeKey}
            detection={detection}
            initialPath={homeFile}
            onNavigate={(id, prefill) => setRoute({ kind: 'command', id, prefill })}
            onOpenSettings={() => setRoute({ kind: 'settings' })}
          />
        )}

        {route.kind === 'command' && activeCommand && (
          <CommandPage
            key={`${activeCommand.id}:${JSON.stringify(route.prefill ?? {})}`}
            command={activeCommand}
            detection={detection}
            prefill={route.prefill}
            lastInputDir={settings.lastInputDir}
            onQueue={(job, front) => queue.addJob(job, front)}
            onToast={setToast}
            onOpenSettings={() => setRoute({ kind: 'settings' })}
            onSwitchCommand={(id, prefill) => setRoute({ kind: 'command', id, prefill })}
          />
        )}

        {route.kind === 'settings' && (
          <SettingsPage
            settings={settings}
            detection={detection}
            appInfo={appInfo}
            onSettingsChange={updateSettings}
            onChooseBinary={chooseBinary}
            onDetect={redetect}
            onToast={setToast}
          />
        )}

        {route.kind === 'templates' && (
          <TemplatesPage
            onUseTemplate={(id) =>
              setRoute({ kind: 'command', id: 'createhd', prefill: { template: id } })
            }
          />
        )}
      </main>

      {queueVisible && (
        <QueuePanel
          jobs={queue.jobs}
          runningCount={queue.runningCount}
          queuedCount={queue.queuedCount}
          finishedCount={queue.finishedCount}
          concurrency={settings.concurrency}
          onCancel={queue.cancelJob}
          onRemove={queue.removeJob}
          onRetry={queue.retryJob}
          onClearFinished={queue.clearFinished}
          onShowLog={openLog}
          onReveal={revealJob}
        />
      )}

      {!queueVisible && (
        <button className="queue-fab" onClick={() => setQueueVisible(true)}>
          <Icon name="queue" size={16} />
          Queue
          {(queue.runningCount > 0 || queue.queuedCount > 0) && (
            <span className="pill">
              {queue.runningCount > 0 ? `${queue.runningCount} running` : `${queue.queuedCount} waiting`}
            </span>
          )}
        </button>
      )}

      {dialog && dialogJob && (
        <JobDialog
          job={dialogJob}
          initialTab={dialog.tab}
          onClose={() => setDialog(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

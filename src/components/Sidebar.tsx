import { CATEGORY_LABELS, COMMANDS, type Category, type CommandId } from '../lib/commands';
import type { ChdmanDetection } from '../lib/types';
import { Icon, type IconName } from './Icon';

export type Route =
  | { kind: 'command'; id: CommandId; prefill?: Record<string, string> }
  | { kind: 'settings' }
  | { kind: 'templates' }
  | { kind: 'about' };

const COMMAND_ICONS: Record<CommandId, IconName> = {
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

interface SidebarProps {
  route: Route;
  detection: ChdmanDetection | null;
  runningCount: number;
  queuedCount: number;
  queueVisible: boolean;
  onNavigate: (route: Route) => void;
  onToggleQueue: () => void;
}

const CATEGORIES: Category[] = ['create', 'extract', 'inspect', 'manage'];

export function Sidebar({
  route,
  detection,
  runningCount,
  queuedCount,
  queueVisible,
  onNavigate,
  onToggleQueue,
}: SidebarProps) {
  const isActive = (id: CommandId) =>
    route.kind === 'command' && route.id === id && id !== 'listtemplates';

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">CHD</div>
        <div className="brand-text">
          <strong>CHDMAN</strong>
          <span>GUI for Linux</span>
        </div>
      </div>

      <nav className="nav">
        {CATEGORIES.map((category) => (
          <div className="nav-group" key={category}>
            <span className="nav-group-title">{CATEGORY_LABELS[category]}</span>
            {COMMANDS.filter((command) => command.category === category).map((command) =>
              command.id === 'listtemplates' ? (
                <button
                  key={command.id}
                  className={`nav-item ${route.kind === 'templates' ? 'active' : ''}`}
                  onClick={() => onNavigate({ kind: 'templates' })}
                  title="Built-in hard disk geometries"
                >
                  <Icon name="list" size={16} />
                  <span>HDD templates</span>
                </button>
              ) : (
                <button
                  key={command.id}
                  className={`nav-item ${isActive(command.id) ? 'active' : ''}`}
                  onClick={() => onNavigate({ kind: 'command', id: command.id })}
                  title={command.summary}
                >
                  <Icon name={COMMAND_ICONS[command.id]} size={16} />
                  <span>{command.title}</span>
                </button>
              ),
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className={`nav-item queue-toggle ${queueVisible ? 'on' : ''}`}
          onClick={onToggleQueue}
        >
          <Icon name="queue" size={16} />
          <span>Queue</span>
          {(runningCount > 0 || queuedCount > 0) && (
            <span className="pill">
              {runningCount > 0 ? `${runningCount} running` : `${queuedCount} waiting`}
            </span>
          )}
        </button>
        <button
          className={`nav-item ${route.kind === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate({ kind: 'settings' })}
        >
          <Icon name="settings" size={16} />
          <span>Settings</span>
        </button>

        <div className={`engine ${detection?.found ? 'ok' : 'err'}`}>
          <span className="engine-dot" />
          <div className="engine-text">
            <strong>
              {detection?.found ? `chdman ${detection.version}` : 'chdman not found'}
            </strong>
            <span>
              {detection?.found
                ? detection.bundled
                  ? 'Bundled binary'
                  : detection.source === 'system'
                    ? 'System binary'
                    : 'Custom binary'
                : 'Open Settings'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { parseTemplates, type TemplateRow } from '../lib/info';
import { Icon } from './Icon';

interface TemplatesPageProps {
  onUseTemplate: (id: string) => void;
}

export function TemplatesPage({ onUseTemplate }: TemplatesPageProps) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let canceled = false;
    window.api
      .runSync({ command: 'listtemplates', args: [] })
      .then((result) => {
        if (canceled) return;
        if (!result.ok && !result.stdout) {
          setError(result.stderr.trim() || 'listtemplates failed');
          setRows([]);
          return;
        }
        setRows(parseTemplates(result.stdout));
      })
      .catch((err: unknown) => {
        if (!canceled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.id, row.manufacturer, row.model, row.totalSize].join(' ').toLowerCase().includes(needle),
    );
  }, [rows, query]);

  return (
    <div className="page templates-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <span>Manage</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">HDD templates</span>
          </div>
          <h1>Hard disk templates</h1>
          <p className="page-summary">
            Built-in geometries accepted by <code>chdman createhd --template</code>.
          </p>
        </div>
        <div className="page-header-side">
          <span className="chip">{filtered.length} templates</span>
        </div>
      </header>

      <div className="card table-card">
        <div className="table-toolbar">
          <div className="search-wrap">
            <Icon name="search" size={15} />
            <input
              className="text-input search"
              placeholder="Search manufacturer, model or size…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
            />
          </div>
        </div>

        {loading ? (
          <div className="table-loading">
            <span className="spinner" /> Reading templates from chdman…
          </div>
        ) : error ? (
          <div className="banner banner-warn compact">
            <Icon name="alert" />
            <div>{error}</div>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="num">ID</th>
                  <th>Manufacturer</th>
                  <th>Model</th>
                  <th className="num">Geometry</th>
                  <th className="num">Total size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    title={`${row.cylinders} cylinders × ${row.heads} heads × ${row.sectors} sectors · ${row.sectorSize} B sectors`}
                  >
                    <td className="num mono">{row.id}</td>
                    <td>{row.manufacturer}</td>
                    <td>{row.model}</td>
                    <td className="num mono">
                      {row.cylinders}×{row.heads}×{row.sectors}
                    </td>
                    <td className="num mono">{row.totalSize}</td>
                    <td className="num">
                      <button className="link-btn" onClick={() => onUseTemplate(row.id)}>
                        Use <Icon name="chevron" size={12} className="rotate-270" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="table-empty">No templates match “{query}”.</p>}
          </div>
        )}
      </div>

      <p className="footnote">
        Selecting a template opens <strong>Create CHD → Hard disk</strong> with the template ID
        filled in. Leave the disk image empty to create an empty drive.
      </p>
    </div>
  );
}

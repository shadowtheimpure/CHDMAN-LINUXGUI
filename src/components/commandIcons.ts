import type { CommandId } from '../lib/commands';
import type { IconName } from './Icon';

/** Icon used for each chdman command across the sidebar, queue and start page. */
export const COMMAND_ICONS: Record<CommandId, IconName> = {
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

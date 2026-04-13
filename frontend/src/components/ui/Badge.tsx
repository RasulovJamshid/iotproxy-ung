import React from 'react';
import { clsx } from 'clsx';

// dot color + text color + bg color per status
const variants: Record<string, { dot: string; text: string; bg: string }> = {
  // commissioning
  DISCOVERY:   { dot: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
  REVIEW:      { dot: 'bg-yellow-400', text: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30' },
  ACTIVE:      { dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/30'  },
  SUSPENDED:   { dot: 'bg-slate-400',  text: 'text-slate-600 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800/50' },
  // connectivity
  ONLINE:      { dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/30'  },
  OFFLINE:     { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/30'    },
  UNKNOWN:     { dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800/50' },
  // sensor status
  MAINTENANCE: { dot: 'bg-orange-400', text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30' },
  DISABLED:    { dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800/50' },
  CALIBRATING: { dot: 'bg-blue-400',   text: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/30'   },
  // severity
  INFO:        { dot: 'bg-blue-400',   text: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/30'   },
  WARNING:     { dot: 'bg-yellow-400', text: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30' },
  CRITICAL:    { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/30'    },
  // alert state
  FIRING:      { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/30'    },
  RESOLVED:    { dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/30'  },
  // export
  PENDING:     { dot: 'bg-slate-400',  text: 'text-slate-600 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800/50' },
  RUNNING:     { dot: 'bg-blue-400',   text: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/30'   },
  COMPLETED:   { dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/30'  },
  FAILED:      { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/30'    },
};

const DISPLAY: Record<string, string> = {
  DISCOVERY:   'Discovery',
  REVIEW:      'Review',
  ACTIVE:      'Active',
  SUSPENDED:   'Suspended',
  ONLINE:      'Online',
  OFFLINE:     'Offline',
  UNKNOWN:     'Unknown',
  MAINTENANCE: 'Maintenance',
  DISABLED:    'Disabled',
  CALIBRATING: 'Calibrating',
  INFO:        'Info',
  WARNING:     'Warning',
  CRITICAL:    'Critical',
  FIRING:      'Firing',
  RESOLVED:    'Resolved',
  PENDING:     'Pending',
  RUNNING:     'Running',
  COMPLETED:   'Completed',
  FAILED:      'Failed',
  TRUE:        'Enabled',
  FALSE:       'Disabled',
};

interface Props {
  value: string | boolean;
  label?: string;
}

export function Badge({ value, label }: Props) {
  const key = String(value).toUpperCase();
  const v = variants[key] ?? { dot: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/50' };
  const displayLabel = label ?? DISPLAY[key] ?? String(value);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', v.bg, v.text)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', v.dot)} />
      {displayLabel}
    </span>
  );
}

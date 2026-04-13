import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SitesPage from './pages/SitesPage';
import SiteDetailPage from './pages/SiteDetailPage';
import SensorsPage from './pages/SensorsPage';
import SensorDetailPage from './pages/SensorDetailPage';
import AlertsPage from './pages/AlertsPage';
import ExportPage from './pages/ExportPage';
import { AdaptersPage } from './pages/AdaptersPage';
import ApiKeysPage from './pages/ApiKeysPage';
import WebhooksPage from './pages/WebhooksPage';
import SettingsPage from './pages/SettingsPage';
import HealthPage from './pages/HealthPage';
import UsersPage from './pages/UsersPage';
import OrganizationsPage from './pages/OrganizationsPage';
import ServerErrorPage from './pages/ServerErrorPage';
import NotFoundPage from './pages/NotFoundPage';

const SERVER_ERROR_EVENT = 'iotproxy:server-error';
const SERVER_RECOVERED_EVENT = 'iotproxy:server-recovered';

type ServerErrorState = {
  status?: number;
  message?: string;
} | null;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,           // axios interceptor handles retries/refresh — don't double-retry
      refetchOnWindowFocus: false, // prevents ghost refetches when switching browser tabs
    },
    mutations: {
      retry: false,
    },
  },
});

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, ...p }: { d: string; [k: string]: unknown }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5 flex-shrink-0" {...(p as any)}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Icons = {
  Dashboard: () => <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  Sites:     () => <Icon d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />,
  Sensors:   () => <Icon d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />,
  Alerts:    () => <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
  Export:    () => <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
  Adapters:  () => <Icon d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  Keys:      () => <Icon d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />,
  Webhooks:  () => <Icon d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
  Settings:  () => <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
  Health:    () => <Icon d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />,
  Users:     () => <Icon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
  Orgs:      () => <Icon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
  Activity:  () => <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  Logout:    () => <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />,
  Menu:      () => <Icon d="M4 6h16M4 12h16M4 18h16" />,
  X:         () => <Icon d="M6 18L18 6M6 6l12 12" />,
  Sun:       () => <Icon d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />,
  Moon:      () => <Icon d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />,
  Monitor:   () => <Icon d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
};

type NavItem = { to: string; label: string; Icon: () => JSX.Element; exact?: boolean; roles?: string[] };
type NavGroup = { heading: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    heading: 'Main',
    items: [
      { to: '/',        label: 'Dashboard', Icon: Icons.Dashboard, exact: true },
    ],
  },
  {
    heading: 'Monitoring',
    items: [
      { to: '/sites',   label: 'Sites',     Icon: Icons.Sites },
      { to: '/sensors', label: 'Sensors',   Icon: Icons.Sensors },
      { to: '/alerts',  label: 'Alerts',    Icon: Icons.Alerts },
    ],
  },
  {
    heading: 'Data',
    items: [
      { to: '/export',    label: 'Export',    Icon: Icons.Export },
      { to: '/adapters',  label: 'Adapters',  Icon: Icons.Adapters },
      { to: '/api-keys',  label: 'API Keys',  Icon: Icons.Keys },
      { to: '/webhooks',  label: 'Webhooks',  Icon: Icons.Webhooks },
    ],
  },
  {
    heading: 'System',
    items: [
      { to: '/organizations', label: 'Organizations', Icon: Icons.Orgs, roles: ['SYSTEM_ADMIN'] },
      { to: '/users',    label: 'Users',    Icon: Icons.Users },
      { to: '/settings', label: 'Settings', Icon: Icons.Settings },
      { to: '/health',   label: 'Health',   Icon: Icons.Health },
    ],
  },
];

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, logout, orgs, switchOrg } = useAuth();
  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => !item.roles || item.roles.includes(user?.role ?? '')) }))
    .filter((g) => g.items.length > 0);
  
  return (
    <>
      <div 
        className={`fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      <aside className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-shrink-0 flex-col border-r border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-slate-900 dark:via-slate-950 dark:to-black text-slate-900 dark:text-slate-100 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)] dark:shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] border border-blue-600/20 dark:border-white/10 text-white">
              <Icons.Activity />
            </span>
            <span className="text-[15px] font-bold tracking-wide bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">IoT Proxy</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 lg:hidden focus:outline-none">
            <Icons.X />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-5 custom-scroll">
          {visibleGroups.map((group) => (
            <div key={group.heading}>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500/80">
                {group.heading}
              </p>
              <div className="space-y-1">
                {group.items.map(({ to, label, Icon, exact }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={exact}
                    onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all duration-200 overflow-hidden ${
                        isActive
                          ? 'text-blue-700 bg-blue-50/60 dark:bg-transparent dark:text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)]'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-indigo-50 dark:from-blue-600/20 dark:to-indigo-600/10 border border-blue-200/50 dark:border-white/5 rounded-xl pointer-events-none" />
                        )}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -mt-2.5 h-5 w-1 rounded-r-full bg-blue-600 dark:bg-blue-500" />
                        )}
                        <span className={`relative z-10 flex-shrink-0 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
                          <Icon />
                        </span>
                        <span className="relative z-10">{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] px-4 py-4 space-y-1">
          {/* Org switcher — only shown when user has multiple orgs */}
          {orgs.length > 1 && (
            <div className="mb-2">
              <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Organization</p>
              <select
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={user?.organizationId ?? ''}
                onChange={(e) => switchOrg(e.target.value)}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
          {orgs.length === 1 && (
            <div className="px-2 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Organization</p>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5 truncate">{orgs[0]?.name}</p>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 border border-slate-300 dark:border-white/10 text-xs font-bold uppercase flex-shrink-0 shadow-inner text-slate-700 dark:text-slate-300">
              {user?.email?.[0] ?? '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{user?.email}</p>
              <p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase mt-0.5">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-start gap-3 rounded-xl px-2.5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
          >
            <span className="flex-shrink-0"><Icons.Logout /></span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Theme Toggle ─────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  return (
    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700">
      <button
        onClick={() => setTheme('light')}
        className={`p-1.5 rounded-full transition-colors ${theme === 'light' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        title="Light Mode"
      >
        <Icons.Sun />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`p-1.5 rounded-full transition-colors ${theme === 'system' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        title="System Theme"
      >
        <Icons.Monitor />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`p-1.5 rounded-full transition-colors ${theme === 'dark' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        title="Dark Mode"
      >
        <Icons.Moon />
      </button>
    </div>
  );
}

// ── Page titles ───────────────────────────────────────────────────────────────
const pageTitles: Record<string, string> = {
  '/':         'Dashboard',
  '/sites':    'Sites',
  '/sensors':  'Sensors',
  '/alerts':   'Alerts',
  '/export':   'Export',
  '/api-keys': 'API Keys',
  '/webhooks': 'Webhooks',
  '/organizations': 'Organizations',
  '/users':    'Users',
  '/settings': 'Settings',
  '/health':   'Health',
};

function AppShell({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const title =
    Object.entries(pageTitles)
      .reverse()
      .find(([k]) => location.pathname === k || (k !== '/' && location.pathname.startsWith(k)))?.[1]
    ?? 'IoT Proxy';

  const now = new Date();
  const topMeta = `${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="flex h-[100dvh] bg-transparent overflow-hidden">
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden relative">
        <header className="relative z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 px-4 sm:px-8 backdrop-blur-xl supports-[backdrop-filter]:bg-white/40 dark:supports-[backdrop-filter]:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1 -ml-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 lg:hidden focus:outline-none"
            >
              <Icons.Menu />
            </button>
            <div>
              <p className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-0.5">Operations</p>
              <h1 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="hidden rounded-full border border-slate-200/80 dark:border-slate-700/80 bg-white/50 dark:bg-slate-800/50 px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-sm xl:block backdrop-blur-md">{topMeta}</p>
            <ThemeToggle />
          </div>
        </header>
        <main className="page-enter flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const [serverError, setServerError] = useState<ServerErrorState>(null);
  const recoveryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onServerError = (event: Event) => {
      const customEvent = event as CustomEvent<{ status?: number; message?: string }>;
      setServerError(customEvent.detail ?? { message: 'Unable to reach backend service.' });
    };

    const onServerRecovered = () => {
      setServerError(null);
    };

    window.addEventListener(SERVER_ERROR_EVENT, onServerError as EventListener);
    window.addEventListener(SERVER_RECOVERED_EVENT, onServerRecovered);

    return () => {
      window.removeEventListener(SERVER_ERROR_EVENT, onServerError as EventListener);
      window.removeEventListener(SERVER_RECOVERED_EVENT, onServerRecovered);
    };
  }, []);

  useEffect(() => {
    if (!serverError) {
      if (recoveryIntervalRef.current !== null) {
        clearInterval(recoveryIntervalRef.current);
        recoveryIntervalRef.current = null;
      }
      return;
    }

    const ping = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch('/api/v1/health', { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          setServerError(null);
          queryClient.invalidateQueries();
        }
      } catch {
        // still unreachable, keep polling
      }
    };

    recoveryIntervalRef.current = setInterval(ping, 5_000);
    return () => {
      if (recoveryIntervalRef.current !== null) {
        clearInterval(recoveryIntervalRef.current);
        recoveryIntervalRef.current = null;
      }
    };
  }, [serverError]);

  const handleRetryServer = () => {
    setServerError(null);
    queryClient.invalidateQueries();
  };

  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route
                  path="/login"
                  element={serverError ? <ServerErrorPage {...serverError} onRetry={handleRetryServer} /> : <LoginPage />}
                />
                <Route path="/404" element={<NotFoundPage />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <AppShell>
                        {serverError ? (
                          <ServerErrorPage {...serverError} onRetry={handleRetryServer} />
                        ) : (
                          <Routes>
                            <Route path="/"              element={<DashboardPage />} />
                            <Route path="/sites"         element={<SitesPage />} />
                            <Route path="/sites/:id"     element={<SiteDetailPage />} />
                            <Route path="/sensors"       element={<SensorsPage />} />
                            <Route path="/sensors/:id"   element={<SensorDetailPage />} />
                            <Route path="/alerts"        element={<AlertsPage />} />
                            <Route path="/export"        element={<ExportPage />} />
                            <Route path="/adapters"      element={<AdaptersPage />} />
                            <Route path="/api-keys"      element={<ApiKeysPage />} />
                            <Route path="/webhooks"      element={<WebhooksPage />} />
                            <Route path="/organizations" element={<OrganizationsPage />} />
                            <Route path="/users"         element={<UsersPage />} />
                            <Route path="/settings"      element={<SettingsPage />} />
                            <Route path="/health"        element={<HealthPage />} />
                            <Route path="*"              element={<NotFoundPage />} />
                          </Routes>
                        )}
                      </AppShell>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </ThemeProvider>
  );
}

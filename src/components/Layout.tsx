import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Layers, Search, Settings } from 'lucide-react';

const NAV = [
  { path: '/', label: 'Folders', icon: Layers },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/settings', label: 'Settings', icon: Settings },
];

// Deliberately the same dark admin look as the Vibz Admin app: it must be obvious this is
// internal tooling, not the user-facing app.
export function Layout() {
  const { pathname } = useLocation();
  // "Folders" also covers the folder and job pages that live under it.
  const isBatchArea = pathname === '/' || pathname.startsWith('/folders') || pathname.startsWith('/jobs');

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="fixed inset-y-0 left-0 w-64 bg-gray-800">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-pink-500">Music Factory</h1>
          <p className="text-xs text-gray-500 mt-1">Vibz admin tool</p>
        </div>
        <nav className="mt-6">
          {NAV.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm font-medium ${
                  (path === '/' ? isBatchArea : isActive) ? 'bg-pink-500/20 text-pink-500' : 'hover:bg-gray-700'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="ml-64 p-8">
        <Outlet />
      </div>
    </div>
  );
}

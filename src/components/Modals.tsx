import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { loginUrl } from '../lib/auth';

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <Loader2 size={40} className="animate-spin text-pink-500" />
    </div>
  );
}

// Shown when there is no Vibz session. No login form here: logging in only happens on the
// standard Vibz login page, which sets the shared cookie.
export function LoginModal() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" className="max-w-md w-full bg-gray-800 rounded-lg shadow-xl p-8 text-center border border-gray-700">
        <div className="mx-auto mb-6 w-16 h-16 bg-pink-500/10 rounded-full flex items-center justify-center">
          <LogIn size={32} className="text-pink-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">Log in to Vibz</h1>
        <p className="text-gray-300 mb-6 leading-relaxed">
          Log in to Vibz using the standard login page, then come back here.
        </p>
        <a
          href={loginUrl()}
          className="inline-block bg-pink-500 text-white px-6 py-3 rounded-lg hover:bg-pink-600 transition-colors font-medium"
        >
          Go to login
        </a>
        <p className="text-gray-500 text-sm mt-6">
          Already logged in?{' '}
          <button onClick={() => window.location.reload()} className="underline hover:text-gray-300">
            Reload this page
          </button>
        </p>
      </div>
    </div>
  );
}

export function NoAccessScreen() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-xl p-8 text-center border border-gray-700">
        <div className="mx-auto mb-6 w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-red-500 mb-4">No access</h1>
        <p className="text-gray-300 mb-6 leading-relaxed">
          You are logged in, but you don&apos;t have access to the Music Factory.
          Ask someone with Permissions access in the Vibz Admin app to grant you the
          &ldquo;Music Factory&rdquo; section.
        </p>
        <a
          href="https://love.vibz.world"
          className="inline-block bg-pink-500 text-white px-6 py-3 rounded-lg hover:bg-pink-600 transition-colors font-medium"
        >
          Return to Vibz
        </a>
      </div>
    </div>
  );
}

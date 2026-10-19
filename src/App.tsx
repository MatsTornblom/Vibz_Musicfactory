import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Placeholder } from './components/Placeholder';
import { LoadingScreen, LoginModal, NoAccessScreen } from './components/Modals';
import { resolveAccess, type AccessState } from './lib/auth';
import { supabase } from './lib/supabase';

export default function App() {
  const [access, setAccess] = useState<AccessState>('loading');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const result = await resolveAccess();
      if (!cancelled) setAccess(result);
    };
    check();

    // Logged out (or in) elsewhere on .vibz.world → re-evaluate.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') check();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (access === 'loading') return <LoadingScreen />;
  if (access === 'logged-out') return <LoginModal />;
  if (access === 'no-access') return <NoAccessScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={<Placeholder title="Batches" description="Create batches of song briefs, generate Suno prompts with AI and track each job." comingIn="the next iteration" />}
          />
          <Route
            path="/search"
            element={<Placeholder title="Search" description="Search across briefs, titles, lyrics and style tags, including songs you discarded." comingIn="a later iteration" />}
          />
          <Route
            path="/settings"
            element={<Placeholder title="Settings" description="Edit the prompt-creator prompt and choose the AI model." comingIn="the next iteration" />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

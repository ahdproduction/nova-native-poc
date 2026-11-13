// A stand-in for an existing React application that consumes Nova.
// ?mode=control  the host alone
// ?mode=direct   the Exact web build mounted into a div of this page
// ?mode=iframe   the Exact web build in an iframe
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const mode = new URLSearchParams(location.search).get('mode') ?? 'control';

function ExactDirect() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/style.css';
    document.head.append(link);
    const entry = '/app.js';
    import(/* webpackIgnore: true */ entry).catch(error => {
      (window as any).__exactImportError = String(error);
    });
  }, []);
  return <div id="exact-root" style={{ position: 'relative', width: 520, height: 520, outline: '2px dashed #999' }} />;
}

function App() {
  const [count, setCount] = useState(0);
  return (
    <div className="host">
      <h2 id="host-title">Existing React app ({mode})</h2>
      <div className="host-bar">
        <input id="host-input" className="host-input" placeholder="Host search" />
        <button id="host-button" className="host-button" onClick={() => setCount(c => c + 1)}>
          Host button {count}
        </button>
      </div>
      {mode === 'direct' && <ExactDirect />}
      {mode === 'iframe' && (
        <iframe id="exact-frame" title="Exact" src="/" style={{ width: 520, height: 520, border: '2px dashed #999' }} />
      )}
    </div>
  );
}

createRoot(document.getElementById('react-root')!).render(<App />);

import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => {
        // geometry fetched before the service worker took control is fetched again through it,
        // so everything already seen also works offline
        const recache = () => {
          const urls = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .filter((u) => u.includes('/data/geo/') || u.includes('/data/desc/'));
          urls.forEach((u) => fetch(u).catch(() => undefined));
        };
        if (navigator.serviceWorker.controller) return;
        navigator.serviceWorker.addEventListener('controllerchange', () => setTimeout(recache, 500), { once: true });
      })
      .catch(() => {
        /* offline support is optional */
      });
  });
}

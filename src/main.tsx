import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}

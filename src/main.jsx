import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { cleanupExpiredRooms } from './hooks/useRoom';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Housekeeping after first paint: delete a few long-idle rooms (rate limited per device)
const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 3000));
scheduleIdle(() => {
  cleanupExpiredRooms();
});

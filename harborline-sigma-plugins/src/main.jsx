import './detect.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { client, SigmaClientProvider } from '@sigmacomputing/plugin';
import App from './App.jsx';
import './brand.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SigmaClientProvider client={client}>
      <App />
    </SigmaClientProvider>
  </React.StrictMode>,
);

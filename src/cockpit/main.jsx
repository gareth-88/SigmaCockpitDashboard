import '../detect.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { client, SigmaClientProvider } from '@sigmacomputing/plugin';
import Cockpit from './Cockpit.jsx';
import '../brand.css';
import './cockpit.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SigmaClientProvider client={client}>
      <Cockpit />
    </SigmaClientProvider>
  </React.StrictMode>,
);

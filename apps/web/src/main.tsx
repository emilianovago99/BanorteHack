import React from 'react';
import { createRoot } from 'react-dom/client';
import { FinancialWorkspace } from './FinancialWorkspace';
import { SessionProvider } from './session';
import './workspace.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><SessionProvider><FinancialWorkspace /></SessionProvider></React.StrictMode>);

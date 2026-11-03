import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './site/App';
import './site/site.css';
import './site/themes/themes.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

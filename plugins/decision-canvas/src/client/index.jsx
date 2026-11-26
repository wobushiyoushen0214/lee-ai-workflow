import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.jsx';
import { createApi } from './api.js';
import {applyTheme,readTheme} from './theme.js';
import { zh } from './i18n.js';
import '@xyflow/react/dist/style.css';
import './style.css';
import './standalone.css';

applyTheme(readTheme());
const api = createApi();
const t = key => zh[key] || key;
createRoot(document.getElementById('root')).render(<App api={api} t={t}/>);

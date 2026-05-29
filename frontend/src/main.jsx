// gastubos/frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/ui.jsx'

// Tabler Icons webfont
const link = document.createElement('link')
link.rel = 'stylesheet'
link.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css'
document.head.appendChild(link)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <ToastProvider />
  </React.StrictMode>
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Comenta o elimina la línea de abajo si existe y notas que rompe estilos:
// import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

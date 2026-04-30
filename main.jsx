import React from 'react'
import ReactDOM from 'react-dom/client'
import App, {ErrorBoundary} from './App.jsx'
ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>)

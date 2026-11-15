import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DriveGate from './DriveGate.tsx'

// FullCalendar's theme switches to dark colors via a data-color-scheme attribute,
// so mirror the OS light/dark preference onto <html>.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const applyColorScheme = () => {
  document.documentElement.dataset.colorScheme = darkQuery.matches
    ? 'dark'
    : 'light'
}
applyColorScheme()
darkQuery.addEventListener('change', applyColorScheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DriveGate>
      <App />
    </DriveGate>
  </StrictMode>,
)

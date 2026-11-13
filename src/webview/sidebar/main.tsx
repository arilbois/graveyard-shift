import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarApp } from './SidebarApp';
import '../styles/tokens.css';
import './sidebar.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <SidebarApp />
    </StrictMode>,
  );
}

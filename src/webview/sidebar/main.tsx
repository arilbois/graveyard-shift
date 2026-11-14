import { StrictMode, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { connectVsCode, useBridge, type Bridge } from '../bridge';
import { SidebarApp } from './SidebarApp';
import '../styles/tokens.css';
import './sidebar.css';

function Root({ bridge }: { readonly bridge: Bridge }): JSX.Element {
  const viewModel = useBridge(bridge, 'sidebar');
  return <SidebarApp viewModel={viewModel} send={bridge.send} />;
}

const container = document.getElementById('root');
if (container) {
  const bridge = connectVsCode();
  createRoot(container).render(
    <StrictMode>
      <Root bridge={bridge} />
    </StrictMode>,
  );
}

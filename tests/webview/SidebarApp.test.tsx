import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SidebarApp } from '../../src/webview/sidebar/SidebarApp';

afterEach(cleanup);

describe('SidebarApp placeholder', () => {
  it('exposes a labelled main landmark with a heading', () => {
    render(<SidebarApp />);
    expect(screen.getByRole('heading', { level: 1, name: 'Graveyard Shift' })).toBeDefined();
    expect(screen.getByRole('main', { name: 'Graveyard Shift' })).toBeDefined();
  });
});

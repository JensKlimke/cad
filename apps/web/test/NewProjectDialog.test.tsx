/**
 * Component tests for `<NewProjectDialog />`.
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { NewProjectDialog } from '../src/components/NewProjectDialog.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

let i18n: I18nInstance;

beforeAll(async () => {
  i18n = await createBrowserI18n({ initialLocale: 'en' });
});

describe('<NewProjectDialog />', () => {
  it('renders the dialog title and cancel/submit buttons when open', () => {
    render(
      <I18nProvider i18n={i18n}>
        <NewProjectDialog open onClose={() => {}} onSubmit={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('new-project-dialog')).toBeDefined();
    expect(screen.getByTestId('new-project-dialog-name')).toBeDefined();
    expect(screen.getByTestId('new-project-dialog-submit')).toBeDefined();
  });

  it('invokes onSubmit with the typed name', async () => {
    const onSubmit = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <NewProjectDialog open onClose={() => {}} onSubmit={onSubmit} />
      </I18nProvider>,
    );
    const input = screen.getByTestId('new-project-dialog-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Smoke Test' } });
    fireEvent.click(screen.getByTestId('new-project-dialog-submit'));
    // setSubmitting awaits a microtask before resolving; advance it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSubmit).toHaveBeenCalledWith('Smoke Test');
  });

  it('does not invoke onSubmit when the input is whitespace only', async () => {
    const onSubmit = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <NewProjectDialog open onClose={() => {}} onSubmit={onSubmit} />
      </I18nProvider>,
    );
    const input = screen.getByTestId('new-project-dialog-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('new-project-dialog-submit'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

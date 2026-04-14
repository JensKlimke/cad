/**
 * Component tests for `<RenameProjectDialog />`.
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { RenameProjectDialog } from '../src/components/RenameProjectDialog.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

let i18n: I18nInstance;

beforeAll(async () => {
  i18n = await createBrowserI18n({ initialLocale: 'en' });
});

describe('<RenameProjectDialog />', () => {
  it('pre-fills the input with the current name', () => {
    render(
      <I18nProvider i18n={i18n}>
        <RenameProjectDialog open currentName="Smoke Test" onClose={() => {}} onSubmit={() => {}} />
      </I18nProvider>,
    );
    const input = screen.getByTestId('rename-project-dialog-name') as HTMLInputElement;
    expect(input.value).toBe('Smoke Test');
  });

  it('invokes onSubmit with the trimmed new name', async () => {
    const onSubmit = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <RenameProjectDialog open currentName="Original" onClose={() => {}} onSubmit={onSubmit} />
      </I18nProvider>,
    );
    const input = screen.getByTestId('rename-project-dialog-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Renamed  ' } });
    fireEvent.click(screen.getByTestId('rename-project-dialog-submit'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSubmit).toHaveBeenCalledWith('Renamed');
  });

  it('does not invoke onSubmit when the name is unchanged', async () => {
    const onSubmit = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <RenameProjectDialog open currentName="Same" onClose={() => {}} onSubmit={onSubmit} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('rename-project-dialog-submit'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

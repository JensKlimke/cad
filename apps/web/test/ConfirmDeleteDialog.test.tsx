/**
 * Component tests for `<ConfirmDeleteDialog />`.
 *
 * The submit button stays disabled until the typed name matches
 * the resource name exactly — the test verifies both the disabled
 * state and the matching-name happy path.
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ConfirmDeleteDialog } from '../src/components/ConfirmDeleteDialog.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

let i18n: I18nInstance;

beforeAll(async () => {
  i18n = await createBrowserI18n({ initialLocale: 'en' });
});

describe('<ConfirmDeleteDialog />', () => {
  it('disables the submit button until the typed name matches', () => {
    render(
      <I18nProvider i18n={i18n}>
        <ConfirmDeleteDialog
          open
          resourceName="Smoke Test"
          onClose={() => {}}
          onConfirm={() => {}}
        />
      </I18nProvider>,
    );
    const submit = screen.getByTestId('confirm-delete-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('enables the submit button when the name matches exactly', () => {
    render(
      <I18nProvider i18n={i18n}>
        <ConfirmDeleteDialog
          open
          resourceName="Smoke Test"
          onClose={() => {}}
          onConfirm={() => {}}
        />
      </I18nProvider>,
    );
    const input = screen.getByTestId('confirm-delete-dialog-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Smoke Test' } });
    const submit = screen.getByTestId('confirm-delete-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('invokes onConfirm only when the name matches', async () => {
    const onConfirm = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <ConfirmDeleteDialog
          open
          resourceName="Smoke Test"
          onClose={() => {}}
          onConfirm={onConfirm}
        />
      </I18nProvider>,
    );
    const input = screen.getByTestId('confirm-delete-dialog-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Smoke Test' } });
    fireEvent.click(screen.getByTestId('confirm-delete-dialog-submit'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

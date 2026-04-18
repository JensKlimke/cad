/**
 * "Type the name to confirm" delete dialog.
 *
 * Slice 1 uses this only for project deletion. The submit button
 * is disabled until the typed name matches the resource name
 * exactly — prevents one-click destructive actions.
 */

import { useT } from '@cad/i18n';
import { useEffect, useRef, useState } from 'react';

export interface ConfirmDeleteDialogProps {
  readonly open: boolean;
  readonly resourceName: string;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void> | void;
}

export function ConfirmDeleteDialog({
  open,
  resourceName,
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps): React.JSX.Element {
  const { t } = useT('projects');
  const ref = useRef<HTMLDialogElement | null>(null);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped('');
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleConfirm = async (): Promise<void> => {
    if (typed !== resourceName) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="workspace-dialog"
      onClose={onClose}
      data-testid="confirm-delete-dialog"
    >
      <div className="workspace-dialog__form">
        <div className="workspace-dialog__header">
          <p className="workspace-dialog__eyebrow workspace-dialog__eyebrow--danger">
            {t('delete_dialog.eyebrow')}
          </p>
          <h2 className="workspace-dialog__title">{t('delete_dialog.title')}</h2>
        </div>
        <p className="workspace-dialog__warning">{t('delete_dialog.warning')}</p>
        <label className="workspace-dialog__field">
          <span>{t('delete_dialog.confirm_label')}</span>
        <input
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={resourceName}
          data-testid="confirm-delete-dialog-input"
        />
        </label>
        <div className="workspace-dialog__actions">
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={onClose}
          >
            {t('dialog.cancel')}
        </button>
        <button
          type="button"
          className="workspace-button workspace-button--danger"
          disabled={typed !== resourceName || submitting}
          onClick={() => void handleConfirm()}
          data-testid="confirm-delete-dialog-submit"
        >
          {t('delete_dialog.submit')}
        </button>
        </div>
      </div>
    </dialog>
  );
}

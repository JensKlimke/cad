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

const DIALOG_STYLE: React.CSSProperties = {
  background: '#161922',
  color: '#e6e8ec',
  border: 'none',
  borderRadius: 8,
  padding: 24,
  minWidth: 320,
};

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
    <dialog ref={ref} style={DIALOG_STYLE} onClose={onClose} data-testid="confirm-delete-dialog">
      <h2 style={{ marginTop: 0 }}>{t('delete_dialog.title')}</h2>
      <p style={{ color: '#ff6b6b' }}>{t('delete_dialog.warning')}</p>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span>{t('delete_dialog.confirm_label')}</span>
        <input
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={resourceName}
          data-testid="confirm-delete-dialog-input"
        />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose}>
          {t('delete_dialog.title') /* placeholder cancel */}
        </button>
        <button
          type="button"
          disabled={typed !== resourceName || submitting}
          onClick={() => void handleConfirm()}
          data-testid="confirm-delete-dialog-submit"
        >
          {t('delete_dialog.submit')}
        </button>
      </div>
    </dialog>
  );
}

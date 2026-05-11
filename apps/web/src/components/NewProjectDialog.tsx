/**
 * Modal dialog for creating a new project.
 *
 * Slice 1 baseline — no design system, just a `<dialog>` element
 * with inline styles. Slice 11 will replace this with the real
 * dialog primitive when the design system lands.
 */

import { useT } from '@cad/i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export interface NewProjectDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => Promise<void> | void;
}

export function NewProjectDialog({
  open,
  onClose,
  onSubmit,
}: NewProjectDialogProps): React.JSX.Element {
  const { t } = useT('projects');
  const ref = useRef<HTMLDialogElement | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(name.trim());
      setName('');
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
      data-testid="new-project-dialog"
    >
      <form onSubmit={handleSubmit} method="dialog" className="workspace-dialog__form">
        <div className="workspace-dialog__header">
          <p className="workspace-dialog__eyebrow">{t('new_dialog.eyebrow')}</p>
          <h2 className="workspace-dialog__title">{t('new_dialog.title')}</h2>
        </div>
        <label className="workspace-dialog__field">
          <span>{t('new_dialog.name_label')}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('new_dialog.name_placeholder')}
            required
            data-testid="new-project-dialog-name"
          />
        </label>
        <div className="workspace-dialog__actions">
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={onClose}
            data-testid="new-project-dialog-cancel"
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="submit"
            className="workspace-button workspace-button--primary"
            disabled={submitting}
            data-testid="new-project-dialog-submit"
          >
            {t('new_dialog.submit')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * Modal dialog for renaming an existing project.
 *
 * Pre-fills the input with the current name. Same minimal styling
 * as `NewProjectDialog` — Slice 11 unifies them under the design
 * system.
 */

import { useT } from '@cad/i18n';
import { useEffect, useRef, useState } from 'react';

export interface RenameProjectDialogProps {
  readonly open: boolean;
  readonly currentName: string;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => Promise<void> | void;
}

const DIALOG_STYLE: React.CSSProperties = {
  background: '#161922',
  color: '#e6e8ec',
  border: 'none',
  borderRadius: 8,
  padding: 24,
  minWidth: 320,
};

export function RenameProjectDialog({
  open,
  currentName,
  onClose,
  onSubmit,
}: RenameProjectDialogProps): React.JSX.Element {
  const { t } = useT('projects');
  const ref = useRef<HTMLDialogElement | null>(null);
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (name.trim().length === 0 || name.trim() === currentName) return;
    setSubmitting(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog ref={ref} style={DIALOG_STYLE} onClose={onClose} data-testid="rename-project-dialog">
      <form onSubmit={handleSubmit} method="dialog">
        <h2 style={{ marginTop: 0 }}>{t('rename_dialog.title')}</h2>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span>{t('new_dialog.name_label')}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            data-testid="rename-project-dialog-name"
          />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>
            {
              t(
                'rename_dialog.title',
              ) /* placeholder cancel; common namespace dialog primitive lands in Slice 11 */
            }
          </button>
          <button type="submit" disabled={submitting} data-testid="rename-project-dialog-submit">
            {t('rename_dialog.submit')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

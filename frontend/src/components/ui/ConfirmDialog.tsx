import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  confirmText?: string;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description,
  confirmLabel = 'Confirm', danger = false, loading = false, confirmText
}: Props) {
  const [inputValue, setInputValue] = useState('');

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (open) setInputValue('');
  }, [open]);

  const isConfirmEnabled = !loading && (!confirmText || inputValue === confirmText);

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-sm">
      <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
      
      {confirmText && (
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
            Type <span className="font-bold text-red-500 font-mono tracking-normal">{confirmText}</span> to confirm
          </label>
          <input
            type="text"
            className="input w-full font-mono text-sm"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmText}
            autoFocus
          />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!isConfirmEnabled}
          className={danger ? 'btn-danger' : 'btn-primary'}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

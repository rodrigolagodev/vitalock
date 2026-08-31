import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { Check, PenLine, X } from 'lucide-react';
import { IconButton, Input } from '@vitalock/ui';
import { cn } from '@vitalock/ui';

interface EditableTitleProps {
  /** Current value shown when not editing. */
  value: string;
  /** Persist the new value. Called with the trimmed draft on confirm. */
  onSave: (value: string) => void;
  /** Disables the controls while a save is in flight. */
  isSaving?: boolean;
  /** Rendered beside the title (e.g. the category badge). */
  adornment?: ReactNode;
  className?: string;
}

/**
 * Inline-editable page title. Shows the value plus a pencil affordance; on
 * confirm it turns into a title-styled input. Enter saves, Esc discards, and
 * the Check / X buttons cover mouse users.
 *
 * Designed to be passed as `PageHeader.title`, which renders it inside the
 * `<h1>`, so this intentionally renders no h1 of its own.
 */
export function EditableTitle({
  value,
  onSave,
  isSaving = false,
  adornment,
  className,
}: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync with the value whenever it changes externally
  // (e.g. the query refetch propagates the saved name back).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    if (isSaving) return;
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
  };

  const cancel = () => {
    if (isSaving) return;
    setDraft(value);
    setEditing(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    commit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (!editing) {
    return (
      <span className={cn('inline-flex items-center gap-2', className)}>
        <span className="max-w-[42ch] truncate">{value}</span>
        {adornment}
        <IconButton
          icon={PenLine}
          label="Renombrar"
          onClick={() => setEditing(true)}
        />
      </span>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Nombre del producto"
        className="h-9 text-2xl font-semibold"
        maxLength={120}
      />
      <IconButton
        icon={Check}
        label="Guardar nombre"
        type="submit"
        loading={isSaving}
      />
      <IconButton
        icon={X}
        label="Cancelar"
        type="button"
        onClick={cancel}
      />
    </form>
  );
}

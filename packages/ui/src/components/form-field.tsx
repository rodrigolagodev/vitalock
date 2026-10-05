import * as React from 'react';

import { cn } from '../lib/utils';
import { Label } from './label';

export interface FormFieldProps {
  label: React.ReactNode;
  /** Validation message; also flips the control to `aria-invalid`. */
  error?: string;
  description?: React.ReactNode;
  /** Id for the control. Pass it here, not on the child (FormField overrides it). */
  id?: string;
  className?: string;
  children: React.ReactElement;
}

/**
 * Label + control + description + error, wired for assistive tech.
 *
 * RHF-agnostic: keep `{...register('x')}` on the child and pass
 * `error={errors.x?.message}` here. The child's own ref and
 * `aria-describedby` are preserved.
 */
function FormField({ label, error, description, id, className, children }: FormFieldProps) {
  const generatedId = React.useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;

  const child = React.Children.only(children);
  const describedBy = [
    (child.props as { 'aria-describedby'?: string })['aria-describedby'],
    description != null ? descriptionId : undefined,
    error ? errorId : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const control = React.cloneElement(child, {
    id: controlId,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as React.Attributes);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {control}
      {description != null && (
        <p id={descriptionId} className="text-footnote text-muted-foreground">
          {description}
        </p>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };

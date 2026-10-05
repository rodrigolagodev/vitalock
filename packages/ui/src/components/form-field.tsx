import * as React from 'react';

import { cn } from '../lib/utils';
import { Label } from './label';

/** What a render-prop child must spread on its focusable node. */
export interface FormFieldControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

export interface FormFieldProps {
  label: React.ReactNode;
  /** Validation message; also flips the control to `aria-invalid`. */
  error?: string;
  description?: React.ReactNode;
  /** Id for the control. Pass it here, not on the child (FormField overrides it). */
  id?: string;
  className?: string;
  /**
   * One element (FormField clones the a11y props onto it), or a render prop for
   * composites whose focusable node is not the child (Radix Select trigger,
   * comboboxes): spread `control` on that node.
   */
  children: React.ReactElement | ((control: FormFieldControlProps) => React.ReactNode);
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

  const join = (...ids: Array<string | undefined>) => ids.filter(Boolean).join(' ') || undefined;
  const ownDescribedBy = description != null ? descriptionId : undefined;
  const errorDescribedBy = error ? errorId : undefined;

  let control: React.ReactNode;
  if (typeof children === 'function') {
    control = children({
      id: controlId,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': join(ownDescribedBy, errorDescribedBy),
    });
  } else {
    const child = React.Children.only(children);
    control = React.cloneElement(child, {
      id: controlId,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': join(
        (child.props as { 'aria-describedby'?: string })['aria-describedby'],
        ownDescribedBy,
        errorDescribedBy,
      ),
    } as React.Attributes);
  }

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

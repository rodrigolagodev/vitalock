import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input, type InputProps } from '../input';

export type PasswordInputProps = Omit<InputProps, 'type'>;

/**
 * `Input` with a trailing toggle that flips between `type="password"` and
 * `type="text"` so the user can check what they typed before submitting.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pr-10', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };

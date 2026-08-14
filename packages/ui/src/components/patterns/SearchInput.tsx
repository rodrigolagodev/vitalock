import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input, type InputProps } from '../input';

// The native HTML `size` attribute is a number; omit it so `size` can carry
// the pattern's visual scale ('default' | 'lg') per design D6.
export interface SearchInputProps extends Omit<InputProps, 'size'> {
  /** `lg` matches the topbar reference: h-12 w-[372px] */
  size?: 'default' | 'lg';
}

/**
 * Visual search placeholder (router-free): a plain uncontrolled input with a
 * leading search icon. It holds no query state, fires no queries and cannot
 * navigate — wiring live search is deferred.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, size = 'default', ...props }, ref) => {
    return (
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          type="search"
          className={cn(
            'pl-9',
            size === 'lg' &&
              'h-12 w-[372px] rounded-[8px] bg-[#f5f5fa] placeholder:text-[18px] placeholder:text-[#cacedc]',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';

export { SearchInput };

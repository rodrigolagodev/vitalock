import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input, type InputProps } from '../input';

// The native HTML `size` attribute is a number; omit it so `size` can carry
// the pattern's visual scale ('default' | 'lg') per design D6.
export interface SearchInputProps extends Omit<InputProps, 'size'> {
  /** `lg` matches the topbar reference at the canonical control height: h-11 w-96 */
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
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          ref={ref}
          type="search"
          className={cn(
            'pl-9',
            '[&::-webkit-search-cancel-button]:appearance-none',
            size === 'lg' &&
              'bg-card placeholder:text-muted-foreground h-11 w-96 rounded-lg placeholder:text-base',
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

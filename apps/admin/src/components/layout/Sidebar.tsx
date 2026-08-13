import { useState } from 'react';
import {
  Building2,
  ClipboardList,
  Home,
  KeyRound,
  ListTodo,
  Menu,
  Package,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { SidebarGroup } from '@vitalock/ui';
import { NavItem } from './NavItem';
import { useOrdens } from '@/hooks/useOrdens';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const { data: inProgressOrdens } = useOrdens({ status: 'in_progress' });

  const navContent = (
    <nav className="flex flex-col gap-1 p-4">
      {/* Brand header (logo + wordmark) */}
      <div className="mb-2 flex items-center gap-2.5 px-3 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <KeyRound className="h-4 w-4" />
        </span>
        <span className="text-base font-semibold">Vitalock</span>
      </div>

      <SidebarGroup label="Infraestructura">
        <NavItem
          label="Administraciones"
          to="/administraciones"
          icon={<Building2 className="h-4 w-4" />}
        />
        <NavItem label="Particulares" to="/particulares" icon={<Home className="h-4 w-4" />} />
      </SidebarGroup>

      <SidebarGroup label="Ordenes">
        <NavItem
          label="Ordenes"
          to="/ordenes"
          icon={<ClipboardList className="h-4 w-4" />}
          badge={inProgressOrdens?.length}
        />
        <NavItem label="Tareas" to="/tareas" icon={<ListTodo className="h-4 w-4" />} />
      </SidebarGroup>

      <SidebarGroup label="Personal">
        <NavItem label="Personal" to="/personal" icon={<Users className="h-4 w-4" />} />
      </SidebarGroup>

      <SidebarGroup label="Ventas">
        <NavItem label="Stock" to="/stock" icon={<Package className="h-4 w-4" />} />
      </SidebarGroup>

      <SidebarGroup label="Tickets" />
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden w-[322px] shrink-0 flex-col border-r bg-background md:flex',
          className,
        )}
      >
        {navContent}
      </aside>

      {/* Mobile hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile slide-over overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[322px] flex-col border-r bg-background shadow-xl">
            <div className="flex items-center justify-end p-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}

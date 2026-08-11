import { useState } from 'react';
import { Building2, ClipboardList, ListTodo, Menu, Package, Users, X } from 'lucide-react';
import { cn } from '@vitalock/ui';
import { Button } from '@/components/ui/button';
import { NavSection } from './NavSection';
import { NavItem } from './NavItem';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [open, setOpen] = useState(false);

  const navContent = (
    <nav className="flex flex-col gap-4 p-4">
      <NavSection label="Infraestructura" icon={<Building2 className="h-4 w-4" />}>
        <NavItem label="Administraciones" to="/administraciones" />
        <NavItem label="Particulares" to="/particulares" />
      </NavSection>
      <NavSection label="Ordenes" icon={<ClipboardList className="h-4 w-4" />}>
        <NavItem label="Ordenes" to="/ordenes" />
      </NavSection>
      <NavSection label="Personal" icon={<Users className="h-4 w-4" />}>
        <NavItem label="Personal" to="/personal" />
      </NavSection>
      <NavSection label="Ventas" disabled />
      <NavSection label="Tareas" icon={<ListTodo className="h-4 w-4" />}>
        <NavItem label="Tareas" to="/tareas" />
      </NavSection>
      <NavSection label="Inventario" icon={<Package className="h-4 w-4" />}>
        <NavItem label="Stock" to="/stock" />
      </NavSection>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex w-60 shrink-0 flex-col border-r bg-background',
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
            className="absolute inset-0 bg-black/40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col border-r bg-background shadow-xl">
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

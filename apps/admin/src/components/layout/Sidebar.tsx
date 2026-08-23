import { useState } from 'react';
import {
  Building2,
  History,
  Home,
  Key,
  ListTodo,
  Menu,
  Package,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { NavItem } from './NavItem';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [open, setOpen] = useState(false);

  const navContent = (
    <nav className="flex flex-col gap-1 p-4">
      {/* Brand header (logo + wordmark) */}
      <div className="mb-2 flex items-center gap-2.5 px-3 py-3">
        <img
          src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_black.svg`}
          alt="Vitalock"
          className="block h-8 w-auto dark:hidden"
        />
        <img
          src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_white.svg`}
          alt=""
          aria-hidden="true"
          className="hidden h-8 w-auto dark:block"
        />
      </div>

      <NavItem
        label="Administraciones"
        to="/administraciones"
        icon={<Building2 className="h-4 w-4" />}
      />
      <NavItem label="Particulares" to="/particulares" icon={<Home className="h-4 w-4" />} />

      <NavItem label="Llaves" to="/llaves" icon={<Key className="h-4 w-4" />} />

      <NavItem
        label="Servicio técnico"
        to="/servicio-tecnico"
        icon={<Wrench className="h-4 w-4" />}
      />

      <NavItem label="Historial" to="/historial" icon={<History className="h-4 w-4" />} />

      <NavItem label="Tareas" to="/tareas" icon={<ListTodo className="h-4 w-4" />} />

      <NavItem label="Personal" to="/personal" icon={<Users className="h-4 w-4" />} />

      <NavItem label="Stock" to="/stock" icon={<Package className="h-4 w-4" />} />
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden w-[240px] shrink-0 flex-col border-r bg-card md:flex',
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
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r bg-card shadow-xl">
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

import { useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { useMutateEquipmentUpdate } from '@/hooks/useMutateEquipmentUpdate';
import { useStaff } from '@/hooks/useStaff';
import { useAuthContext } from '@vitalock/shared';
import type { KeyRow } from '@/hooks/useKeys';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface EquipmentUpdateFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  administrationId: string;
  buildingId: string;
  pendingActivate: KeyRow[];
  pendingDisable: KeyRow[];
  /** ticket_id to use as path prefix — provided by an existing open ticket created externally */
  ticketId: string;
}

export function EquipmentUpdateFormSheet({
  open,
  onOpenChange,
  equipmentId,
  administrationId,
  buildingId,
  pendingActivate,
  pendingDisable,
  ticketId,
}: EquipmentUpdateFormSheetProps) {
  const { staff } = useAuthContext();
  const { createEquipmentUpdate } = useMutateEquipmentUpdate();
  const { data: staffList = [] } = useStaff();
  const installers = staffList.filter((s) => s.role === 'installer');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('El archivo supera el límite de 50 MB.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileError(null);
    setAssignedTo('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !assignedTo) return;

    await createEquipmentUpdate.mutateAsync({
      ticketId,
      equipmentId,
      administrationId,
      buildingId,
      description: `Actualización de equipo — ${formatDate(new Date())}`,
      keysToActivate: pendingActivate.map((k) => k.id),
      keysToDisable: pendingDisable.map((k) => k.id),
      file: selectedFile,
      actorStaffId: staff?.id ?? null,
      assignedToStaffId: assignedTo,
    });

    handleClose();
  };

  const isPending = createEquipmentUpdate.isPending;
  const canSubmit = Boolean(selectedFile) && Boolean(assignedTo) && !isPending;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg overflow-y-auto">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>Crear tarea de actualización</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 px-6">
          {/* Keys to activate */}
          <div className="flex flex-col gap-2">
            <Label>Llaves a activar ({pendingActivate.length})</Label>
            {pendingActivate.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin llaves pendientes de instalación.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {pendingActivate.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono">{k.rfid_code}</span>
                    <span className="text-muted-foreground">· Unidad {k.unit.number}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Keys to disable */}
          <div className="flex flex-col gap-2">
            <Label>Llaves a dar de baja ({pendingDisable.length})</Label>
            {pendingDisable.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin llaves con baja solicitada.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {pendingDisable.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono">{k.rfid_code}</span>
                    <span className="text-muted-foreground">· Unidad {k.unit.number}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Assignee (installer) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="assigned-to">Instalador asignado *</Label>
            <Select
              value={assignedTo}
              onValueChange={setAssignedTo}
              disabled={isPending || installers.length === 0}
            >
              <SelectTrigger id="assigned-to">
                <SelectValue
                  placeholder={
                    installers.length === 0
                      ? 'No hay instaladores activos'
                      : 'Elegí un instalador'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {installers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              El instalador va a recibir la tarea en su board apenas se cree.
            </p>
          </div>

          {/* MDB file */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="mdb-file">Archivo .mdb *</Label>
            <input
              ref={fileInputRef}
              id="mdb-file"
              type="file"
              accept=".mdb,application/x-msaccess"
              onChange={handleFileChange}
              disabled={isPending}
              className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
            />
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
            {selectedFile && !fileError && (
              <p className="text-xs text-muted-foreground">
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <p className="text-xs text-muted-foreground">Máx. 50 MB.</p>
          </div>

          <SheetFooter className="mt-auto pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? 'Creando...' : 'Crear tarea'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

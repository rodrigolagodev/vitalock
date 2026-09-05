import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@vitalock/ui';
import { equipmentStatus, type EquipmentStatus } from '@/lib/status/equipmentStatus';

interface EquipmentStatusSelectProps {
  value: EquipmentStatus;
  onChange: (value: EquipmentStatus) => void;
  /** Called instead of onChange when the user selects 'dead' — triggers DecommissionDialog */
  onDeadSelected: () => void;
  disabled?: boolean;
}

/**
 * Single-select for equipment status transitions.
 * - When current value is 'dead': rendered disabled (terminal state).
 * - When user selects 'dead': fires onDeadSelected callback instead of onChange.
 * - For active/maintenance transitions: fires onChange directly.
 */
export function EquipmentStatusSelect({
  value,
  onChange,
  onDeadSelected,
  disabled,
}: EquipmentStatusSelectProps) {
  const isDead = value === 'dead';
  const isDisabled = disabled || isDead;

  const handleValueChange = (next: string) => {
    if (next === 'dead') {
      onDeadSelected();
    } else {
      onChange(next as EquipmentStatus);
    }
  };

  return (
    <Select value={value} onValueChange={handleValueChange} disabled={isDisabled}>
      <SelectTrigger>
        <SelectValue>{equipmentStatus.label(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Activo</SelectItem>
        <SelectItem value="maintenance">Mantenimiento</SelectItem>
        <SelectItem value="dead">Dado de baja</SelectItem>
      </SelectContent>
    </Select>
  );
}

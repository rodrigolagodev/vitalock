import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, FieldPath, FieldValues } from 'react-hook-form';
import { Input } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { RadioGroup, RadioGroupItem } from '@vitalock/ui';
import type { ProductCategory } from '@/types/stock';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  rfid_key: 'Llave RFID',
  equipment: 'Equipo',
};

interface ProductFormFieldsProps<T extends FieldValues> {
  control: Control<T>;
  /** Form path bound to the product name field. */
  name: FieldPath<T>;
  /** Form path bound to the category field. */
  categoryName: FieldPath<T>;
  /** Form path bound to the cost price field. When omitted, the input is hidden (CargarProductoSheet covers the initial cost with unit_cost). */
  costPriceName?: FieldPath<T>;
  errors: FieldErrors<T>;
  disabled?: boolean;
}

/**
 * Shared controlled inputs for the product form: name, category and cost_price.
 * Uses react-hook-form `Controller`; the category renders as a segmented
 * `RadioGroup` (only two product categories), matching the KeyOrderForm pattern.
 */
export function ProductFormFields<T extends FieldValues>({
  control,
  name,
  categoryName,
  costPriceName,
  errors,
  disabled = false,
}: ProductFormFieldsProps<T>) {
  const message = (path: FieldPath<T>) =>
    (errors as Record<string, { message?: string } | undefined>)[path]?.message;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="product-name">Nombre *</Label>
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Input
              id="product-name"
              placeholder="Ej. Llave RFID genérica"
              value={field.value ?? ''}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
        {message(name) && (
          <p className="text-sm text-destructive">{message(name)}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Categoría *</Label>
        <Controller
          control={control}
          name={categoryName}
          render={({ field }) => (
            <RadioGroup
              value={field.value ?? ''}
              onValueChange={field.onChange}
              disabled={disabled}
              aria-label="Categoría"
              className="grid w-full max-w-md grid-cols-2"
            >
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <RadioGroupItem
                  key={val}
                  value={val}
                  className="text-center"
                >
                  {label}
                </RadioGroupItem>
              ))}
            </RadioGroup>
          )}
        />
        {message(categoryName) && (
          <p className="text-sm text-destructive">{message(categoryName)}</p>
        )}
      </div>

      {costPriceName && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="product-cost-price">Precio de costo</Label>
          <Controller
            control={control}
            name={costPriceName}
            render={({ field }) => (
              <Input
                id="product-cost-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={field.value ?? ''}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={disabled}
              />
            )}
          />
          {message(costPriceName) && (
            <p className="text-sm text-destructive">{message(costPriceName)}</p>
          )}
        </div>
      )}
    </>
  );
}

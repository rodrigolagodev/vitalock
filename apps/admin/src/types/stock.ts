import type { Database } from '@vitalock/supabase';

export type ProductCategory = 'rfid_key' | 'equipment';

export type MovementType =
  | 'compra'
  | 'devolucion'
  | 'ajuste_manual'
  | 'egreso_grabacion'
  | 'egreso_instalacion'
  | 'baja_defectuoso'
  | 'baja_perdida'
  | 'reserva'
  | 'liberacion_reserva';

type ProductsRow = Database['public']['Tables']['products']['Row'];
type StockMovementsRow = Database['public']['Tables']['stock_movements']['Row'];

export interface ProductRow extends ProductsRow {
  category: ProductCategory;
  stock_disponible: number; // derived client-side: stock_total - stock_reservado
}

export interface StockMovementRow extends StockMovementsRow {
  type: MovementType;
  ticket_number: string | null; // resolved by useStockMovements batch lookup
  staff_name: string | null; // resolved by useStockMovements batch lookup
}

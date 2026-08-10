export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  identity: {
    Tables: {
      staff: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_staff_id: { Args: never; Returns: string }
      current_staff_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_installer: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  operations: {
    Tables: {
      equipment: {
        Row: {
          access_type: string | null
          building_id: string
          created_at: string
          decommission_reason: string | null
          decommissioned_at: string | null
          description: string
          id: string
          installed_at: string
          model: string | null
          notes: string | null
          replaces_equipment_id: string | null
          serial_number: string
          status: string
          updated_at: string
        }
        Insert: {
          access_type?: string | null
          building_id: string
          created_at?: string
          decommission_reason?: string | null
          decommissioned_at?: string | null
          description: string
          id?: string
          installed_at?: string
          model?: string | null
          notes?: string | null
          replaces_equipment_id?: string | null
          serial_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_type?: string | null
          building_id?: string
          created_at?: string
          decommission_reason?: string | null
          decommissioned_at?: string | null
          description?: string
          id?: string
          installed_at?: string
          model?: string | null
          notes?: string | null
          replaces_equipment_id?: string | null
          serial_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_replaces_equipment_id_fkey"
            columns: ["replaces_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      key_authorizations: {
        Row: {
          created_at: string
          equipment_id: string
          id: string
          installed_at: string | null
          installed_by_staff_id: string | null
          notes: string | null
          reject_reason: string | null
          remove_reason: string | null
          removed_at: string | null
          removed_by_staff_id: string | null
          rfid_key_id: string
          sync_state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipment_id: string
          id?: string
          installed_at?: string | null
          installed_by_staff_id?: string | null
          notes?: string | null
          reject_reason?: string | null
          remove_reason?: string | null
          removed_at?: string | null
          removed_by_staff_id?: string | null
          rfid_key_id: string
          sync_state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipment_id?: string
          id?: string
          installed_at?: string | null
          installed_by_staff_id?: string | null
          notes?: string | null
          reject_reason?: string | null
          remove_reason?: string | null
          removed_at?: string | null
          removed_by_staff_id?: string | null
          rfid_key_id?: string
          sync_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_authorizations_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      replace_equipment: {
        Args: {
          p_decommission_reason?: string
          p_new_access_type?: string
          p_new_description: string
          p_new_model: string
          p_new_serial_number: string
          p_old_equipment_id: string
          p_replacement_staff_id?: string
        }
        Returns: string
      }
      revoke_key_from_all_equipment: {
        Args: { p_reason?: string; p_rfid_key_id: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      administrations: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      buildings: {
        Row: {
          address: string | null
          administration_id: string
          city: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          administration_id: string
          city?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          administration_id?: string
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "administrations"
            referencedColumns: ["id"]
          },
        ]
      }
      key_events: {
        Row: {
          actor_staff_id: string | null
          event_type: string
          id: string
          key_id: string
          note: string | null
          occurred_at: string
        }
        Insert: {
          actor_staff_id?: string | null
          event_type: string
          id?: string
          key_id: string
          note?: string | null
          occurred_at?: string
        }
        Update: {
          actor_staff_id?: string | null
          event_type?: string
          id?: string
          key_id?: string
          note?: string | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_events_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "rfid_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          building_id: string | null
          created_at: string
          description: string | null
          id: string
          item_type: string
          order_id: string
          produced_key_id: string | null
          product_id: string | null
          quantity: number
          status: string
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type: string
          order_id: string
          produced_key_id?: string | null
          product_id?: string | null
          quantity: number
          status?: string
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type?: string
          order_id?: string
          produced_key_id?: string | null
          product_id?: string | null
          quantity?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_produced_key_id_fkey"
            columns: ["produced_key_id"]
            isOneToOne: false
            referencedRelation: "rfid_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          administration_id: string | null
          client_type: string
          created_at: string
          id: string
          notes: string | null
          order_number: string
          particular_dni: string | null
          particular_email: string | null
          particular_full_name: string | null
          particular_id: string | null
          particular_phone: string | null
          pickup_particular_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          administration_id?: string | null
          client_type: string
          created_at?: string
          id?: string
          notes?: string | null
          order_number?: string
          particular_dni?: string | null
          particular_email?: string | null
          particular_full_name?: string | null
          particular_id?: string | null
          particular_phone?: string | null
          pickup_particular_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          administration_id?: string | null
          client_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_number?: string
          particular_dni?: string | null
          particular_email?: string | null
          particular_full_name?: string | null
          particular_id?: string | null
          particular_phone?: string | null
          pickup_particular_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "administrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_particular_id_fkey"
            columns: ["particular_id"]
            isOneToOne: false
            referencedRelation: "particulares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_particular_id_fkey"
            columns: ["pickup_particular_id"]
            isOneToOne: false
            referencedRelation: "particulares"
            referencedColumns: ["id"]
          },
        ]
      }
      particulares: {
        Row: {
          created_at: string
          dni: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dni: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dni?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "particulares_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          cost_price: number | null
          created_at: string
          id: string
          name: string
          stock_reservado: number
          stock_total: number
          updated_at: string
        }
        Insert: {
          category: string
          cost_price?: number | null
          created_at?: string
          id?: string
          name: string
          stock_reservado?: number
          stock_total?: number
          updated_at?: string
        }
        Update: {
          category?: string
          cost_price?: number | null
          created_at?: string
          id?: string
          name?: string
          stock_reservado?: number
          stock_total?: number
          updated_at?: string
        }
        Relationships: []
      }
      rfid_keys: {
        Row: {
          activated_at: string
          created_at: string
          deactivated_at: string | null
          delivered_by_staff_id: string | null
          id: string
          key_request_item_id: string | null
          notes: string | null
          order_item_id: string | null
          picked_up_at: string | null
          picked_up_by_dni: string | null
          picked_up_by_name: string | null
          picked_up_by_surname: string | null
          rfid_code: string
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          created_at?: string
          deactivated_at?: string | null
          delivered_by_staff_id?: string | null
          id?: string
          key_request_item_id?: string | null
          notes?: string | null
          order_item_id?: string | null
          picked_up_at?: string | null
          picked_up_by_dni?: string | null
          picked_up_by_name?: string | null
          picked_up_by_surname?: string | null
          rfid_code: string
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          created_at?: string
          deactivated_at?: string | null
          delivered_by_staff_id?: string | null
          id?: string
          key_request_item_id?: string | null
          notes?: string | null
          order_item_id?: string | null
          picked_up_at?: string | null
          picked_up_by_dni?: string | null
          picked_up_by_name?: string | null
          picked_up_by_surname?: string | null
          rfid_code?: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfid_keys_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfid_keys_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string | null
          order_item_id: string | null
          product_id: string
          quantity: number
          staff_id: string | null
          ticket_id: string | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          product_id: string
          quantity: number
          staff_id?: string | null
          ticket_id?: string | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          product_id?: string
          quantity?: number
          staff_id?: string | null
          ticket_id?: string | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          building_id: string
          created_at: string
          id: string
          is_administrative: boolean
          notes: string | null
          number: string
          status: string
          unit_type: string | null
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          is_administrative?: boolean
          notes?: string | null
          number: string
          status?: string
          unit_type?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          is_administrative?: boolean
          notes?: string | null
          number?: string
          status?: string
          unit_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      change_key_status: {
        Args: {
          p_actor_staff_id?: string
          p_key_id: string
          p_note?: string
          p_status: string
        }
        Returns: undefined
      }
      configure_key_order_item: {
        Args: {
          p_equipment_ids: string[]
          p_order_item_id: string
          p_rfid_code: string
          p_unit_id: string
        }
        Returns: string
      }
      create_order_with_items: {
        Args: { p_items: Json[]; p_order: Json }
        Returns: string
      }
      gen_order_number: { Args: never; Returns: string }
      recompute_order_status: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      record_order_key_pickup: {
        Args: {
          p_actor_staff_id?: string
          p_key_id: string
          p_picked_up_by_dni: string
          p_picked_up_by_name: string
          p_picked_up_by_surname: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  sales: {
    Tables: {
      bill_items: {
        Row: {
          bill_id: string
          created_at: string
          description: string
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          related_equipment_id: string | null
          related_key_request_item_id: string | null
          related_recurring_charge_id: string | null
          subtotal: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          bill_id: string
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity: number
          related_equipment_id?: string | null
          related_key_request_item_id?: string | null
          related_recurring_charge_id?: string | null
          subtotal?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          bill_id?: string
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          related_equipment_id?: string | null
          related_key_request_item_id?: string | null
          related_recurring_charge_id?: string | null
          subtotal?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_related_key_request_item_id_fkey"
            columns: ["related_key_request_item_id"]
            isOneToOne: false
            referencedRelation: "key_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_related_recurring_charge_id_fkey"
            columns: ["related_recurring_charge_id"]
            isOneToOne: false
            referencedRelation: "recurring_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          administration_id: string
          bill_number: string
          cancellation_reason: string | null
          charge_date: string
          created_at: string
          created_by_staff_id: string | null
          currency: string
          due_date: string | null
          from_quote_id: string | null
          id: string
          notes: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          administration_id: string
          bill_number?: string
          cancellation_reason?: string | null
          charge_date?: string
          created_at?: string
          created_by_staff_id?: string | null
          currency?: string
          due_date?: string | null
          from_quote_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          administration_id?: string
          bill_number?: string
          cancellation_reason?: string | null
          charge_date?: string
          created_at?: string
          created_by_staff_id?: string | null
          currency?: string
          due_date?: string | null
          from_quote_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "administration_balance"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "bills_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "pending_to_invoice"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "bills_from_quote_id_fkey"
            columns: ["from_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      key_request_items: {
        Row: {
          created_at: string
          id: string
          key_request_id: string
          notes: string | null
          quantity: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_request_id: string
          notes?: string | null
          quantity: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_request_id?: string
          notes?: string | null
          quantity?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_request_items_key_request_id_fkey"
            columns: ["key_request_id"]
            isOneToOne: false
            referencedRelation: "key_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      key_requests: {
        Row: {
          administration_id: string
          authorization_method: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancellation_reason: string | null
          created_at: string
          id: string
          notes: string | null
          pickup_particular_id: string | null
          pickup_person_dni: string | null
          pickup_person_name: string | null
          pickup_person_surname: string | null
          received_at: string
          received_by_staff_id: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          request_number: string
          requester_contact: string | null
          requester_dni: string | null
          requester_name: string | null
          requester_particular_id: string | null
          requester_surname: string | null
          requester_type: string
          status: string
          updated_at: string
        }
        Insert: {
          administration_id: string
          authorization_method?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancellation_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pickup_particular_id?: string | null
          pickup_person_dni?: string | null
          pickup_person_name?: string | null
          pickup_person_surname?: string | null
          received_at?: string
          received_by_staff_id?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          request_number?: string
          requester_contact?: string | null
          requester_dni?: string | null
          requester_name?: string | null
          requester_particular_id?: string | null
          requester_surname?: string | null
          requester_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          administration_id?: string
          authorization_method?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancellation_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pickup_particular_id?: string | null
          pickup_person_dni?: string | null
          pickup_person_name?: string | null
          pickup_person_surname?: string | null
          received_at?: string
          received_by_staff_id?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          request_number?: string
          requester_contact?: string | null
          requester_dni?: string | null
          requester_name?: string | null
          requester_particular_id?: string | null
          requester_surname?: string | null
          requester_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_requests_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "administration_balance"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "key_requests_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "pending_to_invoice"
            referencedColumns: ["administration_id"]
          },
        ]
      }
      payments: {
        Row: {
          administration_id: string
          amount: number
          bill_id: string
          created_at: string
          currency: string
          id: string
          invoiced_at: string | null
          notes: string | null
          payment_date: string
          payment_method: string
          reference: string | null
          requires_invoice: boolean
          updated_at: string
        }
        Insert: {
          administration_id: string
          amount: number
          bill_id: string
          created_at?: string
          currency?: string
          id?: string
          invoiced_at?: string | null
          notes?: string | null
          payment_date?: string
          payment_method: string
          reference?: string | null
          requires_invoice: boolean
          updated_at?: string
        }
        Update: {
          administration_id?: string
          amount?: number
          bill_id?: string
          created_at?: string
          currency?: string
          id?: string
          invoiced_at?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference?: string | null
          requires_invoice?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "administration_balance"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "payments_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "pending_to_invoice"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: true
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          product_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          subtotal: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity: number
          quote_id: string
          subtotal?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          subtotal?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          administration_id: string
          created_at: string
          created_by_staff_id: string | null
          currency: string
          id: string
          notes: string | null
          quote_number: string
          rejected_at: string | null
          rejection_reason: string | null
          sent_at: string | null
          status: string
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          administration_id: string
          created_at?: string
          created_by_staff_id?: string | null
          currency?: string
          id?: string
          notes?: string | null
          quote_number?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          administration_id?: string
          created_at?: string
          created_by_staff_id?: string | null
          currency?: string
          id?: string
          notes?: string | null
          quote_number?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "administration_balance"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "quotes_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "pending_to_invoice"
            referencedColumns: ["administration_id"]
          },
        ]
      }
      recurring_charges: {
        Row: {
          administration_id: string
          created_at: string
          description: string
          end_date: string | null
          id: string
          is_active: boolean
          monthly_amount: number
          notes: string | null
          product_id: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          administration_id: string
          created_at?: string
          description: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          monthly_amount: number
          notes?: string | null
          product_id?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          administration_id?: string
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          monthly_amount?: number
          notes?: string | null
          product_id?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_charges_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "administration_balance"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "recurring_charges_administration_id_fkey"
            columns: ["administration_id"]
            isOneToOne: false
            referencedRelation: "pending_to_invoice"
            referencedColumns: ["administration_id"]
          },
          {
            foreignKeyName: "recurring_charges_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      administration_balance: {
        Row: {
          administration_id: string | null
          balance: number | null
          company_name: string | null
          tax_id: string | null
          total_billed: number | null
          total_paid: number | null
        }
        Relationships: []
      }
      pending_to_invoice: {
        Row: {
          administration_id: string | null
          amount: number | null
          bill_number: string | null
          charge_date: string | null
          company_name: string | null
          payment_date: string | null
          payment_id: string | null
          payment_method: string | null
          reference: string | null
          tax_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      gen_bill_number: { Args: never; Returns: string }
      gen_key_request_number: { Args: never; Returns: string }
      gen_quote_number: { Args: never; Returns: string }
      generate_recurring_charges: {
        Args: { p_month: number; p_year: number }
        Returns: number
      }
      recompute_request_status: {
        Args: { p_request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  support: {
    Tables: {
      ticket_comments: {
        Row: {
          author_staff_id: string | null
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_staff_id?: string | null
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_staff_id?: string | null
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          administration_id: string
          assigned_to_staff_id: string | null
          building_id: string
          cancellation_reason: string | null
          category: string
          created_at: string
          description: string
          equipment_id: string | null
          id: string
          notes: string | null
          opened_at: string
          opened_by_staff_id: string | null
          related_bill_id: string | null
          related_key_request_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_staff_id: string | null
          status: string
          ticket_number: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          administration_id: string
          assigned_to_staff_id?: string | null
          building_id: string
          cancellation_reason?: string | null
          category: string
          created_at?: string
          description: string
          equipment_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_staff_id?: string | null
          related_bill_id?: string | null
          related_key_request_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          status?: string
          ticket_number?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          administration_id?: string
          assigned_to_staff_id?: string | null
          building_id?: string
          cancellation_reason?: string | null
          category?: string
          created_at?: string
          description?: string
          equipment_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_staff_id?: string | null
          related_bill_id?: string | null
          related_key_request_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          status?: string
          ticket_number?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gen_ticket_number: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  identity: {
    Enums: {},
  },
  operations: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  sales: {
    Enums: {},
  },
  support: {
    Enums: {},
  },
} as const


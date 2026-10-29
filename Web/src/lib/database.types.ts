/**
 * Tipos del esquema de Supabase (proyecto fpc-mobile).
 *
 * Generado desde la base con `supabase gen types typescript` el 28-10-2026.
 * Si cambia el esquema, se regenera con:
 *   npx supabase gen types typescript --project-id betqgklumvpneppoqhph > web/src/lib/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      camiones: {
        Row: {
          activo: boolean;
          capacidad_cilindros: number;
          creado_en: string;
          descripcion: string | null;
          id: string;
          patente: string;
        };
        Insert: {
          activo?: boolean;
          capacidad_cilindros: number;
          creado_en?: string;
          descripcion?: string | null;
          id?: string;
          patente: string;
        };
        Update: {
          activo?: boolean;
          capacidad_cilindros?: number;
          creado_en?: string;
          descripcion?: string | null;
          id?: string;
          patente?: string;
        };
        Relationships: [];
      };
      cilindros: {
        Row: {
          activo: boolean;
          codigo_barras: string | null;
          codigo_generado: boolean;
          creado_en: string;
          deposito: string | null;
          en_cliente_desde: string | null;
          es_propiedad_cliente: boolean;
          estado: Database['public']['Enums']['estado_cilindro'];
          id: string;
          numero_serie: string;
          producto_id: string;
          serie_normalizada: string | null;
          sucursal_actual_id: string | null;
        };
        Insert: {
          activo?: boolean;
          codigo_barras?: string | null;
          codigo_generado?: boolean;
          creado_en?: string;
          deposito?: string | null;
          en_cliente_desde?: string | null;
          es_propiedad_cliente?: boolean;
          estado?: Database['public']['Enums']['estado_cilindro'];
          id?: string;
          numero_serie: string;
          producto_id: string;
          serie_normalizada?: string | null;
          sucursal_actual_id?: string | null;
        };
        Update: {
          activo?: boolean;
          codigo_barras?: string | null;
          codigo_generado?: boolean;
          creado_en?: string;
          deposito?: string | null;
          en_cliente_desde?: string | null;
          es_propiedad_cliente?: boolean;
          estado?: Database['public']['Enums']['estado_cilindro'];
          id?: string;
          numero_serie?: string;
          producto_id?: string;
          serie_normalizada?: string | null;
          sucursal_actual_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cilindros_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cilindros_sucursal_actual_id_fkey';
            columns: ['sucursal_actual_id'];
            isOneToOne: false;
            referencedRelation: 'sucursales';
            referencedColumns: ['id'];
          },
        ];
      };
      clientes: {
        Row: {
          activo: boolean;
          actualizado_en: string;
          codigo_kame: string | null;
          creado_en: string;
          id: string;
          nombre: string;
          rut: string;
        };
        Insert: {
          activo?: boolean;
          actualizado_en?: string;
          codigo_kame?: string | null;
          creado_en?: string;
          id?: string;
          nombre: string;
          rut: string;
        };
        Update: {
          activo?: boolean;
          actualizado_en?: string;
          codigo_kame?: string | null;
          creado_en?: string;
          id?: string;
          nombre?: string;
          rut?: string;
        };
        Relationships: [];
      };
      movimientos: {
        Row: {
          camion_id: string;
          cilindro_id: string;
          codigo_origen: Database['public']['Enums']['origen_codigo'];
          documento_referencia: string | null;
          fecha_evento: string;
          fecha_sync: string;
          folio_operacion: number | null;
          sucursal_id: string | null;
          tipo: Database['public']['Enums']['tipo_movimiento'];
          usuario_id: string;
          uuid_local: string;
        };
        Insert: {
          camion_id: string;
          cilindro_id: string;
          codigo_origen: Database['public']['Enums']['origen_codigo'];
          documento_referencia?: string | null;
          fecha_evento: string;
          fecha_sync?: string;
          folio_operacion?: number | null;
          sucursal_id?: string | null;
          tipo: Database['public']['Enums']['tipo_movimiento'];
          usuario_id: string;
          uuid_local: string;
        };
        Update: {
          camion_id?: string;
          cilindro_id?: string;
          codigo_origen?: Database['public']['Enums']['origen_codigo'];
          documento_referencia?: string | null;
          fecha_evento?: string;
          fecha_sync?: string;
          folio_operacion?: number | null;
          sucursal_id?: string | null;
          tipo?: Database['public']['Enums']['tipo_movimiento'];
          usuario_id?: string;
          uuid_local?: string;
        };
        Relationships: [];
      };
      movimientos_auditoria: {
        Row: {
          cambiado_en: string;
          cambiado_por: string | null;
          datos_antes: Json;
          datos_despues: Json | null;
          id: number;
          movimiento_uuid: string;
          operacion: string;
        };
        Insert: {
          cambiado_en?: string;
          cambiado_por?: string | null;
          datos_antes: Json;
          datos_despues?: Json | null;
          id?: never;
          movimiento_uuid: string;
          operacion: string;
        };
        Update: {
          cambiado_en?: string;
          cambiado_por?: string | null;
          datos_antes?: Json;
          datos_despues?: Json | null;
          id?: never;
          movimiento_uuid?: string;
          operacion?: string;
        };
        Relationships: [];
      };
      productos: {
        Row: {
          activo: boolean;
          capacidad: number | null;
          codigo: string;
          envase_codigo: string;
          gas_habitual: string | null;
          id: string;
          nombre: string;
          tipo_envase: Database['public']['Enums']['tipo_envase'];
          unidad: Database['public']['Enums']['unidad_capacidad'] | null;
        };
        Insert: {
          activo?: boolean;
          capacidad?: number | null;
          codigo: string;
          envase_codigo: string;
          gas_habitual?: string | null;
          id?: string;
          nombre: string;
          tipo_envase: Database['public']['Enums']['tipo_envase'];
          unidad?: Database['public']['Enums']['unidad_capacidad'] | null;
        };
        Update: {
          activo?: boolean;
          capacidad?: number | null;
          codigo?: string;
          envase_codigo?: string;
          gas_habitual?: string | null;
          id?: string;
          nombre?: string;
          tipo_envase?: Database['public']['Enums']['tipo_envase'];
          unidad?: Database['public']['Enums']['unidad_capacidad'] | null;
        };
        Relationships: [];
      };
      sucursales: {
        Row: {
          activo: boolean;
          ciudad: string | null;
          cliente_id: string;
          comuna: string | null;
          contacto: string | null;
          creado_en: string;
          direccion: string;
          email: string | null;
          es_principal: boolean;
          id: string;
          nombre: string;
          region: string | null;
          telefono: string | null;
        };
        Insert: {
          activo?: boolean;
          ciudad?: string | null;
          cliente_id: string;
          comuna?: string | null;
          contacto?: string | null;
          creado_en?: string;
          direccion: string;
          email?: string | null;
          es_principal?: boolean;
          id?: string;
          nombre: string;
          region?: string | null;
          telefono?: string | null;
        };
        Update: {
          activo?: boolean;
          ciudad?: string | null;
          cliente_id?: string;
          comuna?: string | null;
          contacto?: string | null;
          creado_en?: string;
          direccion?: string;
          email?: string | null;
          es_principal?: boolean;
          id?: string;
          nombre?: string;
          region?: string | null;
          telefono?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sucursales_cliente_id_fkey';
            columns: ['cliente_id'];
            isOneToOne: false;
            referencedRelation: 'clientes';
            referencedColumns: ['id'];
          },
        ];
      };
      usuarios: {
        Row: {
          activo: boolean;
          camion_jornada_id: string | null;
          creado_en: string;
          id: string;
          nombre: string;
          rol: Database['public']['Enums']['rol_usuario'];
        };
        Insert: {
          activo?: boolean;
          camion_jornada_id?: string | null;
          creado_en?: string;
          id: string;
          nombre: string;
          rol?: Database['public']['Enums']['rol_usuario'];
        };
        Update: {
          activo?: boolean;
          camion_jornada_id?: string | null;
          creado_en?: string;
          id?: string;
          nombre?: string;
          rol?: Database['public']['Enums']['rol_usuario'];
        };
        Relationships: [];
      };
    };
    Views: {
      v_movimientos: {
        Row: {
          camion_id: string | null;
          capacidad: number | null;
          cilindro_id: string | null;
          cliente_id: string | null;
          cliente_nombre: string | null;
          cliente_rut: string | null;
          codigo_barras: string | null;
          codigo_origen: Database['public']['Enums']['origen_codigo'] | null;
          deposito: string | null;
          documento_referencia: string | null;
          es_propiedad_cliente: boolean | null;
          estado_actual_cilindro: Database['public']['Enums']['estado_cilindro'] | null;
          fecha_evento: string | null;
          fecha_sync: string | null;
          folio_operacion: number | null;
          gas_habitual: string | null;
          numero_serie: string | null;
          patente: string | null;
          producto_codigo: string | null;
          producto_nombre: string | null;
          retraso_sync: string | null;
          serie_normalizada: string | null;
          sucursal_comuna: string | null;
          sucursal_id: string | null;
          sucursal_nombre: string | null;
          tecnico_nombre: string | null;
          tipo: Database['public']['Enums']['tipo_movimiento'] | null;
          tipo_envase: Database['public']['Enums']['tipo_envase'] | null;
          unidad: Database['public']['Enums']['unidad_capacidad'] | null;
          usuario_id: string | null;
          uuid_local: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      informe_envases_arrendados: {
        Args: {
          p_cliente_id: string;
          p_corte?: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: {
          codigo_arriendo: string;
          dias: number;
          envase_codigo: string;
          envases: number;
          producto: string;
        }[];
      };
    };
    Enums: {
      estado_cilindro: 'en_planta' | 'en_camion' | 'en_cliente';
      origen_codigo: 'escaner' | 'manual';
      rol_usuario: 'tecnico' | 'admin' | 'gerente';
      tipo_envase: 'cilindro' | 'paquete' | 'termo';
      tipo_movimiento: 'carga' | 'entrega' | 'retiro';
      unidad_capacidad: 'm3' | 'kg';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type Publico = Database['public'];

/** Fila de una tabla o vista: `Fila<'cilindros'>`, `Fila<'v_movimientos'>`. */
export type Fila<T extends keyof (Publico['Tables'] & Publico['Views'])> =
  (Publico['Tables'] & Publico['Views'])[T]['Row'];

/** Valores de un enum: `Enum<'tipo_movimiento'>`. */
export type Enum<T extends keyof Publico['Enums']> = Publico['Enums'][T];

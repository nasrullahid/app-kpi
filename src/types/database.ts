export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      daily_inputs: {
        Row: {
          achievement_rp: number | null
          achievement_user: number | null
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          notes: string | null
          period_id: string
          program_id: string
          prospek_drop: number
          prospek_notes: Json | null
          qualitative_status:
            | Database["public"]["Enums"]["qualitative_status"]
            | null
          updated_at: string | null
        }
        Insert: {
          achievement_rp?: number | null
          achievement_user?: number | null
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          notes?: string | null
          period_id: string
          program_id: string
          prospek_drop?: number
          prospek_notes?: Json | null
          qualitative_status?:
            | Database["public"]["Enums"]["qualitative_status"]
            | null
          updated_at?: string | null
        }
        Update: {
          achievement_rp?: number | null
          achievement_user?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          period_id?: string
          program_id?: string
          prospek_drop?: number
          prospek_notes?: Json | null
          qualitative_status?:
            | Database["public"]["Enums"]["qualitative_status"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_inputs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_inputs_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_inputs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_locked: boolean | null
          month: number
          working_days: number
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          month: number
          working_days: number
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          month?: number
          working_days?: number
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string | null
          daily_target_rp: number | null
          daily_target_user: number | null
          department: string
          id: string
          is_active: boolean | null
          monthly_target_rp: number | null
          monthly_target_user: number | null
          name: string
          pic_id: string | null
          pic_name: string
          pic_whatsapp: string | null
          qualitative_description: string | null
          target_type: Database["public"]["Enums"]["target_type"] | null
        }
        Insert: {
          created_at?: string | null
          daily_target_rp?: number | null
          daily_target_user?: number | null
          department?: string
          id?: string
          is_active?: boolean | null
          monthly_target_rp?: number | null
          monthly_target_user?: number | null
          name: string
          pic_id?: string | null
          pic_name: string
          pic_whatsapp?: string | null
          qualitative_description?: string | null
          target_type?: Database["public"]["Enums"]["target_type"] | null
        }
        Update: {
          created_at?: string | null
          daily_target_rp?: number | null
          daily_target_user?: number | null
          department?: string
          id?: string
          is_active?: boolean | null
          monthly_target_rp?: number | null
          monthly_target_user?: number | null
          name?: string
          pic_id?: string | null
          pic_name?: string
          pic_whatsapp?: string | null
          qualitative_description?: string | null
          target_type?: Database["public"]["Enums"]["target_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_pics: {
        Row: {
          created_at: string | null
          id: string
          program_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          program_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          program_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_pics_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_pics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_milestones: {
        Row: {
          created_at: string | null
          id: string
          program_id: string
          title: string
          description: string | null
          order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          program_id: string
          title: string
          description?: string | null
          order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          program_id?: string
          title?: string
          description?: string | null
          order?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_milestones_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_completions: {
        Row: {
          id: string
          milestone_id: string
          period_id: string
          is_completed: boolean
          notes: string | null
          evidence_url: string | null
          completed_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          milestone_id: string
          period_id: string
          is_completed?: boolean
          notes?: string | null
          evidence_url?: string | null
          completed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          milestone_id?: string
          period_id?: string
          is_completed?: boolean
          notes?: string | null
          evidence_url?: string | null
          completed_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestone_completions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "program_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_completions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      program_metric_definitions: {
        Row: {
          id: string
          program_id: string
          metric_key: string
          label: string
          data_type: 'integer' | 'currency' | 'percentage' | 'float' | 'boolean'
          input_type: 'manual' | 'calculated'
          formula: string | null
          is_target_metric: boolean
          is_primary: boolean
          monthly_target: number | null
          target_direction: 'higher_is_better' | 'lower_is_better'
          unit_label: string | null
          show_on_dashboard: boolean
          show_on_tv: boolean
          display_order: number
          metric_group: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          program_id: string
          metric_key: string
          label: string
          data_type: 'integer' | 'currency' | 'percentage' | 'float' | 'boolean'
          input_type: 'manual' | 'calculated'
          formula?: string | null
          is_target_metric?: boolean
          is_primary?: boolean
          monthly_target?: number | null
          target_direction?: 'higher_is_better' | 'lower_is_better'
          unit_label?: string | null
          show_on_dashboard?: boolean
          show_on_tv?: boolean
          display_order?: number
          metric_group?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          program_id?: string
          metric_key?: string
          label?: string
          data_type?: 'integer' | 'currency' | 'percentage' | 'float' | 'boolean'
          input_type?: 'manual' | 'calculated'
          formula?: string | null
          is_target_metric?: boolean
          is_primary?: boolean
          monthly_target?: number | null
          target_direction?: 'higher_is_better' | 'lower_is_better'
          unit_label?: string | null
          show_on_dashboard?: boolean
          show_on_tv?: boolean
          display_order?: number
          metric_group?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_metric_definitions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_metric_values: {
        Row: {
          id: string
          period_id: string
          program_id: string
          metric_definition_id: string
          date: string
          value: number | null
          target_value: number | null
          created_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          period_id: string
          program_id: string
          metric_definition_id: string
          date: string
          value?: number | null
          target_value?: number | null
          created_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          period_id?: string
          program_id?: string
          metric_definition_id?: string
          date?: string
          value?: number | null
          target_value?: number | null
          created_by?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_metric_values_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_metric_values_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_metric_values_metric_definition_id_fkey"
            columns: ["metric_definition_id"]
            isOneToOne: false
            referencedRelation: "program_metric_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      qualitative_status: "not_started" | "in_progress" | "completed"
      target_type: "quantitative" | "qualitative" | "hybrid" | "mou"
      user_role: "admin" | "pic"
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
  public: {
    Enums: {
      qualitative_status: ["not_started", "in_progress", "completed"],
      target_type: ["quantitative", "qualitative", "hybrid", "mou"],
      user_role: ["admin", "pic"],
    },
  },
} as const

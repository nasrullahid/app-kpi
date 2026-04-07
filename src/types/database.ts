export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          email: string
          role: 'admin' | 'pic'
          whatsapp_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          email: string
          role?: 'admin' | 'pic'
          whatsapp_number?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          role?: 'admin' | 'pic'
          whatsapp_number?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      programs: {
        Row: {
          id: string
          name: string
          pic_id: string | null
          pic_name: string
          pic_whatsapp: string | null
          target_type: 'quantitative' | 'qualitative' | 'hybrid'
          monthly_target_rp: number | null
          monthly_target_user: number | null
          daily_target_rp: number | null
          daily_target_user: number | null
          qualitative_description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          pic_id?: string | null
          pic_name: string
          pic_whatsapp?: string | null
          target_type?: 'quantitative' | 'qualitative' | 'hybrid'
          monthly_target_rp?: number | null
          monthly_target_user?: number | null
          daily_target_rp?: number | null
          daily_target_user?: number | null
          qualitative_description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          pic_id?: string | null
          pic_name?: string
          pic_whatsapp?: string | null
          target_type?: 'quantitative' | 'qualitative' | 'hybrid'
          monthly_target_rp?: number | null
          monthly_target_user?: number | null
          daily_target_rp?: number | null
          daily_target_user?: number | null
          qualitative_description?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      periods: {
        Row: {
          id: string
          month: number
          year: number
          working_days: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          month: number
          year: number
          working_days: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          month?: number
          year?: number
          working_days?: number
          is_active?: boolean
          created_at?: string
        }
      }
      daily_inputs: {
        Row: {
          id: string
          period_id: string
          program_id: string
          date: string
          achievement_rp: number | null
          achievement_user: number | null
          qualitative_status: 'not_started' | 'in_progress' | 'completed' | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          period_id: string
          program_id: string
          date: string
          achievement_rp?: number | null
          achievement_user?: number | null
          qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          program_id?: string
          date?: string
          achievement_rp?: number | null
          achievement_user?: number | null
          qualitative_status?: 'not_started' | 'in_progress' | 'completed' | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: 'admin' | 'pic'
      target_type: 'quantitative' | 'qualitative' | 'hybrid'
      qualitative_status: 'not_started' | 'in_progress' | 'completed'
    }
  }
}

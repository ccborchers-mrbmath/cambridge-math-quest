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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      coach_student_links: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: []
      }
      help_requests: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          message: string
          status: Database["public"]["Enums"]["help_request_status"]
          student_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          message?: string
          status?: Database["public"]["Enums"]["help_request_status"]
          student_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          message?: string
          status?: Database["public"]["Enums"]["help_request_status"]
          student_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          coach_code: string | null
          created_at: string
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          share_progress_with_coaches: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          coach_code?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          full_name?: string | null
          id?: string
          share_progress_with_coaches?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          coach_code?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          share_progress_with_coaches?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proposed_slots: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          proposed_by: string
          request_id: string
          scheduled_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          proposed_by: string
          request_id: string
          scheduled_at: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          proposed_by?: string
          request_id?: string
          scheduled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposed_slots_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          marks: number | null
          markscheme_image_path: string | null
          markscheme_text: string | null
          markscheme_text_status: string
          markscheme_url: string | null
          module: Database["public"]["Enums"]["module_code"]
          notes: string | null
          paper_number: number
          question_image_path: string | null
          question_number: number
          question_text: string | null
          question_text_status: string
          question_url: string | null
          sitting: string
          subtopic_ids: string[] | null
          subtopics: string | null
          topic: string | null
          topic_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          marks?: number | null
          markscheme_image_path?: string | null
          markscheme_text?: string | null
          markscheme_text_status?: string
          markscheme_url?: string | null
          module?: Database["public"]["Enums"]["module_code"]
          notes?: string | null
          paper_number: number
          question_image_path?: string | null
          question_number: number
          question_text?: string | null
          question_text_status?: string
          question_url?: string | null
          sitting: string
          subtopic_ids?: string[] | null
          subtopics?: string | null
          topic?: string | null
          topic_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          marks?: number | null
          markscheme_image_path?: string | null
          markscheme_text?: string | null
          markscheme_text_status?: string
          markscheme_url?: string | null
          module?: Database["public"]["Enums"]["module_code"]
          notes?: string | null
          paper_number?: number
          question_image_path?: string | null
          question_number?: number
          question_text?: string | null
          question_text_status?: string
          question_url?: string | null
          sitting?: string
          subtopic_ids?: string[] | null
          subtopics?: string | null
          topic?: string | null
          topic_id?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      sessions: {
        Row: {
          coach_id: string
          created_at: string
          daily_room_name: string | null
          daily_room_url: string | null
          duration_minutes: number
          id: string
          request_id: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["session_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          daily_room_name?: string | null
          daily_room_url?: string | null
          duration_minutes?: number
          id?: string
          request_id?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          daily_room_name?: string | null
          daily_room_url?: string | null
          duration_minutes?: number
          id?: string
          request_id?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_attempts: {
        Row: {
          ai_feedback: string | null
          attempted: boolean | null
          created_at: string
          id: string
          image_url: string | null
          mark_breakdown: Json | null
          nature_of_errors: string | null
          paper_number: number
          percentage_attained: number | null
          question_number: number
          sitting: string
          subtopic: string | null
          topic: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          ai_feedback?: string | null
          attempted?: boolean | null
          created_at?: string
          id?: string
          image_url?: string | null
          mark_breakdown?: Json | null
          nature_of_errors?: string | null
          paper_number: number
          percentage_attained?: number | null
          question_number: number
          sitting: string
          subtopic?: string | null
          topic?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          ai_feedback?: string | null
          attempted?: boolean | null
          created_at?: string
          id?: string
          image_url?: string | null
          mark_breakdown?: Json | null
          nature_of_errors?: string | null
          paper_number?: number
          percentage_attained?: number | null
          question_number?: number
          sitting?: string
          subtopic?: string | null
          topic?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_attempts_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_coach_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "student" | "coach"
      help_request_status:
        | "pending"
        | "accepted"
        | "declined"
        | "scheduled"
        | "completed"
        | "cancelled"
      module_code: "P1" | "P2" | "P3" | "S1" | "S2" | "M1"
      session_status: "scheduled" | "in_progress" | "completed" | "cancelled"
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
      app_role: ["admin", "student", "coach"],
      help_request_status: [
        "pending",
        "accepted",
        "declined",
        "scheduled",
        "completed",
        "cancelled",
      ],
      module_code: ["P1", "P2", "P3", "S1", "S2", "M1"],
      session_status: ["scheduled", "in_progress", "completed", "cancelled"],
    },
  },
} as const

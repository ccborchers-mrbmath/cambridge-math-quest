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
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_question_views: {
        Row: {
          day: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          day?: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          day?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_notes: string | null
          category: Database["public"]["Enums"]["feedback_category"]
          context: Json
          created_at: string
          id: string
          message: string
          page_url: string | null
          question_id: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          category: Database["public"]["Enums"]["feedback_category"]
          context?: Json
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          question_id?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          category?: Database["public"]["Enums"]["feedback_category"]
          context?: Json
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          question_id?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
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
      manual_completions: {
        Row: {
          confidence: Database["public"]["Enums"]["self_confidence"]
          created_at: string
          id: string
          module: Database["public"]["Enums"]["module_code"]
          paper_number: number
          question_number: number
          sitting: string
          topic: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["self_confidence"]
          created_at?: string
          id?: string
          module: Database["public"]["Enums"]["module_code"]
          paper_number: number
          question_number: number
          sitting: string
          topic?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          confidence?: Database["public"]["Enums"]["self_confidence"]
          created_at?: string
          id?: string
          module?: Database["public"]["Enums"]["module_code"]
          paper_number?: number
          question_number?: number
          sitting?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
          year?: number
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
      processed_paddle_events: {
        Row: {
          environment: string
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          environment: string
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          environment?: string
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          billing_exempt: boolean
          coach_code: string | null
          created_at: string
          credit_multiplier: number
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          last_ai_use_at: string | null
          share_progress_with_coaches: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_exempt?: boolean
          coach_code?: string | null
          created_at?: string
          credit_multiplier?: number
          display_name?: string | null
          email: string
          full_name?: string | null
          id?: string
          last_ai_use_at?: string | null
          share_progress_with_coaches?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_exempt?: boolean
          coach_code?: string | null
          created_at?: string
          credit_multiplier?: number
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_ai_use_at?: string | null
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          last_granted_period_start: string | null
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          last_granted_period_start?: string | null
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          last_granted_period_start?: string | null
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          credits_expire_at: string | null
          subscription_credits: number
          subscription_ends_at: string | null
          subscription_status: string
          topup_credits: number
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          credits_expire_at?: string | null
          subscription_credits?: number
          subscription_ends_at?: string | null
          subscription_status?: string
          topup_credits?: number
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          credits_expire_at?: string | null
          subscription_credits?: number
          subscription_ends_at?: string | null
          subscription_status?: string
          topup_credits?: number
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      deduct_credits: {
        Args: {
          _base_cost: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
      expire_all_credits: { Args: { _user_id: string }; Returns: undefined }
      find_coach_by_code: { Args: { _code: string }; Returns: string }
      generate_coach_code: { Args: never; Returns: string }
      grant_credits: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason?: string
          _user_id: string
        }
        Returns: Json
      }
      grant_subscription_credits: {
        Args: { _amount: number; _expires_at: string; _user_id: string }
        Returns: undefined
      }
      grant_topup_credits: {
        Args: { _amount: number; _metadata?: Json; _user_id: string }
        Returns: undefined
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_question_view: { Args: { _user_id: string }; Returns: Json }
      set_billing_exempt: {
        Args: { _exempt: boolean; _user_id: string }
        Returns: undefined
      }
      set_credit_multiplier: {
        Args: { _multiplier: number; _user_id: string }
        Returns: undefined
      }
      set_vip_status: {
        Args: { _is_vip: boolean; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "student" | "coach" | "vip"
      feedback_category:
        | "ai_inaccuracy"
        | "wrong_categorisation"
        | "bug"
        | "feature_request"
        | "other"
      feedback_status: "open" | "triaged" | "resolved" | "wont_fix"
      help_request_status:
        | "pending"
        | "accepted"
        | "declined"
        | "scheduled"
        | "completed"
        | "cancelled"
      module_code: "P1" | "P2" | "P3" | "S1" | "S2" | "M1"
      self_confidence: "easy" | "ok" | "struggled"
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
      app_role: ["admin", "student", "coach", "vip"],
      feedback_category: [
        "ai_inaccuracy",
        "wrong_categorisation",
        "bug",
        "feature_request",
        "other",
      ],
      feedback_status: ["open", "triaged", "resolved", "wont_fix"],
      help_request_status: [
        "pending",
        "accepted",
        "declined",
        "scheduled",
        "completed",
        "cancelled",
      ],
      module_code: ["P1", "P2", "P3", "S1", "S2", "M1"],
      self_confidence: ["easy", "ok", "struggled"],
      session_status: ["scheduled", "in_progress", "completed", "cancelled"],
    },
  },
} as const

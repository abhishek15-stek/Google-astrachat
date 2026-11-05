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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credits: {
        Row: {
          admin_notify_counter: number
          advanced_used: number
          bucket_date: string
          file_used: number
          id: string
          image_used: number
          text_used: number
          updated_at: string
          user_id: string
          video_used: number
        }
        Insert: {
          admin_notify_counter?: number
          advanced_used?: number
          bucket_date?: string
          file_used?: number
          id?: string
          image_used?: number
          text_used?: number
          updated_at?: string
          user_id: string
          video_used?: number
        }
        Update: {
          admin_notify_counter?: number
          advanced_used?: number
          bucket_date?: string
          file_used?: number
          id?: string
          image_used?: number
          text_used?: number
          updated_at?: string
          user_id?: string
          video_used?: number
        }
        Relationships: []
      }
      ai_memory: {
        Row: {
          content: string
          created_at: string
          id: string
          importance: number
          kind: string
          subject_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          importance?: number
          kind?: string
          subject_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          importance?: number
          kind?: string
          subject_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          kind: string
          model: string
          success: boolean
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          kind: string
          model: string
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          kind?: string
          model?: string
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: []
      }
      astrabot_actions: {
        Row: {
          actor_user_id: string | null
          created_at: string
          error: string | null
          id: string
          input: Json | null
          output: Json | null
          success: boolean
          tool_name: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          success?: boolean
          tool_name: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          success?: boolean
          tool_name?: string
        }
        Relationships: []
      }
      call_transcripts: {
        Row: {
          call_id: string
          created_at: string
          id: string
          kind: string
          lang: string | null
          speaker_id: string | null
          text: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          kind?: string
          lang?: string | null
          speaker_id?: string | null
          text: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          kind?: string
          lang?: string | null
          speaker_id?: string | null
          text?: string
        }
        Relationships: []
      }
      calls: {
        Row: {
          answer: Json | null
          call_type: string
          caller_id: string
          created_at: string
          ended_at: string | null
          ice_candidates: Json | null
          id: string
          offer: Json | null
          receiver_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          answer?: Json | null
          call_type?: string
          caller_id: string
          created_at?: string
          ended_at?: string | null
          ice_candidates?: Json | null
          id?: string
          offer?: Json | null
          receiver_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          answer?: Json | null
          call_type?: string
          caller_id?: string
          created_at?: string
          ended_at?: string | null
          ice_candidates?: Json | null
          id?: string
          offer?: Json | null
          receiver_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_requests: {
        Row: {
          context: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_answered: boolean | null
          options: Json | null
          question: string
          question_type: string
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_answered?: boolean | null
          options?: Json | null
          question: string
          question_type?: string
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_answered?: boolean | null
          options?: Json | null
          question?: string
          question_type?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback_responses: {
        Row: {
          created_at: string
          id: string
          request_id: string
          selected_option: string | null
          star_rating: number | null
          text_response: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          selected_option?: string | null
          star_rating?: number | null
          text_response?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          selected_option?: string | null
          star_rating?: number | null
          text_response?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "feedback_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_broadcast: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_broadcast?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_broadcast?: boolean
          name?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          file_type: string | null
          file_url: string | null
          id: string
          receiver_id: string
          receiver_type: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          receiver_id: string
          receiver_type: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          receiver_id?: string
          receiver_type?: string
          sender_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_banned: boolean
          last_active: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          is_banned?: boolean
          last_active?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_banned?: boolean
          last_active?: string | null
        }
        Relationships: []
      }
      read_receipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      screen_share_sessions: {
        Row: {
          answer: Json | null
          created_at: string
          ended_at: string | null
          ice_candidates: Json | null
          id: string
          offer: Json | null
          receiver_id: string
          requester_id: string
          status: string
        }
        Insert: {
          answer?: Json | null
          created_at?: string
          ended_at?: string | null
          ice_candidates?: Json | null
          id?: string
          offer?: Json | null
          receiver_id: string
          requester_id: string
          status?: string
        }
        Update: {
          answer?: Json | null
          created_at?: string
          ended_at?: string | null
          ice_candidates?: Json | null
          id?: string
          offer?: Json | null
          receiver_id?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_share_sessions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screen_share_sessions_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          target_id: string | null
          target_type: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          target_id?: string | null
          target_type?: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          target_id?: string | null
          target_type?: string
          title?: string
        }
        Relationships: []
      }
      typing_status: {
        Row: {
          id: string
          is_typing: boolean
          thread_id: string
          thread_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_typing?: boolean
          thread_id: string
          thread_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_typing?: boolean
          thread_id?: string
          thread_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          chat_theme: string | null
          chat_wallpaper: string | null
          created_at: string
          id: string
          notification_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_theme?: string | null
          chat_wallpaper?: string | null
          created_at?: string
          id?: string
          notification_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_theme?: string | null
          chat_wallpaper?: string | null
          created_at?: string
          id?: string
          notification_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reported_issues: {
        Row: {
          action_taken: string | null
          action_taken_by: string | null
          category: string
          created_at: string
          detailed_explanation: string | null
          follow_up_count: number | null
          id: string
          last_follow_up_at: string | null
          main_problem: string
          priority: string | null
          resolved_at: string | null
          status: string
          updated_at: string
          user_email: string | null
          user_feedback: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action_taken?: string | null
          action_taken_by?: string | null
          category?: string
          created_at?: string
          detailed_explanation?: string | null
          follow_up_count?: number | null
          id?: string
          last_follow_up_at?: string | null
          main_problem: string
          priority?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_feedback?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action_taken?: string | null
          action_taken_by?: string | null
          category?: string
          created_at?: string
          detailed_explanation?: string | null
          follow_up_count?: number | null
          id?: string
          last_follow_up_at?: string | null
          main_problem?: string
          priority?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_feedback?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          content: string | null
          created_at: string
          expires_at: string
          id: string
          media_type: string | null
          media_url: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_consume_credit: {
        Args: { _kind: string; _user_id: string }
        Returns: Json
      }
      get_admin_id: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_level: {
        Args: {
          _min_role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      role_level: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "sub_admin"
        | "senior_member"
        | "member"
        | "spectator"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "admin",
        "user",
        "sub_admin",
        "senior_member",
        "member",
        "spectator",
      ],
    },
  },
} as const

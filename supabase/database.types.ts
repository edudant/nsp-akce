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
      admin_email_allowlist: {
        Row: {
          added_at: string
          added_by: string | null
          claimed_at: string | null
          claimed_by: string | null
          email: string
          is_active: boolean
          note: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          email: string
          is_active?: boolean
          note?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          email?: string
          is_active?: boolean
          note?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          arrived_at: string | null
          calculated_points: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          effective_points: number | null
          event_id: string
          left_at: string | null
          member_id: string
          minutes_present: number | null
          override_reason: string | null
          points_override: number | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          calculated_points?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          effective_points?: number | null
          event_id: string
          left_at?: string | null
          member_id: string
          minutes_present?: number | null
          override_reason?: string | null
          points_override?: number | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          calculated_points?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          effective_points?: number | null
          event_id?: string
          left_at?: string | null
          member_id?: string
          minutes_present?: number | null
          override_reason?: string | null
          points_override?: number | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          change_reason: string | null
          client_ip: unknown
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          record_id: Json
          request_id: string | null
          table_name: string
          table_schema: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          change_reason?: string | null
          client_ip?: unknown
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id: Json
          request_id?: string | null
          table_name: string
          table_schema: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          change_reason?: string | null
          client_ip?: unknown
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: Json
          request_id?: string | null
          table_name?: string
          table_schema?: string
        }
        Relationships: []
      }
      event_pairs: {
        Row: {
          created_at: string
          created_by: string | null
          explanation: string
          id: string
          is_confirmed_actual: boolean
          is_locked: boolean
          manual_change_reason: string | null
          member_a_id: string
          member_b_id: string
          pairing_run_id: string
          round_number: number
          score: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          explanation?: string
          id?: string
          is_confirmed_actual?: boolean
          is_locked?: boolean
          manual_change_reason?: string | null
          member_a_id: string
          member_b_id: string
          pairing_run_id: string
          round_number: number
          score?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          explanation?: string
          id?: string
          is_confirmed_actual?: boolean
          is_locked?: boolean
          manual_change_reason?: string | null
          member_a_id?: string
          member_b_id?: string
          pairing_run_id?: string
          round_number?: number
          score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_pairs_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_pairs_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_pairs_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_pairs_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_pairs_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_pairs_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_pairs_pairing_run_id_fkey"
            columns: ["pairing_run_id"]
            isOneToOne: false
            referencedRelation: "pairing_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          event_id: string
          member_id: string
          note: string | null
          selected_at: string
          selected_by: string | null
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
        }
        Insert: {
          event_id: string
          member_id: string
          note?: string | null
          selected_at?: string
          selected_by?: string | null
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
        }
        Update: {
          event_id?: string
          member_id?: string
          note?: string | null
          selected_at?: string
          selected_by?: string | null
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_responses: {
        Row: {
          event_id: string
          member_id: string
          note: string | null
          responded_at: string
          responded_by: string | null
          response: Database["public"]["Enums"]["event_response_status"]
          updated_at: string
        }
        Insert: {
          event_id: string
          member_id: string
          note?: string | null
          responded_at?: string
          responded_by?: string | null
          response?: Database["public"]["Enums"]["event_response_status"]
          updated_at?: string
        }
        Update: {
          event_id?: string
          member_id?: string
          note?: string | null
          responded_at?: string
          responded_by?: string | null
          response?: Database["public"]["Enums"]["event_response_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          location: string | null
          note: string | null
          points_weight: number
          program: string | null
          required_pairs: number | null
          response_deadline: string | null
          season_id: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["event_visibility"]
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          location?: string | null
          note?: string | null
          points_weight?: number
          program?: string | null
          required_pairs?: number | null
          response_deadline?: string | null
          season_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          location?: string | null
          note?: string | null
          points_weight?: number
          program?: string | null
          required_pairs?: number | null
          response_deadline?: string | null
          season_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          active_from: string | null
          active_to: string | null
          admin_note: string | null
          created_at: string
          display_name: string
          experience_level: Database["public"]["Enums"]["experience_level"]
          id: string
          is_active: boolean
          pairing_role: Database["public"]["Enums"]["pairing_role"]
          short_name: string
          updated_at: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          admin_note?: string | null
          created_at?: string
          display_name: string
          experience_level?: Database["public"]["Enums"]["experience_level"]
          id?: string
          is_active?: boolean
          pairing_role: Database["public"]["Enums"]["pairing_role"]
          short_name: string
          updated_at?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          admin_note?: string | null
          created_at?: string
          display_name?: string
          experience_level?: Database["public"]["Enums"]["experience_level"]
          id?: string
          is_active?: boolean
          pairing_role?: Database["public"]["Enums"]["pairing_role"]
          short_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pairing_preferences: {
        Row: {
          created_at: string
          created_by: string | null
          kind: Database["public"]["Enums"]["pairing_preference_kind"]
          member_a_id: string
          member_b_id: string
          private_reason: string | null
          strength: number
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          kind: Database["public"]["Enums"]["pairing_preference_kind"]
          member_a_id: string
          member_b_id: string
          private_reason?: string | null
          strength?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          kind?: Database["public"]["Enums"]["pairing_preference_kind"]
          member_a_id?: string
          member_b_id?: string
          private_reason?: string | null
          strength?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairing_preferences_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "pairing_preferences_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "pairing_preferences_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_preferences_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "pairing_preferences_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "pairing_preferences_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_rules: {
        Row: {
          beginner_beginner_penalty: number
          beginner_experienced_bonus: number
          discouraged_pair_penalty: number
          history_lookback_days: number
          id: number
          preferred_pair_bonus: number
          recent_pair_penalty: number
          repeat_pair_penalty: number
          same_event_repeat_penalty: number
          unpaired_history_penalty: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          beginner_beginner_penalty?: number
          beginner_experienced_bonus?: number
          discouraged_pair_penalty?: number
          history_lookback_days?: number
          id?: number
          preferred_pair_bonus?: number
          recent_pair_penalty?: number
          repeat_pair_penalty?: number
          same_event_repeat_penalty?: number
          unpaired_history_penalty?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          beginner_beginner_penalty?: number
          beginner_experienced_bonus?: number
          discouraged_pair_penalty?: number
          history_lookback_days?: number
          id?: number
          preferred_pair_bonus?: number
          recent_pair_penalty?: number
          repeat_pair_penalty?: number
          same_event_repeat_penalty?: number
          unpaired_history_penalty?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pairing_runs: {
        Row: {
          algorithm_version: string
          event_id: string
          generated_at: string
          generated_by: string | null
          id: string
          note: string | null
          published_at: string | null
          rules_snapshot: Json
          seed: number
          status: Database["public"]["Enums"]["pairing_run_status"]
          updated_at: string
        }
        Insert: {
          algorithm_version?: string
          event_id: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          note?: string | null
          published_at?: string | null
          rules_snapshot?: Json
          seed: number
          status?: Database["public"]["Enums"]["pairing_run_status"]
          updated_at?: string
        }
        Update: {
          algorithm_version?: string
          event_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          note?: string | null
          published_at?: string | null
          rules_snapshot?: Json
          seed?: number
          status?: Database["public"]["Enums"]["pairing_run_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "pairing_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          member_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "event_attendance_detail"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "member_scores"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          date_from: string
          date_to: string
          id: string
          is_current: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_from: string
          date_to: string
          id?: string
          is_current?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_from?: string
          date_to?: string
          id?: string
          is_current?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shared_access_attempts: {
        Row: {
          attempt_count: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          attempt_count?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          attempt_count?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
      }
      shared_access_config: {
        Row: {
          code_hash: string | null
          id: number
          is_enabled: boolean
          rotated_at: string | null
          rotated_by: string | null
          session_duration_minutes: number
          updated_at: string
        }
        Insert: {
          code_hash?: string | null
          id?: number
          is_enabled?: boolean
          rotated_at?: string | null
          rotated_by?: string | null
          session_duration_minutes?: number
          updated_at?: string
        }
        Update: {
          code_hash?: string | null
          id?: number
          is_enabled?: boolean
          rotated_at?: string | null
          rotated_by?: string | null
          session_duration_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      shared_access_sessions: {
        Row: {
          expires_at: string
          last_seen_at: string
          user_id: string
          verified_at: string
        }
        Insert: {
          expires_at: string
          last_seen_at?: string
          user_id: string
          verified_at?: string
        }
        Update: {
          expires_at?: string
          last_seen_at?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      event_attendance_detail: {
        Row: {
          arrived_at: string | null
          attendance_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          calculated_points: number | null
          confirmed_at: string | null
          display_name: string | null
          effective_points: number | null
          ends_at: string | null
          event_id: string | null
          event_title: string | null
          event_type: Database["public"]["Enums"]["event_type"] | null
          left_at: string | null
          member_id: string | null
          minutes_present: number | null
          override_reason: string | null
          pairing_role: Database["public"]["Enums"]["pairing_role"] | null
          points_override: number | null
          points_weight: number | null
          short_name: string | null
          starts_at: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      member_scores: {
        Row: {
          absent_count: number | null
          display_name: string | null
          excused_count: number | null
          experience_level:
            | Database["public"]["Enums"]["experience_level"]
            | null
          full_attendance_count: number | null
          is_active: boolean | null
          last_attended_at: string | null
          last_updated_at: string | null
          member_id: string | null
          pairing_role: Database["public"]["Enums"]["pairing_role"] | null
          partial_attendance_count: number | null
          performance_points: number | null
          possible_points: number | null
          rehearsal_points: number | null
          season_id: string | null
          season_name: string | null
          short_name: string | null
          total_points: number | null
        }
        Relationships: []
      }
      pair_history: {
        Row: {
          first_paired_at: string | null
          last_paired_at: string | null
          member_high_id: string | null
          member_low_id: string | null
          times_paired: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_member_respond: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      confirm_actual_pairs: { Args: { target_run_id: string }; Returns: number }
      current_member_id: { Args: never; Returns: string }
      end_shared_session: { Args: never; Returns: undefined }
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_pairing_candidate_scores: {
        Args: { target_event_id: string; target_pairing_run_id?: string }
        Returns: {
          blocked: boolean
          explanation: string
          member_a_id: string
          member_b_id: string
          score: number
        }[]
      }
      get_shared_event_attendance: {
        Args: { target_event_id: string }
        Returns: Json
      }
      get_shared_event_pairs: {
        Args: { target_event_id: string }
        Returns: Json
      }
      get_shared_overview: { Args: never; Returns: Json }
      get_staff_members: {
        Args: never
        Returns: {
          active_from: string
          active_to: string
          admin_note: string
          created_at: string
          display_name: string
          experience_level: Database["public"]["Enums"]["experience_level"]
          id: string
          is_active: boolean
          pairing_role: Database["public"]["Enums"]["pairing_role"]
          short_name: string
          updated_at: string
        }[]
      }
      has_active_shared_session: { Args: never; Returns: boolean }
      has_role: {
        Args: { required_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      publish_pairing_run: {
        Args: {
          allow_confirmed_override?: boolean
          override_reason?: string
          target_run_id: string
        }
        Returns: undefined
      }
      rotate_shared_code: { Args: never; Returns: string }
      set_current_season: {
        Args: { target_season_id: string }
        Returns: undefined
      }
      set_shared_access_enabled: {
        Args: { enabled: boolean }
        Returns: undefined
      }
      update_all_event_attendance: {
        Args: {
          new_attendance_status: Database["public"]["Enums"]["attendance_status"]
          target_event_id: string
        }
        Returns: number
      }
      update_event_member_state: {
        Args: {
          new_attendance_status?: Database["public"]["Enums"]["attendance_status"]
          new_minutes_present?: number
          new_response?: Database["public"]["Enums"]["event_response_status"]
          new_selected?: boolean
          set_minutes?: boolean
          target_event_id: string
          target_member_id: string
        }
        Returns: undefined
      }
      verify_shared_code: { Args: { code: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "recorder" | "member"
      attendance_status:
        | "unrecorded"
        | "full"
        | "partial"
        | "absent"
        | "excused"
      event_response_status:
        | "unanswered"
        | "yes"
        | "no"
        | "maybe"
        | "substitute"
      event_status: "draft" | "open" | "closed" | "cancelled"
      event_type: "rehearsal" | "performance"
      event_visibility: "public" | "shared" | "members" | "private"
      experience_level: "beginner" | "advanced" | "experienced"
      pairing_preference_kind: "forbidden" | "discouraged" | "preferred"
      pairing_role: "lead" | "follow"
      pairing_run_status: "draft" | "published" | "superseded"
      participant_status: "invited" | "selected" | "substitute" | "declined"
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
      app_role: ["admin", "recorder", "member"],
      attendance_status: ["unrecorded", "full", "partial", "absent", "excused"],
      event_response_status: ["unanswered", "yes", "no", "maybe", "substitute"],
      event_status: ["draft", "open", "closed", "cancelled"],
      event_type: ["rehearsal", "performance"],
      event_visibility: ["public", "shared", "members", "private"],
      experience_level: ["beginner", "advanced", "experienced"],
      pairing_preference_kind: ["forbidden", "discouraged", "preferred"],
      pairing_role: ["lead", "follow"],
      pairing_run_status: ["draft", "published", "superseded"],
      participant_status: ["invited", "selected", "substitute", "declined"],
    },
  },
} as const

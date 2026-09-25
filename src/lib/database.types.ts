// ĐƯỢC SINH TỰ ĐỘNG bởi scripts/gen-db-types.py — không sửa tay.
// Có thể thay bằng: npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_assignments: {
        Row: {
          id: string;
          scope: string;
          user_id: string | null;
          usage: string;
          connection_id: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope: string;
          user_id?: string | null;
          usage: string;
          connection_id: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scope?: string;
          user_id?: string | null;
          usage?: string;
          connection_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_assignments_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "ai_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_connections: {
        Row: {
          id: string;
          scope: string;
          user_id: string | null;
          name: string;
          provider: string;
          base_url: string | null;
          encrypted_key: string;
          key_hint: string | null;
          model: string;
          params: Json;
          status: string;
          last_tested_at: string | null;
          last_latency_ms: number | null;
          last_error: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope: string;
          user_id?: string | null;
          name: string;
          provider: string;
          base_url?: string | null;
          encrypted_key: string;
          key_hint?: string | null;
          model: string;
          params?: Json;
          status?: string;
          last_tested_at?: string | null;
          last_latency_ms?: number | null;
          last_error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scope?: string;
          user_id?: string | null;
          name?: string;
          provider?: string;
          base_url?: string | null;
          encrypted_key?: string;
          key_hint?: string | null;
          model?: string;
          params?: Json;
          status?: string;
          last_tested_at?: string | null;
          last_latency_ms?: number | null;
          last_error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_connections_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversations: {
        Row: {
          id: string;
          user_id: string;
          recording_id: string | null;
          group_id: string | null;
          title: string | null;
          source_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          recording_id?: string | null;
          group_id?: string | null;
          title?: string | null;
          source_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          recording_id?: string | null;
          group_id?: string | null;
          title?: string | null;
          source_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_conversations_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: false;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_conversations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          provider: string | null;
          model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: string;
          content: string;
          provider?: string | null;
          model?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: string;
          content?: string;
          provider?: string | null;
          model?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_members: {
        Row: {
          channel_id: string;
          user_id: string;
          last_read_at: string;
        };
        Insert: {
          channel_id: string;
          user_id: string;
          last_read_at?: string;
        };
        Update: {
          channel_id?: string;
          user_id?: string;
          last_read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channel_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      channels: {
        Row: {
          id: string;
          kind: string;
          group_id: string | null;
          dm_key: string | null;
          last_message_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          kind: string;
          group_id?: string | null;
          dm_key?: string | null;
          last_message_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          group_id?: string | null;
          dm_key?: string | null;
          last_message_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channels_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: true;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      glossary_terms: {
        Row: {
          id: string;
          scope: string;
          group_id: string | null;
          user_id: string | null;
          term: string;
          aliases: string[];
          category: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          scope: string;
          group_id?: string | null;
          user_id?: string | null;
          term: string;
          aliases?: string[];
          category?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          scope?: string;
          group_id?: string | null;
          user_id?: string | null;
          term?: string;
          aliases?: string[];
          category?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "glossary_terms_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "glossary_terms_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "glossary_terms_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          role: string;
          joined_at: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
          role?: string;
          joined_at?: string;
        };
        Update: {
          group_id?: string;
          user_id?: string;
          role?: string;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          owner_id: string;
          invite_code: string;
          invite_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          owner_id: string;
          invite_code?: string;
          invite_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          owner_id?: string;
          invite_code?: string;
          invite_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_id: string | null;
          content: string;
          recording_id: string | null;
          report_id: string | null;
          created_at: string;
          edited_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          channel_id: string;
          sender_id?: string | null;
          content?: string;
          recording_id?: string | null;
          report_id?: string | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          channel_id?: string;
          sender_id?: string | null;
          content?: string;
          recording_id?: string | null;
          report_id?: string | null;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: false;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          recording_id: string | null;
          title: string | null;
          content: string;
          anchor_sec: number | null;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          recording_id?: string | null;
          title?: string | null;
          content?: string;
          anchor_sec?: number | null;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          recording_id?: string | null;
          title?: string | null;
          content?: string;
          anchor_sec?: number | null;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: false;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          title: string | null;
          department: string | null;
          avatar_url: string | null;
          role: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          title?: string | null;
          department?: string | null;
          avatar_url?: string | null;
          role?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          title?: string | null;
          department?: string | null;
          avatar_url?: string | null;
          role?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      recording_shares: {
        Row: {
          id: string;
          recording_id: string;
          group_id: string | null;
          user_id: string | null;
          permission: string;
          shared_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recording_id: string;
          group_id?: string | null;
          user_id?: string | null;
          permission?: string;
          shared_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recording_id?: string;
          group_id?: string | null;
          user_id?: string | null;
          permission?: string;
          shared_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recording_shares_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recording_shares_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: false;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recording_shares_shared_by_fkey";
            columns: ["shared_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recording_shares_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recordings: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          category: string;
          meeting_date: string | null;
          location: string | null;
          participants: string | null;
          tags: string[];
          language: string;
          drive_file_id: string | null;
          original_filename: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          duration_sec: number | null;
          upload_status: string;
          status: string;
          status_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          category?: string;
          meeting_date?: string | null;
          location?: string | null;
          participants?: string | null;
          tags?: string[];
          language?: string;
          drive_file_id?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          duration_sec?: number | null;
          upload_status?: string;
          status?: string;
          status_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          meeting_date?: string | null;
          location?: string | null;
          participants?: string | null;
          tags?: string[];
          language?: string;
          drive_file_id?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          duration_sec?: number | null;
          upload_status?: string;
          status?: string;
          status_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recordings_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          recording_id: string;
          template_key: string | null;
          title: string;
          content: string;
          status: string;
          provider: string | null;
          model: string | null;
          is_shared: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recording_id: string;
          template_key?: string | null;
          title: string;
          content?: string;
          status?: string;
          provider?: string | null;
          model?: string | null;
          is_shared?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          recording_id?: string;
          template_key?: string | null;
          title?: string;
          content?: string;
          status?: string;
          provider?: string | null;
          model?: string | null;
          is_shared?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: false;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          id: string;
          scope: string;
          owner_id: string | null;
          group_id: string | null;
          name: string;
          description: string | null;
          category: string;
          prompt: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope?: string;
          owner_id?: string | null;
          group_id?: string | null;
          name: string;
          description?: string | null;
          category?: string;
          prompt: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scope?: string;
          owner_id?: string | null;
          group_id?: string | null;
          name?: string;
          description?: string | null;
          category?: string;
          prompt?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "templates_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "templates_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transcription_chunks: {
        Row: {
          job_id: string;
          idx: number;
          kind: string;
          start_sec: number;
          end_sec: number;
          file_uri: string | null;
          file_name: string | null;
          mime_type: string | null;
          status: string;
          attempts: number;
          result: Json | null;
          error: string | null;
          claimed_at: string | null;
          updated_at: string;
        };
        Insert: {
          job_id: string;
          idx: number;
          kind?: string;
          start_sec: number;
          end_sec: number;
          file_uri?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          status?: string;
          attempts?: number;
          result?: Json | null;
          error?: string | null;
          claimed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          job_id?: string;
          idx?: number;
          kind?: string;
          start_sec?: number;
          end_sec?: number;
          file_uri?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          status?: string;
          attempts?: number;
          result?: Json | null;
          error?: string | null;
          claimed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transcription_chunks_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "transcription_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      transcription_jobs: {
        Row: {
          id: string;
          recording_id: string;
          created_by: string | null;
          status: string;
          stage: string | null;
          progress: number;
          error: string | null;
          engine: string;
          model: string | null;
          options: Json;
          analysis: Json | null;
          total_chunks: number;
          done_chunks: number;
          base_url: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recording_id: string;
          created_by?: string | null;
          status?: string;
          stage?: string | null;
          progress?: number;
          error?: string | null;
          engine?: string;
          model?: string | null;
          options?: Json;
          analysis?: Json | null;
          total_chunks?: number;
          done_chunks?: number;
          base_url?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          recording_id?: string;
          created_by?: string | null;
          status?: string;
          stage?: string | null;
          progress?: number;
          error?: string | null;
          engine?: string;
          model?: string | null;
          options?: Json;
          analysis?: Json | null;
          total_chunks?: number;
          done_chunks?: number;
          base_url?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transcription_jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transcription_jobs_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: false;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
        ];
      };
      transcripts: {
        Row: {
          recording_id: string;
          segments: Json;
          original_segments: Json;
          speakers: Json;
          engine: string | null;
          model: string | null;
          quality: Json | null;
          search_text: string | null;
          version: number;
          edited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          recording_id: string;
          segments?: Json;
          original_segments?: Json;
          speakers?: Json;
          engine?: string | null;
          model?: string | null;
          quality?: Json | null;
          search_text?: string | null;
          version?: number;
          edited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          recording_id?: string;
          segments?: Json;
          original_segments?: Json;
          speakers?: Json;
          engine?: string | null;
          model?: string | null;
          quality?: Json | null;
          search_text?: string | null;
          version?: number;
          edited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transcripts_edited_by_fkey";
            columns: ["edited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transcripts_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: true;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
        ];
      };
      upload_sessions: {
        Row: {
          recording_id: string;
          session_uri: string;
          total_bytes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          recording_id: string;
          session_uri: string;
          total_bytes: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          recording_id?: string;
          session_uri?: string;
          total_bytes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "upload_sessions_recording_id_fkey";
            columns: ["recording_id"];
            isOneToOne: true;
            referencedRelation: "recordings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      can_edit_recording: {
        Args: {
          rid: string;
        };
        Returns: boolean;
      };
      can_view_recording: {
        Args: {
          rid: string;
        };
        Returns: boolean;
      };
      claim_job: {
        Args: {
          p_job: string;
          p_from: string[];
          p_to: string;
          p_stale_seconds?: number;
        };
        Returns: boolean;
      };
      claim_transcription_chunk: {
        Args: {
          p_job: string;
          p_idx: number;
          p_stale_seconds?: number;
        };
        Returns: boolean;
      };
      get_group_invite: {
        Args: {
          p_code: string;
        };
        Returns: {
          id: string;
          name: string;
          description: string;
          member_count: number;
          already_member: boolean;
        }[];
      };
      get_or_create_dm: {
        Args: {
          p_other: string;
        };
        Returns: string;
      };
      is_admin: {
        Args: never;
        Returns: boolean;
      };
      join_group_by_code: {
        Args: {
          p_code: string;
        };
        Returns: string;
      };
      mark_channel_read: {
        Args: {
          p_channel: string;
        };
        Returns: undefined;
      };
      my_channels: {
        Args: never;
        Returns: {
          channel_id: string;
          kind: string;
          group_id: string;
          title: string;
          avatar_url: string;
          other_user_id: string;
          last_message_at: string;
          last_message: string;
          unread_count: number;
        }[];
      };
      regenerate_invite_code: {
        Args: {
          p_group: string;
        };
        Returns: string;
      };
      search_recordings: {
        Args: {
          p_query: string;
          p_limit?: number;
        };
        Returns: Database["public"]["Tables"]["recordings"]["Row"][];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database["public"]["Tables"];
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"];

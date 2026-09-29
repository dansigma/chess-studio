export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      boards: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          pgn: string;
          current_node_path: number[];
          orientation: "white" | "black";
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          pgn: string;
          current_node_path?: number[];
          orientation?: "white" | "black";
          updated_at?: string;
        };
        Update: {
          title?: string;
          pgn?: string;
          current_node_path?: number[];
          orientation?: "white" | "black";
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          show_coordinates: boolean;
          piece_theme: string;
          board_theme: string;
          layout: Json | null;
          engine_depth: number;
          multi_pv: number;
        };
        Insert: {
          user_id: string;
          show_coordinates?: boolean;
          piece_theme?: string;
          board_theme?: string;
          layout?: Json | null;
          engine_depth?: number;
          multi_pv?: number;
        };
        Update: {
          show_coordinates?: boolean;
          piece_theme?: string;
          board_theme?: string;
          layout?: Json | null;
          engine_depth?: number;
          multi_pv?: number;
        };
        Relationships: [];
      };
      explorer_cache: {
        Row: {
          source: string;
          fen: string;
          payload: Json;
          fetched_at: string;
        };
        Insert: {
          source: string;
          fen: string;
          payload: Json;
          fetched_at?: string;
        };
        Update: {
          payload?: Json;
          fetched_at?: string;
        };
        Relationships: [];
      };
      game_databases: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          kind: "ultra" | "online" | "personal";
          game_count: number;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          kind: "ultra" | "online" | "personal";
          game_count?: number;
        };
        Update: {
          name?: string;
          game_count?: number;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          database_id: string;
          white: string;
          black: string;
          white_elo: number | null;
          black_elo: number | null;
          event: string | null;
          date: string | null;
          eco: string | null;
          opening: string | null;
          result: string | null;
          ply_count: number | null;
          pgn: string;
        };
        Insert: {
          id?: string;
          database_id: string;
          white: string;
          black: string;
          white_elo?: number | null;
          black_elo?: number | null;
          event?: string | null;
          date?: string | null;
          eco?: string | null;
          opening?: string | null;
          result?: string | null;
          ply_count?: number | null;
          pgn: string;
        };
        Update: {
          white?: string;
          black?: string;
          pgn?: string;
        };
        Relationships: [];
      };
      game_positions: {
        Row: {
          game_id: string;
          ply: number;
          zkey: string;
          next_uci: string | null;
        };
        Insert: {
          game_id: string;
          ply: number;
          zkey: string;
          next_uci?: string | null;
        };
        Update: {
          next_uci?: string | null;
        };
        Relationships: [];
      };
      position_stats: {
        Row: {
          database_id: string;
          zkey: string;
          next_uci: string;
          games: number;
          white_wins: number;
          draws: number;
          black_wins: number;
        };
        Insert: {
          database_id: string;
          zkey: string;
          next_uci: string;
          games?: number;
          white_wins?: number;
          draws?: number;
          black_wins?: number;
        };
        Update: {
          games?: number;
          white_wins?: number;
          draws?: number;
          black_wins?: number;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          slug: string;
          title: string;
          summary: string;
          color: "white" | "black";
          theme: "openings" | "strategy" | "tactics" | "endgames";
          chapters: Json;
          cover_url: string | null;
          video_url: string | null;
          created_by: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          slug: string;
          title: string;
          summary?: string;
          color: "white" | "black";
          theme?: "openings" | "strategy" | "tactics" | "endgames";
          chapters?: Json;
          cover_url?: string | null;
          video_url?: string | null;
          created_by?: string | null;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          title?: string;
          summary?: string;
          color?: "white" | "black";
          theme?: "openings" | "strategy" | "tactics" | "endgames";
          chapters?: Json;
          cover_url?: string | null;
          video_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      course_progress: {
        Row: {
          user_id: string;
          variation_id: string;
          step: number;
          learned: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          variation_id: string;
          step?: number;
          learned?: boolean;
          updated_at?: string;
        };
        Update: {
          step?: number;
          learned?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: "student" | "admin";
          created_at: string;
        };
        Insert: {
          id: string;
          role?: "student" | "admin";
          created_at?: string;
        };
        Update: {
          role?: "student" | "admin";
        };
        Relationships: [];
      };
      course_admins: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      player_bookmarks: {
        Row: {
          id: string;
          user_id: string;
          source: "lichess" | "chesscom" | "studio";
          username: string;
          display_name: string;
          subtitle: string;
          title: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: "lichess" | "chesscom" | "studio";
          username: string;
          display_name: string;
          subtitle?: string;
          title?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          subtitle?: string;
          title?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

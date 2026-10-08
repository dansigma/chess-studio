export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Convert an unknown value into Supabase-compatible JSON, mirroring how
 * JSON.stringify treats edge cases (drops `undefined` object values,
 * maps non-finite numbers to null). Use at the cache↔DB boundary instead
 * of `as unknown as Json` casts so the type is earned, not asserted.
 */
export function toJson(value: unknown): Json {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }
  if (typeof value === "object") {
    const out: { [key: string]: Json | undefined } = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        continue;
      }
      out[key] = toJson(entry);
    }
    return out;
  }
  return null;
}

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
          seq: number;
          ply: number;
          // pg bigint maps to string in postgrest-js (precision safety);
          // code writes positionKey(fen).toString() and reads coerce String().
          zkey: string;
          next_uci: string | null;
        };
        Insert: {
          game_id: string;
          seq: number;
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
          // SIG-861: nullable draft/published lifecycle. published_at null =
          // draft invisible to anon (courses_select_published), non-null =
          // visible to everyone. Backfilled from updated_at; default now().
          published_at: string | null;
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
          published_at?: string | null;
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
          published_at?: string | null;
        };
        Relationships: [];
      };
      // SIG-861: course_progress.variation_id targets variation ids embedded
      // in courses.chapters jsonb, not a FK. Enforced by
      // normalizeChapters/parseChapters, not by the DB.
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
      puzzle_progress: {
        Row: {
          user_id: string;
          data: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          data?: Json;
          updated_at?: string;
        };
        Update: {
          data?: Json;
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
        // SIG-861: no client-updatable columns. No update policy and no
        // grant exist; the service-role finishSignIn path in
        // src/lib/auth/access.ts is the only writer.
        Update: Record<string, never>;
        Relationships: [];
      };
      course_admins: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        // SIG-861: deny-all RLS (no client select/insert/update/delete), so
        // no client-updatable columns exist. Service-role access.ts only writer.
        Update: Record<string, never>;
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

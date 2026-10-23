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
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        continue;
      }
      if (typeof entry === "function" || typeof entry === "symbol") {
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
          locale: string;
        };
        Insert: {
          user_id: string;
          show_coordinates?: boolean;
          piece_theme?: string;
          board_theme?: string;
          layout?: Json | null;
          engine_depth?: number;
          multi_pv?: number;
          locale?: string;
        };
        Update: {
          show_coordinates?: boolean;
          piece_theme?: string;
          board_theme?: string;
          layout?: Json | null;
          engine_depth?: number;
          multi_pv?: number;
          locale?: string;
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
      user_folders: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          parent_id?: string | null;
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
          folder_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          kind: "ultra" | "online" | "personal";
          game_count?: number;
          folder_id?: string | null;
        };
        Update: {
          name?: string;
          game_count?: number;
          folder_id?: string | null;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          database_id: string;
          pending: boolean;
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
          pending?: boolean;
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
          pending?: boolean;
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
      repertoire_progress: {
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
      // SIG-1096: one row per user holding mistake exercises with SRS state.
      mistake_exercises: {
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
      // SIG-1039: one public Lichess / Chess.com username per (user, source).
      linked_accounts: {
        Row: {
          user_id: string;
          source: "lichess" | "chesscom";
          username: string;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          source: "lichess" | "chesscom";
          username: string;
          last_synced_at?: string | null;
          created_at?: string;
        };
        Update: {
          username?: string;
          last_synced_at?: string | null;
        };
        Relationships: [];
      };
      // SIG-1088: imported recent games (My Games 2/5), one row per
      // (user, source, external game id); sync route is the only writer.
      // SIG-1090: batch review summaries (My Games 4/5) — the only
      // client-updatable columns (see my_games_update_review_own + column
      // grant in 20261021210000_my_games_review_summary.sql).
      my_games: {
        Row: {
          id: string;
          user_id: string;
          source: "lichess" | "chesscom";
          external_id: string;
          played_at: string | null;
          color: "white" | "black" | null;
          result: "win" | "loss" | "draw" | null;
          time_class: string | null;
          white: string | null;
          black: string | null;
          white_elo: number | null;
          black_elo: number | null;
          eco: string | null;
          opening: string | null;
          ply_count: number | null;
          pgn: string;
          created_at: string;
          user_accuracy: number | null;
          opponent_accuracy: number | null;
          reviewed_at: string | null;
          mistake_counts: Json | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: "lichess" | "chesscom";
          external_id: string;
          played_at?: string | null;
          color?: "white" | "black" | null;
          result?: "win" | "loss" | "draw" | null;
          time_class?: string | null;
          white?: string | null;
          black?: string | null;
          white_elo?: number | null;
          black_elo?: number | null;
          eco?: string | null;
          opening?: string | null;
          ply_count?: number | null;
          pgn: string;
          created_at?: string;
          user_accuracy?: number | null;
          opponent_accuracy?: number | null;
          reviewed_at?: string | null;
          mistake_counts?: Json | null;
        };
        Update: {
          user_accuracy?: number | null;
          opponent_accuracy?: number | null;
          reviewed_at?: string | null;
          mistake_counts?: Json | null;
        };
        Relationships: [];
      };
      // SIG-1042: curated Lichess puzzle subset (slice 1/3, data side only).
      // Read-only for clients; loaded offline via \copy (serving in SIG-1102).
      puzzles: {
        Row: {
          id: string;
          fen: string;
          moves: string[];
          rating: number;
          themes: string[];
          popularity: number | null;
          nb_plays: number | null;
        };
        Insert: {
          id: string;
          fen: string;
          moves: string[];
          rating: number;
          themes: string[];
          popularity?: number | null;
          nb_plays?: number | null;
        };
        Update: {
          fen?: string;
          moves?: string[];
          rating?: number;
          themes?: string[];
          popularity?: number | null;
          nb_plays?: number | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: "student" | "coach" | "admin";
          // SIG-1049: "manual" = set from the admin UI; the sign-in sync keeps it.
          role_source: "system" | "manual";
          created_at: string;
        };
        Insert: {
          id: string;
          role?: "student" | "coach" | "admin";
          role_source?: "system" | "manual";
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
      // SIG-1049: deny-all RLS; service role only (role changes audit log).
      role_changes: {
        Row: {
          id: string;
          user_id: string;
          old_role: string;
          new_role: string;
          changed_by: string | null;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          old_role: string;
          new_role: string;
          changed_by?: string | null;
          reason: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      // SIG-1049: deny-all RLS; service role only. Only the SHA-256 hash of the
      // invite token is stored.
      coach_invites: {
        Row: {
          id: string;
          email: string;
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          token_hash: string;
          invited_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
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
    Functions: {
      // SIG-1102: seed-stable sampling over public.puzzles (serving slice).
      puzzles_window: {
        Args: {
          p_min: number | null;
          p_max: number | null;
          p_theme: string | null;
          p_limit: number | null;
          p_seed: number | null;
          p_exclude: string[] | null;
        };
        Returns: Array<{
          id: string;
          fen: string;
          moves: string[];
          rating: number;
          themes: string[];
          popularity: number | null;
          nb_plays: number | null;
        }>;
      };
      swap_database_games: {
        Args: { p_database_id: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

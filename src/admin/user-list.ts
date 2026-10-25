// SIG-1063: client-safe admin user-list shared types. `src/lib/admin/users.ts`
// is `server-only` (service-role Supabase client), so the client component
// (`UsersView.tsx`) imports the page size + row type from here instead.
export const ADMIN_USERS_PAGE_SIZE = 50;

export type AdminListUser = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  email_confirmed: boolean;
  // v_total from admin_list_users: the filtered count over ALL matches,
  // repeated on every returned row. Out-of-range pages return zero rows,
  // so the lib reads the total via admin_count_users instead.
  total: number;
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAuthorCourses, getRole } from "@/src/lib/auth/roles";
import type { Database } from "@/src/lib/supabase/database.types";
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from "@/src/lib/supabase/env";
import { adminDenyDestination, isAdminGatePath } from "@/src/lib/supabase/admin-gate";

function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

/**
 * Pure admin-gate decision for `/courses/admin*`, unit-testable.
 * (Moved to ./admin-gate so tests can import it without pulling next/server.)
 */

function redirectToDestination(request: NextRequest, destination: string, sessionResponse: NextResponse) {
  const url = request.nextUrl.clone();
  const queryIndex = destination.indexOf("?");
  if (queryIndex === -1) {
    url.pathname = destination;
    url.search = "";
  } else {
    url.pathname = destination.slice(0, queryIndex);
    url.search = destination.slice(queryIndex);
  }
  return redirectWithSession(url, sessionResponse);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Only `/courses/admin*` needs the session: every other path's gate decision
  // is `null` regardless of auth state, so return before creating a client.
  if (!isAdminGatePath(path)) {
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) {
    const denied = adminDenyDestination(path, { configured: false, hasUser: false, canAuthor: false });
    if (denied) {
      return redirectToDestination(request, denied, response);
    }
    return response;
  }
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const denied = data.user
    ? adminDenyDestination(
        path,
        { configured: true, hasUser: true, canAuthor: canAuthorCourses(await getRole(supabase, data.user)) },
      )
    : adminDenyDestination(path, { configured: true, hasUser: false, canAuthor: false });
  if (denied) {
    return redirectToDestination(request, denied, response);
  }
  return response;
}

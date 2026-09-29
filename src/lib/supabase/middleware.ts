import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { userCanPublishCourses } from "@/src/lib/auth/access";
import type { Database } from "@/src/lib/supabase/database.types";
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from "@/src/lib/supabase/env";

function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) {
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
  const path = request.nextUrl.pathname;
  if (path === "/courses/admin" || path.startsWith("/courses/admin/")) {
    const destination = request.nextUrl.clone();
    if (!data.user) {
      destination.pathname = "/login";
      destination.search = "";
      destination.searchParams.set("next", path);
      return redirectWithSession(destination, response);
    }
    const allowed = await userCanPublishCourses(supabase, data.user);
    if (!allowed) {
      destination.pathname = "/courses";
      destination.search = "";
      return redirectWithSession(destination, response);
    }
  }
  return response;
}

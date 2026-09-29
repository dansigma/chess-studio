import { redirect } from "next/navigation";

export default function OldCoursesRedirect() {
  redirect("/courses");
}

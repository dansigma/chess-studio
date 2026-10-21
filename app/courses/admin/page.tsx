import { redirect } from "next/navigation";
import { AdminView } from "@/src/courses/AdminView";
import { currentUserCanAuthor } from "@/src/courses/publish";

export default async function CourseAdminPage() {
  if (!(await currentUserCanAuthor())) {
    redirect("/courses");
  }
  return <AdminView />;
}

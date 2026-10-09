import { redirect } from "next/navigation";
import { AdminView } from "@/src/courses/AdminView";
import { currentUserCanPublish } from "@/src/courses/publish";

export default async function CourseAdminPage() {
  if (!(await currentUserCanPublish())) {
    redirect("/courses");
  }
  return <AdminView />;
}

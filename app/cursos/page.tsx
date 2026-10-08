import { permanentRedirect } from "next/navigation";

export default function OldCoursesRedirect() {
  permanentRedirect("/courses");
}

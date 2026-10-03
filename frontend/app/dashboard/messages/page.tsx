import { redirect } from "next/navigation";

/** Moved route: kept as a redirect so existing links keep working. */
export default function Page() {
  redirect("/activity");
}

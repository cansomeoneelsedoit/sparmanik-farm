import { redirect } from "next/navigation";

// Convenience redirect so /greenhouses (the new user-facing terminology)
// resolves to the existing /harvest route without touching the rest of the
// route tree. The DB model is still called Harvest internally.
export default function GreenhousesRedirect() {
  redirect("/harvest");
}

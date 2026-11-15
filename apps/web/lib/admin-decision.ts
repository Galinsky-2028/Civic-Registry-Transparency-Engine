export function parseAdminDecision(value: string): "approved" | "rejected" {
  if (value !== "approved" && value !== "rejected") {
    throw new Error("Select an explicit approval or rejection decision.");
  }
  return value;
}

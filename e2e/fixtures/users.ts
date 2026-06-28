export const TEST_USERS = {
  alice: {
    email: "alice@example.com",
    password: "alice-strong-password-1!",
    display_name: "Alice",
    roles: ["standard"],
  },
  ops: {
    email: "ops@example.com",
    password: "ops-strong-password-1!",
    display_name: "Ops",
    roles: ["standard", "operations_admin"],
  },
  cs: {
    email: "cs@example.com",
    password: "cs-strong-password-1!",
    display_name: "CS",
    roles: ["standard", "cs_admin"],
  },
} as const;

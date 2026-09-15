// ---------------------------------------------------------------------------
// The children, hard-coded. No database, no accounts, no passwords.
//
// TO SET UP A WORKSHOP: change the names and pick avatars from public/avatars/.
// Adding a fourth child is just another line here.
// ---------------------------------------------------------------------------

export const USERS = [
  { id: "kid1", name: "דניאל", avatar: "babydragon.webp", color: "#2f9e8f" },
  { id: "kid2", name: "נועה", avatar: "mermaid.webp", color: "#d4568f" },
  { id: "kid3", name: "איתי", avatar: "ninja.webp", color: "#5566cc" },
  { id: "teacher", name: "מדריך", avatar: "monk.webp", color: "#7a6cc4", isInstructor: true },
];

export const userById = (id) => USERS.find((u) => u.id === id) ?? null;

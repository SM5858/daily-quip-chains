export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const idleState: ActionState = { status: "idle", message: "" };

export const ok = (message: string): ActionState => ({
  status: "success",
  message,
});

export const fail = (message: string): ActionState => ({
  status: "error",
  message,
});

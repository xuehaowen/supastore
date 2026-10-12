import type { QuoteDto } from "@supastore/contracts";

interface CheckoutState {
  phase: "editing" | "reviewing" | "ready" | "placing";
  quote: QuoteDto | null;
  message: string;
}
type CheckoutEvent =
  | { type: "quote"; quote: QuoteDto | null }
  | { type: "message"; message: string }
  | { type: "start" | "finish" };

export function checkoutReducer(
  state: CheckoutState,
  event: CheckoutEvent,
): CheckoutState {
  switch (event.type) {
    case "quote":
      return {
        ...state,
        quote: event.quote,
        phase: event.quote
          ? "ready"
          : state.phase === "reviewing" || state.phase === "placing"
            ? state.phase
            : "editing",
      };
    case "message":
      return { ...state, message: event.message };
    case "start":
      return { ...state, phase: state.quote ? "placing" : "reviewing" };
    case "finish":
      return { ...state, phase: state.quote ? "ready" : "editing" };
  }
}

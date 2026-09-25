/**
 * Detail pages take their id from the query string so the app can be
 * exported as static files (GitHub Pages has no server to resolve ids).
 */
export const taskHref = (id: string, edit?: "deadline" | "estimate") =>
  `/tasks/detail?id=${encodeURIComponent(id)}${edit ? `&edit=${edit}` : ""}`;

export const lineHref = (id: string) => `/lines/detail?id=${encodeURIComponent(id)}`;

export const ticketHref = (journeyId: string, issued = false) =>
  `/archive/ticket?id=${encodeURIComponent(journeyId)}${issued ? "&issued=1" : ""}`;

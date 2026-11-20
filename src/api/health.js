export const apiMode = import.meta.env.VITE_API_MODE || "mock";

export async function getHealth(signal) {
  if (!["mock", "live"].includes(apiMode)) {
    throw new Error("Set VITE_API_MODE to mock or live.");
  }
  const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
  const url = apiMode === "mock" ? "/mocks/health.json" : `${base}/health`;
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The service returned an invalid JSON response.");
  }
  if (!response.ok) {
    throw new Error(
      data.error?.message || `Service unavailable (HTTP ${response.status}).`,
    );
  }
  if (data.status !== "ok" || data.database !== "connected") {
    throw new Error(
      "The service is not ready. Check the backend health response.",
    );
  }
  return data;
}

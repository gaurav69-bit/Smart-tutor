// ST-23 consumes Jahid Hasan's proposed PR #11 contract. No mock authentication.
const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const messages = {
  400: "Please check the form values or request a fresh verification link.",
  401: "Sign-in was not accepted. Check your details, email verification and account approval.",
  403: "This account cannot access that page.",
  404: "Account services are not connected yet. Please try again later.",
  409: "That email address is already registered. Try signing in.",
  429: "Too many requests. Please wait before trying again.",
  503: "Account services are temporarily unavailable. Please try again later.",
};
export class AccountError extends Error {
  constructor(message, status = 0, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export async function accountRequest(path, body, { signal } = {}) {
  let response;
  try {
    response = await fetch(`${base}/auth/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      headers:
        body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AccountError(
      "Unable to reach account services. Check your connection and try again.",
    );
  }
  const expectedStatus = {
    register: 201,
    "verify-email": 200,
    "resend-verification": 202,
    login: 200,
    me: 200,
    logout: 204,
  }[path];
  if (response.ok && response.status !== expectedStatus)
    throw new AccountError(
      "Account services returned an unexpected response.",
      response.status,
    );
  if (response.status === 204 && path === "logout") return null;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new AccountError(
      messages[response.status] ||
        "Account services returned an unexpected response.",
      response.status,
    );
  }
  if (!response.ok) {
    // Render known field errors only. Never echo raw service messages or submitted credentials.
    const safeDetails = {};
    for (const key of [
      "name",
      "email",
      "password",
      "role",
      "username",
      "dob",
      "address",
      "qualifications",
      "bio",
      "subject",
      "terms",
    ])
      if (typeof data?.error?.details?.[key] === "string")
        safeDetails[key] = "Please check this field.";
    throw new AccountError(
      messages[response.status] || "Account request failed. Please try again.",
      response.status,
      safeDetails,
    );
  }
  return data;
}
export function safeAccount(value, { registration = false } = {}) {
  const account = value?.account;
  if (
    !account ||
    !(typeof account.id === "string" || typeof account.id === "number") ||
    !account.id ||
    typeof account.name !== "string" ||
    typeof account.email !== "string" ||
    !["student", "tutor"].includes(account.role) ||
    (registration && account.verified !== false)
  )
    throw new AccountError("Account services returned an unexpected response.");
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
  };
}

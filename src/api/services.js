import { useEffect, useState } from "react";
import { AccountError } from "./account.js";
export const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);
const messages = {
  400: "Please check the highlighted values and try again.",
  401: "Your session or credentials were not accepted. Sign in again if needed.",
  403: "You do not have permission to perform this action.",
  404: "This service is not connected or the requested item is unavailable.",
  409: "This change conflicts with an existing record. Refresh and try again.",
  413: "This file is too large. Choose a smaller photo.",
  415: "Choose a still JPEG, PNG or WebP image.",
  422: "The submitted values or image could not be accepted.",
  428: "Confirm your identity, then repeat this action.",
  429: "Too many requests. Please wait before trying again.",
  503: "This service is temporarily unavailable. Please try again later.",
};
export async function serviceRequest(
  path,
  { method = "GET", body, signal, status = 200 } = {},
) {
  const multipart = body instanceof FormData;
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(!multipart && body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(body === undefined
        ? {}
        : { body: multipart ? body : JSON.stringify(body) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AccountError(
      "Unable to reach this service. Check your connection and retry.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new AccountError(
      messages[response.status] ||
        "This service returned an unexpected response.",
      response.status,
    );
  }
  if (!response.ok) {
    const details = {};
    for (const key of [
      "name",
      "email",
      "username",
      "bio",
      "qualifications",
      "address",
      "timezone",
      "subjects",
      "dob",
      "reason",
      "code",
      "password",
      "captcha",
      "invite",
    ])
      if (typeof data?.error?.details?.[key] === "string")
        details[key] = "Please check this field.";
    throw new AccountError(
      messages[response.status] || "The request failed. Please try again.",
      response.status,
      details,
    );
  }
  if (response.status !== status)
    throw new AccountError("This service returned an unexpected response.");
  return data;
}
export function requireMessage(data) {
  if (typeof data?.message !== "string" || !data.message.trim())
    throw new AccountError("This service returned an unexpected response.");
  return data;
}
export function requireList(data) {
  if (!Array.isArray(data))
    throw new AccountError("This service returned an unexpected list.");
  return data;
}
const identity = (value) => value;
export function useResource(path, parse = identity) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, data: null, error: "" });
    serviceRequest(path, { signal: controller.signal })
      .then(parse)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ loading: false, data, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ loading: false, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [path, revision, parse]);
  return { ...state, reload: () => setRevision((value) => value + 1) };
}

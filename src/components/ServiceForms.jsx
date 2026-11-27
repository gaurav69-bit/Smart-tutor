// Shared form and identity-dialog layout adapted from Gaurav's reference at 3a9f2bf.
import React, { useEffect, useId, useRef, useState } from "react";
import { serviceRequest, requireMessage } from "../api/services.js";
import { Feedback, Field } from "../pages/Account.jsx";

export function ResourceState({ resource, children }) {
  if (resource.loading) return <p role="status">Loading…</p>;
  if (resource.error)
    return (
      <div className="panel">
        <p role="alert">{resource.error}</p>
        <button className="btn secondary" onClick={resource.reload}>
          Retry
        </button>
      </div>
    );
  return children;
}
export function Control({
  label,
  error,
  name,
  as: Tag = "input",
  children,
  ...props
}) {
  const id = `field-${name}-${useId()}`;
  return (
    <label htmlFor={id}>
      {label}
      <Tag
        {...props}
        name={name}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {children}
      </Tag>
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </label>
  );
}
export function IdentityDialog({ onClose }) {
  const dialog = useRef(null),
    trigger = useRef(document.activeElement);
  useEffect(() => {
    dialog.current.showModal();
    return () => {
      trigger.current?.isConnected && trigger.current.focus();
    };
  }, []);
  return (
    <dialog
      className="panel identity-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="identity-title"
    >
      <button type="button" className="btn secondary" onClick={onClose}>
        Close identity check
      </button>
      <h2 id="identity-title">One quick identity check.</h2>
      <p>
        Confirm your current password, then repeat the action. No action is
        automatically retried.
      </p>
      <ServiceForm
        label="Confirm identity"
        path="/auth/reauth"
        submit="Confirm identity"
        success="Identity confirmed."
        onSuccess={onClose}
      >
        {(details) => (
          <Field
            label="Current password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            error={details.password}
          />
        )}
      </ServiceForm>
    </dialog>
  );
}
export function ServiceForm({
  label,
  path,
  method = "POST",
  status = 200,
  transform,
  submit,
  children,
  onSuccess,
  success = "Your changes were accepted.",
  disabled = false,
  onAttempt,
  parseResult = requireMessage,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [details, setDetails] = useState({}),
    [message, setMessage] = useState(""),
    [identity, setIdentity] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), [path]);
  return (
    <>
      <Feedback error={error} message={message} />
      <form
        aria-label={label}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || disabled) return;
          const form = event.currentTarget,
            data = new FormData(form),
            controller = new AbortController();
          request.current = controller;
          setError("");
          setDetails({});
          setMessage("");
          setBusy(true);
          try {
            const body = transform
              ? await transform(data)
              : Object.fromEntries(data);
            const result = parseResult(
              await serviceRequest(path, {
                method,
                body,
                status,
                signal: controller.signal,
              }),
            );
            if (controller.signal.aborted) return;
            setMessage(success);
            form.reset();
            await onSuccess?.(result);
          } catch (err) {
            if (controller.signal.aborted) return;
            setError(err.message);
            setDetails(err.details || {});
            if (err.status === 428 && path !== "/auth/reauth")
              setIdentity(true);
          } finally {
            form.querySelectorAll('input[type="password"]').forEach((input) => {
              input.value = "";
            });
            if (!controller.signal.aborted) {
              setBusy(false);
              onAttempt?.();
            }
          }
        }}
      >
        <fieldset disabled={busy || disabled}>
          {children(details)}
          <button className="btn" type="submit">
            {busy ? "Just a moment…" : submit}
          </button>
        </fieldset>
      </form>
      {identity && <IdentityDialog onClose={() => setIdentity(false)} />}
    </>
  );
}

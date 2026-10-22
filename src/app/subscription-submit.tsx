"use client";
import { useFormStatus } from "react-dom";
export function SubscriptionSubmit({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="primary"
      type="submit"
      disabled={pending}
      aria-live="polite"
    >
      {pending ? "Wird synchronisiert …" : children}
    </button>
  );
}

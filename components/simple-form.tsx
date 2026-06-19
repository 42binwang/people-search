export function SimpleForm({
  type,
  action,
  profileId,
}: Readonly<{
  type: "opt-out" | "report" | "contact" | "do-not-sell";
  action: string;
  profileId?: string;
}>) {
  const label =
    type === "opt-out"
      ? "Removal request"
      : type === "report"
        ? "Report"
        : type === "do-not-sell"
          ? "Privacy request"
          : "Message";

  return (
    <form className="search-surface" action={action} method="post">
      <input type="hidden" name="profileId" value={profileId ?? ""} />
      <input type="hidden" name="type" value={type} />
      <div className="form-grid">
        <label className="field">
          Full name
          <input name="name" autoComplete="name" required />
        </label>
        <label className="field">
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field full">
          Profile URL or details
          <input name="subject" required />
        </label>
        <label className="field full">
          {label}
          <textarea name="message" required />
        </label>
      </div>
      <div className="button-row">
        <button className="button" type="submit">
          Submit
        </button>
        <span className="fine-print">
          This creates an auditable local request. Production will add identity
          verification and email status updates.
        </span>
      </div>
    </form>
  );
}

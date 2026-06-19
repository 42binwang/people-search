export function SimpleForm({
  type,
}: Readonly<{
  type: "opt-out" | "report" | "contact" | "do-not-sell";
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
    <form className="search-surface">
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
          Prototype form only. Production submissions will create auditable
          privacy and support tickets.
        </span>
      </div>
    </form>
  );
}


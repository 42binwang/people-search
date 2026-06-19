"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Home, Phone, Search, UserRound } from "lucide-react";

type SearchMode = "name" | "phone" | "address";

const modes: Array<{
  value: SearchMode;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "name", label: "Name", icon: UserRound },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "address", label: "Address", icon: Home },
];

export function SearchForm() {
  const [mode, setMode] = useState<SearchMode>("name");

  return (
    <form action="/search" method="post">
      <input type="hidden" name="mode" value={mode} />
      <div className="mode-tabs" role="tablist" aria-label="Search mode">
        {modes.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            className="mode-tab"
            data-active={mode === value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
          >
            <Icon size={17} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {mode === "name" && (
        <div className="form-grid">
          <label className="field">
            First name
            <input name="firstName" autoComplete="given-name" />
          </label>
          <label className="field">
            Last name
            <input name="lastName" autoComplete="family-name" required />
          </label>
          <label className="field">
            City
            <input name="city" autoComplete="address-level2" />
          </label>
          <label className="field">
            State
            <select name="state" defaultValue="">
              <option value="">Any state</option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {mode === "phone" && (
        <div className="form-grid">
          <label className="field full">
            Phone number
            <input
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              required
            />
          </label>
        </div>
      )}

      {mode === "address" && (
        <div className="form-grid">
          <label className="field full">
            Street address
            <input name="street" autoComplete="address-line1" required />
          </label>
          <label className="field">
            City
            <input name="city" autoComplete="address-level2" required />
          </label>
          <label className="field">
            State
            <select name="state" defaultValue="" required>
              <option value="" disabled>
                Select state
              </option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            ZIP
            <input name="zip" inputMode="numeric" autoComplete="postal-code" />
          </label>
        </div>
      )}

      <div className="button-row">
        <button className="button" type="submit">
          <Search size={17} aria-hidden="true" />
          Search
        </button>
        <span className="fine-print">
          Search terms are submitted by POST and kept out of page URLs.
        </span>
      </div>
    </form>
  );
}

const stateOptions = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

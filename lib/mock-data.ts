import type { SearchPayload } from "@/lib/search-store";

export type ResultSummary = {
  id: string;
  name: string;
  ageRange: string;
  locations: string[];
  relatives: string[];
  confidence: string;
};

export type MockProfile = ResultSummary & {
  aliases: string[];
  phones: string[];
  emails: string[];
  addresses: string[];
  sourceCategories: string[];
};

const profiles: MockProfile[] = [
  {
    id: "p_demo_jordan_ellis",
    name: "Jordan Ellis",
    ageRange: "40s",
    locations: ["Austin, TX", "Plano, TX", "Denver, CO"],
    relatives: ["Morgan Ellis", "Taylor Brooks"],
    confidence: "High",
    aliases: ["J. Ellis", "Jordan M. Ellis"],
    phones: ["Possible phone ending in 0148", "Possible phone ending in 2291"],
    emails: ["Possible email at examplemail.com"],
    addresses: ["Austin, TX", "Plano, TX", "Denver, CO"],
    sourceCategories: ["Property index", "Business entity record"],
  },
  {
    id: "p_demo_casey_morgan",
    name: "Casey Morgan",
    ageRange: "30s",
    locations: ["Phoenix, AZ", "Mesa, AZ"],
    relatives: ["Riley Morgan", "Sam Patel"],
    confidence: "Medium",
    aliases: ["C. Morgan"],
    phones: ["Possible phone ending in 7720"],
    emails: ["Possible email at mailbox.test"],
    addresses: ["Phoenix, AZ", "Mesa, AZ"],
    sourceCategories: ["Professional license", "Parcel open data"],
  },
  {
    id: "p_demo_avery_chen",
    name: "Avery Chen",
    ageRange: "50s",
    locations: ["Seattle, WA", "Bellevue, WA"],
    relatives: ["Jamie Chen", "Robin Lee"],
    confidence: "Medium",
    aliases: ["A. Chen", "Avery L. Chen"],
    phones: ["Possible phone ending in 4406"],
    emails: ["Possible email at inbox.test"],
    addresses: ["Seattle, WA", "Bellevue, WA"],
    sourceCategories: ["Recorder index", "Business entity record"],
  },
];

export function getMockResults(payload: SearchPayload) {
  if (payload.mode === "name") {
    return profiles.map((profile, index) => ({
      ...profile,
      confidence: index === 0 ? "High" : profile.confidence,
    }));
  }

  if (payload.mode === "phone") {
    return [profiles[1], profiles[0]];
  }

  return [profiles[2], profiles[0]];
}

export function getMockProfile(id: string) {
  return profiles.find((profile) => profile.id === id);
}


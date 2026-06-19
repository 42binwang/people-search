import { upsertApprovedSource, upsertProfile } from "../lib/db";

upsertApprovedSource({
  id: "demo_property_index",
  name: "Demo County Property Index",
  category: "Property index",
  jurisdiction: "Demo",
  acquisitionMethod: "bulk_file",
  licenseUrl: "https://example.com/demo-property-license",
  notes: "Synthetic seed data for local development only.",
});

upsertApprovedSource({
  id: "demo_business_entities",
  name: "Demo Secretary of State Business Entities",
  category: "Business entity record",
  jurisdiction: "Demo",
  acquisitionMethod: "official_api",
  licenseUrl: "https://example.com/demo-business-license",
  notes: "Synthetic seed data for local development only.",
});

const sourceId = "demo_property_index";

upsertProfile({
  id: "p_demo_jordan_ellis",
  fullName: "Jordan Ellis",
  ageRange: "40s",
  confidence: "High",
  aliases: ["J. Ellis", "Jordan M. Ellis"],
  locations: [
    {
      street: "100 Demo Lake Dr",
      city: "Austin",
      state: "TX",
      zip: "78701",
      kind: "possible current",
      sourceId,
    },
    { city: "Plano", state: "TX", kind: "possible past", sourceId },
    { city: "Denver", state: "CO", kind: "possible past", sourceId },
  ],
  contacts: [
    { type: "phone", value: "+15125550148", confidence: "Medium", sourceId },
    { type: "phone", value: "+19725552291", confidence: "Low", sourceId },
    { type: "email", value: "jordan.ellis@examplemail.test", sourceId },
  ],
  relationships: [
    { name: "Morgan Ellis", type: "possible relative", sourceId },
    { name: "Taylor Brooks", type: "possible associate", sourceId },
  ],
  sourceRecord: {
    sourceId,
    sourceRecordId: "demo-001",
    raw: { synthetic: true, row: 1 },
  },
});

upsertProfile({
  id: "p_demo_casey_morgan",
  fullName: "Casey Morgan",
  ageRange: "30s",
  confidence: "Medium",
  aliases: ["C. Morgan"],
  locations: [
    {
      street: "40 Sample Way",
      city: "Phoenix",
      state: "AZ",
      zip: "85004",
      kind: "possible current",
      sourceId,
    },
    { city: "Mesa", state: "AZ", kind: "possible past", sourceId },
  ],
  contacts: [
    { type: "phone", value: "+16025557720", confidence: "Medium", sourceId },
    { type: "email", value: "casey.morgan@mailbox.test", sourceId },
  ],
  relationships: [
    { name: "Riley Morgan", type: "possible relative", sourceId },
    { name: "Sam Patel", type: "possible associate", sourceId },
  ],
  sourceRecord: {
    sourceId,
    sourceRecordId: "demo-002",
    raw: { synthetic: true, row: 2 },
  },
});

upsertProfile({
  id: "p_demo_avery_chen",
  fullName: "Avery Chen",
  ageRange: "50s",
  confidence: "Medium",
  aliases: ["A. Chen", "Avery L. Chen"],
  locations: [
    {
      street: "9 Example Ave",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      kind: "possible current",
      sourceId,
    },
    { city: "Bellevue", state: "WA", kind: "possible past", sourceId },
  ],
  contacts: [
    { type: "phone", value: "+12065554406", confidence: "Medium", sourceId },
    { type: "email", value: "avery.chen@inbox.test", sourceId },
  ],
  relationships: [
    { name: "Jamie Chen", type: "possible relative", sourceId },
    { name: "Robin Lee", type: "possible associate", sourceId },
  ],
  sourceRecord: {
    sourceId,
    sourceRecordId: "demo-003",
    raw: { synthetic: true, row: 3 },
  },
});

console.log("Seeded local people-search database.");


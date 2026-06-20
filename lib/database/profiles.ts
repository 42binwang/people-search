export {
  databaseHasProfiles,
  getProfile,
  getSourceRecordsForProfile,
  searchProfiles,
  upsertProfile,
} from "@/lib/database/legacy";

export type {
  AddressHistoryEntry,
  Profile,
  ProfileSourceRecord,
  SearchResult,
  UpsertProfileInput,
} from "@/lib/database/legacy";

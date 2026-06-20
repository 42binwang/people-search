import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import {
  maskEmail,
  escapeSqlLike,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeText,
} from "@/lib/normalization";
import {
  getNameSearchTokens,
  isPersonLikeSearchName,
  nameTokenLikePattern,
} from "@/lib/name-search";
import {
  createSearchCacheKey,
  getSearchResultCacheTtlMs,
} from "@/lib/search-cache";
import type { SearchPayload } from "@/lib/search-store";

const dbPath =
  process.env.PEOPLE_SEARCH_DB_PATH ??
  join(
    process.cwd(),
    "data",
    process.env.VITEST
      ? `people-search-test-${process.env.VITEST_POOL_ID ?? process.pid}.sqlite`
      : "people-search.sqlite",
  );
const schemaVersion = 40;

const streetSuffixVariants: Record<string, string[]> = {
  alley: ["alley", "aly"],
  aly: ["aly", "alley"],
  avenue: ["avenue", "ave"],
  ave: ["ave", "avenue"],
  boulevard: ["boulevard", "blvd"],
  blvd: ["blvd", "boulevard"],
  circle: ["circle", "cir"],
  cir: ["cir", "circle"],
  court: ["court", "ct"],
  ct: ["ct", "court"],
  drive: ["drive", "dr"],
  dr: ["dr", "drive"],
  highway: ["highway", "hwy"],
  hwy: ["hwy", "highway"],
  lane: ["lane", "ln"],
  ln: ["ln", "lane"],
  parkway: ["parkway", "pkwy"],
  pkwy: ["pkwy", "parkway"],
  place: ["place", "pl"],
  pl: ["pl", "place"],
  road: ["road", "rd"],
  rd: ["rd", "road"],
  square: ["square", "sq"],
  sq: ["sq", "square"],
  street: ["street", "st"],
  st: ["st", "street"],
  terrace: ["terrace", "ter"],
  ter: ["ter", "terrace"],
  trail: ["trail", "trl"],
  trl: ["trl", "trail"],
  way: ["way"],
};

// Non-residential, source-context locations that must never surface as address
// matches. Shared by isGenericLocation() and the address-search WHERE clause.
const genericLocationCities = [
  "federal register",
  "library of congress",
  "openalex",
  "wikidata",
  "crossref",
  "pubmed",
  "clinicaltrials gov",
  "internet archive",
  "open library",
  "github",
  "stack exchange",
  "orcid",
  "semantic scholar",
  "google books",
  "europe pmc",
  "socrata",
  "arcgis",
  "ckan",
  "opendatasoft",
  "musicbrainz",
  "viaf",
  "datacite",
  "arxiv",
];

const genericLocationStates = ["GLOBAL", "USER-ENTERED", "US"];

export type SearchResult = {
  id: string;
  name: string;
  ageRange: string;
  locations: string[];
  relatives: string[];
  confidence: string;
};

export type Profile = SearchResult & {
  aliases: string[];
  phones: string[];
  emails: string[];
  addresses: string[];
  addressHistory: AddressHistoryEntry[];
  sourceCategories: string[];
};

export type AddressHistoryEntry = {
  address: string;
  street: string | null;
  city: string;
  state: string;
  zip: string | null;
  kinds: string[];
  sources: string[];
  sourceCategories: string[];
};

export type PrivacyRequest = {
  id: number;
  type: string;
  status: string;
  profileId: string | null;
  requesterName: string;
  requesterEmail: string;
  details: string;
  createdAt: string;
  reviewedAt: string | null;
};

export type RecordFeedbackValue = "up" | "down";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAtMs: number;
};

export type UpsertProfileInput = {
  id: string;
  fullName: string;
  birthDate?: string;
  ageRange?: string;
  confidence?: string;
  aliases?: string[];
  locations?: Array<{
    street?: string;
    city: string;
    state: string;
    zip?: string;
    kind?: string;
    sourceId?: string;
  }>;
  contacts?: Array<{
    type: "phone" | "email";
    value: string;
    confidence?: string;
    sourceId?: string;
  }>;
  relationships?: Array<{
    name: string;
    type?: string;
    confidence?: string;
    sourceId?: string;
  }>;
  sourceRecord?: {
    sourceId: string;
    sourceRecordId: string;
    raw: unknown;
  };
};

export type SearchResultCacheHit = {
  results: SearchResult[];
  refreshNotice: string | null;
  createdAtMs: number;
  expiresAtMs: number;
  remainingTtlMs: number;
};

export type SourceSearchRefresh = {
  sourceId: string;
  queryKey: string;
  refreshedAtMs: number;
  status: "success" | "failed" | "skipped";
  fetched: number;
  imported: number;
  errorMessage: string | null;
};

export type AggregateMobilityMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  year: number;
  geographyLevel: string;
  geoId: string;
  name: string;
  hub: string;
  state: string;
  county: string;
  totalPopulationOneYearOver: number | null;
  sameHouse: number | null;
  differentHouse: number | null;
  differentHouseUs: number | null;
  movedWithinSameCounty: number | null;
  movedDifferentCounty: number | null;
  movedDifferentCountySameState: number | null;
  movedDifferentState: number | null;
  movedFromAbroad: number | null;
  sameHousePct: number | null;
  differentHousePct: number | null;
  movedWithinSameCountyPct: number | null;
  movedDifferentCountySameStatePct: number | null;
  movedDifferentStatePct: number | null;
  movedFromAbroadPct: number | null;
  raw: unknown;
};

export type AggregateMigrationFlowInput = {
  sourceId: string;
  sourceRecordId: string;
  yearStart: number;
  yearEnd: number;
  hub: string;
  flowDirection: "inflow" | "outflow";
  flowKind: string;
  originStateFips: string;
  originCountyFips: string;
  originName: string;
  destinationStateFips: string;
  destinationCountyFips: string;
  destinationName: string;
  returnsCount: number | null;
  individualsCount: number | null;
  adjustedGrossIncome: number | null;
  raw: unknown;
};

export type AggregateHousingPermitMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  city: string;
  state: string;
  periodMonth: string;
  category: string;
  permitCount: number;
  housingUnitsAdded: number | null;
  housingUnitsRemoved: number | null;
  netHousingUnits: number | null;
  estimatedCost: number | null;
  raw: unknown;
};

export type AggregatePopulationChangeMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  stateName: string;
  populationEstimate: number | null;
  netPopulationChange: number | null;
  births: number | null;
  deaths: number | null;
  naturalChange: number | null;
  internationalMigration: number | null;
  domesticMigration: number | null;
  netMigration: number | null;
  residual: number | null;
  domesticMigrationRate: number | null;
  internationalMigrationRate: number | null;
  netMigrationRate: number | null;
  raw: unknown;
};

export type AggregateHousingStockMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalHousingUnits: number | null;
  occupiedHousingUnits: number | null;
  vacantHousingUnits: number | null;
  occupiedHousingPct: number | null;
  vacantHousingPct: number | null;
  homeownerVacancyRate: number | null;
  rentalVacancyRate: number | null;
  ownerOccupiedUnits: number | null;
  renterOccupiedUnits: number | null;
  ownerOccupiedPct: number | null;
  renterOccupiedPct: number | null;
  medianHomeValue: number | null;
  medianGrossRent: number | null;
  raw: unknown;
};

export type AggregateResidentialConstructionPermitMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  stateName: string;
  allPermits: number | null;
  singleFamilyPermits: number | null;
  multifamilyPermits: number | null;
  raw: unknown;
};

export type AggregateHousingAssistanceMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  coveragePeriod: string;
  stateFips: string;
  countyFips: string;
  tractFips: string;
  geoid: string;
  geographyName: string;
  housingChoiceVouchers: number | null;
  housingChoiceVoucherPct: number | null;
  raw: unknown;
};

export type AggregatePublicHousingInventoryMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  coveragePeriod: string;
  stateFips: string;
  countyFips: string;
  countyName: string;
  buildingCount: number;
  totalDwellingUnits: number | null;
  totalUnits: number | null;
  occupiedUnits: number | null;
  vacantUnits: number | null;
  numberReported: number | null;
  peopleTotal: number | null;
  averagePctOccupied: number | null;
  raw: unknown;
};

export type AggregateLihtcPropertyInventoryMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  coveragePeriod: string;
  stateFips: string;
  countyFips: string;
  countyName: string;
  projectCount: number;
  totalUnits: number | null;
  lowIncomeUnits: number | null;
  zeroBedroomUnits: number | null;
  oneBedroomUnits: number | null;
  twoBedroomUnits: number | null;
  threeBedroomUnits: number | null;
  fourPlusBedroomUnits: number | null;
  allocationAmount: number | null;
  earliestPlacedInServiceYear: number | null;
  latestPlacedInServiceYear: number | null;
  earliestAllocationYear: number | null;
  latestAllocationYear: number | null;
  raw: unknown;
};

export type AggregateLihtcQualifiedCensusTractMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  fiscalYear: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  qualifiedTractCount: number;
  raw: unknown;
};

export type AggregateLihtcDifficultDevelopmentAreaMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  fiscalYear: number;
  areaName: string;
  ddaCode: string;
  ddaType: string;
  zctaCount: number;
  raw: unknown;
};

export type AggregateSmallAreaFairMarketRentMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  fiscalYear: number;
  hudCode: string;
  fmrName: string;
  zcta: string;
  safmr0br: number | null;
  safmr0brPaymentStandard90: number | null;
  safmr0brPaymentStandard110: number | null;
  safmr1br: number | null;
  safmr1brPaymentStandard90: number | null;
  safmr1brPaymentStandard110: number | null;
  safmr2br: number | null;
  safmr2brPaymentStandard90: number | null;
  safmr2brPaymentStandard110: number | null;
  safmr3br: number | null;
  safmr3brPaymentStandard90: number | null;
  safmr3brPaymentStandard110: number | null;
  safmr4br: number | null;
  safmr4brPaymentStandard90: number | null;
  safmr4brPaymentStandard110: number | null;
  raw: unknown;
};

export type AggregateFairMarketRentMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  fiscalYear: number;
  fmrCode: string;
  fmrName: string;
  fmr0br: number | null;
  fmr1br: number | null;
  fmr2br: number | null;
  fmr3br: number | null;
  fmr4br: number | null;
  raw: unknown;
};

export type AggregateCommuteFlowMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  jobType: string;
  flowKind: string;
  homeStateFips: string;
  homeCountyFips: string;
  homeCountyName: string;
  workStateFips: string;
  workCountyFips: string;
  workCountyName: string;
  totalJobs: number;
  jobsAge29OrYounger: number | null;
  jobsAge30To54: number | null;
  jobsAge55OrOlder: number | null;
  jobsEarnings1250OrLess: number | null;
  jobsEarnings1251To3333: number | null;
  jobsEarnings3333Plus: number | null;
  raw: unknown;
};

export type AggregateCommutingCharacteristicMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalWorkers16Over: number | null;
  droveAlone: number | null;
  droveAlonePct: number | null;
  carpooled: number | null;
  carpooledPct: number | null;
  publicTransportation: number | null;
  publicTransportationPct: number | null;
  walked: number | null;
  walkedPct: number | null;
  otherMeans: number | null;
  otherMeansPct: number | null;
  workedFromHome: number | null;
  workedFromHomePct: number | null;
  meanTravelTimeMinutes: number | null;
  raw: unknown;
};

export type AggregateHouseholdIncomeMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalHouseholds: number | null;
  incomeUnder10k: number | null;
  incomeUnder10kPct: number | null;
  income10kTo14999: number | null;
  income10kTo14999Pct: number | null;
  income15kTo24999: number | null;
  income15kTo24999Pct: number | null;
  income25kTo34999: number | null;
  income25kTo34999Pct: number | null;
  income35kTo49999: number | null;
  income35kTo49999Pct: number | null;
  income50kTo74999: number | null;
  income50kTo74999Pct: number | null;
  income75kTo99999: number | null;
  income75kTo99999Pct: number | null;
  income100kTo149999: number | null;
  income100kTo149999Pct: number | null;
  income150kTo199999: number | null;
  income150kTo199999Pct: number | null;
  income200kPlus: number | null;
  income200kPlusPct: number | null;
  medianHouseholdIncome: number | null;
  meanHouseholdIncome: number | null;
  incomeUnder50k: number | null;
  incomeUnder50kPct: number | null;
  income100kPlus: number | null;
  income100kPlusPct: number | null;
  income150kPlus: number | null;
  income150kPlusPct: number | null;
  raw: unknown;
};

export type AggregateResidentialTenureMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  occupiedHousingUnits: number | null;
  moved2023OrLater: number | null;
  moved2023OrLaterPct: number | null;
  moved2020To2022: number | null;
  moved2020To2022Pct: number | null;
  moved2010To2019: number | null;
  moved2010To2019Pct: number | null;
  moved2000To2009: number | null;
  moved2000To2009Pct: number | null;
  moved1990To1999: number | null;
  moved1990To1999Pct: number | null;
  moved1989OrEarlier: number | null;
  moved1989OrEarlierPct: number | null;
  raw: unknown;
};

export type AggregateHousingCostBurdenMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  ownerMortgageUnits: number | null;
  ownerMortgage30To34Pct: number | null;
  ownerMortgage35PlusPct: number | null;
  ownerMortgage30Plus: number | null;
  ownerMortgage30PlusPct: number | null;
  ownerNoMortgageUnits: number | null;
  ownerNoMortgage30To34Pct: number | null;
  ownerNoMortgage35PlusPct: number | null;
  ownerNoMortgage30Plus: number | null;
  ownerNoMortgage30PlusPct: number | null;
  renterUnits: number | null;
  renter30To34Pct: number | null;
  renter35PlusPct: number | null;
  renter30Plus: number | null;
  renter30PlusPct: number | null;
  medianOwnerCostWithMortgage: number | null;
  medianOwnerCostWithoutMortgage: number | null;
  medianGrossRent: number | null;
  raw: unknown;
};

export type AggregateVacancyStatusMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalVacantUnits: number | null;
  forRentUnits: number | null;
  forRentPct: number | null;
  rentedNotOccupiedUnits: number | null;
  rentedNotOccupiedPct: number | null;
  forSaleOnlyUnits: number | null;
  forSaleOnlyPct: number | null;
  soldNotOccupiedUnits: number | null;
  soldNotOccupiedPct: number | null;
  seasonalRecreationalOccasionalUnits: number | null;
  seasonalRecreationalOccasionalPct: number | null;
  migrantWorkerUnits: number | null;
  migrantWorkerPct: number | null;
  otherVacantUnits: number | null;
  otherVacantPct: number | null;
  raw: unknown;
};

export type AggregateHousingCrowdingMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  occupiedHousingUnits: number | null;
  occupantsPerRoomOneOrLess: number | null;
  occupantsPerRoomOneOrLessPct: number | null;
  occupantsPerRoomOneToOnePointFive: number | null;
  occupantsPerRoomOneToOnePointFivePct: number | null;
  occupantsPerRoomOnePointFivePlus: number | null;
  occupantsPerRoomOnePointFivePlusPct: number | null;
  overcrowdedUnits: number | null;
  overcrowdedPct: number | null;
  severeOvercrowdedUnits: number | null;
  severeOvercrowdedPct: number | null;
  raw: unknown;
};

export type AggregateHouseholdCompositionMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalHouseholds: number | null;
  marriedCoupleHouseholds: number | null;
  marriedCoupleHouseholdsPct: number | null;
  marriedCoupleWithChildren: number | null;
  marriedCoupleWithChildrenPct: number | null;
  cohabitingCoupleHouseholds: number | null;
  cohabitingCoupleHouseholdsPct: number | null;
  cohabitingCoupleWithChildren: number | null;
  cohabitingCoupleWithChildrenPct: number | null;
  maleNoSpouseHouseholds: number | null;
  maleNoSpouseHouseholdsPct: number | null;
  maleLivingAlone: number | null;
  maleLivingAlonePct: number | null;
  maleLivingAlone65Plus: number | null;
  maleLivingAlone65PlusPct: number | null;
  femaleNoSpouseHouseholds: number | null;
  femaleNoSpouseHouseholdsPct: number | null;
  femaleLivingAlone: number | null;
  femaleLivingAlonePct: number | null;
  femaleLivingAlone65Plus: number | null;
  femaleLivingAlone65PlusPct: number | null;
  householdsWithUnder18: number | null;
  householdsWithUnder18Pct: number | null;
  householdsWith65Plus: number | null;
  householdsWith65PlusPct: number | null;
  averageHouseholdSize: number | null;
  averageFamilySize: number | null;
  singlePersonHouseholds: number | null;
  singlePersonHouseholdsPct: number | null;
  livingAlone65Plus: number | null;
  livingAlone65PlusPct: number | null;
  raw: unknown;
};

export type AggregateHousingStructureMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalHousingUnits: number | null;
  oneUnitDetached: number | null;
  oneUnitDetachedPct: number | null;
  oneUnitAttached: number | null;
  oneUnitAttachedPct: number | null;
  twoUnits: number | null;
  twoUnitsPct: number | null;
  threeOrFourUnits: number | null;
  threeOrFourUnitsPct: number | null;
  fiveToNineUnits: number | null;
  fiveToNineUnitsPct: number | null;
  tenToNineteenUnits: number | null;
  tenToNineteenUnitsPct: number | null;
  twentyPlusUnits: number | null;
  twentyPlusUnitsPct: number | null;
  mobileHomeUnits: number | null;
  mobileHomeUnitsPct: number | null;
  boatRvVanUnits: number | null;
  boatRvVanUnitsPct: number | null;
  built2020OrLater: number | null;
  built2020OrLaterPct: number | null;
  built2010To2019: number | null;
  built2010To2019Pct: number | null;
  built2000To2009: number | null;
  built2000To2009Pct: number | null;
  built1990To1999: number | null;
  built1990To1999Pct: number | null;
  built1980To1989: number | null;
  built1980To1989Pct: number | null;
  built1970To1979: number | null;
  built1970To1979Pct: number | null;
  built1960To1969: number | null;
  built1960To1969Pct: number | null;
  built1950To1959: number | null;
  built1950To1959Pct: number | null;
  built1940To1949: number | null;
  built1940To1949Pct: number | null;
  built1939OrEarlier: number | null;
  built1939OrEarlierPct: number | null;
  singleFamilyUnits: number | null;
  singleFamilyUnitsPct: number | null;
  smallMultifamilyUnits: number | null;
  smallMultifamilyUnitsPct: number | null;
  largeMultifamilyUnits: number | null;
  largeMultifamilyUnitsPct: number | null;
  built2010OrLater: number | null;
  built2010OrLaterPct: number | null;
  builtBefore1960: number | null;
  builtBefore1960Pct: number | null;
  raw: unknown;
};

export type AggregateHousingValueRentMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  ownerValueUnits: number | null;
  valueUnder50k: number | null;
  valueUnder50kPct: number | null;
  value50kTo99999: number | null;
  value50kTo99999Pct: number | null;
  value100kTo149999: number | null;
  value100kTo149999Pct: number | null;
  value150kTo199999: number | null;
  value150kTo199999Pct: number | null;
  value200kTo299999: number | null;
  value200kTo299999Pct: number | null;
  value300kTo499999: number | null;
  value300kTo499999Pct: number | null;
  value500kTo999999: number | null;
  value500kTo999999Pct: number | null;
  value1mPlus: number | null;
  value1mPlusPct: number | null;
  medianHomeValue: number | null;
  rentPayingUnits: number | null;
  rentUnder500: number | null;
  rentUnder500Pct: number | null;
  rent500To999: number | null;
  rent500To999Pct: number | null;
  rent1000To1499: number | null;
  rent1000To1499Pct: number | null;
  rent1500To1999: number | null;
  rent1500To1999Pct: number | null;
  rent2000To2499: number | null;
  rent2000To2499Pct: number | null;
  rent2500To2999: number | null;
  rent2500To2999Pct: number | null;
  rent3000Plus: number | null;
  rent3000PlusPct: number | null;
  medianGrossRent: number | null;
  noRentPaid: number | null;
  noRentPaidPct: number | null;
  value500kPlus: number | null;
  value500kPlusPct: number | null;
  rent2500Plus: number | null;
  rent2500PlusPct: number | null;
  raw: unknown;
};

export type AggregateLowModerateIncomeMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  coveragePeriod: string;
  stateFips: string;
  countyFips: string;
  countyName: string;
  blockGroupCount: number;
  lowPersons: number | null;
  lowModPersons: number | null;
  lowModerateMiddleIncomePersons: number | null;
  lowModUniverse: number | null;
  lowModPct: number | null;
  blockGroups51PctPlus: number;
  raw: unknown;
};

export type AggregatePovertyAssistanceMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  cashPublicAssistanceHouseholds: number | null;
  cashPublicAssistanceHouseholdsPct: number | null;
  meanCashPublicAssistanceIncome: number | null;
  snapHouseholds: number | null;
  snapHouseholdsPct: number | null;
  familiesBelowPoverty: number | null;
  familiesBelowPovertyPct: number | null;
  familiesWithChildrenBelowPoverty: number | null;
  familiesWithChildrenBelowPovertyPct: number | null;
  femaleHouseholderFamiliesBelowPoverty: number | null;
  femaleHouseholderFamiliesBelowPovertyPct: number | null;
  peopleBelowPoverty: number | null;
  peopleBelowPovertyPct: number | null;
  childrenBelowPoverty: number | null;
  childrenBelowPovertyPct: number | null;
  adults18To64BelowPoverty: number | null;
  adults18To64BelowPovertyPct: number | null;
  adults65PlusBelowPoverty: number | null;
  adults65PlusBelowPovertyPct: number | null;
  raw: unknown;
};

export type AggregateHealthInsuranceMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  civilianNoninstitutionalizedPopulation: number | null;
  withHealthInsurance: number | null;
  withHealthInsurancePct: number | null;
  privateHealthInsurance: number | null;
  privateHealthInsurancePct: number | null;
  publicCoverage: number | null;
  publicCoveragePct: number | null;
  noHealthInsurance: number | null;
  noHealthInsurancePct: number | null;
  under19Population: number | null;
  under19NoHealthInsurance: number | null;
  under19NoHealthInsurancePct: number | null;
  age19To64Population: number | null;
  employedAge19To64NoHealthInsurance: number | null;
  employedAge19To64NoHealthInsurancePct: number | null;
  unemployedAge19To64NoHealthInsurance: number | null;
  unemployedAge19To64NoHealthInsurancePct: number | null;
  notInLaborForceAge19To64NoHealthInsurance: number | null;
  notInLaborForceAge19To64NoHealthInsurancePct: number | null;
  raw: unknown;
};

export type AggregateEducationalAttainmentMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  population25Plus: number | null;
  lessThan9thGrade: number | null;
  lessThan9thGradePct: number | null;
  ninthTo12thNoDiploma: number | null;
  ninthTo12thNoDiplomaPct: number | null;
  highSchoolGraduate: number | null;
  highSchoolGraduatePct: number | null;
  someCollegeNoDegree: number | null;
  someCollegeNoDegreePct: number | null;
  associatesDegree: number | null;
  associatesDegreePct: number | null;
  bachelorsDegree: number | null;
  bachelorsDegreePct: number | null;
  graduateProfessionalDegree: number | null;
  graduateProfessionalDegreePct: number | null;
  highSchoolGraduateOrHigher: number | null;
  highSchoolGraduateOrHigherPct: number | null;
  bachelorsDegreeOrHigher: number | null;
  bachelorsDegreeOrHigherPct: number | null;
  raw: unknown;
};

export type AggregateEmploymentStatusMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  population16Plus: number | null;
  inLaborForce: number | null;
  inLaborForcePct: number | null;
  civilianLaborForce: number | null;
  civilianLaborForcePct: number | null;
  employed: number | null;
  employedPct: number | null;
  unemployed: number | null;
  unemployedPct: number | null;
  armedForces: number | null;
  armedForcesPct: number | null;
  notInLaborForce: number | null;
  notInLaborForcePct: number | null;
  unemploymentRate: number | null;
  raw: unknown;
};

export type AggregateLanguageProficiencyMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  population5Plus: number | null;
  englishOnly: number | null;
  englishOnlyPct: number | null;
  languageOtherThanEnglish: number | null;
  languageOtherThanEnglishPct: number | null;
  limitedEnglish: number | null;
  limitedEnglishPct: number | null;
  spanish: number | null;
  spanishPct: number | null;
  spanishLimitedEnglish: number | null;
  spanishLimitedEnglishPct: number | null;
  otherIndoEuropean: number | null;
  otherIndoEuropeanPct: number | null;
  otherIndoEuropeanLimitedEnglish: number | null;
  otherIndoEuropeanLimitedEnglishPct: number | null;
  asianPacificIslander: number | null;
  asianPacificIslanderPct: number | null;
  asianPacificIslanderLimitedEnglish: number | null;
  asianPacificIslanderLimitedEnglishPct: number | null;
  otherLanguages: number | null;
  otherLanguagesPct: number | null;
  otherLanguagesLimitedEnglish: number | null;
  otherLanguagesLimitedEnglishPct: number | null;
  raw: unknown;
};

export type AggregateInternetAccessMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalHouseholds: number | null;
  totalHouseholdsPct: number | null;
  withComputer: number | null;
  withComputerPct: number | null;
  withBroadband: number | null;
  withBroadbandPct: number | null;
  raw: unknown;
};

export type AggregateAgeSexMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  totalPopulation: number | null;
  male: number | null;
  malePct: number | null;
  female: number | null;
  femalePct: number | null;
  sexRatio: number | null;
  under5: number | null;
  under5Pct: number | null;
  age5To9: number | null;
  age5To9Pct: number | null;
  age10To14: number | null;
  age10To14Pct: number | null;
  age15To19: number | null;
  age15To19Pct: number | null;
  age20To24: number | null;
  age20To24Pct: number | null;
  age25To34: number | null;
  age25To34Pct: number | null;
  age35To44: number | null;
  age35To44Pct: number | null;
  age45To54: number | null;
  age45To54Pct: number | null;
  age55To59: number | null;
  age55To59Pct: number | null;
  age60To64: number | null;
  age60To64Pct: number | null;
  age65To74: number | null;
  age65To74Pct: number | null;
  age75To84: number | null;
  age75To84Pct: number | null;
  age85Plus: number | null;
  age85PlusPct: number | null;
  medianAge: number | null;
  raw: unknown;
};

export type AggregateRaceOriginMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  raceTotalPopulation: number | null;
  white: number | null;
  whitePct: number | null;
  black: number | null;
  blackPct: number | null;
  americanIndianAlaskaNative: number | null;
  americanIndianAlaskaNativePct: number | null;
  asian: number | null;
  asianPct: number | null;
  nativeHawaiianPacificIslander: number | null;
  nativeHawaiianPacificIslanderPct: number | null;
  someOtherRace: number | null;
  someOtherRacePct: number | null;
  twoOrMoreRaces: number | null;
  twoOrMoreRacesPct: number | null;
  hispanicLatino: number | null;
  hispanicLatinoPct: number | null;
  notHispanicLatino: number | null;
  notHispanicLatinoPct: number | null;
  whiteNonHispanic: number | null;
  whiteNonHispanicPct: number | null;
  raw: unknown;
};

export type AggregateLausLaborMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  period: string;
  periodName: string;
  stateFips: string;
  countyFips: string;
  countyName: string;
  laborForce: number | null;
  employment: number | null;
  unemployment: number | null;
  unemploymentRate: number | null;
  raw: unknown;
};

export type AggregateCountyBusinessMetricInput = {
  sourceId: string;
  sourceRecordId: string;
  hub: string;
  year: number;
  stateFips: string;
  countyFips: string;
  countyName: string;
  naicsCode: string;
  naicsLabel: string;
  legalFormCode: string;
  legalFormLabel: string;
  employmentSizeCode: string;
  employmentSizeLabel: string;
  establishments: number | null;
  employment: number | null;
  annualPayrollThousands: number | null;
  raw: unknown;
};

declare global {
  var peopleSearchDb: Database.Database | undefined;
  var peopleSearchDbSchemaVersion: number | undefined;
}

export function getDb() {
  if (!globalThis.peopleSearchDb) {
    mkdirSync(dirname(dbPath), { recursive: true });
    globalThis.peopleSearchDb = new Database(dbPath);
    globalThis.peopleSearchDb.pragma("journal_mode = WAL");
    globalThis.peopleSearchDb.pragma("foreign_keys = ON");
  }
  if (globalThis.peopleSearchDbSchemaVersion !== schemaVersion) {
    migrate(globalThis.peopleSearchDb);
    globalThis.peopleSearchDbSchemaVersion = schemaVersion;
  }
  return globalThis.peopleSearchDb;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS approved_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      acquisition_method TEXT NOT NULL,
      license_url TEXT,
      approved_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      birth_date TEXT,
      normalized_birth_date TEXT,
      age_range TEXT NOT NULL DEFAULT 'Unknown',
      confidence TEXT NOT NULL DEFAULT 'Medium',
      suppressed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profile_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      street TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT,
      normalized_address TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'possible',
      source_id TEXT REFERENCES approved_sources(id),
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('phone', 'email')),
      value TEXT NOT NULL,
      display_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'Medium',
      source_id TEXT REFERENCES approved_sources(id),
      display_allowed INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      related_name TEXT NOT NULL,
      relationship_type TEXT NOT NULL DEFAULT 'possible associate',
      confidence TEXT NOT NULL DEFAULT 'Medium',
      source_id TEXT REFERENCES approved_sources(id)
    );

    CREATE TABLE IF NOT EXISTS source_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS suppression_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS privacy_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_verification',
      profile_id TEXT,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      review_note TEXT
    );

    CREATE TABLE IF NOT EXISTS abuse_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT,
      reporter_name TEXT NOT NULL,
      reporter_email TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS search_result_cache (
      query_key TEXT PRIMARY KEY,
      query_kind TEXT NOT NULL,
      profile_ids_json TEXT NOT NULL,
      refresh_notice TEXT,
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_search_refreshes (
      source_id TEXT NOT NULL,
      query_key TEXT NOT NULL,
      refreshed_at_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      fetched INTEGER NOT NULL DEFAULT 0,
      imported INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      PRIMARY KEY (source_id, query_key)
    );

    CREATE TABLE IF NOT EXISTS record_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      feedback TEXT NOT NULL CHECK (feedback IN ('up', 'down')),
      context TEXT NOT NULL DEFAULT 'search_result',
      search_token TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket_key TEXT NOT NULL,
      route TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS aggregate_mobility_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      geography_level TEXT NOT NULL,
      geo_id TEXT NOT NULL,
      name TEXT NOT NULL,
      hub TEXT NOT NULL,
      state TEXT NOT NULL,
      county TEXT NOT NULL,
      total_population_one_year_over INTEGER,
      same_house INTEGER,
      different_house INTEGER,
      different_house_us INTEGER,
      moved_within_same_county INTEGER,
      moved_different_county INTEGER,
      moved_different_county_same_state INTEGER,
      moved_different_state INTEGER,
      moved_from_abroad INTEGER,
      same_house_pct REAL,
      different_house_pct REAL,
      moved_within_same_county_pct REAL,
      moved_different_county_same_state_pct REAL,
      moved_different_state_pct REAL,
      moved_from_abroad_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_migration_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      year_start INTEGER NOT NULL,
      year_end INTEGER NOT NULL,
      hub TEXT NOT NULL,
      flow_direction TEXT NOT NULL,
      flow_kind TEXT NOT NULL,
      origin_state_fips TEXT NOT NULL,
      origin_county_fips TEXT NOT NULL,
      origin_name TEXT NOT NULL,
      destination_state_fips TEXT NOT NULL,
      destination_county_fips TEXT NOT NULL,
      destination_name TEXT NOT NULL,
      returns_count INTEGER,
      individuals_count INTEGER,
      adjusted_gross_income INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_housing_permit_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      period_month TEXT NOT NULL,
      category TEXT NOT NULL,
      permit_count INTEGER NOT NULL,
      housing_units_added INTEGER,
      housing_units_removed INTEGER,
      net_housing_units INTEGER,
      estimated_cost REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_population_change_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      state_name TEXT NOT NULL,
      population_estimate INTEGER,
      net_population_change INTEGER,
      births INTEGER,
      deaths INTEGER,
      natural_change INTEGER,
      international_migration INTEGER,
      domestic_migration INTEGER,
      net_migration INTEGER,
      residual INTEGER,
      domestic_migration_rate REAL,
      international_migration_rate REAL,
      net_migration_rate REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_housing_stock_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_housing_units INTEGER,
      occupied_housing_units INTEGER,
      vacant_housing_units INTEGER,
      occupied_housing_pct REAL,
      vacant_housing_pct REAL,
      homeowner_vacancy_rate REAL,
      rental_vacancy_rate REAL,
      owner_occupied_units INTEGER,
      renter_occupied_units INTEGER,
      owner_occupied_pct REAL,
      renter_occupied_pct REAL,
      median_home_value INTEGER,
      median_gross_rent INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_residential_construction_permit_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      state_name TEXT NOT NULL,
      all_permits INTEGER,
      single_family_permits INTEGER,
      multifamily_permits INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_housing_assistance_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      coverage_period TEXT NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      tract_fips TEXT NOT NULL,
      geoid TEXT NOT NULL,
      geography_name TEXT NOT NULL,
      housing_choice_vouchers INTEGER,
      housing_choice_voucher_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_public_housing_inventory_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      coverage_period TEXT NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      building_count INTEGER NOT NULL,
      total_dwelling_units INTEGER,
      total_units INTEGER,
      occupied_units INTEGER,
      vacant_units INTEGER,
      number_reported INTEGER,
      people_total INTEGER,
      average_pct_occupied REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_lihtc_property_inventory_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      coverage_period TEXT NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      project_count INTEGER NOT NULL,
      total_units INTEGER,
      low_income_units INTEGER,
      zero_bedroom_units INTEGER,
      one_bedroom_units INTEGER,
      two_bedroom_units INTEGER,
      three_bedroom_units INTEGER,
      four_plus_bedroom_units INTEGER,
      allocation_amount REAL,
      earliest_placed_in_service_year INTEGER,
      latest_placed_in_service_year INTEGER,
      earliest_allocation_year INTEGER,
      latest_allocation_year INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_lihtc_qualified_census_tract_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      qualified_tract_count INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_lihtc_difficult_development_area_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      area_name TEXT NOT NULL,
      dda_code TEXT NOT NULL,
      dda_type TEXT NOT NULL,
      zcta_count INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_small_area_fair_market_rent_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      hud_code TEXT NOT NULL,
      fmr_name TEXT NOT NULL,
      zcta TEXT NOT NULL,
      safmr_0br INTEGER,
      safmr_0br_payment_standard_90 INTEGER,
      safmr_0br_payment_standard_110 INTEGER,
      safmr_1br INTEGER,
      safmr_1br_payment_standard_90 INTEGER,
      safmr_1br_payment_standard_110 INTEGER,
      safmr_2br INTEGER,
      safmr_2br_payment_standard_90 INTEGER,
      safmr_2br_payment_standard_110 INTEGER,
      safmr_3br INTEGER,
      safmr_3br_payment_standard_90 INTEGER,
      safmr_3br_payment_standard_110 INTEGER,
      safmr_4br INTEGER,
      safmr_4br_payment_standard_90 INTEGER,
      safmr_4br_payment_standard_110 INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_fair_market_rent_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      fmr_code TEXT NOT NULL,
      fmr_name TEXT NOT NULL,
      fmr_0br INTEGER,
      fmr_1br INTEGER,
      fmr_2br INTEGER,
      fmr_3br INTEGER,
      fmr_4br INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_low_moderate_income_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      coverage_period TEXT NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      block_group_count INTEGER NOT NULL,
      low_persons INTEGER,
      low_mod_persons INTEGER,
      low_moderate_middle_income_persons INTEGER,
      low_mod_universe INTEGER,
      low_mod_pct REAL,
      block_groups_51_pct_plus INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_commute_flow_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      flow_kind TEXT NOT NULL,
      home_state_fips TEXT NOT NULL,
      home_county_fips TEXT NOT NULL,
      home_county_name TEXT NOT NULL,
      work_state_fips TEXT NOT NULL,
      work_county_fips TEXT NOT NULL,
      work_county_name TEXT NOT NULL,
      total_jobs INTEGER NOT NULL,
      jobs_age_29_or_younger INTEGER,
      jobs_age_30_to_54 INTEGER,
      jobs_age_55_or_older INTEGER,
      jobs_earnings_1250_or_less INTEGER,
      jobs_earnings_1251_to_3333 INTEGER,
      jobs_earnings_3333_plus INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_commuting_characteristic_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_workers_16_over INTEGER,
      drove_alone INTEGER,
      drove_alone_pct REAL,
      carpooled INTEGER,
      carpooled_pct REAL,
      public_transportation INTEGER,
      public_transportation_pct REAL,
      walked INTEGER,
      walked_pct REAL,
      other_means INTEGER,
      other_means_pct REAL,
      worked_from_home INTEGER,
      worked_from_home_pct REAL,
      mean_travel_time_minutes REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_household_income_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_households INTEGER,
      income_under_10k INTEGER,
      income_under_10k_pct REAL,
      income_10k_to_14999 INTEGER,
      income_10k_to_14999_pct REAL,
      income_15k_to_24999 INTEGER,
      income_15k_to_24999_pct REAL,
      income_25k_to_34999 INTEGER,
      income_25k_to_34999_pct REAL,
      income_35k_to_49999 INTEGER,
      income_35k_to_49999_pct REAL,
      income_50k_to_74999 INTEGER,
      income_50k_to_74999_pct REAL,
      income_75k_to_99999 INTEGER,
      income_75k_to_99999_pct REAL,
      income_100k_to_149999 INTEGER,
      income_100k_to_149999_pct REAL,
      income_150k_to_199999 INTEGER,
      income_150k_to_199999_pct REAL,
      income_200k_plus INTEGER,
      income_200k_plus_pct REAL,
      median_household_income INTEGER,
      mean_household_income INTEGER,
      income_under_50k INTEGER,
      income_under_50k_pct REAL,
      income_100k_plus INTEGER,
      income_100k_plus_pct REAL,
      income_150k_plus INTEGER,
      income_150k_plus_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_poverty_assistance_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      cash_public_assistance_households INTEGER,
      cash_public_assistance_households_pct REAL,
      mean_cash_public_assistance_income INTEGER,
      snap_households INTEGER,
      snap_households_pct REAL,
      families_below_poverty INTEGER,
      families_below_poverty_pct REAL,
      families_with_children_below_poverty INTEGER,
      families_with_children_below_poverty_pct REAL,
      female_householder_families_below_poverty INTEGER,
      female_householder_families_below_poverty_pct REAL,
      people_below_poverty INTEGER,
      people_below_poverty_pct REAL,
      children_below_poverty INTEGER,
      children_below_poverty_pct REAL,
      adults_18_to_64_below_poverty INTEGER,
      adults_18_to_64_below_poverty_pct REAL,
      adults_65_plus_below_poverty INTEGER,
      adults_65_plus_below_poverty_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_health_insurance_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      civilian_noninstitutionalized_population INTEGER,
      with_health_insurance INTEGER,
      with_health_insurance_pct REAL,
      private_health_insurance INTEGER,
      private_health_insurance_pct REAL,
      public_coverage INTEGER,
      public_coverage_pct REAL,
      no_health_insurance INTEGER,
      no_health_insurance_pct REAL,
      under_19_population INTEGER,
      under_19_no_health_insurance INTEGER,
      under_19_no_health_insurance_pct REAL,
      age_19_to_64_population INTEGER,
      employed_age_19_to_64_no_health_insurance INTEGER,
      employed_age_19_to_64_no_health_insurance_pct REAL,
      unemployed_age_19_to_64_no_health_insurance INTEGER,
      unemployed_age_19_to_64_no_health_insurance_pct REAL,
      not_in_labor_force_age_19_to_64_no_health_insurance INTEGER,
      not_in_labor_force_age_19_to_64_no_health_insurance_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_educational_attainment_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      population_25_plus INTEGER,
      less_than_9th_grade INTEGER,
      less_than_9th_grade_pct REAL,
      ninth_to_12th_no_diploma INTEGER,
      ninth_to_12th_no_diploma_pct REAL,
      high_school_graduate INTEGER,
      high_school_graduate_pct REAL,
      some_college_no_degree INTEGER,
      some_college_no_degree_pct REAL,
      associates_degree INTEGER,
      associates_degree_pct REAL,
      bachelors_degree INTEGER,
      bachelors_degree_pct REAL,
      graduate_professional_degree INTEGER,
      graduate_professional_degree_pct REAL,
      high_school_graduate_or_higher INTEGER,
      high_school_graduate_or_higher_pct REAL,
      bachelors_degree_or_higher INTEGER,
      bachelors_degree_or_higher_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_employment_status_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      population_16_plus INTEGER,
      in_labor_force INTEGER,
      in_labor_force_pct REAL,
      civilian_labor_force INTEGER,
      civilian_labor_force_pct REAL,
      employed INTEGER,
      employed_pct REAL,
      unemployed INTEGER,
      unemployed_pct REAL,
      armed_forces INTEGER,
      armed_forces_pct REAL,
      not_in_labor_force INTEGER,
      not_in_labor_force_pct REAL,
      unemployment_rate REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_language_proficiency_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      population_5_plus INTEGER,
      english_only INTEGER,
      english_only_pct REAL,
      language_other_than_english INTEGER,
      language_other_than_english_pct REAL,
      limited_english INTEGER,
      limited_english_pct REAL,
      spanish INTEGER,
      spanish_pct REAL,
      spanish_limited_english INTEGER,
      spanish_limited_english_pct REAL,
      other_indo_european INTEGER,
      other_indo_european_pct REAL,
      other_indo_european_limited_english INTEGER,
      other_indo_european_limited_english_pct REAL,
      asian_pacific_islander INTEGER,
      asian_pacific_islander_pct REAL,
      asian_pacific_islander_limited_english INTEGER,
      asian_pacific_islander_limited_english_pct REAL,
      other_languages INTEGER,
      other_languages_pct REAL,
      other_languages_limited_english INTEGER,
      other_languages_limited_english_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_internet_access_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_households INTEGER,
      total_households_pct REAL,
      with_computer INTEGER,
      with_computer_pct REAL,
      with_broadband INTEGER,
      with_broadband_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_age_sex_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_population INTEGER,
      male INTEGER,
      male_pct REAL,
      female INTEGER,
      female_pct REAL,
      sex_ratio REAL,
      under_5 INTEGER,
      under_5_pct REAL,
      age_5_to_9 INTEGER,
      age_5_to_9_pct REAL,
      age_10_to_14 INTEGER,
      age_10_to_14_pct REAL,
      age_15_to_19 INTEGER,
      age_15_to_19_pct REAL,
      age_20_to_24 INTEGER,
      age_20_to_24_pct REAL,
      age_25_to_34 INTEGER,
      age_25_to_34_pct REAL,
      age_35_to_44 INTEGER,
      age_35_to_44_pct REAL,
      age_45_to_54 INTEGER,
      age_45_to_54_pct REAL,
      age_55_to_59 INTEGER,
      age_55_to_59_pct REAL,
      age_60_to_64 INTEGER,
      age_60_to_64_pct REAL,
      age_65_to_74 INTEGER,
      age_65_to_74_pct REAL,
      age_75_to_84 INTEGER,
      age_75_to_84_pct REAL,
      age_85_plus INTEGER,
      age_85_plus_pct REAL,
      median_age REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_race_origin_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      race_total_population INTEGER,
      white INTEGER,
      white_pct REAL,
      black INTEGER,
      black_pct REAL,
      american_indian_alaska_native INTEGER,
      american_indian_alaska_native_pct REAL,
      asian INTEGER,
      asian_pct REAL,
      native_hawaiian_pacific_islander INTEGER,
      native_hawaiian_pacific_islander_pct REAL,
      some_other_race INTEGER,
      some_other_race_pct REAL,
      two_or_more_races INTEGER,
      two_or_more_races_pct REAL,
      hispanic_latino INTEGER,
      hispanic_latino_pct REAL,
      not_hispanic_latino INTEGER,
      not_hispanic_latino_pct REAL,
      white_non_hispanic INTEGER,
      white_non_hispanic_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_laus_labor_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      period TEXT NOT NULL,
      period_name TEXT NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      labor_force INTEGER,
      employment INTEGER,
      unemployment INTEGER,
      unemployment_rate REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_county_business_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      naics_code TEXT NOT NULL,
      naics_label TEXT NOT NULL,
      legal_form_code TEXT NOT NULL,
      legal_form_label TEXT NOT NULL,
      employment_size_code TEXT NOT NULL,
      employment_size_label TEXT NOT NULL,
      establishments INTEGER,
      employment INTEGER,
      annual_payroll_thousands INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_residential_tenure_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      occupied_housing_units INTEGER,
      moved_2023_or_later INTEGER,
      moved_2023_or_later_pct REAL,
      moved_2020_to_2022 INTEGER,
      moved_2020_to_2022_pct REAL,
      moved_2010_to_2019 INTEGER,
      moved_2010_to_2019_pct REAL,
      moved_2000_to_2009 INTEGER,
      moved_2000_to_2009_pct REAL,
      moved_1990_to_1999 INTEGER,
      moved_1990_to_1999_pct REAL,
      moved_1989_or_earlier INTEGER,
      moved_1989_or_earlier_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_housing_cost_burden_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      owner_mortgage_units INTEGER,
      owner_mortgage_30_to_34_pct REAL,
      owner_mortgage_35_plus_pct REAL,
      owner_mortgage_30_plus INTEGER,
      owner_mortgage_30_plus_pct REAL,
      owner_no_mortgage_units INTEGER,
      owner_no_mortgage_30_to_34_pct REAL,
      owner_no_mortgage_35_plus_pct REAL,
      owner_no_mortgage_30_plus INTEGER,
      owner_no_mortgage_30_plus_pct REAL,
      renter_units INTEGER,
      renter_30_to_34_pct REAL,
      renter_35_plus_pct REAL,
      renter_30_plus INTEGER,
      renter_30_plus_pct REAL,
      median_owner_cost_with_mortgage INTEGER,
      median_owner_cost_without_mortgage INTEGER,
      median_gross_rent INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_vacancy_status_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_vacant_units INTEGER,
      for_rent_units INTEGER,
      for_rent_pct REAL,
      rented_not_occupied_units INTEGER,
      rented_not_occupied_pct REAL,
      for_sale_only_units INTEGER,
      for_sale_only_pct REAL,
      sold_not_occupied_units INTEGER,
      sold_not_occupied_pct REAL,
      seasonal_recreational_occasional_units INTEGER,
      seasonal_recreational_occasional_pct REAL,
      migrant_worker_units INTEGER,
      migrant_worker_pct REAL,
      other_vacant_units INTEGER,
      other_vacant_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_housing_crowding_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      occupied_housing_units INTEGER,
      occupants_per_room_one_or_less INTEGER,
      occupants_per_room_one_or_less_pct REAL,
      occupants_per_room_one_to_one_point_five INTEGER,
      occupants_per_room_one_to_one_point_five_pct REAL,
      occupants_per_room_one_point_five_plus INTEGER,
      occupants_per_room_one_point_five_plus_pct REAL,
      overcrowded_units INTEGER,
      overcrowded_pct REAL,
      severe_overcrowded_units INTEGER,
      severe_overcrowded_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_household_composition_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_households INTEGER,
      married_couple_households INTEGER,
      married_couple_households_pct REAL,
      married_couple_with_children INTEGER,
      married_couple_with_children_pct REAL,
      cohabiting_couple_households INTEGER,
      cohabiting_couple_households_pct REAL,
      cohabiting_couple_with_children INTEGER,
      cohabiting_couple_with_children_pct REAL,
      male_no_spouse_households INTEGER,
      male_no_spouse_households_pct REAL,
      male_living_alone INTEGER,
      male_living_alone_pct REAL,
      male_living_alone_65_plus INTEGER,
      male_living_alone_65_plus_pct REAL,
      female_no_spouse_households INTEGER,
      female_no_spouse_households_pct REAL,
      female_living_alone INTEGER,
      female_living_alone_pct REAL,
      female_living_alone_65_plus INTEGER,
      female_living_alone_65_plus_pct REAL,
      households_with_under_18 INTEGER,
      households_with_under_18_pct REAL,
      households_with_65_plus INTEGER,
      households_with_65_plus_pct REAL,
      average_household_size REAL,
      average_family_size REAL,
      single_person_households INTEGER,
      single_person_households_pct REAL,
      living_alone_65_plus INTEGER,
      living_alone_65_plus_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_housing_structure_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      total_housing_units INTEGER,
      one_unit_detached INTEGER,
      one_unit_detached_pct REAL,
      one_unit_attached INTEGER,
      one_unit_attached_pct REAL,
      two_units INTEGER,
      two_units_pct REAL,
      three_or_four_units INTEGER,
      three_or_four_units_pct REAL,
      five_to_nine_units INTEGER,
      five_to_nine_units_pct REAL,
      ten_to_nineteen_units INTEGER,
      ten_to_nineteen_units_pct REAL,
      twenty_plus_units INTEGER,
      twenty_plus_units_pct REAL,
      mobile_home_units INTEGER,
      mobile_home_units_pct REAL,
      boat_rv_van_units INTEGER,
      boat_rv_van_units_pct REAL,
      built_2020_or_later INTEGER,
      built_2020_or_later_pct REAL,
      built_2010_to_2019 INTEGER,
      built_2010_to_2019_pct REAL,
      built_2000_to_2009 INTEGER,
      built_2000_to_2009_pct REAL,
      built_1990_to_1999 INTEGER,
      built_1990_to_1999_pct REAL,
      built_1980_to_1989 INTEGER,
      built_1980_to_1989_pct REAL,
      built_1970_to_1979 INTEGER,
      built_1970_to_1979_pct REAL,
      built_1960_to_1969 INTEGER,
      built_1960_to_1969_pct REAL,
      built_1950_to_1959 INTEGER,
      built_1950_to_1959_pct REAL,
      built_1940_to_1949 INTEGER,
      built_1940_to_1949_pct REAL,
      built_1939_or_earlier INTEGER,
      built_1939_or_earlier_pct REAL,
      single_family_units INTEGER,
      single_family_units_pct REAL,
      small_multifamily_units INTEGER,
      small_multifamily_units_pct REAL,
      large_multifamily_units INTEGER,
      large_multifamily_units_pct REAL,
      built_2010_or_later INTEGER,
      built_2010_or_later_pct REAL,
      built_before_1960 INTEGER,
      built_before_1960_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS aggregate_housing_value_rent_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      hub TEXT NOT NULL,
      year INTEGER NOT NULL,
      state_fips TEXT NOT NULL,
      county_fips TEXT NOT NULL,
      county_name TEXT NOT NULL,
      owner_value_units INTEGER,
      value_under_50k INTEGER,
      value_under_50k_pct REAL,
      value_50k_to_99999 INTEGER,
      value_50k_to_99999_pct REAL,
      value_100k_to_149999 INTEGER,
      value_100k_to_149999_pct REAL,
      value_150k_to_199999 INTEGER,
      value_150k_to_199999_pct REAL,
      value_200k_to_299999 INTEGER,
      value_200k_to_299999_pct REAL,
      value_300k_to_499999 INTEGER,
      value_300k_to_499999_pct REAL,
      value_500k_to_999999 INTEGER,
      value_500k_to_999999_pct REAL,
      value_1m_plus INTEGER,
      value_1m_plus_pct REAL,
      median_home_value INTEGER,
      rent_paying_units INTEGER,
      rent_under_500 INTEGER,
      rent_under_500_pct REAL,
      rent_500_to_999 INTEGER,
      rent_500_to_999_pct REAL,
      rent_1000_to_1499 INTEGER,
      rent_1000_to_1499_pct REAL,
      rent_1500_to_1999 INTEGER,
      rent_1500_to_1999_pct REAL,
      rent_2000_to_2499 INTEGER,
      rent_2000_to_2499_pct REAL,
      rent_2500_to_2999 INTEGER,
      rent_2500_to_2999_pct REAL,
      rent_3000_plus INTEGER,
      rent_3000_plus_pct REAL,
      median_gross_rent INTEGER,
      no_rent_paid INTEGER,
      no_rent_paid_pct REAL,
      value_500k_plus INTEGER,
      value_500k_plus_pct REAL,
      rent_2500_plus INTEGER,
      rent_2500_plus_pct REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_normalized_name ON profiles(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_profiles_suppressed ON profiles(suppressed_at);
    CREATE INDEX IF NOT EXISTS idx_locations_address ON profile_locations(normalized_address);
    CREATE INDEX IF NOT EXISTS idx_locations_city_state ON profile_locations(city, state);
    CREATE INDEX IF NOT EXISTS idx_contacts_normalized ON profile_contacts(type, normalized_value);
    CREATE INDEX IF NOT EXISTS idx_privacy_status ON privacy_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_search_result_cache_expires ON search_result_cache(expires_at_ms);
    CREATE INDEX IF NOT EXISTS idx_source_search_refreshes_refreshed ON source_search_refreshes(refreshed_at_ms);
    CREATE INDEX IF NOT EXISTS idx_record_feedback_profile ON record_feedback(profile_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_record_feedback_created ON record_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_created ON rate_limit_events(bucket_key, created_at_ms);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created ON rate_limit_events(created_at_ms);
    CREATE INDEX IF NOT EXISTS idx_aggregate_mobility_hub_year ON aggregate_mobility_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_mobility_geo ON aggregate_mobility_metrics(geo_id, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_migration_flows_hub_year ON aggregate_migration_flows(hub, year_start, year_end);
    CREATE INDEX IF NOT EXISTS idx_aggregate_migration_flows_origin ON aggregate_migration_flows(origin_state_fips, origin_county_fips);
    CREATE INDEX IF NOT EXISTS idx_aggregate_migration_flows_destination ON aggregate_migration_flows(destination_state_fips, destination_county_fips);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_permits_hub_month ON aggregate_housing_permit_metrics(hub, period_month);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_permits_city_month ON aggregate_housing_permit_metrics(city, state, period_month);
    CREATE INDEX IF NOT EXISTS idx_aggregate_population_change_hub_year ON aggregate_population_change_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_population_change_county_year ON aggregate_population_change_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_stock_hub_year ON aggregate_housing_stock_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_stock_county_year ON aggregate_housing_stock_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_residential_construction_permits_hub_year ON aggregate_residential_construction_permit_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_residential_construction_permits_county_year ON aggregate_residential_construction_permit_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_assistance_hub_period ON aggregate_housing_assistance_metrics(hub, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_assistance_county_period ON aggregate_housing_assistance_metrics(state_fips, county_fips, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_assistance_geoid_period ON aggregate_housing_assistance_metrics(geoid, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_public_housing_inventory_hub_period ON aggregate_public_housing_inventory_metrics(hub, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_public_housing_inventory_county_period ON aggregate_public_housing_inventory_metrics(state_fips, county_fips, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_lihtc_property_inventory_hub_period ON aggregate_lihtc_property_inventory_metrics(hub, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_lihtc_property_inventory_county_period ON aggregate_lihtc_property_inventory_metrics(state_fips, county_fips, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_lihtc_qct_hub_year ON aggregate_lihtc_qualified_census_tract_metrics(hub, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_lihtc_qct_county_year ON aggregate_lihtc_qualified_census_tract_metrics(state_fips, county_fips, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_lihtc_dda_hub_year ON aggregate_lihtc_difficult_development_area_metrics(hub, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_lihtc_dda_area_year ON aggregate_lihtc_difficult_development_area_metrics(area_name, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_safmr_hub_year ON aggregate_small_area_fair_market_rent_metrics(hub, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_safmr_fmr_year ON aggregate_small_area_fair_market_rent_metrics(fmr_name, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_safmr_zcta_year ON aggregate_small_area_fair_market_rent_metrics(zcta, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_fmr_hub_year ON aggregate_fair_market_rent_metrics(hub, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_fmr_name_year ON aggregate_fair_market_rent_metrics(fmr_name, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_fmr_code_year ON aggregate_fair_market_rent_metrics(fmr_code, fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_low_mod_income_hub_period ON aggregate_low_moderate_income_metrics(hub, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_low_mod_income_county_period ON aggregate_low_moderate_income_metrics(state_fips, county_fips, coverage_period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_commute_flows_hub_year ON aggregate_commute_flow_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_commute_flows_home_county ON aggregate_commute_flow_metrics(home_state_fips, home_county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_commute_flows_work_county ON aggregate_commute_flow_metrics(work_state_fips, work_county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_commuting_characteristics_hub_year ON aggregate_commuting_characteristic_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_commuting_characteristics_county_year ON aggregate_commuting_characteristic_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_household_income_hub_year ON aggregate_household_income_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_household_income_county_year ON aggregate_household_income_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_poverty_assistance_hub_year ON aggregate_poverty_assistance_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_poverty_assistance_county_year ON aggregate_poverty_assistance_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_health_insurance_hub_year ON aggregate_health_insurance_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_health_insurance_county_year ON aggregate_health_insurance_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_educational_attainment_hub_year ON aggregate_educational_attainment_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_educational_attainment_county_year ON aggregate_educational_attainment_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_employment_status_hub_year ON aggregate_employment_status_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_employment_status_county_year ON aggregate_employment_status_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_language_proficiency_hub_year ON aggregate_language_proficiency_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_language_proficiency_county_year ON aggregate_language_proficiency_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_internet_access_hub_year ON aggregate_internet_access_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_internet_access_county_year ON aggregate_internet_access_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_age_sex_hub_year ON aggregate_age_sex_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_age_sex_county_year ON aggregate_age_sex_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_race_origin_hub_year ON aggregate_race_origin_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_race_origin_county_year ON aggregate_race_origin_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_laus_labor_hub_period ON aggregate_laus_labor_metrics(hub, year, period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_laus_labor_county_period ON aggregate_laus_labor_metrics(state_fips, county_fips, year, period);
    CREATE INDEX IF NOT EXISTS idx_aggregate_county_business_hub_year ON aggregate_county_business_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_county_business_county_year ON aggregate_county_business_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_residential_tenure_hub_year ON aggregate_residential_tenure_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_residential_tenure_county_year ON aggregate_residential_tenure_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_cost_burden_hub_year ON aggregate_housing_cost_burden_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_cost_burden_county_year ON aggregate_housing_cost_burden_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_vacancy_status_hub_year ON aggregate_vacancy_status_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_vacancy_status_county_year ON aggregate_vacancy_status_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_crowding_hub_year ON aggregate_housing_crowding_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_crowding_county_year ON aggregate_housing_crowding_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_household_composition_hub_year ON aggregate_household_composition_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_household_composition_county_year ON aggregate_household_composition_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_structure_hub_year ON aggregate_housing_structure_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_structure_county_year ON aggregate_housing_structure_metrics(state_fips, county_fips, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_value_rent_hub_year ON aggregate_housing_value_rent_metrics(hub, year);
    CREATE INDEX IF NOT EXISTS idx_aggregate_housing_value_rent_county_year ON aggregate_housing_value_rent_metrics(state_fips, county_fips, year);
  `);
  ensureProfileIdentityColumns(db);
}

function ensureProfileIdentityColumns(db: Database.Database) {
  const columns = new Set(
    (
      db.prepare("PRAGMA table_info(profiles)").all() as Array<{
        name: string;
      }>
    ).map((column) => column.name),
  );

  if (!columns.has("birth_date")) {
    db.prepare("ALTER TABLE profiles ADD COLUMN birth_date TEXT").run();
  }

  if (!columns.has("normalized_birth_date")) {
    db
      .prepare("ALTER TABLE profiles ADD COLUMN normalized_birth_date TEXT")
      .run();
  }

  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_profiles_name_birth ON profiles(normalized_name, normalized_birth_date)",
  ).run();
}

export function databaseHasProfiles() {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM profiles").get() as {
    count: number;
  };
  return row.count > 0;
}

export function searchProfiles(payload: SearchPayload): SearchResult[] {
  const db = getDb();

  if (payload.mode === "name") {
    const nameTokens = getNameSearchTokens(payload);
    if (nameTokens.length === 0) {
      return [];
    }

    const city = normalizeText(payload.city);
    const state = payload.state.trim().toUpperCase();
    const profileTokenWhere = nameTokenWhereClause(
      "p.normalized_name",
      nameTokens,
      "profileNameToken",
    );
    const aliasTokenWhere = nameTokenWhereClause(
      "a.normalized_alias",
      nameTokens,
      "aliasNameToken",
    );
    const rows = db
      .prepare(
        `
        SELECT DISTINCT p.*
        FROM profiles p
        LEFT JOIN profile_locations l ON l.profile_id = p.id
        WHERE p.suppressed_at IS NULL
          AND (
            ${profileTokenWhere}
            OR EXISTS (
              SELECT 1
              FROM profile_aliases a
              WHERE a.profile_id = p.id
                AND ${aliasTokenWhere}
            )
          )
          AND (@state = '' OR l.state = @state)
          AND (@city = '' OR lower(l.city) LIKE @cityLike ESCAPE '\\')
        ORDER BY
          CASE p.confidence WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
          p.full_name
        LIMIT 25
      `,
      )
      .all({
        ...nameTokenParams(nameTokens, "profileNameToken"),
        ...nameTokenParams(nameTokens, "aliasNameToken"),
        state,
        city,
        cityLike: `%${escapeSqlLike(city)}%`,
      }) as DbProfileRow[];

    return rows
      .filter((row) => isPersonLikeSearchName(row.full_name, nameTokens))
      .map(toSearchResult);
  }

  if (payload.mode === "phone") {
    const phone = normalizePhone(payload.phone);
    const rows = db
      .prepare(
        `
        SELECT DISTINCT p.*
        FROM profiles p
        JOIN profile_contacts c ON c.profile_id = p.id
        WHERE p.suppressed_at IS NULL
          AND c.type = 'phone'
          AND c.normalized_value = @phone
        LIMIT 25
      `,
      )
      .all({ phone }) as DbProfileRow[];

    return rows.map(toSearchResult);
  }

  if (payload.mode === "email") {
    const email = normalizeEmail(payload.email);
    if (!email) {
      return [];
    }

    const rows = db
      .prepare(
        `
        SELECT DISTINCT p.*
        FROM profiles p
        JOIN profile_contacts c ON c.profile_id = p.id
        WHERE p.suppressed_at IS NULL
          AND c.type = 'email'
          AND c.normalized_value = @email
        LIMIT 25
      `,
      )
      .all({ email }) as DbProfileRow[];

    return rows.map(toSearchResult);
  }

  // Fuzzy / partial address lookup: a search works with any meaningful subset
  // of street / city+state / ZIP — not all fields at once. Street matching is
  // token-subset (match if at least one token hits), ranked by how many tokens
  // hit, with exact and prefix matches ranked above partial ones.
  const streetTokens = addressSearchTokens(payload.street);
  const state = payload.state.trim().toUpperCase();
  const city = normalizeText(payload.city);
  const zip = payload.zip.trim();

  const hasStreet = streetTokens.length > 0;
  const hasZip = zip.length > 0;
  const hasCityState = city.length > 0 && state.length > 0;
  if (!hasStreet && !hasZip && !hasCityState) {
    return [];
  }

  const normalizedAddress = normalizeAddress(payload);

  const where: string[] = [
    "p.suppressed_at IS NULL",
    `lower(l.city) NOT IN (${genericLocationCities
      .map((_, index) => `@genericCity${index}`)
      .join(", ")})`,
    "l.state NOT IN ('GLOBAL', 'USER-ENTERED', 'US')",
  ];
  const params: Record<string, string> = {};
  genericLocationCities.forEach((genericCity, index) => {
    params[`genericCity${index}`] = genericCity;
  });

  if (state) {
    where.push("l.state = @state");
    params.state = state;
  }
  if (city) {
    where.push("lower(l.city) LIKE @cityLike ESCAPE '\\'");
    params.cityLike = `%${escapeSqlLike(city)}%`;
  }
  if (zip) {
    where.push(
      "(l.zip = @zip OR l.normalized_address LIKE @zipLike ESCAPE '\\')",
    );
    params.zip = zip;
    params.zipLike = `%${escapeSqlLike(zip)}%`;
  }

  const tokenGroups = addressTokenGroups(
    "l.normalized_address",
    streetTokens,
    "streetToken",
  );
  Object.assign(params, tokenGroups.params);
  let tokenScoreExpr = "0";
  if (tokenGroups.groups.length > 0) {
    // Require EVERY street token to match (via its suffix variants). Token-OR
    // matching returned garbage because common tokens (Way/St/410) matched
    // unrelated addresses; all-tokens-AND keeps results precise while still
    // tolerating abbreviations (St<->Street) and extra tokens (Apt/Unit) in the
    // stored address.
    where.push(
      `(${tokenGroups.groups.map((group) => `(${group.condition})`).join(" AND ")})`,
    );
    tokenScoreExpr = tokenGroups.groups
      .map((group) => `CASE WHEN (${group.condition}) THEN 1 ELSE 0 END`)
      .join(" + ");
  }

  params.normalizedAddress = normalizedAddress;
  params.prefixLike = `${escapeSqlLike(normalizedAddress)}%`;

  const rows = db
    .prepare(
      `
      SELECT p.*
      FROM profiles p
      JOIN profile_locations l ON l.profile_id = p.id
      WHERE ${where.join("\n        AND ")}
      GROUP BY p.id
      ORDER BY
        MIN(
          CASE
            WHEN l.normalized_address = @normalizedAddress THEN 0
            WHEN l.normalized_address LIKE @prefixLike ESCAPE '\\' THEN 1
            ELSE 2
          END
        ),
        MAX(${tokenScoreExpr}) DESC,
        CASE p.confidence WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
        p.full_name
      LIMIT 25
    `,
    )
    .all(params) as DbProfileRow[];

  return rows.map(toSearchResult);
}

function nameTokenWhereClause(
  column: string,
  tokens: string[],
  paramPrefix: string,
) {
  return tokens
    .map(
      (_, index) =>
        `(' ' || ${column} || ' ') LIKE @${paramPrefix}${index} ESCAPE '\\'`,
    )
    .join(" AND ");
}

function nameTokenParams(tokens: string[], paramPrefix: string) {
  return Object.fromEntries(
    tokens.map((token, index) => [
      `${paramPrefix}${index}`,
      nameTokenLikePattern(token),
    ]),
  );
}

function addressSearchTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 0);
}

function addressTokenGroups(
  column: string,
  tokens: string[],
  paramPrefix: string,
): {
  groups: Array<{ condition: string }>;
  params: Record<string, string>;
} {
  const groups = tokens.map((token, tokenIndex) => {
    const variants = addressTokenVariants(token);
    const condition = variants
      .map(
        (_variant, variantIndex) =>
          `(' ' || ${column} || ' ') LIKE @${paramPrefix}${tokenIndex}_${variantIndex} ESCAPE '\\'`,
      )
      .join(" OR ");
    return { condition };
  });

  const params = Object.fromEntries(
    tokens.flatMap((token, tokenIndex) =>
      addressTokenVariants(token).map((variant, variantIndex) => [
        `${paramPrefix}${tokenIndex}_${variantIndex}`,
        `% ${escapeSqlLike(variant)} %`,
      ]),
    ),
  );

  return { groups, params };
}

function addressTokenVariants(token: string) {
  const variants = streetSuffixVariants[token] ?? [token];
  return Array.from(new Set(variants));
}

export function getCachedSearchResults(
  payload: SearchPayload,
  nowMs = Date.now(),
): SearchResultCacheHit | null {
  purgeExpiredSearchResultCache(nowMs);

  const row = getDb()
    .prepare(
      `
      SELECT
        profile_ids_json AS profileIdsJson,
        refresh_notice AS refreshNotice,
        created_at_ms AS createdAtMs,
        expires_at_ms AS expiresAtMs
      FROM search_result_cache
      WHERE query_key = @queryKey
        AND expires_at_ms > @nowMs
    `,
    )
    .get({
      queryKey: createSearchCacheKey(payload),
      nowMs,
    }) as
    | {
        profileIdsJson: string;
        refreshNotice: string | null;
        createdAtMs: number;
        expiresAtMs: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    results: getSearchResultsByIds(parseCachedProfileIds(row.profileIdsJson)),
    refreshNotice: row.refreshNotice,
    createdAtMs: row.createdAtMs,
    expiresAtMs: row.expiresAtMs,
    remainingTtlMs: Math.max(0, row.expiresAtMs - nowMs),
  };
}

export function setCachedSearchResults(input: {
  payload: SearchPayload;
  results: SearchResult[];
  refreshNotice?: string | null;
  nowMs?: number;
  ttlMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? getSearchResultCacheTtlMs();

  getDb()
    .prepare(
      `
      INSERT INTO search_result_cache (
        query_key, query_kind, profile_ids_json, refresh_notice, created_at_ms, expires_at_ms
      )
      VALUES (@queryKey, @queryKind, @profileIdsJson, @refreshNotice, @createdAtMs, @expiresAtMs)
      ON CONFLICT(query_key) DO UPDATE SET
        query_kind = excluded.query_kind,
        profile_ids_json = excluded.profile_ids_json,
        refresh_notice = excluded.refresh_notice,
        created_at_ms = excluded.created_at_ms,
        expires_at_ms = excluded.expires_at_ms
    `,
    )
    .run({
      queryKey: createSearchCacheKey(input.payload),
      queryKind: input.payload.mode,
      profileIdsJson: JSON.stringify(input.results.map((result) => result.id)),
      refreshNotice: input.refreshNotice ?? null,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
    });
}

export function purgeExpiredSearchResultCache(nowMs = Date.now()) {
  getDb()
    .prepare("DELETE FROM search_result_cache WHERE expires_at_ms <= ?")
    .run(nowMs);
}

export function clearSearchResultCache() {
  getDb().prepare("DELETE FROM search_result_cache").run();
}

export function getFreshSourceSearchRefresh(input: {
  sourceId: string;
  queryKey: string;
  nowMs?: number;
  ttlMs: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const row = getDb()
    .prepare(
      `
      SELECT
        source_id AS sourceId,
        query_key AS queryKey,
        refreshed_at_ms AS refreshedAtMs,
        status,
        fetched,
        imported,
        error_message AS errorMessage
      FROM source_search_refreshes
      WHERE source_id = @sourceId
        AND query_key = @queryKey
        AND refreshed_at_ms > @freshAfterMs
    `,
    )
    .get({
      sourceId: input.sourceId,
      queryKey: input.queryKey,
      freshAfterMs: nowMs - input.ttlMs,
    }) as SourceSearchRefresh | undefined;

  return row ?? null;
}

export function setSourceSearchRefresh(input: {
  sourceId: string;
  queryKey: string;
  status: SourceSearchRefresh["status"];
  fetched?: number;
  imported?: number;
  errorMessage?: string | null;
  refreshedAtMs?: number;
}) {
  getDb()
    .prepare(
      `
      INSERT INTO source_search_refreshes (
        source_id, query_key, refreshed_at_ms, status, fetched, imported, error_message
      )
      VALUES (
        @sourceId, @queryKey, @refreshedAtMs, @status, @fetched, @imported, @errorMessage
      )
      ON CONFLICT(source_id, query_key) DO UPDATE SET
        refreshed_at_ms = excluded.refreshed_at_ms,
        status = excluded.status,
        fetched = excluded.fetched,
        imported = excluded.imported,
        error_message = excluded.error_message
    `,
    )
    .run({
      sourceId: input.sourceId,
      queryKey: input.queryKey,
      refreshedAtMs: input.refreshedAtMs ?? Date.now(),
      status: input.status,
      fetched: input.fetched ?? 0,
      imported: input.imported ?? 0,
      errorMessage: input.errorMessage ?? null,
    });
}

export function getProfile(id: string): Profile | null {
  const row = getDb()
    .prepare("SELECT * FROM profiles WHERE id = ? AND suppressed_at IS NULL")
    .get(id) as DbProfileRow | undefined;

  if (!row) {
    return null;
  }

  const addressHistory = getAddressHistory(row.id);

  return {
    ...toSearchResult(row),
    aliases: getAliases(row.id),
    phones: getContacts(row.id, "phone"),
    emails: getContacts(row.id, "email"),
    addresses: addressHistory.map((address) => address.address),
    addressHistory,
    sourceCategories: getSourceCategories(row.id),
  };
}

export function upsertApprovedSource(source: {
  id: string;
  name: string;
  category: string;
  jurisdiction: string;
  acquisitionMethod: string;
  licenseUrl?: string;
  notes?: string;
}) {
  getDb()
    .prepare(
      `
      INSERT INTO approved_sources (
        id, name, category, jurisdiction, acquisition_method, license_url, approved_at, notes
      )
      VALUES (@id, @name, @category, @jurisdiction, @acquisitionMethod, @licenseUrl, CURRENT_TIMESTAMP, @notes)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        jurisdiction = excluded.jurisdiction,
        acquisition_method = excluded.acquisition_method,
        license_url = excluded.license_url,
        notes = excluded.notes
    `,
    )
    .run({
      ...source,
      licenseUrl: source.licenseUrl ?? null,
      notes: source.notes ?? null,
    });
}

export function upsertProfile(input: UpsertProfileInput) {
  const db = getDb();
  const tx = db.transaction(() => {
    const normalizedName = normalizeName(input.fullName);
    const normalizedBirthDate = normalizeBirthDate(input.birthDate);
    const targetProfileId =
      findProfileIdForUpsert(db, input, normalizedName, normalizedBirthDate) ??
      input.id;
    const existingProfile = db
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .get(targetProfileId) as DbProfileRow | undefined;
    const fullName = existingProfile?.full_name ?? input.fullName;
    const ageRange = chooseProfileText(
      existingProfile?.age_range,
      input.ageRange,
      "Unknown",
    );
    const confidence = chooseHighestConfidence(
      existingProfile?.confidence,
      input.confidence,
    );
    const birthDate = existingProfile?.birth_date ?? normalizedBirthDate;

    db.prepare(
      `
      INSERT INTO profiles (
        id,
        full_name,
        normalized_name,
        birth_date,
        normalized_birth_date,
        age_range,
        confidence,
        updated_at
      )
      VALUES (
        @id,
        @fullName,
        @normalizedName,
        @birthDate,
        @normalizedBirthDate,
        @ageRange,
        @confidence,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        full_name = excluded.full_name,
        normalized_name = excluded.normalized_name,
        birth_date = COALESCE(profiles.birth_date, excluded.birth_date),
        normalized_birth_date = COALESCE(profiles.normalized_birth_date, excluded.normalized_birth_date),
        age_range = excluded.age_range,
        confidence = excluded.confidence,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run({
      id: targetProfileId,
      fullName,
      normalizedName: normalizeName(fullName),
      birthDate,
      normalizedBirthDate: birthDate,
      ageRange,
      confidence,
    });

    const aliases = [...(input.aliases ?? [])];
    if (
      targetProfileId !== input.id &&
      normalizeName(input.fullName) !== normalizeName(fullName)
    ) {
      aliases.unshift(input.fullName);
    }
    for (const alias of aliases) {
      insertAliasIfMissing(db, targetProfileId, alias);
    }

    for (const [index, location] of (input.locations ?? []).entries()) {
      insertLocationIfMissing(db, targetProfileId, location, index);
    }

    for (const contact of input.contacts ?? []) {
      insertContactIfMissing(db, targetProfileId, contact);
    }

    for (const relationship of input.relationships ?? []) {
      insertRelationshipIfMissing(db, targetProfileId, relationship);
    }

    if (input.sourceRecord) {
      db.prepare(
        `
        INSERT INTO source_records (source_id, source_record_id, profile_id, raw_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source_id, source_record_id) DO UPDATE SET
          profile_id = excluded.profile_id,
          raw_json = excluded.raw_json,
          imported_at = CURRENT_TIMESTAMP
      `,
      ).run(
        input.sourceRecord.sourceId,
        input.sourceRecord.sourceRecordId,
        targetProfileId,
        JSON.stringify(input.sourceRecord.raw),
      );
    }
  });

  tx();
}

function findProfileIdForUpsert(
  db: Database.Database,
  input: UpsertProfileInput,
  normalizedName: string,
  normalizedBirthDate: string | null,
) {
  if (input.sourceRecord) {
    const row = db
      .prepare(
        `
        SELECT profile_id AS profileId
        FROM source_records
        WHERE source_id = ? AND source_record_id = ? AND profile_id IS NOT NULL
        LIMIT 1
      `,
      )
      .get(
        input.sourceRecord.sourceId,
        input.sourceRecord.sourceRecordId,
      ) as { profileId: string } | undefined;
    if (row?.profileId) {
      return row.profileId;
    }
  }

  const existingId = db
    .prepare("SELECT id FROM profiles WHERE id = ? LIMIT 1")
    .get(input.id) as { id: string } | undefined;
  if (existingId?.id) {
    return existingId.id;
  }

  for (const contact of input.contacts ?? []) {
    const normalized = normalizeContactValue(contact);
    if (!normalized) {
      continue;
    }
    const row = db
      .prepare(
        `
        SELECT profile_id AS profileId
        FROM profile_contacts
        WHERE type = ? AND normalized_value = ?
        ORDER BY id
        LIMIT 1
      `,
      )
      .get(contact.type, normalized) as { profileId: string } | undefined;
    if (row?.profileId) {
      return row.profileId;
    }
  }

  if (normalizedBirthDate) {
    const row = db
      .prepare(
        `
        SELECT p.id
        FROM profiles p
        WHERE p.normalized_birth_date = @birthDate
          AND (
            p.normalized_name = @name
            OR EXISTS (
              SELECT 1
              FROM profile_aliases a
              WHERE a.profile_id = p.id AND a.normalized_alias = @name
            )
          )
        ORDER BY p.created_at, p.id
        LIMIT 1
      `,
      )
      .get({
        birthDate: normalizedBirthDate,
        name: normalizedName,
      }) as { id: string } | undefined;
    if (row?.id) {
      return row.id;
    }
  }

  // Location-aware and generic source merge for profiles with no age/birth date and no contact info
  // Merge if:
  // 1. Locations overlap (same city + state), OR
  // 2. At least one profile has a generic/source-specific location (e.g., "Federal Register, US")
  if (!normalizedBirthDate && !input.contacts?.length && input.locations?.length) {
    const incomingLocations = new Set(
      input.locations.map((loc) => ({
        city: normalizeText(loc.city),
        state: loc.state.trim().toUpperCase(),
        fullKey: `${normalizeText(loc.city)},${loc.state.trim().toUpperCase()}`
      }))
    );

    // Check for overlapping locations
    for (const location of incomingLocations) {
      const row = db
        .prepare(
          `
          SELECT DISTINCT p.id, p.birth_date, p.normalized_birth_date,
                 COUNT(DISTINCT c.id) as contact_count
          FROM profiles p
          LEFT JOIN profile_locations l ON l.profile_id = p.id
          LEFT JOIN profile_contacts c ON c.profile_id = p.id
          WHERE p.suppressed_at IS NULL
            AND p.normalized_name = @name
            AND lower(l.city) = lower(@city)
            AND l.state = @state
            AND p.birth_date IS NULL
            AND p.normalized_birth_date IS NULL
          GROUP BY p.id
          HAVING contact_count = 0
          ORDER BY p.created_at, p.id
          LIMIT 1
        `,
        )
        .get({
          name: normalizedName,
          city: location.city,
          state: location.state,
        }) as { id: string } | undefined;
      if (row?.id) {
        return row.id;
      }
    }

    // Check for generic/source locations - merge if either profile has one
    // Generic locations are: non-geographic locations like "Federal Register", "Library of Congress", etc.
    const hasGenericLocation = Array.from(incomingLocations).some(
      loc => isGenericLocation(loc.city, loc.state)
    );

    if (hasGenericLocation) {
      // Find any profile with same name, no birth date, no contacts, and any generic location
      const row = db
        .prepare(
          `
          SELECT DISTINCT p.id
          FROM profiles p
          LEFT JOIN profile_locations l ON l.profile_id = p.id
          LEFT JOIN profile_contacts c ON c.profile_id = p.id
          WHERE p.suppressed_at IS NULL
            AND p.normalized_name = @name
            AND p.birth_date IS NULL
            AND p.normalized_birth_date IS NULL
          GROUP BY p.id
          HAVING COUNT(DISTINCT c.id) = 0
            AND SUM(CASE
              WHEN lower(l.city) IN ('federal register', 'library of congress', 'openalex', 'wikidata', 'crossref', 'pubmed', 'clinicaltrials gov', 'internet archive', 'open library', 'github', 'stack exchange', 'orcid', 'semantic scholar', 'google books', 'europe pmc', 'socrata', 'arcgis', 'ckan', 'opendatasoft', 'musicbrainz', 'viaf', 'datacite', 'arxiv')
                 OR l.state IN ('USER-ENTERED', 'US')
              THEN 1 ELSE 0
            END) > 0
          ORDER BY p.created_at, p.id
          LIMIT 1
        `,
        )
        .get({
          name: normalizedName,
        }) as { id: string } | undefined;
      if (row?.id) {
        return row.id;
      }
    }
  }

  return null;
}

function insertAliasIfMissing(
  db: Database.Database,
  profileId: string,
  alias: string,
) {
  const normalizedAlias = normalizeName(alias);
  if (!normalizedAlias) {
    return;
  }

  const existing = db
    .prepare(
      `
      SELECT 1
      FROM profile_aliases
      WHERE profile_id = ? AND normalized_alias = ?
      LIMIT 1
    `,
    )
    .get(profileId, normalizedAlias);
  if (existing) {
    return;
  }

  db.prepare(
    "INSERT INTO profile_aliases (profile_id, alias, normalized_alias) VALUES (?, ?, ?)",
  ).run(profileId, alias, normalizedAlias);
}

function insertLocationIfMissing(
  db: Database.Database,
  profileId: string,
  location: NonNullable<UpsertProfileInput["locations"]>[number],
  displayOrder: number,
) {
  const state = location.state.trim().toUpperCase();
  const normalizedAddress = normalizeAddress(location);
  const kind = location.kind ?? "possible";
  const sourceId = location.sourceId ?? null;
  const existing = db
    .prepare(
      `
      SELECT 1
      FROM profile_locations
      WHERE profile_id = ?
        AND normalized_address = ?
        AND kind = ?
        AND COALESCE(source_id, '') = COALESCE(?, '')
      LIMIT 1
    `,
    )
    .get(profileId, normalizedAddress, kind, sourceId);
  if (existing) {
    return;
  }

  db.prepare(
    `
    INSERT INTO profile_locations (
      profile_id, street, city, state, zip, normalized_address, kind, source_id, display_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    profileId,
    location.street ?? null,
    location.city,
    state,
    location.zip ?? null,
    normalizedAddress,
    kind,
    sourceId,
    displayOrder,
  );
}

function insertContactIfMissing(
  db: Database.Database,
  profileId: string,
  contact: NonNullable<UpsertProfileInput["contacts"]>[number],
) {
  const normalized = normalizeContactValue(contact);
  if (!normalized) {
    return;
  }

  const existing = db
    .prepare(
      `
      SELECT 1
      FROM profile_contacts
      WHERE profile_id = ? AND type = ? AND normalized_value = ?
      LIMIT 1
    `,
    )
    .get(profileId, contact.type, normalized);
  if (existing) {
    return;
  }

  db.prepare(
    `
    INSERT INTO profile_contacts (
      profile_id, type, value, display_value, normalized_value, confidence, source_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    profileId,
    contact.type,
    contact.value,
    contact.type === "email" ? maskEmail(contact.value) : contact.value,
    normalized,
    contact.confidence ?? "Medium",
    contact.sourceId ?? null,
  );
}

function insertRelationshipIfMissing(
  db: Database.Database,
  profileId: string,
  relationship: NonNullable<UpsertProfileInput["relationships"]>[number],
) {
  const relationshipType = relationship.type ?? "possible associate";
  const sourceId = relationship.sourceId ?? null;
  const existing = db
    .prepare(
      `
      SELECT 1
      FROM relationships
      WHERE profile_id = ?
        AND lower(related_name) = lower(?)
        AND relationship_type = ?
        AND COALESCE(source_id, '') = COALESCE(?, '')
      LIMIT 1
    `,
    )
    .get(profileId, relationship.name, relationshipType, sourceId);
  if (existing) {
    return;
  }

  db.prepare(
    `
    INSERT INTO relationships (
      profile_id, related_name, relationship_type, confidence, source_id
    )
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    profileId,
    relationship.name,
    relationshipType,
    relationship.confidence ?? "Medium",
    sourceId,
  );
}

function normalizeContactValue(
  contact: NonNullable<UpsertProfileInput["contacts"]>[number],
) {
  return contact.type === "phone"
    ? normalizePhone(contact.value)
    : normalizeEmail(contact.value);
}

function isGenericLocation(city: string, state: string): boolean {
  return (
    genericLocationCities.includes(city) ||
    genericLocationStates.includes(state)
  );
}

function normalizeBirthDate(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    return formatBirthDateParts(iso[1], iso[2], iso[3]);
  }

  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return formatBirthDateParts(compact[1], compact[2], compact[3]);
  }

  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    return formatBirthDateParts(us[3], us[1], us[2]);
  }

  return null;
}

function formatBirthDateParts(year: string, month: string, day: string) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  if (
    date.getUTCFullYear() !== numericYear ||
    date.getUTCMonth() !== numericMonth - 1 ||
    date.getUTCDate() !== numericDay
  ) {
    return null;
  }

  return [
    String(numericYear).padStart(4, "0"),
    String(numericMonth).padStart(2, "0"),
    String(numericDay).padStart(2, "0"),
  ].join("-");
}

function chooseProfileText(
  existingValue: string | undefined,
  incomingValue: string | undefined,
  fallback: string,
) {
  if (existingValue && existingValue !== fallback) {
    return existingValue;
  }
  return incomingValue || existingValue || fallback;
}

function chooseHighestConfidence(
  existingValue: string | undefined,
  incomingValue: string | undefined,
) {
  const existing = existingValue ?? "Medium";
  const incoming = incomingValue ?? "Medium";
  const rank: Record<string, number> = {
    High: 3,
    Medium: 2,
    Low: 1,
  };
  return (rank[incoming] ?? 2) > (rank[existing] ?? 2) ? incoming : existing;
}

export function upsertAggregateMobilityMetric(
  input: AggregateMobilityMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_mobility_metrics (
        source_id,
        source_record_id,
        year,
        geography_level,
        geo_id,
        name,
        hub,
        state,
        county,
        total_population_one_year_over,
        same_house,
        different_house,
        different_house_us,
        moved_within_same_county,
        moved_different_county,
        moved_different_county_same_state,
        moved_different_state,
        moved_from_abroad,
        same_house_pct,
        different_house_pct,
        moved_within_same_county_pct,
        moved_different_county_same_state_pct,
        moved_different_state_pct,
        moved_from_abroad_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @year,
        @geographyLevel,
        @geoId,
        @name,
        @hub,
        @state,
        @county,
        @totalPopulationOneYearOver,
        @sameHouse,
        @differentHouse,
        @differentHouseUs,
        @movedWithinSameCounty,
        @movedDifferentCounty,
        @movedDifferentCountySameState,
        @movedDifferentState,
        @movedFromAbroad,
        @sameHousePct,
        @differentHousePct,
        @movedWithinSameCountyPct,
        @movedDifferentCountySameStatePct,
        @movedDifferentStatePct,
        @movedFromAbroadPct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        year = excluded.year,
        geography_level = excluded.geography_level,
        geo_id = excluded.geo_id,
        name = excluded.name,
        hub = excluded.hub,
        state = excluded.state,
        county = excluded.county,
        total_population_one_year_over = excluded.total_population_one_year_over,
        same_house = excluded.same_house,
        different_house = excluded.different_house,
        different_house_us = excluded.different_house_us,
        moved_within_same_county = excluded.moved_within_same_county,
        moved_different_county = excluded.moved_different_county,
        moved_different_county_same_state = excluded.moved_different_county_same_state,
        moved_different_state = excluded.moved_different_state,
        moved_from_abroad = excluded.moved_from_abroad,
        same_house_pct = excluded.same_house_pct,
        different_house_pct = excluded.different_house_pct,
        moved_within_same_county_pct = excluded.moved_within_same_county_pct,
        moved_different_county_same_state_pct = excluded.moved_different_county_same_state_pct,
        moved_different_state_pct = excluded.moved_different_state_pct,
        moved_from_abroad_pct = excluded.moved_from_abroad_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateMigrationFlow(input: AggregateMigrationFlowInput) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_migration_flows (
        source_id,
        source_record_id,
        year_start,
        year_end,
        hub,
        flow_direction,
        flow_kind,
        origin_state_fips,
        origin_county_fips,
        origin_name,
        destination_state_fips,
        destination_county_fips,
        destination_name,
        returns_count,
        individuals_count,
        adjusted_gross_income,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @yearStart,
        @yearEnd,
        @hub,
        @flowDirection,
        @flowKind,
        @originStateFips,
        @originCountyFips,
        @originName,
        @destinationStateFips,
        @destinationCountyFips,
        @destinationName,
        @returnsCount,
        @individualsCount,
        @adjustedGrossIncome,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        year_start = excluded.year_start,
        year_end = excluded.year_end,
        hub = excluded.hub,
        flow_direction = excluded.flow_direction,
        flow_kind = excluded.flow_kind,
        origin_state_fips = excluded.origin_state_fips,
        origin_county_fips = excluded.origin_county_fips,
        origin_name = excluded.origin_name,
        destination_state_fips = excluded.destination_state_fips,
        destination_county_fips = excluded.destination_county_fips,
        destination_name = excluded.destination_name,
        returns_count = excluded.returns_count,
        individuals_count = excluded.individuals_count,
        adjusted_gross_income = excluded.adjusted_gross_income,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHousingPermitMetric(
  input: AggregateHousingPermitMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_housing_permit_metrics (
        source_id,
        source_record_id,
        hub,
        city,
        state,
        period_month,
        category,
        permit_count,
        housing_units_added,
        housing_units_removed,
        net_housing_units,
        estimated_cost,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @city,
        @state,
        @periodMonth,
        @category,
        @permitCount,
        @housingUnitsAdded,
        @housingUnitsRemoved,
        @netHousingUnits,
        @estimatedCost,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        city = excluded.city,
        state = excluded.state,
        period_month = excluded.period_month,
        category = excluded.category,
        permit_count = excluded.permit_count,
        housing_units_added = excluded.housing_units_added,
        housing_units_removed = excluded.housing_units_removed,
        net_housing_units = excluded.net_housing_units,
        estimated_cost = excluded.estimated_cost,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregatePopulationChangeMetric(
  input: AggregatePopulationChangeMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_population_change_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        state_name,
        population_estimate,
        net_population_change,
        births,
        deaths,
        natural_change,
        international_migration,
        domestic_migration,
        net_migration,
        residual,
        domestic_migration_rate,
        international_migration_rate,
        net_migration_rate,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @stateName,
        @populationEstimate,
        @netPopulationChange,
        @births,
        @deaths,
        @naturalChange,
        @internationalMigration,
        @domesticMigration,
        @netMigration,
        @residual,
        @domesticMigrationRate,
        @internationalMigrationRate,
        @netMigrationRate,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        state_name = excluded.state_name,
        population_estimate = excluded.population_estimate,
        net_population_change = excluded.net_population_change,
        births = excluded.births,
        deaths = excluded.deaths,
        natural_change = excluded.natural_change,
        international_migration = excluded.international_migration,
        domestic_migration = excluded.domestic_migration,
        net_migration = excluded.net_migration,
        residual = excluded.residual,
        domestic_migration_rate = excluded.domestic_migration_rate,
        international_migration_rate = excluded.international_migration_rate,
        net_migration_rate = excluded.net_migration_rate,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHousingStockMetric(
  input: AggregateHousingStockMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_housing_stock_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_housing_units,
        occupied_housing_units,
        vacant_housing_units,
        occupied_housing_pct,
        vacant_housing_pct,
        homeowner_vacancy_rate,
        rental_vacancy_rate,
        owner_occupied_units,
        renter_occupied_units,
        owner_occupied_pct,
        renter_occupied_pct,
        median_home_value,
        median_gross_rent,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalHousingUnits,
        @occupiedHousingUnits,
        @vacantHousingUnits,
        @occupiedHousingPct,
        @vacantHousingPct,
        @homeownerVacancyRate,
        @rentalVacancyRate,
        @ownerOccupiedUnits,
        @renterOccupiedUnits,
        @ownerOccupiedPct,
        @renterOccupiedPct,
        @medianHomeValue,
        @medianGrossRent,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_housing_units = excluded.total_housing_units,
        occupied_housing_units = excluded.occupied_housing_units,
        vacant_housing_units = excluded.vacant_housing_units,
        occupied_housing_pct = excluded.occupied_housing_pct,
        vacant_housing_pct = excluded.vacant_housing_pct,
        homeowner_vacancy_rate = excluded.homeowner_vacancy_rate,
        rental_vacancy_rate = excluded.rental_vacancy_rate,
        owner_occupied_units = excluded.owner_occupied_units,
        renter_occupied_units = excluded.renter_occupied_units,
        owner_occupied_pct = excluded.owner_occupied_pct,
        renter_occupied_pct = excluded.renter_occupied_pct,
        median_home_value = excluded.median_home_value,
        median_gross_rent = excluded.median_gross_rent,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateResidentialConstructionPermitMetric(
  input: AggregateResidentialConstructionPermitMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_residential_construction_permit_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        state_name,
        all_permits,
        single_family_permits,
        multifamily_permits,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @stateName,
        @allPermits,
        @singleFamilyPermits,
        @multifamilyPermits,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        state_name = excluded.state_name,
        all_permits = excluded.all_permits,
        single_family_permits = excluded.single_family_permits,
        multifamily_permits = excluded.multifamily_permits,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHousingAssistanceMetric(
  input: AggregateHousingAssistanceMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_housing_assistance_metrics (
        source_id,
        source_record_id,
        hub,
        coverage_period,
        state_fips,
        county_fips,
        tract_fips,
        geoid,
        geography_name,
        housing_choice_vouchers,
        housing_choice_voucher_pct,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @coveragePeriod,
        @stateFips,
        @countyFips,
        @tractFips,
        @geoid,
        @geographyName,
        @housingChoiceVouchers,
        @housingChoiceVoucherPct,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        coverage_period = excluded.coverage_period,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        tract_fips = excluded.tract_fips,
        geoid = excluded.geoid,
        geography_name = excluded.geography_name,
        housing_choice_vouchers = excluded.housing_choice_vouchers,
        housing_choice_voucher_pct = excluded.housing_choice_voucher_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregatePublicHousingInventoryMetric(
  input: AggregatePublicHousingInventoryMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_public_housing_inventory_metrics (
        source_id,
        source_record_id,
        hub,
        coverage_period,
        state_fips,
        county_fips,
        county_name,
        building_count,
        total_dwelling_units,
        total_units,
        occupied_units,
        vacant_units,
        number_reported,
        people_total,
        average_pct_occupied,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @coveragePeriod,
        @stateFips,
        @countyFips,
        @countyName,
        @buildingCount,
        @totalDwellingUnits,
        @totalUnits,
        @occupiedUnits,
        @vacantUnits,
        @numberReported,
        @peopleTotal,
        @averagePctOccupied,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        coverage_period = excluded.coverage_period,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        building_count = excluded.building_count,
        total_dwelling_units = excluded.total_dwelling_units,
        total_units = excluded.total_units,
        occupied_units = excluded.occupied_units,
        vacant_units = excluded.vacant_units,
        number_reported = excluded.number_reported,
        people_total = excluded.people_total,
        average_pct_occupied = excluded.average_pct_occupied,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateLihtcPropertyInventoryMetric(
  input: AggregateLihtcPropertyInventoryMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_lihtc_property_inventory_metrics (
        source_id,
        source_record_id,
        hub,
        coverage_period,
        state_fips,
        county_fips,
        county_name,
        project_count,
        total_units,
        low_income_units,
        zero_bedroom_units,
        one_bedroom_units,
        two_bedroom_units,
        three_bedroom_units,
        four_plus_bedroom_units,
        allocation_amount,
        earliest_placed_in_service_year,
        latest_placed_in_service_year,
        earliest_allocation_year,
        latest_allocation_year,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @coveragePeriod,
        @stateFips,
        @countyFips,
        @countyName,
        @projectCount,
        @totalUnits,
        @lowIncomeUnits,
        @zeroBedroomUnits,
        @oneBedroomUnits,
        @twoBedroomUnits,
        @threeBedroomUnits,
        @fourPlusBedroomUnits,
        @allocationAmount,
        @earliestPlacedInServiceYear,
        @latestPlacedInServiceYear,
        @earliestAllocationYear,
        @latestAllocationYear,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        coverage_period = excluded.coverage_period,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        project_count = excluded.project_count,
        total_units = excluded.total_units,
        low_income_units = excluded.low_income_units,
        zero_bedroom_units = excluded.zero_bedroom_units,
        one_bedroom_units = excluded.one_bedroom_units,
        two_bedroom_units = excluded.two_bedroom_units,
        three_bedroom_units = excluded.three_bedroom_units,
        four_plus_bedroom_units = excluded.four_plus_bedroom_units,
        allocation_amount = excluded.allocation_amount,
        earliest_placed_in_service_year = excluded.earliest_placed_in_service_year,
        latest_placed_in_service_year = excluded.latest_placed_in_service_year,
        earliest_allocation_year = excluded.earliest_allocation_year,
        latest_allocation_year = excluded.latest_allocation_year,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateLihtcQualifiedCensusTractMetric(
  input: AggregateLihtcQualifiedCensusTractMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_lihtc_qualified_census_tract_metrics (
        source_id,
        source_record_id,
        hub,
        fiscal_year,
        state_fips,
        county_fips,
        county_name,
        qualified_tract_count,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @fiscalYear,
        @stateFips,
        @countyFips,
        @countyName,
        @qualifiedTractCount,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        fiscal_year = excluded.fiscal_year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        qualified_tract_count = excluded.qualified_tract_count,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateLihtcDifficultDevelopmentAreaMetric(
  input: AggregateLihtcDifficultDevelopmentAreaMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_lihtc_difficult_development_area_metrics (
        source_id,
        source_record_id,
        hub,
        fiscal_year,
        area_name,
        dda_code,
        dda_type,
        zcta_count,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @fiscalYear,
        @areaName,
        @ddaCode,
        @ddaType,
        @zctaCount,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        fiscal_year = excluded.fiscal_year,
        area_name = excluded.area_name,
        dda_code = excluded.dda_code,
        dda_type = excluded.dda_type,
        zcta_count = excluded.zcta_count,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateSmallAreaFairMarketRentMetric(
  input: AggregateSmallAreaFairMarketRentMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_small_area_fair_market_rent_metrics (
        source_id,
        source_record_id,
        hub,
        fiscal_year,
        hud_code,
        fmr_name,
        zcta,
        safmr_0br,
        safmr_0br_payment_standard_90,
        safmr_0br_payment_standard_110,
        safmr_1br,
        safmr_1br_payment_standard_90,
        safmr_1br_payment_standard_110,
        safmr_2br,
        safmr_2br_payment_standard_90,
        safmr_2br_payment_standard_110,
        safmr_3br,
        safmr_3br_payment_standard_90,
        safmr_3br_payment_standard_110,
        safmr_4br,
        safmr_4br_payment_standard_90,
        safmr_4br_payment_standard_110,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @fiscalYear,
        @hudCode,
        @fmrName,
        @zcta,
        @safmr0br,
        @safmr0brPaymentStandard90,
        @safmr0brPaymentStandard110,
        @safmr1br,
        @safmr1brPaymentStandard90,
        @safmr1brPaymentStandard110,
        @safmr2br,
        @safmr2brPaymentStandard90,
        @safmr2brPaymentStandard110,
        @safmr3br,
        @safmr3brPaymentStandard90,
        @safmr3brPaymentStandard110,
        @safmr4br,
        @safmr4brPaymentStandard90,
        @safmr4brPaymentStandard110,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        fiscal_year = excluded.fiscal_year,
        hud_code = excluded.hud_code,
        fmr_name = excluded.fmr_name,
        zcta = excluded.zcta,
        safmr_0br = excluded.safmr_0br,
        safmr_0br_payment_standard_90 = excluded.safmr_0br_payment_standard_90,
        safmr_0br_payment_standard_110 = excluded.safmr_0br_payment_standard_110,
        safmr_1br = excluded.safmr_1br,
        safmr_1br_payment_standard_90 = excluded.safmr_1br_payment_standard_90,
        safmr_1br_payment_standard_110 = excluded.safmr_1br_payment_standard_110,
        safmr_2br = excluded.safmr_2br,
        safmr_2br_payment_standard_90 = excluded.safmr_2br_payment_standard_90,
        safmr_2br_payment_standard_110 = excluded.safmr_2br_payment_standard_110,
        safmr_3br = excluded.safmr_3br,
        safmr_3br_payment_standard_90 = excluded.safmr_3br_payment_standard_90,
        safmr_3br_payment_standard_110 = excluded.safmr_3br_payment_standard_110,
        safmr_4br = excluded.safmr_4br,
        safmr_4br_payment_standard_90 = excluded.safmr_4br_payment_standard_90,
        safmr_4br_payment_standard_110 = excluded.safmr_4br_payment_standard_110,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateFairMarketRentMetric(
  input: AggregateFairMarketRentMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_fair_market_rent_metrics (
        source_id,
        source_record_id,
        hub,
        fiscal_year,
        fmr_code,
        fmr_name,
        fmr_0br,
        fmr_1br,
        fmr_2br,
        fmr_3br,
        fmr_4br,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @fiscalYear,
        @fmrCode,
        @fmrName,
        @fmr0br,
        @fmr1br,
        @fmr2br,
        @fmr3br,
        @fmr4br,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        fiscal_year = excluded.fiscal_year,
        fmr_code = excluded.fmr_code,
        fmr_name = excluded.fmr_name,
        fmr_0br = excluded.fmr_0br,
        fmr_1br = excluded.fmr_1br,
        fmr_2br = excluded.fmr_2br,
        fmr_3br = excluded.fmr_3br,
        fmr_4br = excluded.fmr_4br,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateLowModerateIncomeMetric(
  input: AggregateLowModerateIncomeMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_low_moderate_income_metrics (
        source_id,
        source_record_id,
        hub,
        coverage_period,
        state_fips,
        county_fips,
        county_name,
        block_group_count,
        low_persons,
        low_mod_persons,
        low_moderate_middle_income_persons,
        low_mod_universe,
        low_mod_pct,
        block_groups_51_pct_plus,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @coveragePeriod,
        @stateFips,
        @countyFips,
        @countyName,
        @blockGroupCount,
        @lowPersons,
        @lowModPersons,
        @lowModerateMiddleIncomePersons,
        @lowModUniverse,
        @lowModPct,
        @blockGroups51PctPlus,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        coverage_period = excluded.coverage_period,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        block_group_count = excluded.block_group_count,
        low_persons = excluded.low_persons,
        low_mod_persons = excluded.low_mod_persons,
        low_moderate_middle_income_persons = excluded.low_moderate_middle_income_persons,
        low_mod_universe = excluded.low_mod_universe,
        low_mod_pct = excluded.low_mod_pct,
        block_groups_51_pct_plus = excluded.block_groups_51_pct_plus,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateCommuteFlowMetric(
  input: AggregateCommuteFlowMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_commute_flow_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        job_type,
        flow_kind,
        home_state_fips,
        home_county_fips,
        home_county_name,
        work_state_fips,
        work_county_fips,
        work_county_name,
        total_jobs,
        jobs_age_29_or_younger,
        jobs_age_30_to_54,
        jobs_age_55_or_older,
        jobs_earnings_1250_or_less,
        jobs_earnings_1251_to_3333,
        jobs_earnings_3333_plus,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @jobType,
        @flowKind,
        @homeStateFips,
        @homeCountyFips,
        @homeCountyName,
        @workStateFips,
        @workCountyFips,
        @workCountyName,
        @totalJobs,
        @jobsAge29OrYounger,
        @jobsAge30To54,
        @jobsAge55OrOlder,
        @jobsEarnings1250OrLess,
        @jobsEarnings1251To3333,
        @jobsEarnings3333Plus,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        job_type = excluded.job_type,
        flow_kind = excluded.flow_kind,
        home_state_fips = excluded.home_state_fips,
        home_county_fips = excluded.home_county_fips,
        home_county_name = excluded.home_county_name,
        work_state_fips = excluded.work_state_fips,
        work_county_fips = excluded.work_county_fips,
        work_county_name = excluded.work_county_name,
        total_jobs = excluded.total_jobs,
        jobs_age_29_or_younger = excluded.jobs_age_29_or_younger,
        jobs_age_30_to_54 = excluded.jobs_age_30_to_54,
        jobs_age_55_or_older = excluded.jobs_age_55_or_older,
        jobs_earnings_1250_or_less = excluded.jobs_earnings_1250_or_less,
        jobs_earnings_1251_to_3333 = excluded.jobs_earnings_1251_to_3333,
        jobs_earnings_3333_plus = excluded.jobs_earnings_3333_plus,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateCommutingCharacteristicMetric(
  input: AggregateCommutingCharacteristicMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_commuting_characteristic_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_workers_16_over,
        drove_alone,
        drove_alone_pct,
        carpooled,
        carpooled_pct,
        public_transportation,
        public_transportation_pct,
        walked,
        walked_pct,
        other_means,
        other_means_pct,
        worked_from_home,
        worked_from_home_pct,
        mean_travel_time_minutes,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalWorkers16Over,
        @droveAlone,
        @droveAlonePct,
        @carpooled,
        @carpooledPct,
        @publicTransportation,
        @publicTransportationPct,
        @walked,
        @walkedPct,
        @otherMeans,
        @otherMeansPct,
        @workedFromHome,
        @workedFromHomePct,
        @meanTravelTimeMinutes,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_workers_16_over = excluded.total_workers_16_over,
        drove_alone = excluded.drove_alone,
        drove_alone_pct = excluded.drove_alone_pct,
        carpooled = excluded.carpooled,
        carpooled_pct = excluded.carpooled_pct,
        public_transportation = excluded.public_transportation,
        public_transportation_pct = excluded.public_transportation_pct,
        walked = excluded.walked,
        walked_pct = excluded.walked_pct,
        other_means = excluded.other_means,
        other_means_pct = excluded.other_means_pct,
        worked_from_home = excluded.worked_from_home,
        worked_from_home_pct = excluded.worked_from_home_pct,
        mean_travel_time_minutes = excluded.mean_travel_time_minutes,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHouseholdIncomeMetric(
  input: AggregateHouseholdIncomeMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_household_income_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_households,
        income_under_10k,
        income_under_10k_pct,
        income_10k_to_14999,
        income_10k_to_14999_pct,
        income_15k_to_24999,
        income_15k_to_24999_pct,
        income_25k_to_34999,
        income_25k_to_34999_pct,
        income_35k_to_49999,
        income_35k_to_49999_pct,
        income_50k_to_74999,
        income_50k_to_74999_pct,
        income_75k_to_99999,
        income_75k_to_99999_pct,
        income_100k_to_149999,
        income_100k_to_149999_pct,
        income_150k_to_199999,
        income_150k_to_199999_pct,
        income_200k_plus,
        income_200k_plus_pct,
        median_household_income,
        mean_household_income,
        income_under_50k,
        income_under_50k_pct,
        income_100k_plus,
        income_100k_plus_pct,
        income_150k_plus,
        income_150k_plus_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalHouseholds,
        @incomeUnder10k,
        @incomeUnder10kPct,
        @income10kTo14999,
        @income10kTo14999Pct,
        @income15kTo24999,
        @income15kTo24999Pct,
        @income25kTo34999,
        @income25kTo34999Pct,
        @income35kTo49999,
        @income35kTo49999Pct,
        @income50kTo74999,
        @income50kTo74999Pct,
        @income75kTo99999,
        @income75kTo99999Pct,
        @income100kTo149999,
        @income100kTo149999Pct,
        @income150kTo199999,
        @income150kTo199999Pct,
        @income200kPlus,
        @income200kPlusPct,
        @medianHouseholdIncome,
        @meanHouseholdIncome,
        @incomeUnder50k,
        @incomeUnder50kPct,
        @income100kPlus,
        @income100kPlusPct,
        @income150kPlus,
        @income150kPlusPct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_households = excluded.total_households,
        income_under_10k = excluded.income_under_10k,
        income_under_10k_pct = excluded.income_under_10k_pct,
        income_10k_to_14999 = excluded.income_10k_to_14999,
        income_10k_to_14999_pct = excluded.income_10k_to_14999_pct,
        income_15k_to_24999 = excluded.income_15k_to_24999,
        income_15k_to_24999_pct = excluded.income_15k_to_24999_pct,
        income_25k_to_34999 = excluded.income_25k_to_34999,
        income_25k_to_34999_pct = excluded.income_25k_to_34999_pct,
        income_35k_to_49999 = excluded.income_35k_to_49999,
        income_35k_to_49999_pct = excluded.income_35k_to_49999_pct,
        income_50k_to_74999 = excluded.income_50k_to_74999,
        income_50k_to_74999_pct = excluded.income_50k_to_74999_pct,
        income_75k_to_99999 = excluded.income_75k_to_99999,
        income_75k_to_99999_pct = excluded.income_75k_to_99999_pct,
        income_100k_to_149999 = excluded.income_100k_to_149999,
        income_100k_to_149999_pct = excluded.income_100k_to_149999_pct,
        income_150k_to_199999 = excluded.income_150k_to_199999,
        income_150k_to_199999_pct = excluded.income_150k_to_199999_pct,
        income_200k_plus = excluded.income_200k_plus,
        income_200k_plus_pct = excluded.income_200k_plus_pct,
        median_household_income = excluded.median_household_income,
        mean_household_income = excluded.mean_household_income,
        income_under_50k = excluded.income_under_50k,
        income_under_50k_pct = excluded.income_under_50k_pct,
        income_100k_plus = excluded.income_100k_plus,
        income_100k_plus_pct = excluded.income_100k_plus_pct,
        income_150k_plus = excluded.income_150k_plus,
        income_150k_plus_pct = excluded.income_150k_plus_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregatePovertyAssistanceMetric(
  input: AggregatePovertyAssistanceMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_poverty_assistance_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        cash_public_assistance_households,
        cash_public_assistance_households_pct,
        mean_cash_public_assistance_income,
        snap_households,
        snap_households_pct,
        families_below_poverty,
        families_below_poverty_pct,
        families_with_children_below_poverty,
        families_with_children_below_poverty_pct,
        female_householder_families_below_poverty,
        female_householder_families_below_poverty_pct,
        people_below_poverty,
        people_below_poverty_pct,
        children_below_poverty,
        children_below_poverty_pct,
        adults_18_to_64_below_poverty,
        adults_18_to_64_below_poverty_pct,
        adults_65_plus_below_poverty,
        adults_65_plus_below_poverty_pct,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @cashPublicAssistanceHouseholds,
        @cashPublicAssistanceHouseholdsPct,
        @meanCashPublicAssistanceIncome,
        @snapHouseholds,
        @snapHouseholdsPct,
        @familiesBelowPoverty,
        @familiesBelowPovertyPct,
        @familiesWithChildrenBelowPoverty,
        @familiesWithChildrenBelowPovertyPct,
        @femaleHouseholderFamiliesBelowPoverty,
        @femaleHouseholderFamiliesBelowPovertyPct,
        @peopleBelowPoverty,
        @peopleBelowPovertyPct,
        @childrenBelowPoverty,
        @childrenBelowPovertyPct,
        @adults18To64BelowPoverty,
        @adults18To64BelowPovertyPct,
        @adults65PlusBelowPoverty,
        @adults65PlusBelowPovertyPct,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        cash_public_assistance_households = excluded.cash_public_assistance_households,
        cash_public_assistance_households_pct = excluded.cash_public_assistance_households_pct,
        mean_cash_public_assistance_income = excluded.mean_cash_public_assistance_income,
        snap_households = excluded.snap_households,
        snap_households_pct = excluded.snap_households_pct,
        families_below_poverty = excluded.families_below_poverty,
        families_below_poverty_pct = excluded.families_below_poverty_pct,
        families_with_children_below_poverty = excluded.families_with_children_below_poverty,
        families_with_children_below_poverty_pct = excluded.families_with_children_below_poverty_pct,
        female_householder_families_below_poverty = excluded.female_householder_families_below_poverty,
        female_householder_families_below_poverty_pct = excluded.female_householder_families_below_poverty_pct,
        people_below_poverty = excluded.people_below_poverty,
        people_below_poverty_pct = excluded.people_below_poverty_pct,
        children_below_poverty = excluded.children_below_poverty,
        children_below_poverty_pct = excluded.children_below_poverty_pct,
        adults_18_to_64_below_poverty = excluded.adults_18_to_64_below_poverty,
        adults_18_to_64_below_poverty_pct = excluded.adults_18_to_64_below_poverty_pct,
        adults_65_plus_below_poverty = excluded.adults_65_plus_below_poverty,
        adults_65_plus_below_poverty_pct = excluded.adults_65_plus_below_poverty_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHealthInsuranceMetric(
  input: AggregateHealthInsuranceMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_health_insurance_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        civilian_noninstitutionalized_population,
        with_health_insurance,
        with_health_insurance_pct,
        private_health_insurance,
        private_health_insurance_pct,
        public_coverage,
        public_coverage_pct,
        no_health_insurance,
        no_health_insurance_pct,
        under_19_population,
        under_19_no_health_insurance,
        under_19_no_health_insurance_pct,
        age_19_to_64_population,
        employed_age_19_to_64_no_health_insurance,
        employed_age_19_to_64_no_health_insurance_pct,
        unemployed_age_19_to_64_no_health_insurance,
        unemployed_age_19_to_64_no_health_insurance_pct,
        not_in_labor_force_age_19_to_64_no_health_insurance,
        not_in_labor_force_age_19_to_64_no_health_insurance_pct,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @civilianNoninstitutionalizedPopulation,
        @withHealthInsurance,
        @withHealthInsurancePct,
        @privateHealthInsurance,
        @privateHealthInsurancePct,
        @publicCoverage,
        @publicCoveragePct,
        @noHealthInsurance,
        @noHealthInsurancePct,
        @under19Population,
        @under19NoHealthInsurance,
        @under19NoHealthInsurancePct,
        @age19To64Population,
        @employedAge19To64NoHealthInsurance,
        @employedAge19To64NoHealthInsurancePct,
        @unemployedAge19To64NoHealthInsurance,
        @unemployedAge19To64NoHealthInsurancePct,
        @notInLaborForceAge19To64NoHealthInsurance,
        @notInLaborForceAge19To64NoHealthInsurancePct,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        civilian_noninstitutionalized_population = excluded.civilian_noninstitutionalized_population,
        with_health_insurance = excluded.with_health_insurance,
        with_health_insurance_pct = excluded.with_health_insurance_pct,
        private_health_insurance = excluded.private_health_insurance,
        private_health_insurance_pct = excluded.private_health_insurance_pct,
        public_coverage = excluded.public_coverage,
        public_coverage_pct = excluded.public_coverage_pct,
        no_health_insurance = excluded.no_health_insurance,
        no_health_insurance_pct = excluded.no_health_insurance_pct,
        under_19_population = excluded.under_19_population,
        under_19_no_health_insurance = excluded.under_19_no_health_insurance,
        under_19_no_health_insurance_pct = excluded.under_19_no_health_insurance_pct,
        age_19_to_64_population = excluded.age_19_to_64_population,
        employed_age_19_to_64_no_health_insurance = excluded.employed_age_19_to_64_no_health_insurance,
        employed_age_19_to_64_no_health_insurance_pct = excluded.employed_age_19_to_64_no_health_insurance_pct,
        unemployed_age_19_to_64_no_health_insurance = excluded.unemployed_age_19_to_64_no_health_insurance,
        unemployed_age_19_to_64_no_health_insurance_pct = excluded.unemployed_age_19_to_64_no_health_insurance_pct,
        not_in_labor_force_age_19_to_64_no_health_insurance = excluded.not_in_labor_force_age_19_to_64_no_health_insurance,
        not_in_labor_force_age_19_to_64_no_health_insurance_pct = excluded.not_in_labor_force_age_19_to_64_no_health_insurance_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateEducationalAttainmentMetric(
  input: AggregateEducationalAttainmentMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_educational_attainment_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        population_25_plus,
        less_than_9th_grade,
        less_than_9th_grade_pct,
        ninth_to_12th_no_diploma,
        ninth_to_12th_no_diploma_pct,
        high_school_graduate,
        high_school_graduate_pct,
        some_college_no_degree,
        some_college_no_degree_pct,
        associates_degree,
        associates_degree_pct,
        bachelors_degree,
        bachelors_degree_pct,
        graduate_professional_degree,
        graduate_professional_degree_pct,
        high_school_graduate_or_higher,
        high_school_graduate_or_higher_pct,
        bachelors_degree_or_higher,
        bachelors_degree_or_higher_pct,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @population25Plus,
        @lessThan9thGrade,
        @lessThan9thGradePct,
        @ninthTo12thNoDiploma,
        @ninthTo12thNoDiplomaPct,
        @highSchoolGraduate,
        @highSchoolGraduatePct,
        @someCollegeNoDegree,
        @someCollegeNoDegreePct,
        @associatesDegree,
        @associatesDegreePct,
        @bachelorsDegree,
        @bachelorsDegreePct,
        @graduateProfessionalDegree,
        @graduateProfessionalDegreePct,
        @highSchoolGraduateOrHigher,
        @highSchoolGraduateOrHigherPct,
        @bachelorsDegreeOrHigher,
        @bachelorsDegreeOrHigherPct,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        population_25_plus = excluded.population_25_plus,
        less_than_9th_grade = excluded.less_than_9th_grade,
        less_than_9th_grade_pct = excluded.less_than_9th_grade_pct,
        ninth_to_12th_no_diploma = excluded.ninth_to_12th_no_diploma,
        ninth_to_12th_no_diploma_pct = excluded.ninth_to_12th_no_diploma_pct,
        high_school_graduate = excluded.high_school_graduate,
        high_school_graduate_pct = excluded.high_school_graduate_pct,
        some_college_no_degree = excluded.some_college_no_degree,
        some_college_no_degree_pct = excluded.some_college_no_degree_pct,
        associates_degree = excluded.associates_degree,
        associates_degree_pct = excluded.associates_degree_pct,
        bachelors_degree = excluded.bachelors_degree,
        bachelors_degree_pct = excluded.bachelors_degree_pct,
        graduate_professional_degree = excluded.graduate_professional_degree,
        graduate_professional_degree_pct = excluded.graduate_professional_degree_pct,
        high_school_graduate_or_higher = excluded.high_school_graduate_or_higher,
        high_school_graduate_or_higher_pct = excluded.high_school_graduate_or_higher_pct,
        bachelors_degree_or_higher = excluded.bachelors_degree_or_higher,
        bachelors_degree_or_higher_pct = excluded.bachelors_degree_or_higher_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateEmploymentStatusMetric(
  input: AggregateEmploymentStatusMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_employment_status_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        population_16_plus,
        in_labor_force,
        in_labor_force_pct,
        civilian_labor_force,
        civilian_labor_force_pct,
        employed,
        employed_pct,
        unemployed,
        unemployed_pct,
        armed_forces,
        armed_forces_pct,
        not_in_labor_force,
        not_in_labor_force_pct,
        unemployment_rate,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @population16Plus,
        @inLaborForce,
        @inLaborForcePct,
        @civilianLaborForce,
        @civilianLaborForcePct,
        @employed,
        @employedPct,
        @unemployed,
        @unemployedPct,
        @armedForces,
        @armedForcesPct,
        @notInLaborForce,
        @notInLaborForcePct,
        @unemploymentRate,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        population_16_plus = excluded.population_16_plus,
        in_labor_force = excluded.in_labor_force,
        in_labor_force_pct = excluded.in_labor_force_pct,
        civilian_labor_force = excluded.civilian_labor_force,
        civilian_labor_force_pct = excluded.civilian_labor_force_pct,
        employed = excluded.employed,
        employed_pct = excluded.employed_pct,
        unemployed = excluded.unemployed,
        unemployed_pct = excluded.unemployed_pct,
        armed_forces = excluded.armed_forces,
        armed_forces_pct = excluded.armed_forces_pct,
        not_in_labor_force = excluded.not_in_labor_force,
        not_in_labor_force_pct = excluded.not_in_labor_force_pct,
        unemployment_rate = excluded.unemployment_rate,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateLanguageProficiencyMetric(
  input: AggregateLanguageProficiencyMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_language_proficiency_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        population_5_plus,
        english_only,
        english_only_pct,
        language_other_than_english,
        language_other_than_english_pct,
        limited_english,
        limited_english_pct,
        spanish,
        spanish_pct,
        spanish_limited_english,
        spanish_limited_english_pct,
        other_indo_european,
        other_indo_european_pct,
        other_indo_european_limited_english,
        other_indo_european_limited_english_pct,
        asian_pacific_islander,
        asian_pacific_islander_pct,
        asian_pacific_islander_limited_english,
        asian_pacific_islander_limited_english_pct,
        other_languages,
        other_languages_pct,
        other_languages_limited_english,
        other_languages_limited_english_pct,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @population5Plus,
        @englishOnly,
        @englishOnlyPct,
        @languageOtherThanEnglish,
        @languageOtherThanEnglishPct,
        @limitedEnglish,
        @limitedEnglishPct,
        @spanish,
        @spanishPct,
        @spanishLimitedEnglish,
        @spanishLimitedEnglishPct,
        @otherIndoEuropean,
        @otherIndoEuropeanPct,
        @otherIndoEuropeanLimitedEnglish,
        @otherIndoEuropeanLimitedEnglishPct,
        @asianPacificIslander,
        @asianPacificIslanderPct,
        @asianPacificIslanderLimitedEnglish,
        @asianPacificIslanderLimitedEnglishPct,
        @otherLanguages,
        @otherLanguagesPct,
        @otherLanguagesLimitedEnglish,
        @otherLanguagesLimitedEnglishPct,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        population_5_plus = excluded.population_5_plus,
        english_only = excluded.english_only,
        english_only_pct = excluded.english_only_pct,
        language_other_than_english = excluded.language_other_than_english,
        language_other_than_english_pct = excluded.language_other_than_english_pct,
        limited_english = excluded.limited_english,
        limited_english_pct = excluded.limited_english_pct,
        spanish = excluded.spanish,
        spanish_pct = excluded.spanish_pct,
        spanish_limited_english = excluded.spanish_limited_english,
        spanish_limited_english_pct = excluded.spanish_limited_english_pct,
        other_indo_european = excluded.other_indo_european,
        other_indo_european_pct = excluded.other_indo_european_pct,
        other_indo_european_limited_english = excluded.other_indo_european_limited_english,
        other_indo_european_limited_english_pct = excluded.other_indo_european_limited_english_pct,
        asian_pacific_islander = excluded.asian_pacific_islander,
        asian_pacific_islander_pct = excluded.asian_pacific_islander_pct,
        asian_pacific_islander_limited_english = excluded.asian_pacific_islander_limited_english,
        asian_pacific_islander_limited_english_pct = excluded.asian_pacific_islander_limited_english_pct,
        other_languages = excluded.other_languages,
        other_languages_pct = excluded.other_languages_pct,
        other_languages_limited_english = excluded.other_languages_limited_english,
        other_languages_limited_english_pct = excluded.other_languages_limited_english_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateInternetAccessMetric(
  input: AggregateInternetAccessMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_internet_access_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_households,
        total_households_pct,
        with_computer,
        with_computer_pct,
        with_broadband,
        with_broadband_pct,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalHouseholds,
        @totalHouseholdsPct,
        @withComputer,
        @withComputerPct,
        @withBroadband,
        @withBroadbandPct,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_households = excluded.total_households,
        total_households_pct = excluded.total_households_pct,
        with_computer = excluded.with_computer,
        with_computer_pct = excluded.with_computer_pct,
        with_broadband = excluded.with_broadband,
        with_broadband_pct = excluded.with_broadband_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateAgeSexMetric(input: AggregateAgeSexMetricInput) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_age_sex_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_population,
        male,
        male_pct,
        female,
        female_pct,
        sex_ratio,
        under_5,
        under_5_pct,
        age_5_to_9,
        age_5_to_9_pct,
        age_10_to_14,
        age_10_to_14_pct,
        age_15_to_19,
        age_15_to_19_pct,
        age_20_to_24,
        age_20_to_24_pct,
        age_25_to_34,
        age_25_to_34_pct,
        age_35_to_44,
        age_35_to_44_pct,
        age_45_to_54,
        age_45_to_54_pct,
        age_55_to_59,
        age_55_to_59_pct,
        age_60_to_64,
        age_60_to_64_pct,
        age_65_to_74,
        age_65_to_74_pct,
        age_75_to_84,
        age_75_to_84_pct,
        age_85_plus,
        age_85_plus_pct,
        median_age,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalPopulation,
        @male,
        @malePct,
        @female,
        @femalePct,
        @sexRatio,
        @under5,
        @under5Pct,
        @age5To9,
        @age5To9Pct,
        @age10To14,
        @age10To14Pct,
        @age15To19,
        @age15To19Pct,
        @age20To24,
        @age20To24Pct,
        @age25To34,
        @age25To34Pct,
        @age35To44,
        @age35To44Pct,
        @age45To54,
        @age45To54Pct,
        @age55To59,
        @age55To59Pct,
        @age60To64,
        @age60To64Pct,
        @age65To74,
        @age65To74Pct,
        @age75To84,
        @age75To84Pct,
        @age85Plus,
        @age85PlusPct,
        @medianAge,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_population = excluded.total_population,
        male = excluded.male,
        male_pct = excluded.male_pct,
        female = excluded.female,
        female_pct = excluded.female_pct,
        sex_ratio = excluded.sex_ratio,
        under_5 = excluded.under_5,
        under_5_pct = excluded.under_5_pct,
        age_5_to_9 = excluded.age_5_to_9,
        age_5_to_9_pct = excluded.age_5_to_9_pct,
        age_10_to_14 = excluded.age_10_to_14,
        age_10_to_14_pct = excluded.age_10_to_14_pct,
        age_15_to_19 = excluded.age_15_to_19,
        age_15_to_19_pct = excluded.age_15_to_19_pct,
        age_20_to_24 = excluded.age_20_to_24,
        age_20_to_24_pct = excluded.age_20_to_24_pct,
        age_25_to_34 = excluded.age_25_to_34,
        age_25_to_34_pct = excluded.age_25_to_34_pct,
        age_35_to_44 = excluded.age_35_to_44,
        age_35_to_44_pct = excluded.age_35_to_44_pct,
        age_45_to_54 = excluded.age_45_to_54,
        age_45_to_54_pct = excluded.age_45_to_54_pct,
        age_55_to_59 = excluded.age_55_to_59,
        age_55_to_59_pct = excluded.age_55_to_59_pct,
        age_60_to_64 = excluded.age_60_to_64,
        age_60_to_64_pct = excluded.age_60_to_64_pct,
        age_65_to_74 = excluded.age_65_to_74,
        age_65_to_74_pct = excluded.age_65_to_74_pct,
        age_75_to_84 = excluded.age_75_to_84,
        age_75_to_84_pct = excluded.age_75_to_84_pct,
        age_85_plus = excluded.age_85_plus,
        age_85_plus_pct = excluded.age_85_plus_pct,
        median_age = excluded.median_age,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateRaceOriginMetric(
  input: AggregateRaceOriginMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_race_origin_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        race_total_population,
        white,
        white_pct,
        black,
        black_pct,
        american_indian_alaska_native,
        american_indian_alaska_native_pct,
        asian,
        asian_pct,
        native_hawaiian_pacific_islander,
        native_hawaiian_pacific_islander_pct,
        some_other_race,
        some_other_race_pct,
        two_or_more_races,
        two_or_more_races_pct,
        hispanic_latino,
        hispanic_latino_pct,
        not_hispanic_latino,
        not_hispanic_latino_pct,
        white_non_hispanic,
        white_non_hispanic_pct,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @raceTotalPopulation,
        @white,
        @whitePct,
        @black,
        @blackPct,
        @americanIndianAlaskaNative,
        @americanIndianAlaskaNativePct,
        @asian,
        @asianPct,
        @nativeHawaiianPacificIslander,
        @nativeHawaiianPacificIslanderPct,
        @someOtherRace,
        @someOtherRacePct,
        @twoOrMoreRaces,
        @twoOrMoreRacesPct,
        @hispanicLatino,
        @hispanicLatinoPct,
        @notHispanicLatino,
        @notHispanicLatinoPct,
        @whiteNonHispanic,
        @whiteNonHispanicPct,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        race_total_population = excluded.race_total_population,
        white = excluded.white,
        white_pct = excluded.white_pct,
        black = excluded.black,
        black_pct = excluded.black_pct,
        american_indian_alaska_native = excluded.american_indian_alaska_native,
        american_indian_alaska_native_pct = excluded.american_indian_alaska_native_pct,
        asian = excluded.asian,
        asian_pct = excluded.asian_pct,
        native_hawaiian_pacific_islander = excluded.native_hawaiian_pacific_islander,
        native_hawaiian_pacific_islander_pct = excluded.native_hawaiian_pacific_islander_pct,
        some_other_race = excluded.some_other_race,
        some_other_race_pct = excluded.some_other_race_pct,
        two_or_more_races = excluded.two_or_more_races,
        two_or_more_races_pct = excluded.two_or_more_races_pct,
        hispanic_latino = excluded.hispanic_latino,
        hispanic_latino_pct = excluded.hispanic_latino_pct,
        not_hispanic_latino = excluded.not_hispanic_latino,
        not_hispanic_latino_pct = excluded.not_hispanic_latino_pct,
        white_non_hispanic = excluded.white_non_hispanic,
        white_non_hispanic_pct = excluded.white_non_hispanic_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateLausLaborMetric(
  input: AggregateLausLaborMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_laus_labor_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        period,
        period_name,
        state_fips,
        county_fips,
        county_name,
        labor_force,
        employment,
        unemployment,
        unemployment_rate,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @period,
        @periodName,
        @stateFips,
        @countyFips,
        @countyName,
        @laborForce,
        @employment,
        @unemployment,
        @unemploymentRate,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        period = excluded.period,
        period_name = excluded.period_name,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        labor_force = excluded.labor_force,
        employment = excluded.employment,
        unemployment = excluded.unemployment,
        unemployment_rate = excluded.unemployment_rate,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateCountyBusinessMetric(
  input: AggregateCountyBusinessMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_county_business_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        naics_code,
        naics_label,
        legal_form_code,
        legal_form_label,
        employment_size_code,
        employment_size_label,
        establishments,
        employment,
        annual_payroll_thousands,
        raw_json
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @naicsCode,
        @naicsLabel,
        @legalFormCode,
        @legalFormLabel,
        @employmentSizeCode,
        @employmentSizeLabel,
        @establishments,
        @employment,
        @annualPayrollThousands,
        @rawJson
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        naics_code = excluded.naics_code,
        naics_label = excluded.naics_label,
        legal_form_code = excluded.legal_form_code,
        legal_form_label = excluded.legal_form_label,
        employment_size_code = excluded.employment_size_code,
        employment_size_label = excluded.employment_size_label,
        establishments = excluded.establishments,
        employment = excluded.employment,
        annual_payroll_thousands = excluded.annual_payroll_thousands,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateResidentialTenureMetric(
  input: AggregateResidentialTenureMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_residential_tenure_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        occupied_housing_units,
        moved_2023_or_later,
        moved_2023_or_later_pct,
        moved_2020_to_2022,
        moved_2020_to_2022_pct,
        moved_2010_to_2019,
        moved_2010_to_2019_pct,
        moved_2000_to_2009,
        moved_2000_to_2009_pct,
        moved_1990_to_1999,
        moved_1990_to_1999_pct,
        moved_1989_or_earlier,
        moved_1989_or_earlier_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @occupiedHousingUnits,
        @moved2023OrLater,
        @moved2023OrLaterPct,
        @moved2020To2022,
        @moved2020To2022Pct,
        @moved2010To2019,
        @moved2010To2019Pct,
        @moved2000To2009,
        @moved2000To2009Pct,
        @moved1990To1999,
        @moved1990To1999Pct,
        @moved1989OrEarlier,
        @moved1989OrEarlierPct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        occupied_housing_units = excluded.occupied_housing_units,
        moved_2023_or_later = excluded.moved_2023_or_later,
        moved_2023_or_later_pct = excluded.moved_2023_or_later_pct,
        moved_2020_to_2022 = excluded.moved_2020_to_2022,
        moved_2020_to_2022_pct = excluded.moved_2020_to_2022_pct,
        moved_2010_to_2019 = excluded.moved_2010_to_2019,
        moved_2010_to_2019_pct = excluded.moved_2010_to_2019_pct,
        moved_2000_to_2009 = excluded.moved_2000_to_2009,
        moved_2000_to_2009_pct = excluded.moved_2000_to_2009_pct,
        moved_1990_to_1999 = excluded.moved_1990_to_1999,
        moved_1990_to_1999_pct = excluded.moved_1990_to_1999_pct,
        moved_1989_or_earlier = excluded.moved_1989_or_earlier,
        moved_1989_or_earlier_pct = excluded.moved_1989_or_earlier_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHousingCostBurdenMetric(
  input: AggregateHousingCostBurdenMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_housing_cost_burden_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        owner_mortgage_units,
        owner_mortgage_30_to_34_pct,
        owner_mortgage_35_plus_pct,
        owner_mortgage_30_plus,
        owner_mortgage_30_plus_pct,
        owner_no_mortgage_units,
        owner_no_mortgage_30_to_34_pct,
        owner_no_mortgage_35_plus_pct,
        owner_no_mortgage_30_plus,
        owner_no_mortgage_30_plus_pct,
        renter_units,
        renter_30_to_34_pct,
        renter_35_plus_pct,
        renter_30_plus,
        renter_30_plus_pct,
        median_owner_cost_with_mortgage,
        median_owner_cost_without_mortgage,
        median_gross_rent,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @ownerMortgageUnits,
        @ownerMortgage30To34Pct,
        @ownerMortgage35PlusPct,
        @ownerMortgage30Plus,
        @ownerMortgage30PlusPct,
        @ownerNoMortgageUnits,
        @ownerNoMortgage30To34Pct,
        @ownerNoMortgage35PlusPct,
        @ownerNoMortgage30Plus,
        @ownerNoMortgage30PlusPct,
        @renterUnits,
        @renter30To34Pct,
        @renter35PlusPct,
        @renter30Plus,
        @renter30PlusPct,
        @medianOwnerCostWithMortgage,
        @medianOwnerCostWithoutMortgage,
        @medianGrossRent,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        owner_mortgage_units = excluded.owner_mortgage_units,
        owner_mortgage_30_to_34_pct = excluded.owner_mortgage_30_to_34_pct,
        owner_mortgage_35_plus_pct = excluded.owner_mortgage_35_plus_pct,
        owner_mortgage_30_plus = excluded.owner_mortgage_30_plus,
        owner_mortgage_30_plus_pct = excluded.owner_mortgage_30_plus_pct,
        owner_no_mortgage_units = excluded.owner_no_mortgage_units,
        owner_no_mortgage_30_to_34_pct = excluded.owner_no_mortgage_30_to_34_pct,
        owner_no_mortgage_35_plus_pct = excluded.owner_no_mortgage_35_plus_pct,
        owner_no_mortgage_30_plus = excluded.owner_no_mortgage_30_plus,
        owner_no_mortgage_30_plus_pct = excluded.owner_no_mortgage_30_plus_pct,
        renter_units = excluded.renter_units,
        renter_30_to_34_pct = excluded.renter_30_to_34_pct,
        renter_35_plus_pct = excluded.renter_35_plus_pct,
        renter_30_plus = excluded.renter_30_plus,
        renter_30_plus_pct = excluded.renter_30_plus_pct,
        median_owner_cost_with_mortgage = excluded.median_owner_cost_with_mortgage,
        median_owner_cost_without_mortgage = excluded.median_owner_cost_without_mortgage,
        median_gross_rent = excluded.median_gross_rent,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateVacancyStatusMetric(
  input: AggregateVacancyStatusMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_vacancy_status_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_vacant_units,
        for_rent_units,
        for_rent_pct,
        rented_not_occupied_units,
        rented_not_occupied_pct,
        for_sale_only_units,
        for_sale_only_pct,
        sold_not_occupied_units,
        sold_not_occupied_pct,
        seasonal_recreational_occasional_units,
        seasonal_recreational_occasional_pct,
        migrant_worker_units,
        migrant_worker_pct,
        other_vacant_units,
        other_vacant_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalVacantUnits,
        @forRentUnits,
        @forRentPct,
        @rentedNotOccupiedUnits,
        @rentedNotOccupiedPct,
        @forSaleOnlyUnits,
        @forSaleOnlyPct,
        @soldNotOccupiedUnits,
        @soldNotOccupiedPct,
        @seasonalRecreationalOccasionalUnits,
        @seasonalRecreationalOccasionalPct,
        @migrantWorkerUnits,
        @migrantWorkerPct,
        @otherVacantUnits,
        @otherVacantPct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_vacant_units = excluded.total_vacant_units,
        for_rent_units = excluded.for_rent_units,
        for_rent_pct = excluded.for_rent_pct,
        rented_not_occupied_units = excluded.rented_not_occupied_units,
        rented_not_occupied_pct = excluded.rented_not_occupied_pct,
        for_sale_only_units = excluded.for_sale_only_units,
        for_sale_only_pct = excluded.for_sale_only_pct,
        sold_not_occupied_units = excluded.sold_not_occupied_units,
        sold_not_occupied_pct = excluded.sold_not_occupied_pct,
        seasonal_recreational_occasional_units = excluded.seasonal_recreational_occasional_units,
        seasonal_recreational_occasional_pct = excluded.seasonal_recreational_occasional_pct,
        migrant_worker_units = excluded.migrant_worker_units,
        migrant_worker_pct = excluded.migrant_worker_pct,
        other_vacant_units = excluded.other_vacant_units,
        other_vacant_pct = excluded.other_vacant_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHousingCrowdingMetric(
  input: AggregateHousingCrowdingMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_housing_crowding_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        occupied_housing_units,
        occupants_per_room_one_or_less,
        occupants_per_room_one_or_less_pct,
        occupants_per_room_one_to_one_point_five,
        occupants_per_room_one_to_one_point_five_pct,
        occupants_per_room_one_point_five_plus,
        occupants_per_room_one_point_five_plus_pct,
        overcrowded_units,
        overcrowded_pct,
        severe_overcrowded_units,
        severe_overcrowded_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @occupiedHousingUnits,
        @occupantsPerRoomOneOrLess,
        @occupantsPerRoomOneOrLessPct,
        @occupantsPerRoomOneToOnePointFive,
        @occupantsPerRoomOneToOnePointFivePct,
        @occupantsPerRoomOnePointFivePlus,
        @occupantsPerRoomOnePointFivePlusPct,
        @overcrowdedUnits,
        @overcrowdedPct,
        @severeOvercrowdedUnits,
        @severeOvercrowdedPct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        occupied_housing_units = excluded.occupied_housing_units,
        occupants_per_room_one_or_less = excluded.occupants_per_room_one_or_less,
        occupants_per_room_one_or_less_pct = excluded.occupants_per_room_one_or_less_pct,
        occupants_per_room_one_to_one_point_five = excluded.occupants_per_room_one_to_one_point_five,
        occupants_per_room_one_to_one_point_five_pct = excluded.occupants_per_room_one_to_one_point_five_pct,
        occupants_per_room_one_point_five_plus = excluded.occupants_per_room_one_point_five_plus,
        occupants_per_room_one_point_five_plus_pct = excluded.occupants_per_room_one_point_five_plus_pct,
        overcrowded_units = excluded.overcrowded_units,
        overcrowded_pct = excluded.overcrowded_pct,
        severe_overcrowded_units = excluded.severe_overcrowded_units,
        severe_overcrowded_pct = excluded.severe_overcrowded_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHouseholdCompositionMetric(
  input: AggregateHouseholdCompositionMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_household_composition_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_households,
        married_couple_households,
        married_couple_households_pct,
        married_couple_with_children,
        married_couple_with_children_pct,
        cohabiting_couple_households,
        cohabiting_couple_households_pct,
        cohabiting_couple_with_children,
        cohabiting_couple_with_children_pct,
        male_no_spouse_households,
        male_no_spouse_households_pct,
        male_living_alone,
        male_living_alone_pct,
        male_living_alone_65_plus,
        male_living_alone_65_plus_pct,
        female_no_spouse_households,
        female_no_spouse_households_pct,
        female_living_alone,
        female_living_alone_pct,
        female_living_alone_65_plus,
        female_living_alone_65_plus_pct,
        households_with_under_18,
        households_with_under_18_pct,
        households_with_65_plus,
        households_with_65_plus_pct,
        average_household_size,
        average_family_size,
        single_person_households,
        single_person_households_pct,
        living_alone_65_plus,
        living_alone_65_plus_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalHouseholds,
        @marriedCoupleHouseholds,
        @marriedCoupleHouseholdsPct,
        @marriedCoupleWithChildren,
        @marriedCoupleWithChildrenPct,
        @cohabitingCoupleHouseholds,
        @cohabitingCoupleHouseholdsPct,
        @cohabitingCoupleWithChildren,
        @cohabitingCoupleWithChildrenPct,
        @maleNoSpouseHouseholds,
        @maleNoSpouseHouseholdsPct,
        @maleLivingAlone,
        @maleLivingAlonePct,
        @maleLivingAlone65Plus,
        @maleLivingAlone65PlusPct,
        @femaleNoSpouseHouseholds,
        @femaleNoSpouseHouseholdsPct,
        @femaleLivingAlone,
        @femaleLivingAlonePct,
        @femaleLivingAlone65Plus,
        @femaleLivingAlone65PlusPct,
        @householdsWithUnder18,
        @householdsWithUnder18Pct,
        @householdsWith65Plus,
        @householdsWith65PlusPct,
        @averageHouseholdSize,
        @averageFamilySize,
        @singlePersonHouseholds,
        @singlePersonHouseholdsPct,
        @livingAlone65Plus,
        @livingAlone65PlusPct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_households = excluded.total_households,
        married_couple_households = excluded.married_couple_households,
        married_couple_households_pct = excluded.married_couple_households_pct,
        married_couple_with_children = excluded.married_couple_with_children,
        married_couple_with_children_pct = excluded.married_couple_with_children_pct,
        cohabiting_couple_households = excluded.cohabiting_couple_households,
        cohabiting_couple_households_pct = excluded.cohabiting_couple_households_pct,
        cohabiting_couple_with_children = excluded.cohabiting_couple_with_children,
        cohabiting_couple_with_children_pct = excluded.cohabiting_couple_with_children_pct,
        male_no_spouse_households = excluded.male_no_spouse_households,
        male_no_spouse_households_pct = excluded.male_no_spouse_households_pct,
        male_living_alone = excluded.male_living_alone,
        male_living_alone_pct = excluded.male_living_alone_pct,
        male_living_alone_65_plus = excluded.male_living_alone_65_plus,
        male_living_alone_65_plus_pct = excluded.male_living_alone_65_plus_pct,
        female_no_spouse_households = excluded.female_no_spouse_households,
        female_no_spouse_households_pct = excluded.female_no_spouse_households_pct,
        female_living_alone = excluded.female_living_alone,
        female_living_alone_pct = excluded.female_living_alone_pct,
        female_living_alone_65_plus = excluded.female_living_alone_65_plus,
        female_living_alone_65_plus_pct = excluded.female_living_alone_65_plus_pct,
        households_with_under_18 = excluded.households_with_under_18,
        households_with_under_18_pct = excluded.households_with_under_18_pct,
        households_with_65_plus = excluded.households_with_65_plus,
        households_with_65_plus_pct = excluded.households_with_65_plus_pct,
        average_household_size = excluded.average_household_size,
        average_family_size = excluded.average_family_size,
        single_person_households = excluded.single_person_households,
        single_person_households_pct = excluded.single_person_households_pct,
        living_alone_65_plus = excluded.living_alone_65_plus,
        living_alone_65_plus_pct = excluded.living_alone_65_plus_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHousingStructureMetric(
  input: AggregateHousingStructureMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_housing_structure_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        total_housing_units,
        one_unit_detached,
        one_unit_detached_pct,
        one_unit_attached,
        one_unit_attached_pct,
        two_units,
        two_units_pct,
        three_or_four_units,
        three_or_four_units_pct,
        five_to_nine_units,
        five_to_nine_units_pct,
        ten_to_nineteen_units,
        ten_to_nineteen_units_pct,
        twenty_plus_units,
        twenty_plus_units_pct,
        mobile_home_units,
        mobile_home_units_pct,
        boat_rv_van_units,
        boat_rv_van_units_pct,
        built_2020_or_later,
        built_2020_or_later_pct,
        built_2010_to_2019,
        built_2010_to_2019_pct,
        built_2000_to_2009,
        built_2000_to_2009_pct,
        built_1990_to_1999,
        built_1990_to_1999_pct,
        built_1980_to_1989,
        built_1980_to_1989_pct,
        built_1970_to_1979,
        built_1970_to_1979_pct,
        built_1960_to_1969,
        built_1960_to_1969_pct,
        built_1950_to_1959,
        built_1950_to_1959_pct,
        built_1940_to_1949,
        built_1940_to_1949_pct,
        built_1939_or_earlier,
        built_1939_or_earlier_pct,
        single_family_units,
        single_family_units_pct,
        small_multifamily_units,
        small_multifamily_units_pct,
        large_multifamily_units,
        large_multifamily_units_pct,
        built_2010_or_later,
        built_2010_or_later_pct,
        built_before_1960,
        built_before_1960_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @totalHousingUnits,
        @oneUnitDetached,
        @oneUnitDetachedPct,
        @oneUnitAttached,
        @oneUnitAttachedPct,
        @twoUnits,
        @twoUnitsPct,
        @threeOrFourUnits,
        @threeOrFourUnitsPct,
        @fiveToNineUnits,
        @fiveToNineUnitsPct,
        @tenToNineteenUnits,
        @tenToNineteenUnitsPct,
        @twentyPlusUnits,
        @twentyPlusUnitsPct,
        @mobileHomeUnits,
        @mobileHomeUnitsPct,
        @boatRvVanUnits,
        @boatRvVanUnitsPct,
        @built2020OrLater,
        @built2020OrLaterPct,
        @built2010To2019,
        @built2010To2019Pct,
        @built2000To2009,
        @built2000To2009Pct,
        @built1990To1999,
        @built1990To1999Pct,
        @built1980To1989,
        @built1980To1989Pct,
        @built1970To1979,
        @built1970To1979Pct,
        @built1960To1969,
        @built1960To1969Pct,
        @built1950To1959,
        @built1950To1959Pct,
        @built1940To1949,
        @built1940To1949Pct,
        @built1939OrEarlier,
        @built1939OrEarlierPct,
        @singleFamilyUnits,
        @singleFamilyUnitsPct,
        @smallMultifamilyUnits,
        @smallMultifamilyUnitsPct,
        @largeMultifamilyUnits,
        @largeMultifamilyUnitsPct,
        @built2010OrLater,
        @built2010OrLaterPct,
        @builtBefore1960,
        @builtBefore1960Pct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        total_housing_units = excluded.total_housing_units,
        one_unit_detached = excluded.one_unit_detached,
        one_unit_detached_pct = excluded.one_unit_detached_pct,
        one_unit_attached = excluded.one_unit_attached,
        one_unit_attached_pct = excluded.one_unit_attached_pct,
        two_units = excluded.two_units,
        two_units_pct = excluded.two_units_pct,
        three_or_four_units = excluded.three_or_four_units,
        three_or_four_units_pct = excluded.three_or_four_units_pct,
        five_to_nine_units = excluded.five_to_nine_units,
        five_to_nine_units_pct = excluded.five_to_nine_units_pct,
        ten_to_nineteen_units = excluded.ten_to_nineteen_units,
        ten_to_nineteen_units_pct = excluded.ten_to_nineteen_units_pct,
        twenty_plus_units = excluded.twenty_plus_units,
        twenty_plus_units_pct = excluded.twenty_plus_units_pct,
        mobile_home_units = excluded.mobile_home_units,
        mobile_home_units_pct = excluded.mobile_home_units_pct,
        boat_rv_van_units = excluded.boat_rv_van_units,
        boat_rv_van_units_pct = excluded.boat_rv_van_units_pct,
        built_2020_or_later = excluded.built_2020_or_later,
        built_2020_or_later_pct = excluded.built_2020_or_later_pct,
        built_2010_to_2019 = excluded.built_2010_to_2019,
        built_2010_to_2019_pct = excluded.built_2010_to_2019_pct,
        built_2000_to_2009 = excluded.built_2000_to_2009,
        built_2000_to_2009_pct = excluded.built_2000_to_2009_pct,
        built_1990_to_1999 = excluded.built_1990_to_1999,
        built_1990_to_1999_pct = excluded.built_1990_to_1999_pct,
        built_1980_to_1989 = excluded.built_1980_to_1989,
        built_1980_to_1989_pct = excluded.built_1980_to_1989_pct,
        built_1970_to_1979 = excluded.built_1970_to_1979,
        built_1970_to_1979_pct = excluded.built_1970_to_1979_pct,
        built_1960_to_1969 = excluded.built_1960_to_1969,
        built_1960_to_1969_pct = excluded.built_1960_to_1969_pct,
        built_1950_to_1959 = excluded.built_1950_to_1959,
        built_1950_to_1959_pct = excluded.built_1950_to_1959_pct,
        built_1940_to_1949 = excluded.built_1940_to_1949,
        built_1940_to_1949_pct = excluded.built_1940_to_1949_pct,
        built_1939_or_earlier = excluded.built_1939_or_earlier,
        built_1939_or_earlier_pct = excluded.built_1939_or_earlier_pct,
        single_family_units = excluded.single_family_units,
        single_family_units_pct = excluded.single_family_units_pct,
        small_multifamily_units = excluded.small_multifamily_units,
        small_multifamily_units_pct = excluded.small_multifamily_units_pct,
        large_multifamily_units = excluded.large_multifamily_units,
        large_multifamily_units_pct = excluded.large_multifamily_units_pct,
        built_2010_or_later = excluded.built_2010_or_later,
        built_2010_or_later_pct = excluded.built_2010_or_later_pct,
        built_before_1960 = excluded.built_before_1960,
        built_before_1960_pct = excluded.built_before_1960_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function upsertAggregateHousingValueRentMetric(
  input: AggregateHousingValueRentMetricInput,
) {
  getDb()
    .prepare(
      `
      INSERT INTO aggregate_housing_value_rent_metrics (
        source_id,
        source_record_id,
        hub,
        year,
        state_fips,
        county_fips,
        county_name,
        owner_value_units,
        value_under_50k,
        value_under_50k_pct,
        value_50k_to_99999,
        value_50k_to_99999_pct,
        value_100k_to_149999,
        value_100k_to_149999_pct,
        value_150k_to_199999,
        value_150k_to_199999_pct,
        value_200k_to_299999,
        value_200k_to_299999_pct,
        value_300k_to_499999,
        value_300k_to_499999_pct,
        value_500k_to_999999,
        value_500k_to_999999_pct,
        value_1m_plus,
        value_1m_plus_pct,
        median_home_value,
        rent_paying_units,
        rent_under_500,
        rent_under_500_pct,
        rent_500_to_999,
        rent_500_to_999_pct,
        rent_1000_to_1499,
        rent_1000_to_1499_pct,
        rent_1500_to_1999,
        rent_1500_to_1999_pct,
        rent_2000_to_2499,
        rent_2000_to_2499_pct,
        rent_2500_to_2999,
        rent_2500_to_2999_pct,
        rent_3000_plus,
        rent_3000_plus_pct,
        median_gross_rent,
        no_rent_paid,
        no_rent_paid_pct,
        value_500k_plus,
        value_500k_plus_pct,
        rent_2500_plus,
        rent_2500_plus_pct,
        raw_json,
        imported_at
      )
      VALUES (
        @sourceId,
        @sourceRecordId,
        @hub,
        @year,
        @stateFips,
        @countyFips,
        @countyName,
        @ownerValueUnits,
        @valueUnder50k,
        @valueUnder50kPct,
        @value50kTo99999,
        @value50kTo99999Pct,
        @value100kTo149999,
        @value100kTo149999Pct,
        @value150kTo199999,
        @value150kTo199999Pct,
        @value200kTo299999,
        @value200kTo299999Pct,
        @value300kTo499999,
        @value300kTo499999Pct,
        @value500kTo999999,
        @value500kTo999999Pct,
        @value1mPlus,
        @value1mPlusPct,
        @medianHomeValue,
        @rentPayingUnits,
        @rentUnder500,
        @rentUnder500Pct,
        @rent500To999,
        @rent500To999Pct,
        @rent1000To1499,
        @rent1000To1499Pct,
        @rent1500To1999,
        @rent1500To1999Pct,
        @rent2000To2499,
        @rent2000To2499Pct,
        @rent2500To2999,
        @rent2500To2999Pct,
        @rent3000Plus,
        @rent3000PlusPct,
        @medianGrossRent,
        @noRentPaid,
        @noRentPaidPct,
        @value500kPlus,
        @value500kPlusPct,
        @rent2500Plus,
        @rent2500PlusPct,
        @rawJson,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, source_record_id) DO UPDATE SET
        hub = excluded.hub,
        year = excluded.year,
        state_fips = excluded.state_fips,
        county_fips = excluded.county_fips,
        county_name = excluded.county_name,
        owner_value_units = excluded.owner_value_units,
        value_under_50k = excluded.value_under_50k,
        value_under_50k_pct = excluded.value_under_50k_pct,
        value_50k_to_99999 = excluded.value_50k_to_99999,
        value_50k_to_99999_pct = excluded.value_50k_to_99999_pct,
        value_100k_to_149999 = excluded.value_100k_to_149999,
        value_100k_to_149999_pct = excluded.value_100k_to_149999_pct,
        value_150k_to_199999 = excluded.value_150k_to_199999,
        value_150k_to_199999_pct = excluded.value_150k_to_199999_pct,
        value_200k_to_299999 = excluded.value_200k_to_299999,
        value_200k_to_299999_pct = excluded.value_200k_to_299999_pct,
        value_300k_to_499999 = excluded.value_300k_to_499999,
        value_300k_to_499999_pct = excluded.value_300k_to_499999_pct,
        value_500k_to_999999 = excluded.value_500k_to_999999,
        value_500k_to_999999_pct = excluded.value_500k_to_999999_pct,
        value_1m_plus = excluded.value_1m_plus,
        value_1m_plus_pct = excluded.value_1m_plus_pct,
        median_home_value = excluded.median_home_value,
        rent_paying_units = excluded.rent_paying_units,
        rent_under_500 = excluded.rent_under_500,
        rent_under_500_pct = excluded.rent_under_500_pct,
        rent_500_to_999 = excluded.rent_500_to_999,
        rent_500_to_999_pct = excluded.rent_500_to_999_pct,
        rent_1000_to_1499 = excluded.rent_1000_to_1499,
        rent_1000_to_1499_pct = excluded.rent_1000_to_1499_pct,
        rent_1500_to_1999 = excluded.rent_1500_to_1999,
        rent_1500_to_1999_pct = excluded.rent_1500_to_1999_pct,
        rent_2000_to_2499 = excluded.rent_2000_to_2499,
        rent_2000_to_2499_pct = excluded.rent_2000_to_2499_pct,
        rent_2500_to_2999 = excluded.rent_2500_to_2999,
        rent_2500_to_2999_pct = excluded.rent_2500_to_2999_pct,
        rent_3000_plus = excluded.rent_3000_plus,
        rent_3000_plus_pct = excluded.rent_3000_plus_pct,
        median_gross_rent = excluded.median_gross_rent,
        no_rent_paid = excluded.no_rent_paid,
        no_rent_paid_pct = excluded.no_rent_paid_pct,
        value_500k_plus = excluded.value_500k_plus,
        value_500k_plus_pct = excluded.value_500k_plus_pct,
        rent_2500_plus = excluded.rent_2500_plus,
        rent_2500_plus_pct = excluded.rent_2500_plus_pct,
        raw_json = excluded.raw_json,
        imported_at = CURRENT_TIMESTAMP
    `,
    )
    .run({
      ...input,
      rawJson: JSON.stringify(input.raw),
    });
}

export function createPrivacyRequest(input: {
  type: string;
  profileId?: string | null;
  requesterName: string;
  requesterEmail: string;
  details: string;
}) {
  const info = getDb()
    .prepare(
      `
      INSERT INTO privacy_requests (
        type, profile_id, requester_name, requester_email, details
      )
      VALUES (@type, @profileId, @requesterName, @requesterEmail, @details)
    `,
    )
    .run({
      ...input,
      profileId: input.profileId || null,
    });

  return Number(info.lastInsertRowid);
}

export function createAbuseReport(input: {
  profileId?: string | null;
  reporterName: string;
  reporterEmail: string;
  details: string;
}) {
  const info = getDb()
    .prepare(
      `
      INSERT INTO abuse_reports (profile_id, reporter_name, reporter_email, details)
      VALUES (@profileId, @reporterName, @reporterEmail, @details)
    `,
    )
    .run({
      ...input,
      profileId: input.profileId || null,
    });

  return Number(info.lastInsertRowid);
}

export function createRecordFeedback(input: {
  profileId: string;
  feedback: RecordFeedbackValue;
  context?: string;
  searchToken?: string | null;
  userAgent?: string | null;
}) {
  const info = getDb()
    .prepare(
      `
      INSERT INTO record_feedback (
        profile_id, feedback, context, search_token, user_agent
      )
      VALUES (@profileId, @feedback, @context, @searchToken, @userAgent)
    `,
    )
    .run({
      profileId: input.profileId,
      feedback: input.feedback,
      context: input.context || "search_result",
      searchToken: input.searchToken || null,
      userAgent: input.userAgent || null,
    });

  return Number(info.lastInsertRowid);
}

export function checkRateLimit(input: {
  bucketKey: string;
  route: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}): RateLimitResult {
  const nowMs = input.nowMs ?? Date.now();
  const windowStartMs = nowMs - input.windowMs;
  const db = getDb();

  return db.transaction(() => {
    db.prepare("DELETE FROM rate_limit_events WHERE created_at_ms < ?").run(
      windowStartMs,
    );

    const rows = db
      .prepare(
        `
        SELECT created_at_ms AS createdAtMs
        FROM rate_limit_events
        WHERE bucket_key = ?
          AND created_at_ms >= ?
        ORDER BY created_at_ms ASC
      `,
      )
      .all(input.bucketKey, windowStartMs) as Array<{ createdAtMs: number }>;

    if (rows.length >= input.limit) {
      const oldestMs = rows[0]?.createdAtMs ?? nowMs;
      const resetAtMs = oldestMs + input.windowMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
        resetAtMs,
      };
    }

    db.prepare(
      `
      INSERT INTO rate_limit_events (bucket_key, route, created_at_ms)
      VALUES (?, ?, ?)
    `,
    ).run(input.bucketKey, input.route, nowMs);

    return {
      allowed: true,
      remaining: Math.max(0, input.limit - rows.length - 1),
      retryAfterSeconds: 0,
      resetAtMs: nowMs + input.windowMs,
    };
  })();
}

export function listPrivacyRequests(): PrivacyRequest[] {
  return getDb()
    .prepare(
      `
      SELECT
        id,
        type,
        status,
        profile_id AS profileId,
        requester_name AS requesterName,
        requester_email AS requesterEmail,
        details,
        created_at AS createdAt,
        reviewed_at AS reviewedAt
      FROM privacy_requests
      ORDER BY created_at DESC
      LIMIT 100
    `,
    )
    .all() as PrivacyRequest[];
}

export function approvePrivacyRequest(id: number, actor = "local-admin") {
  const db = getDb();
  const request = db
    .prepare("SELECT * FROM privacy_requests WHERE id = ?")
    .get(id) as
    | {
        id: number;
        profile_id: string | null;
      }
    | undefined;

  if (!request) {
    return false;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE privacy_requests
      SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, review_note = 'Approved in local admin console'
      WHERE id = ?
    `,
    ).run(id);

    if (request.profile_id) {
      db.prepare("UPDATE profiles SET suppressed_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        request.profile_id,
      );
      db.prepare(
        `
        INSERT INTO suppression_entries (type, value, normalized_value, reason)
        VALUES ('profile_id', ?, ?, 'approved opt-out')
      `,
      ).run(request.profile_id, request.profile_id);
    }

    db.prepare(
      `
      INSERT INTO admin_audit_logs (actor, action, target_type, target_id, details)
      VALUES (?, 'approve_privacy_request', 'privacy_request', ?, ?)
    `,
    ).run(actor, String(id), JSON.stringify({ profileId: request.profile_id }));
  });

  tx();
  clearSearchResultCache();
  return true;
}

function getSearchResultsByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `
      SELECT *
      FROM profiles
      WHERE suppressed_at IS NULL
        AND id IN (${placeholders})
    `,
    )
    .all(...ids) as DbProfileRow[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  return ids
    .map((id) => rowsById.get(id))
    .filter((row): row is DbProfileRow => Boolean(row))
    .map(toSearchResult);
}

function parseCachedProfileIds(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function toSearchResult(row: DbProfileRow): SearchResult {
  return {
    id: row.id,
    name: row.full_name,
    ageRange: row.age_range,
    confidence: row.confidence,
    locations: getLocations(row.id),
    relatives: getRelationships(row.id),
  };
}

function getLocations(profileId: string) {
  const rows = getDb()
    .prepare(
      `
      SELECT city, state
      FROM profile_locations
      WHERE profile_id = ?
      ORDER BY display_order, id
    `,
    )
    .all(profileId) as Array<{ city: string; state: string }>;
  return uniqueValues(
    rows
      .filter((row) => isGeographicLocationRow(row))
      .map((row) => `${row.city}, ${row.state}`),
  ).slice(0, 4);
}

function getAddressHistory(profileId: string): AddressHistoryEntry[] {
  const rows = getDb()
    .prepare(
      `
      SELECT
        MIN(street) AS street,
        city,
        state,
        MIN(zip) AS zip,
        GROUP_CONCAT(DISTINCT kind) AS kinds,
        GROUP_CONCAT(DISTINCT s.name) AS sources,
        GROUP_CONCAT(DISTINCT s.category) AS sourceCategories,
        MIN(display_order) AS firstDisplayOrder,
        MIN(l.id) AS firstId
      FROM profile_locations l
      LEFT JOIN approved_sources s ON s.id = l.source_id
      WHERE l.profile_id = ?
      GROUP BY l.normalized_address, city, state
      ORDER BY firstDisplayOrder, firstId
    `,
    )
    .all(profileId) as Array<{
    street: string | null;
    city: string;
    state: string;
    zip: string | null;
    kinds: string | null;
    sources: string | null;
    sourceCategories: string | null;
  }>;

  return rows.map((row) => ({
    address: [row.street, row.city, row.state, row.zip].filter(Boolean).join(", "),
    street: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    kinds: splitSqlList(row.kinds),
    sources: splitSqlList(row.sources),
    sourceCategories: splitSqlList(row.sourceCategories),
  })).filter(isGeographicAddressHistoryEntry);
}

function splitSqlList(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function isGeographicAddressHistoryEntry(entry: AddressHistoryEntry) {
  if (entry.street || entry.zip) {
    return true;
  }

  return isGeographicLocationRow(entry);
}

function isGeographicLocationRow(row: { city: string; state: string }) {
  const city = normalizeText(row.city);
  const state = row.state.trim().toUpperCase();
  return !isGenericLocation(city, state);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function getRelationships(profileId: string) {
  const rows = getDb()
    .prepare(
      `
      SELECT related_name
      FROM relationships
      WHERE profile_id = ?
      ORDER BY id
      LIMIT 4
    `,
    )
    .all(profileId) as Array<{ related_name: string }>;
  return rows.map((row) => row.related_name);
}

function getAliases(profileId: string) {
  const rows = getDb()
    .prepare("SELECT alias FROM profile_aliases WHERE profile_id = ? ORDER BY id")
    .all(profileId) as Array<{ alias: string }>;
  return rows.map((row) => row.alias);
}

function getContacts(profileId: string, type: "phone" | "email") {
  const rows = getDb()
    .prepare(
      `
      SELECT display_value
      FROM profile_contacts
      WHERE profile_id = ? AND type = ? AND display_allowed = 1
      ORDER BY id
    `,
    )
    .all(profileId, type) as Array<{ display_value: string }>;
  return rows.map((row) => row.display_value);
}

function getSourceCategories(profileId: string) {
  const rows = getDb()
    .prepare(
      `
      SELECT DISTINCT s.category
      FROM approved_sources s
      JOIN source_records r ON r.source_id = s.id
      WHERE r.profile_id = ?
      ORDER BY s.category
    `,
    )
    .all(profileId) as Array<{ category: string }>;

  return rows.map((row) => row.category);
}

type DbProfileRow = {
  id: string;
  full_name: string;
  normalized_name: string;
  birth_date: string | null;
  normalized_birth_date: string | null;
  age_range: string;
  confidence: string;
  suppressed_at: string | null;
};

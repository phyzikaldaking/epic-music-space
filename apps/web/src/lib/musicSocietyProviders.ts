export type SocietyProvider = {
  id: string; name: string; territory: string; officialUrl: string;
  apiAvailable: boolean; integrationStatus: "HANDOFF" | "PARTNER_API";
};

// No society API is enabled without approved partner credentials and terms.
// These entries make the boundary explicit and keep artists on official portals.
export const SOCIETY_PROVIDERS: SocietyProvider[] = [
  { id: "ascap", name: "ASCAP", territory: "US", officialUrl: "https://www.ascap.com/help/career-development/registering-your-music", apiAvailable: false, integrationStatus: "HANDOFF" },
  { id: "bmi", name: "BMI", territory: "US", officialUrl: "https://www.bmi.com/creators", apiAvailable: false, integrationStatus: "HANDOFF" },
  { id: "soundexchange", name: "SoundExchange", territory: "US", officialUrl: "https://www.soundexchange.com/", apiAvailable: false, integrationStatus: "HANDOFF" },
  { id: "mlc", name: "The MLC", territory: "US", officialUrl: "https://www.themlc.com/", apiAvailable: false, integrationStatus: "HANDOFF" },
  { id: "cisac", name: "CISAC directory", territory: "International", officialUrl: "https://members.cisac.org/CisacPortal/annuaire.do?method=membersDirectoryHome", apiAvailable: false, integrationStatus: "HANDOFF" },
  { id: "prs", name: "PRS for Music", territory: "UK", officialUrl: "https://www.prsformusic.com/", apiAvailable: false, integrationStatus: "HANDOFF" },
  { id: "socan", name: "SOCAN", territory: "Canada", officialUrl: "https://www.socan.com/", apiAvailable: false, integrationStatus: "HANDOFF" },
  { id: "apra-amcos", name: "APRA AMCOS", territory: "Australia/NZ", officialUrl: "https://www.apraamcos.com.au/", apiAvailable: false, integrationStatus: "HANDOFF" },
];

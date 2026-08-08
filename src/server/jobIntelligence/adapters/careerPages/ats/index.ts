// ── The ATS provider registry ──
//
// One lookup table; adding support for another ATS is one entry plus its
// provider file. Nothing in the crawler, parser, orchestrator or admin UI
// changes.

import { ashbyProvider } from "./ashby";
import { greenhouseProvider } from "./greenhouse";
import { jsonLdBoardProvider } from "./jsonLdBoard";
import { leverProvider } from "./lever";
import { recruiteeProvider } from "./recruitee";
import { smartRecruitersProvider } from "./smartrecruiters";
import { workableProvider } from "./workable";
import type { AtsProvider, AtsProviderId } from "./types";

export const ATS_PROVIDERS: Record<AtsProviderId, AtsProvider> = {
  greenhouse: greenhouseProvider,
  lever: leverProvider,
  ashby: ashbyProvider,
  smartrecruiters: smartRecruitersProvider,
  workable: workableProvider,
  recruitee: recruiteeProvider,
  jsonld: jsonLdBoardProvider,
};

export function getAtsProvider(id: AtsProviderId): AtsProvider {
  return ATS_PROVIDERS[id];
}

export * from "./types";
export { detectAtsBoard, readCareerPagesConfig, isAtsProviderId } from "./detect";
export {
  ashbyProvider,
  greenhouseProvider,
  jsonLdBoardProvider,
  leverProvider,
  recruiteeProvider,
  smartRecruitersProvider,
  workableProvider,
};

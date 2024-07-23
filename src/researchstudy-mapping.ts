/**
 * This module exports a function for mapping a trial in the format returned by
 * the underlying service to the FHIR ResearchStudy type.
 */

import {
  ResearchStudy,
  CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
} from "clinical-trial-matching-service";

export function convertToResearchStudy(
  nctId: string,
  id: number
): ResearchStudy {
  const result = new ResearchStudy(id);
  result.identifier = [
    {
      system: CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
      value: nctId,
      use: "official",
    },
  ];
  // Add whatever fields can be added here, for example:
  result.status = "active";
  return result;
}

export default convertToResearchStudy;

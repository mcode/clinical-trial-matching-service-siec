/**
 * Handles conversion of patient bundle data to a proper request for matching service apis.
 * Retrieves api response as promise to be used in conversion to fhir ResearchStudy
 */
import { Bundle } from "fhir/r4";
import {
  ClinicalTrialsGovService,
  ServiceConfiguration,
  ResearchStudy,
  SearchSet,
  QueryParameters,
} from "clinical-trial-matching-service";
import convertToResearchStudy from "./researchstudy-mapping";

export interface QueryConfiguration extends ServiceConfiguration {
  endpoint?: string;
  auth_token?: string;
}

/**
 * Create a new matching function using the given configuration.
 *
 * @param configuration the configuration to use to configure the matcher
 * @param ctgService an optional ClinicalTrialGovService which can be used to
 *     update the returned trials with additional information pulled from
 *     ClinicalTrials.gov
 */
export function createClinicalTrialLookup(
  configuration: QueryConfiguration,
  ctgService: ClinicalTrialsGovService
): (patientBundle: Bundle) => Promise<SearchSet> {
  // Raise errors on missing configuration
  if (typeof configuration.endpoint !== "string") {
    throw new Error("Missing endpoint in configuration");
  }
  if (typeof configuration.auth_token !== "string") {
    throw new Error("Missing auth_token in configuration");
  }
  const endpoint = configuration.endpoint;
  const bearerToken = configuration.auth_token;
  return function getMatchingClinicalTrials(
    patientBundle: Bundle
  ): Promise<SearchSet> {
    // Create the query based on the patient bundle:
    const query = new SIECQuery(patientBundle);
    // And send the query to the server
    return sendQuery(endpoint, query, bearerToken, ctgService);
  };
}

export default createClinicalTrialLookup;

// Currently assume the SIECQueryJSON will be a patient bundle
export type SIECQueryJSON = Bundle;

/**
 * Response from the server.
 */
export interface SIECResponse extends Record<string, unknown> {
  nctIds: string[];
}

/**
 * Type guard to determine if an object is a valid SEICResponse.
 * @param o the object to determine if it is a SEICResponse
 */
export function isSIECResponse(o: unknown): o is SIECResponse {
  if (typeof o !== "object" || o === null) return false;

  // Note that the following DOES NOT check the array to make sure every object
  // within it is valid. Currently this is done later in the process. This
  // makes this type guard or the SEICResponse type sort of invalid. However,
  // the assumption is that a single unparsable trial should not cause the
  // entire response to be thrown away.
  return Array.isArray((o as SIECResponse).nctIds);
}

export interface SIECErrorResponse extends Record<string, unknown> {
  error: string;
}

/**
 * Type guard to determine if an object is a SEICErrorResponse.
 * @param o the object to determine if it is a SEICErrorResponse
 */
export function isSIECErrorResponse(o: unknown): o is SIECErrorResponse {
  if (typeof o !== "object" || o === null) return false;
  return typeof (o as SIECErrorResponse).error === "string";
}

// API RESPONSE SECTION
export class APIError extends Error {
  constructor(message: string, public response: Response, public body: string) {
    super(message);
  }
}

/**
 * This class represents a query, built based on values from within the patient
 * bundle.
 * TO-DO
 * Finish making an object for storing the various parameters necessary for the api query
 * based on a patient bundle.
 * Reference https://github.com/mcode/clinical-trial-matching-engine/wiki to see patientBundle Structures
 */
export class SIECQuery {
  /**
   * US zip code
   */
  zipCode: string;
  /**
   * Distance in miles a user has indicated they're willing to travel
   */
  travelRadius: number;
  /**
   * A FHIR ResearchStudy phase
   */
  phase: string;
  /**
   * A FHIR ResearchStudy status
   */
  recruitmentStatus: string;
  patientBundle: Bundle;
  parameters: QueryParameters;
  // TO-DO Add any additional fields which need to be extracted from the bundle to construct query

  /**
   * Create a new query object.
   * @param patientBundle the patient bundle to use for field values
   */
  constructor(patientBundle: Bundle) {
    this.patientBundle = patientBundle;
  }

  /**
   * Create the information sent to the server.
   * @return the query object
   */
  toQuery(): SIECQueryJSON {
    return this.patientBundle;
  }

  toString(): string {
    return JSON.stringify(this.toQuery());
  }
}

/**
 * Convert a query response into a search set.
 *
 * @param response the response object
 * @param ctgService an optional ClinicalTrialGovService which can be used to
 *     update the returned trials with additional information pulled from
 *     ClinicalTrials.gov
 */
export function convertResponseToSearchSet(
  response: SIECResponse,
  ctgService?: ClinicalTrialsGovService
): Promise<SearchSet> {
  // Our final response
  const studies: ResearchStudy[] = [];
  // For generating IDs
  let id = 0;
  for (const nctId of response.nctIds) {
    if (typeof nctId === "string") {
      studies.push(convertToResearchStudy(nctId, id++));
    } else {
      // This trial could not be understood. It can be ignored if that should
      // happen or raised/logged as an error.
      console.error("Unable to parse trial from server: %o", nctId);
    }
  }
  if (ctgService) {
    // If given a backup service, use it
    return ctgService.updateResearchStudies(studies).then(() => {
      return new SearchSet(studies);
    });
  } else {
    // Otherwise, resolve immediately
    return Promise.resolve(new SearchSet(studies));
  }
}

/**
 * Helper function to handle actually sending the query.
 *
 * @param endpoint the URL of the end point to send the query to
 * @param query the query to send
 * @param bearerToken the bearer token to send along with the query to
 *     authenticate with the service
 * @param ctgService an optional ClinicalTrialGovService which can be used to
 *     update the returned trials with additional information pulled from
 *     ClinicalTrials.gov
 */
async function sendQuery(
  endpoint: string,
  query: SIECQuery,
  bearerToken: string,
  ctgService?: ClinicalTrialsGovService
): Promise<SearchSet> {
  const response = await fetch(endpoint, {
    method: "POST",
    body: query.toString(),
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: "Bearer " + bearerToken,
    },
  });
  console.log("Complete");
  if (response.status === 200) {
    let json: unknown;
    try {
      json = await response.json();
    } catch (ex) {
      throw new APIError('Unable to parse response as JSON', response, ex.message);
    }
    if (isSIECResponse(json)) {
      return convertResponseToSearchSet(json, ctgService);
    } else if (isSIECErrorResponse(json)) {
      throw new APIError(
        `Error from service: ${json.error}`,
        response,
        json.error
      );
    } else {
      throw new Error("Unable to parse response from server");
    }
  } else {
    throw new APIError(
      `Server returned ${response.status} ${response.statusText}`,
      response,
      // Note that in this case the response hasn't been read yet
      await response.text()
    );
  }
}

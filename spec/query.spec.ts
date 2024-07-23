/**
 * This provides an example of how to test the query to ensure it produces
 * results.
 */

import { Bundle } from "fhir/r4";
import {
  CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
  ClinicalTrialsGovService,
  SearchSet,
} from "clinical-trial-matching-service";
import createClinicalTrialLookup, {
  convertResponseToSearchSet,
  isSIECResponse,
  isSIECErrorResponse,
  SIECQuery,
  SIECResponse,
} from "../src/query";
import nock from "nock";

describe("createClinicalTrialLookup()", () => {
  let mockService: ClinicalTrialsGovService;

  beforeEach(() => {
    // Create but don't bother initing this, it just needs to exist for these tests
    mockService = new ClinicalTrialsGovService(":memory:");
  });
  it("creates a function if configured properly", () => {
    expect(
      typeof createClinicalTrialLookup(
        {
          endpoint: "http://www.example.com/",
          auth_token: "token",
        },
        mockService
      )
    ).toEqual("function");
  });

  // This test just makes sure an error is properly raised for invalid
  // configurations
  it("raises an error if configuration is missing", () => {
    expect(() => {
      createClinicalTrialLookup({}, mockService);
    }).toThrowError("Missing endpoint in configuration");
    expect(() => {
      createClinicalTrialLookup(
        { endpoint: "http://www.example.com/" },
        mockService
      );
    }).toThrowError("Missing auth_token in configuration");
  });
});

describe("isSIECResponse()", () => {
  it("returns false for non-response objects", () => {
    expect(isSIECResponse(null)).toBeFalse();
    expect(isSIECResponse(true)).toBeFalse();
    expect(isSIECResponse("string")).toBeFalse();
    expect(isSIECResponse(42)).toBeFalse();
    expect(isSIECResponse({ invalid: true })).toBeFalse();
  });

  it("returns true on a matching object", () => {
    expect(isSIECResponse({ nctIds: [] })).toBeTrue();
    expect(isSIECResponse({ nctIds: ["NCT12345678"] })).toBeTrue();
    // Currently this is true. It may make sense to make it false, but for now,
    // a single invalid trial does not invalidate the array.
    expect(isSIECResponse({ nctIds: [{ invalid: true }] })).toBeTrue();
  });
});

describe("isSIECErrorResponse()", () => {
  it("returns false for non-response objects", () => {
    expect(isSIECErrorResponse(null)).toBeFalse();
    expect(isSIECErrorResponse(true)).toBeFalse();
    expect(isSIECErrorResponse("string")).toBeFalse();
    expect(isSIECErrorResponse(42)).toBeFalse();
    expect(isSIECErrorResponse({ invalid: true })).toBeFalse();
  });

  it("returns true on a matching object", () => {
    expect(isSIECErrorResponse({ error: "oops" })).toBeTrue();
  });
});

describe("SIECQuery", () => {
  it("converts the query to a string", () => {
    expect(
      new SIECQuery({
        resourceType: "Bundle",
        type: "collection",
        entry: [
          {
            resource: {
              resourceType: "Parameters",
              parameter: [
                {
                  name: "zipCode",
                  valueString: "01730",
                },
                {
                  name: "travelRadius",
                  valueString: "25",
                },
                {
                  name: "phase",
                  valueString: "phase-1",
                },
                {
                  name: "recruitmentStatus",
                  valueString: "approved",
                },
              ],
            },
          },
        ],
      }).toString()
    ).toEqual(
      '{"zip":"01730","distance":25,"phase":"phase-1","status":"approved","conditions":[]}'
    );
  });
});

describe("convertResponseToSearchSet()", () => {
  it("converts trials", async () => {
    const searchSet = await convertResponseToSearchSet({
      nctIds: ["NCT12345678"],
    });
    expect(searchSet.entry).toEqual([
      {
        search: {},
        resource: {
          resourceType: "ResearchStudy",
          status: "active",
          identifier: [
            {
              system: CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
              value: "NCT12345678",
              use: "official",
            },
          ],
        },
      },
    ]);
  });

  it("skips invalid trials", async () => {
    const response: SIECResponse = {
      nctIds: [],
    };
    // Push on an invalid object
    response.nctIds.push({
      invalidObject: true,
    } as unknown as string);
    await convertResponseToSearchSet(response);
  });

  it("uses the backup service if provided", async () => {
    // Note that we don't initialize the backup service so no files are created
    const backupService = new ClinicalTrialsGovService(":memory:");
    // Instead we install a spy that takes over "updating" the research studies
    // by doing nothing
    const spy = spyOn(backupService, "updateResearchStudies").and.callFake(
      (studies) => {
        return Promise.resolve(studies);
      }
    );
    await convertResponseToSearchSet(
      {
        nctIds: ["NCT12345678"],
      },
      backupService
    );
    expect(spy).toHaveBeenCalled();
  });
});

describe("ClinicalTrialLookup", () => {
  // A valid patient bundle for the matcher, passed to ensure a query is generated
  const patientBundle: Bundle = {
    resourceType: "Bundle",
    type: "batch",
    entry: [],
  };
  const ctgService = new ClinicalTrialsGovService(":memory:");
  let matcher: (patientBundle: Bundle) => Promise<SearchSet>;
  let scope: nock.Scope;
  let mockRequest: nock.Interceptor;
  beforeEach(() => {
    // Create the matcher here. This creates a new instance each test so that
    // each test can adjust it as necessary without worrying about interfering
    // with other tests.
    matcher = createClinicalTrialLookup(
      {
        endpoint: "https://www.example.com/endpoint",
        auth_token: "test_token",
      },
      ctgService
    );
    // Create the interceptor for the mock request here as it's the same for
    // each test
    scope = nock("https://www.example.com");
    mockRequest = scope.post("/endpoint");
  });
  afterEach(() => {
    // Expect the endpoint to have been hit in these tests
    expect(nock.isDone()).toBeTrue();
  });

  it("generates a request", () => {
    mockRequest.reply(200, { matchingTrials: [] });
    return expectAsync(matcher(patientBundle)).toBeResolved();
  });

  it("rejects with an error if an error is returned by the server", () => {
    // Simulate an error response
    mockRequest.reply(200, { error: "Test error" });
    return expectAsync(matcher(patientBundle)).toBeRejectedWithError(
      "Error from service: Test error"
    );
  });

  it("rejects with an error if an HTTP error is returned by the server", () => {
    // Simulate an error response
    mockRequest.reply(500, "Internal Server Error");
    return expectAsync(matcher(patientBundle)).toBeRejectedWithError(
      /^Server returned 500/
    );
  });

  it("rejects with an error if the response is invalid", () => {
    // Simulate a valid response with something that can't be parsed as JSON
    mockRequest.reply(200, { missingAllKnownKeys: true });
    return expectAsync(matcher(patientBundle)).toBeRejectedWithError(
      "Unable to parse response from server"
    );
  });

  it("rejects with an error if the response is not JSON", () => {
    // Simulate a valid response with something that can't be parsed as JSON
    mockRequest.reply(200, "A string that isn't JSON");
    return expectAsync(matcher(patientBundle)).toBeRejectedWithError(
      "Unable to parse response as JSON"
    );
  });

  it("rejects with an error if the request fails", () => {
    // Simulate a valid response with something that can't be parsed as JSON
    mockRequest.replyWithError("Test error");
    return expectAsync(matcher(patientBundle)).toBeRejectedWithError(
      "Test error"
    );
  });
});

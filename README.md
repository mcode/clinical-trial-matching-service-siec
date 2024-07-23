# clinical-trial-matching-service-siec

This is a wrapper between the [Clinical Trial Matching App](https://github.com/mcode/clinical-trial-matching-app) and the backend [Structured Inclusion Exclusion Criteria (SIEC) Engine](https://github.com/mcode/siec-engine).

# Requirements

The ResearchStudy object passed back by this server must be [FHIR-compliant](https://www.hl7.org/fhir/researchstudy.html) and satisfy several requirements. It must contain:
- Title
- Summary
- Site location
- Phase
- Contact Information i.e. sponsor email, phone number
- Study Type
- Inclusion/ Exclusion criteria

# Running the Server

1. Run `npm install`
2. Run `npm start`
3. The service will now be running at http://localhost:3000/

# Testing

A validation test is provided to validate the ResearchStudy created via this service. Put an example response object in `spec/data/trial_object.json` and this object will be loaded and validated by the test in `spec/validate.spec.ts`.

For this test to produce meaningful results, you must have:

1. Placed appropriate test data in `spec/data/trial_object.json` (the default is an empty object)
2. Properly implemented `convertToResearchStudy` in `src/researchstudy-mapping.ts`

The test will always output any messages from the FHIR validator, even if the result is valid, so you may see warning messages displayed in the test output.

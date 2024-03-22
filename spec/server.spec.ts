import { Server } from 'node:http';
import startServer from "../src/server";
import ClinicalTrialMatchingService from "clinical-trial-matching-service";

describe("startServer()", () => {
  beforeAll(() => {
    // Because the .env file will override it, explicitly unset the
    // CTGOV_CACHE_FILE variable. This will cause the cache to not be created.
    process.env.CTGOV_CACHE_FILE = '';
  });

  beforeEach(() => {
    // Don't actually want to start the server listening, so spy on the
    // prototype to prevent that from happening
    spyOn(ClinicalTrialMatchingService.prototype, "listen").and.callFake(() => {
      // Note: null return works here because the result of service is never
      // actually used in the "real" function. Tell TypeScript to pretend it's
      // fine, although this is, technically, invalid.
      return Promise.resolve(null as unknown as Server);
    });
  });

  it("starts the server", async () => {
    await startServer();
  });

  it("overrides the configuration", async () => {
    // Basically make sure we get our configuration values back out
    const service = await startServer({
        endpoint: "https://www.example.com/endpoint",
        auth_token: "fake",
        host: "127.0.0.1",
        port: 0,
    });
    expect(service.host).toEqual("127.0.0.1");
    expect(service.port).toEqual(0);
  });
});

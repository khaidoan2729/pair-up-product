import { defineRailway, project, service, volume } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code\#multi-repo-projects
export const partial = "pair-up";
export default defineRailway(() => {
  const storage = volume("pair-up-volume", { region: "us-west2", sizeMB: 5000 });
  const pairUp = service("pair-up", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE" },
    networking: { serviceDomains: { "pair-up-production.up.railway.app": { port: 3000 } } },
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
    replicas: { "us-west2": 1 },
    volumeMounts: { "/data": storage },
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5 },
  });

  return project("Pair Up — CPEN 441", {
    variables: { managed: false },
    resources: [pairUp, storage],
  });
});

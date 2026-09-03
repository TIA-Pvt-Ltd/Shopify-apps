/** @type {import("@react-router/dev/config").Config} */
export default {
  routeDiscovery: {
    mode: "initial",
  },
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
};

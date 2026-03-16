import fp from "fastify-plugin";
import { MemoryCacheProvider } from "../services/cache.js";

export default fp(async function cachePlugin(fastify) {
  fastify.decorate("cache", new MemoryCacheProvider());
});

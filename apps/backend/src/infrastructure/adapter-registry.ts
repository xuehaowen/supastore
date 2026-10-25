export type AdapterEnvironment = Readonly<Record<string, string | undefined>>;
export interface AdapterDefinition<
  Config extends { provider: string },
  Adapter,
  Dependencies,
> {
  readonly handle: Config["provider"];
  parseEnvironment(env: AdapterEnvironment): Config;
  validateConfig(config: Config): void;
  create(config: Config, dependencies: Dependencies): Adapter;
  configurationFingerprint?(config: Config): string;
}
export type AdapterRegistry<
  Config extends { provider: string },
  Adapter,
  Dependencies,
> = {
  readonly [Handle in Config["provider"]]: AdapterDefinition<
    Extract<Config, { provider: Handle }>,
    Adapter,
    Dependencies
  >;
};
export type ProfiledAdapterRegistry<
  Config extends { provider: string },
  Adapter,
  Dependencies,
> = {
  readonly [Handle in Config["provider"]]: AdapterDefinition<
    Extract<Config, { provider: Handle }>,
    Adapter,
    Dependencies
  > & {
    configurationFingerprint(
      config: Extract<Config, { provider: Handle }>,
    ): string;
  };
};
export function adapterFingerprint<
  Config extends { provider: string },
  Adapter,
  Dependencies,
>(
  registry: ProfiledAdapterRegistry<Config, Adapter, Dependencies>,
  config: Config,
): string {
  return adapterDefinition(registry, config.provider, "provider")
    .configurationFingerprint!(config);
}
export function adapterDefinition<
  Config extends { provider: string },
  Adapter,
  Dependencies,
>(
  registry: AdapterRegistry<Config, Adapter, Dependencies>,
  handle: string,
  field: string,
): AdapterDefinition<Config, Adapter, Dependencies> {
  if (!Object.hasOwn(registry, handle))
    throw new Error(`Invalid adapter configuration: ${field}.`);
  // The mapped registry enforces the discriminator/config correlation; union
  // indexing cannot express it without this assertion at the dispatch boundary.
  return registry[handle as Config["provider"]] as AdapterDefinition<
    Config,
    Adapter,
    Dependencies
  >;
}
export function createAdapter<
  Config extends { provider: string },
  Adapter,
  Dependencies,
>(
  registry: AdapterRegistry<Config, Adapter, Dependencies>,
  config: Config,
  dependencies: Dependencies,
): Adapter {
  const definition = adapterDefinition(registry, config.provider, "provider");
  definition.validateConfig(config);
  return definition.create(config, dependencies);
}

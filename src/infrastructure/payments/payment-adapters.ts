import type { PaymentProvider } from "@/application/ports/payments";
import {
  adapterDefinition,
  createAdapter,
  type AdapterEnvironment,
  type AdapterRegistry,
} from "../adapter-registry";
import { StripeAdapter, validateStripeConfiguration } from "./stripe";
export interface StripePaymentConfig {
  provider: "stripe";
  secretKey: string;
  storefrontOrigin: string;
}
export interface PaymentDependencies {
  fetcher?: typeof fetch;
}
export const paymentAdapters = Object.freeze({
  stripe: {
    handle: "stripe",
    parseEnvironment: (env) => ({
      provider: "stripe",
      secretKey: env.STRIPE_SECRET_KEY ?? "",
      storefrontOrigin: env.STOREFRONT_ORIGIN || env.APP_URL || "",
    }),
    validateConfig: (config) => {
      validateStripeConfiguration(config.secretKey, config.storefrontOrigin);
    },
    create: (config, dependencies) =>
      new StripeAdapter(
        config.secretKey,
        config.storefrontOrigin,
        dependencies.fetcher,
      ),
  },
} satisfies AdapterRegistry<
  StripePaymentConfig,
  PaymentProvider,
  PaymentDependencies
>);
export function createPaymentAdapter(
  config: StripePaymentConfig,
  dependencies: PaymentDependencies = {},
): PaymentProvider {
  return createAdapter<
    StripePaymentConfig,
    PaymentProvider,
    PaymentDependencies
  >(paymentAdapters, config, dependencies);
}
/** Resolve the operation's original provider, never a replacement global default. */
export function paymentProviderFromEnvironment(
  handle: string,
  env: AdapterEnvironment = process.env,
  dependencies: PaymentDependencies = {},
): PaymentProvider {
  const definition = adapterDefinition<
    StripePaymentConfig,
    PaymentProvider,
    PaymentDependencies
  >(paymentAdapters, handle, "payment provider");
  return createPaymentAdapter(definition.parseEnvironment(env), dependencies);
}
